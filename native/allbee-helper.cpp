// allbee-helper.exe — native companion process for AllBee Focus on Windows.
//
// What it does
//   * Watches which window is in front, event-driven (SetWinEventHook), with a light
//     fallback poll while a browser is in front.
//   * For Chrome, Edge, Brave and Firefox it reads the address shown in the browser's own
//     address bar through Windows UI Automation (the accessibility API). Page content is
//     never read: the search skips every web document in the accessibility tree.
//   * On request it closes the active tab of the front browser window by sending Ctrl+W,
//     but only after re-checking that the same window is still in front and still shows
//     the same site, and that no modifier keys are held.
//
// What it never does
//   * Read page content, keystrokes, passwords or text from other applications.
//   * Terminate processes, change system settings, or touch any window other than the
//     front browser window it was asked about.
//
// Protocol: newline-delimited JSON. Events on stdout, commands on stdin.
//   -> {"t":"hello","v":1,"pid":123,"uia":true}
//   -> {"t":"fg","hwnd":"1a2b","pid":44,"exe":"chrome.exe","name":"Google Chrome","browser":"chrome","status":"ok","url":"youtube.com/shorts/x","self":false}
//   <- {"cmd":"close","id":7,"hwnd":"1a2b","host":"youtube.com","path":"/shorts"}
//   -> {"t":"closed","id":7,"ok":true,"reason":""}
//   <- {"cmd":"sample"}
//   <- {"cmd":"quit"}
// The process exits when stdin closes or the parent process ends.

#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <initguid.h>
#include <windows.h>
#include <objbase.h>
#include <oleauto.h>
#include <uiautomation.h>

#include <atomic>
#include <cctype>
#include <climits>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cwchar>
#include <deque>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

const int kProtocolVersion = 1;

std::mutex g_outMutex;
HANDLE g_stdout = INVALID_HANDLE_VALUE;
HANDLE g_wake = nullptr;
std::atomic<bool> g_quit{false};
DWORD g_uiThreadId = 0;
DWORD g_parentPid = 0;
HWINEVENTHOOK g_nameHook = nullptr;

struct Command {
  std::string cmd;
  long long id = 0;
  std::string hwnd;
  std::string host;
  std::string path;
};

std::mutex g_cmdMutex;
std::deque<Command> g_cmds;

void requestQuit() {
  g_quit = true;
  if (g_wake) SetEvent(g_wake);
  if (g_uiThreadId) PostThreadMessageW(g_uiThreadId, WM_QUIT, 0, 0);
}

// ---------------------------------------------------------------------------
// text helpers

std::string utf8(const wchar_t* w, size_t len) {
  if (!w || len == 0) return {};
  int n = WideCharToMultiByte(CP_UTF8, 0, w, static_cast<int>(len), nullptr, 0, nullptr, nullptr);
  if (n <= 0) return {};
  std::string s(static_cast<size_t>(n), '\0');
  WideCharToMultiByte(CP_UTF8, 0, w, static_cast<int>(len), &s[0], n, nullptr, nullptr);
  return s;
}

std::string utf8(const std::wstring& w) { return utf8(w.data(), w.size()); }

std::string lower(std::string s) {
  for (auto& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return s;
}

std::string trim(const std::string& s) {
  size_t a = 0, b = s.size();
  while (a < b && std::isspace(static_cast<unsigned char>(s[a]))) a++;
  while (b > a && std::isspace(static_cast<unsigned char>(s[b - 1]))) b--;
  return s.substr(a, b - a);
}

std::string jstr(const std::string& s) {
  std::string o;
  o.reserve(s.size() + 2);
  o += '"';
  for (unsigned char c : s) {
    switch (c) {
      case '"': o += "\\\""; break;
      case '\\': o += "\\\\"; break;
      case '\n': o += "\\n"; break;
      case '\r': o += "\\r"; break;
      case '\t': o += "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof buf, "\\u%04x", c);
          o += buf;
        } else {
          o += static_cast<char>(c);
        }
    }
  }
  o += '"';
  return o;
}

void emit(const std::string& line) {
  std::lock_guard<std::mutex> lk(g_outMutex);
  std::string l = line + "\n";
  DWORD written = 0;
  if (!WriteFile(g_stdout, l.data(), static_cast<DWORD>(l.size()), &written, nullptr)) requestQuit();
}

void logLine(const std::string& msg) { emit(std::string("{\"t\":\"log\",\"msg\":") + jstr(msg) + "}"); }

// Minimal JSON field reader for the flat command objects sent by AllBee Focus.
std::string jget(const std::string& line, const char* key) {
  const std::string k = std::string("\"") + key + "\"";
  size_t p = line.find(k);
  if (p == std::string::npos) return {};
  p = line.find(':', p + k.size());
  if (p == std::string::npos) return {};
  p++;
  while (p < line.size() && (line[p] == ' ' || line[p] == '\t')) p++;
  if (p >= line.size()) return {};
  if (line[p] == '"') {
    std::string out;
    for (p++; p < line.size() && line[p] != '"'; p++) {
      if (line[p] == '\\' && p + 1 < line.size()) {
        p++;
        char e = line[p];
        out += (e == 'n' ? '\n' : e == 't' ? '\t' : e);
      } else {
        out += line[p];
      }
    }
    return out;
  }
  size_t e = p;
  while (e < line.size() && (std::isdigit(static_cast<unsigned char>(line[e])) || line[e] == '-')) e++;
  return line.substr(p, e - p);
}

// ---------------------------------------------------------------------------
// address parsing (mirrors src/shared/utilities/url.ts closely enough for a safety re-check)

bool splitAddress(const std::string& raw, std::string& host, std::string& path) {
  std::string s = trim(raw);
  if (s.empty() || s.find(' ') != std::string::npos) return false;
  const size_t sch = s.find("://");
  if (sch != std::string::npos) {
    const std::string proto = lower(s.substr(0, sch));
    if (proto != "http" && proto != "https") return false;
    s = s.substr(sch + 3);
  }
  size_t slash = s.find_first_of("/?#");
  const size_t at = s.find('@');
  if (at != std::string::npos && (slash == std::string::npos || at < slash)) {
    s = s.substr(at + 1);
    slash = s.find_first_of("/?#");
  }
  host = lower(slash == std::string::npos ? s : s.substr(0, slash));
  std::string rest = slash == std::string::npos ? std::string() : s.substr(slash);
  const size_t colon = host.find(':');
  if (colon != std::string::npos) host = host.substr(0, colon);
  if (!host.empty() && host.back() == '.') host.pop_back();
  for (;;) {
    std::string next = host;
    for (const char* pre : {"www.", "www1.", "www2.", "www3.", "m.", "mobile."}) {
      const size_t n = std::strlen(pre);
      if (next.compare(0, n, pre) == 0 && next.find('.', n) != std::string::npos) {
        next = next.substr(n);
        break;
      }
    }
    if (next == host) break;
    host = next;
  }
  const size_t q = rest.find_first_of("?#");
  if (q != std::string::npos) rest = rest.substr(0, q);
  path = lower(rest);
  while (!path.empty() && path.back() == '/') path.pop_back();
  return !host.empty() && host.find('.') != std::string::npos;
}

bool matchesRule(const std::string& host, const std::string& path, const std::string& rHost, const std::string& rPath) {
  if (rHost.empty()) return false;
  bool h = host == rHost;
  if (!h && host.size() > rHost.size()) {
    const size_t off = host.size() - rHost.size();
    h = host.compare(off, rHost.size(), rHost) == 0 && host[off - 1] == '.';
  }
  if (!h) return false;
  if (rPath.empty()) return true;
  if (path == rPath) return true;
  return path.size() > rPath.size() && path.compare(0, rPath.size(), rPath) == 0 && path[rPath.size()] == '/';
}

std::string stripQuery(const std::string& s) {
  const size_t q = s.find_first_of("?#");
  return q == std::string::npos ? s : s.substr(0, q);
}

// ---------------------------------------------------------------------------
// process identification

const char* browserOf(const std::string& exe) {
  if (exe == "chrome.exe") return "chrome";
  if (exe == "msedge.exe") return "edge";
  if (exe == "firefox.exe") return "firefox";
  if (exe == "brave.exe") return "brave";
  return nullptr;
}

bool isOtherBrowser(const std::string& exe) {
  static const char* list[] = {"opera.exe",   "opera_gx.exe", "vivaldi.exe", "iexplore.exe", "waterfox.exe", "librewolf.exe",
                               "floorp.exe",  "arc.exe",      "zen.exe",     "chromium.exe", "yandex.exe",   "thorium.exe",
                               "palemoon.exe", "seamonkey.exe", "whale.exe",  "maxthon.exe",  "iron.exe",     "duckduckgo.exe"};
  for (const char* b : list)
    if (exe == b) return true;
  return false;
}

std::map<std::wstring, std::string> g_friendlyNames;

std::string friendlyName(const std::wstring& path, const std::string& fallback) {
  auto it = g_friendlyNames.find(path);
  if (it != g_friendlyNames.end()) return it->second;
  std::string name;
  DWORD dummy = 0;
  const DWORD size = GetFileVersionInfoSizeW(path.c_str(), &dummy);
  if (size > 0) {
    std::vector<BYTE> data(size);
    if (GetFileVersionInfoW(path.c_str(), 0, size, data.data())) {
      struct LangCp {
        WORD lang;
        WORD cp;
      };
      LangCp* tr = nullptr;
      UINT trLen = 0;
      if (VerQueryValueW(data.data(), L"\\VarFileInfo\\Translation", reinterpret_cast<LPVOID*>(&tr), &trLen) && tr &&
          trLen >= sizeof(LangCp)) {
        wchar_t q[80];
        std::swprintf(q, 80, L"\\StringFileInfo\\%04x%04x\\FileDescription", tr[0].lang, tr[0].cp);
        wchar_t* val = nullptr;
        UINT vlen = 0;
        if (VerQueryValueW(data.data(), q, reinterpret_cast<LPVOID*>(&val), &vlen) && val && vlen > 1) {
          name = trim(utf8(val, wcsnlen(val, vlen)));
        }
      }
    }
  }
  if (name.empty()) {
    name = fallback;
    if (name.size() > 4 && lower(name.substr(name.size() - 4)) == ".exe") name = name.substr(0, name.size() - 4);
  }
  if (name.size() > 80) name = name.substr(0, 80);
  if (g_friendlyNames.size() > 256) g_friendlyNames.clear();
  g_friendlyNames[path] = name;
  return name;
}

std::wstring windowTitle(HWND hwnd) {
  wchar_t buf[512];
  const int n = GetWindowTextW(hwnd, buf, 512);
  return n > 0 ? std::wstring(buf, static_cast<size_t>(n)) : std::wstring();
}

// ---------------------------------------------------------------------------
// UI Automation address bar reader

struct Sample {
  HWND hwnd = nullptr;
  DWORD pid = 0;
  std::string exe;
  std::string name;
  std::string browser;
  std::string status = "none";
  std::string url;
  bool self = false;
};

class AddressReader {
 public:
  ~AddressReader() {
    for (auto& kv : entries_)
      if (kv.second.el) kv.second.el->Release();
    if (walker_) walker_->Release();
    if (cache_) cache_->Release();
    if (uia_) uia_->Release();
  }

  bool init() {
    HRESULT hr = CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER, IID_IUIAutomation, reinterpret_cast<void**>(&uia_));
    if (FAILED(hr) || !uia_) return false;
    IUIAutomation2* u2 = nullptr;
    if (SUCCEEDED(uia_->QueryInterface(IID_IUIAutomation2, reinterpret_cast<void**>(&u2))) && u2) {
      u2->put_ConnectionTimeout(2000);
      u2->put_TransactionTimeout(1500);
      u2->Release();
    }
    if (FAILED(uia_->CreateCacheRequest(&cache_)) || !cache_) return false;
    cache_->AddProperty(UIA_ControlTypePropertyId);
    cache_->AddProperty(UIA_AutomationIdPropertyId);
    cache_->AddProperty(UIA_BoundingRectanglePropertyId);
    if (FAILED(uia_->get_ControlViewWalker(&walker_)) || !walker_) return false;
    return true;
  }

  bool ready() const { return uia_ && cache_ && walker_; }

  // Reads the address bar of `hwnd`. status: ok | editing | unreadable | denied
  void read(HWND hwnd, bool firefox, bool allowStale, std::string& status, std::string& url) {
    status = "unreadable";
    url.clear();
    if (!ready()) return;
    Entry& e = entries_[hwnd];
    const std::wstring title = windowTitle(hwnd);
    for (int attempt = 0; attempt < 2; attempt++) {
      if (!e.el) {
        const ULONGLONG now = GetTickCount64();
        if (now < e.retryAt) break;  // don't rescan a window we just failed to read
        HRESULT hr = S_OK;
        e.el = findAddressBar(hwnd, firefox, hr);
        if (!e.el) {
          if (hr == E_ACCESSDENIED) status = "denied";
          e.retryAt = now + 2000;
          break;
        }
      }
      VARIANT v;
      VariantInit(&v);
      HRESULT hr = e.el->GetCurrentPropertyValue(UIA_ValueValuePropertyId, &v);
      if (FAILED(hr) || v.vt != VT_BSTR) {
        VariantClear(&v);
        e.el->Release();
        e.el = nullptr;
        if (hr == E_ACCESSDENIED) {
          status = "denied";
          break;
        }
        continue;  // element went stale: search again once
      }
      std::string value = trim(utf8(v.bstrVal, SysStringLen(v.bstrVal)));
      VariantClear(&v);
      if (value.size() > 2048) value = value.substr(0, 2048);

      VARIANT f;
      VariantInit(&f);
      bool focused = false;
      if (SUCCEEDED(e.el->GetCurrentPropertyValue(UIA_HasKeyboardFocusPropertyId, &f)) && f.vt == VT_BOOL) focused = f.boolVal == VARIANT_TRUE;
      VariantClear(&f);

      if (focused) {
        // The user is typing in the address bar: the text may not be the page that is open.
        if (allowStale && !e.lastUrl.empty() && e.lastTitle == title) {
          status = "ok";
          url = e.lastUrl;
        } else {
          status = "editing";
        }
        return;
      }
      status = "ok";
      url = stripQuery(value);
      e.lastUrl = url;
      e.lastTitle = title;
      return;
    }
    // Couldn't read (for example a full-screen video hides the toolbar). If the window
    // still shows the same page title, the last address we read is still the right one.
    if (allowStale && status == "unreadable" && !e.lastUrl.empty() && e.lastTitle == title && !title.empty()) {
      status = "ok";
      url = e.lastUrl;
    }
  }

  void prune() {
    for (auto it = entries_.begin(); it != entries_.end();) {
      if (!IsWindow(it->first)) {
        if (it->second.el) it->second.el->Release();
        it = entries_.erase(it);
      } else {
        ++it;
      }
    }
  }

 private:
  struct Entry {
    IUIAutomationElement* el = nullptr;
    std::string lastUrl;
    std::wstring lastTitle;
    ULONGLONG retryAt = 0;
  };

  // Breadth-first walk of the browser's own interface (never into web documents).
  // Picks the address field: Firefox's "urlbar-input", otherwise the top-most edit box.
  IUIAutomationElement* findAddressBar(HWND hwnd, bool firefox, HRESULT& outHr) {
    IUIAutomationElement* root = nullptr;
    outHr = uia_->ElementFromHandleBuildCache(hwnd, cache_, &root);
    if (FAILED(outHr) || !root) return nullptr;
    RECT winRect{};
    GetWindowRect(hwnd, &winRect);

    std::deque<std::pair<IUIAutomationElement*, int>> queue;
    queue.emplace_back(root, 0);
    IUIAutomationElement* best = nullptr;
    LONG bestTop = LONG_MAX;
    int visited = 0;
    bool done = false;
    while (!queue.empty()) {
      auto item = queue.front();
      queue.pop_front();
      IUIAutomationElement* el = item.first;
      if (done || visited > 2000) {
        el->Release();
        continue;
      }
      visited++;
      CONTROLTYPEID ct = 0;
      el->get_CachedControlType(&ct);
      bool descend = item.second < 18 && ct != UIA_DocumentControlTypeId;
      bool keep = false;
      if (ct == UIA_EditControlTypeId) {
        descend = false;
        BSTR aid = nullptr;
        el->get_CachedAutomationId(&aid);
        const bool isUrlbar = aid && std::wcscmp(aid, L"urlbar-input") == 0;
        if (aid) SysFreeString(aid);
        RECT r{};
        el->get_CachedBoundingRectangle(&r);
        const bool visible = r.right > r.left && r.bottom > r.top;
        LONG top = visible ? r.top : LONG_MAX - 1;
        // ignore edit boxes in the lower part of the window (find bars, side panels...)
        const LONG winHeight = winRect.bottom - winRect.top;
        if (visible && winHeight > 0 && r.top - winRect.top > winHeight / 3) top = LONG_MAX - 1;
        if (firefox && isUrlbar) {
          if (best) best->Release();
          best = el;
          keep = true;
          done = true;
        } else if (top < bestTop || (!best && top == LONG_MAX - 1)) {
          if (best) best->Release();
          best = el;
          bestTop = top;
          keep = true;
        }
      }
      if (descend) {
        IUIAutomationElement* child = nullptr;
        walker_->GetFirstChildElementBuildCache(el, cache_, &child);
        int guard = 0;
        while (child && guard++ < 400) {
          queue.emplace_back(child, item.second + 1);
          IUIAutomationElement* next = nullptr;
          walker_->GetNextSiblingElementBuildCache(child, cache_, &next);
          child = next;
        }
        if (child) child->Release();
      }
      if (!keep) el->Release();
    }
    return best;
  }

  IUIAutomation* uia_ = nullptr;
  IUIAutomationCacheRequest* cache_ = nullptr;
  IUIAutomationTreeWalker* walker_ = nullptr;
  std::map<HWND, Entry> entries_;
};

AddressReader* g_reader = nullptr;

Sample sampleWindow(HWND hwnd, bool allowStale) {
  Sample s;
  s.hwnd = hwnd;
  if (!hwnd || !IsWindow(hwnd)) return s;
  GetWindowThreadProcessId(hwnd, &s.pid);
  s.self = s.pid != 0 && (s.pid == g_parentPid || s.pid == GetCurrentProcessId());
  HANDLE ph = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, s.pid);
  if (!ph) {
    s.status = "denied";
    return s;
  }
  wchar_t buf[MAX_PATH * 2];
  DWORD len = MAX_PATH * 2;
  std::wstring path;
  if (QueryFullProcessImageNameW(ph, 0, buf, &len)) path.assign(buf, len);
  CloseHandle(ph);
  const size_t slash = path.find_last_of(L"\\/");
  const std::string exe = lower(utf8(slash == std::wstring::npos ? path : path.substr(slash + 1)));
  s.exe = exe;
  s.name = path.empty() ? exe : friendlyName(path, exe);
  const char* browser = browserOf(exe);
  if (!browser) {
    s.status = isOtherBrowser(exe) ? "unsupported-browser" : "not-browser";
    return s;
  }
  s.browser = browser;
  if (!g_reader || !g_reader->ready()) {
    s.status = "unreadable";
    return s;
  }
  g_reader->read(hwnd, s.browser == "firefox", allowStale, s.status, s.url);
  return s;
}

std::string hwndText(HWND h) {
  char buf[32];
  std::snprintf(buf, sizeof buf, "%llx", static_cast<unsigned long long>(reinterpret_cast<ULONG_PTR>(h)));
  return buf;
}

std::string sampleJson(const Sample& s) {
  std::string o = "{\"t\":\"fg\",\"hwnd\":" + jstr(s.hwnd ? hwndText(s.hwnd) : "") + ",\"pid\":" + std::to_string(s.pid) +
                  ",\"exe\":" + jstr(s.exe) + ",\"name\":" + jstr(s.name) + ",\"browser\":" + (s.browser.empty() ? "null" : jstr(s.browser)) +
                  ",\"status\":" + jstr(s.status) + ",\"url\":" + jstr(s.url) + ",\"self\":" + (s.self ? "true" : "false") + "}";
  return o;
}

// ---------------------------------------------------------------------------
// closing a tab

bool modifiersDown() {
  static const int keys[] = {VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN};
  for (int k : keys)
    if (GetAsyncKeyState(k) & 0x8000) return true;
  return false;
}

bool sendCtrlW() {
  INPUT in[4] = {};
  in[0].type = INPUT_KEYBOARD;
  in[0].ki.wVk = VK_CONTROL;
  in[1].type = INPUT_KEYBOARD;
  in[1].ki.wVk = 'W';
  in[2].type = INPUT_KEYBOARD;
  in[2].ki.wVk = 'W';
  in[2].ki.dwFlags = KEYEVENTF_KEYUP;
  in[3].type = INPUT_KEYBOARD;
  in[3].ki.wVk = VK_CONTROL;
  in[3].ki.dwFlags = KEYEVENTF_KEYUP;
  return SendInput(4, in, sizeof(INPUT)) == 4;
}

void handleClose(const Command& c) {
  auto reply = [&](bool ok, const char* reason) {
    emit("{\"t\":\"closed\",\"id\":" + std::to_string(c.id) + ",\"ok\":" + (ok ? "true" : "false") + ",\"reason\":" + jstr(reason) + "}");
  };
  const HWND target = reinterpret_cast<HWND>(static_cast<ULONG_PTR>(std::strtoull(c.hwnd.c_str(), nullptr, 16)));
  if (!target || GetForegroundWindow() != target) return reply(false, "not-foreground");
  const Sample before = sampleWindow(target, false);
  if (before.browser.empty()) return reply(false, "not-browser");
  if (before.status != "ok") return reply(false, before.status == "editing" ? "editing" : "unreadable");
  std::string h, p;
  if (!splitAddress(before.url, h, p) || !matchesRule(h, p, c.host, c.path)) return reply(false, "moved-on");
  for (int i = 0; i < 30 && modifiersDown(); i++) Sleep(100);
  if (modifiersDown()) return reply(false, "keys-held");
  if (GetForegroundWindow() != target) return reply(false, "not-foreground");
  if (!sendCtrlW()) return reply(false, "input-blocked");
  Sleep(700);
  if (!IsWindow(target) || GetForegroundWindow() != target) return reply(true, "window-closed");
  const Sample after = sampleWindow(target, false);
  if (after.status == "ok") {
    std::string h2, p2;
    if (splitAddress(after.url, h2, p2) && matchesRule(h2, p2, c.host, c.path)) return reply(false, "still-open");
    return reply(true, "");
  }
  // The new tab page focuses the address bar, so an unreadable result here usually means success.
  return reply(true, "unverified");
}

// ---------------------------------------------------------------------------
// threads

void stdinThread() {
  const HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
  std::string buf;
  char chunk[4096];
  for (;;) {
    DWORD n = 0;
    if (!ReadFile(in, chunk, sizeof chunk, &n, nullptr) || n == 0) break;
    buf.append(chunk, n);
    size_t pos;
    while ((pos = buf.find('\n')) != std::string::npos) {
      const std::string line = buf.substr(0, pos);
      buf.erase(0, pos + 1);
      Command c;
      c.cmd = jget(line, "cmd");
      c.id = std::atoll(jget(line, "id").c_str());
      c.hwnd = jget(line, "hwnd");
      c.host = lower(jget(line, "host"));
      c.path = lower(jget(line, "path"));
      if (c.cmd == "quit") {
        requestQuit();
        return;
      }
      if (c.cmd.empty()) continue;
      {
        std::lock_guard<std::mutex> lk(g_cmdMutex);
        if (g_cmds.size() < 64) g_cmds.push_back(c);
      }
      SetEvent(g_wake);
    }
    if (buf.size() > 65536) buf.clear();
  }
  requestQuit();
}

void parentWatch() {
  if (!g_parentPid) return;
  const HANDLE h = OpenProcess(SYNCHRONIZE, FALSE, g_parentPid);
  if (!h) return;
  WaitForSingleObject(h, INFINITE);
  CloseHandle(h);
  requestQuit();
}

void workerThread() {
  const HRESULT co = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  AddressReader* reader = new AddressReader();
  const bool uiaOk = reader->init();
  g_reader = reader;
  emit("{\"t\":\"hello\",\"v\":" + std::to_string(kProtocolVersion) + ",\"pid\":" + std::to_string(GetCurrentProcessId()) +
       ",\"uia\":" + (uiaOk ? "true" : "false") + "}");
  if (!uiaOk) logLine("UI Automation could not be started; website addresses can't be read.");

  std::string lastLine;
  ULONGLONG lastEmit = 0;
  ULONGLONG lastPrune = GetTickCount64();
  while (!g_quit) {
    std::deque<Command> cmds;
    {
      std::lock_guard<std::mutex> lk(g_cmdMutex);
      cmds.swap(g_cmds);
    }
    bool force = false;
    for (const Command& c : cmds) {
      if (c.cmd == "close") handleClose(c);
      else if (c.cmd == "sample") force = true;
    }
    const Sample s = sampleWindow(GetForegroundWindow(), true);
    const std::string line = sampleJson(s);
    const ULONGLONG now = GetTickCount64();
    if (force || line != lastLine || now - lastEmit > 15000) {
      emit(line);
      lastLine = line;
      lastEmit = now;
    }
    if (now - lastPrune > 60000) {
      reader->prune();
      lastPrune = now;
    }
    // Browsers are re-read once a second (a cached property read); other apps only on events.
    WaitForSingleObject(g_wake, s.browser.empty() ? 3000 : 1000);
  }
  g_reader = nullptr;
  delete reader;
  if (SUCCEEDED(co)) CoUninitialize();
}

void CALLBACK onWinEvent(HWINEVENTHOOK, DWORD event, HWND hwnd, LONG idObject, LONG idChild, DWORD, DWORD);

void rehookNameChanges(HWND fg) {
  if (g_nameHook) {
    UnhookWinEvent(g_nameHook);
    g_nameHook = nullptr;
  }
  DWORD pid = 0;
  if (fg) GetWindowThreadProcessId(fg, &pid);
  if (pid && pid != GetCurrentProcessId()) {
    g_nameHook = SetWinEventHook(EVENT_OBJECT_NAMECHANGE, EVENT_OBJECT_NAMECHANGE, nullptr, onWinEvent, pid, 0, WINEVENT_OUTOFCONTEXT);
  }
}

void CALLBACK onWinEvent(HWINEVENTHOOK, DWORD event, HWND hwnd, LONG idObject, LONG idChild, DWORD, DWORD) {
  if (event == EVENT_SYSTEM_FOREGROUND) {
    rehookNameChanges(hwnd);
    SetEvent(g_wake);
  } else if (event == EVENT_OBJECT_NAMECHANGE) {
    // a tab switch or navigation changes the window title
    if (idObject == OBJID_WINDOW && idChild == CHILDID_SELF && hwnd == GetForegroundWindow()) SetEvent(g_wake);
  }
}

}  // namespace

int WINAPI wWinMain(HINSTANCE, HINSTANCE, LPWSTR, int) {
  for (int i = 1; __wargv && i + 1 < __argc; i++) {
    if (std::wcscmp(__wargv[i], L"--parent-pid") == 0) g_parentPid = static_cast<DWORD>(std::wcstoul(__wargv[i + 1], nullptr, 10));
  }

  g_stdout = GetStdHandle(STD_OUTPUT_HANDLE);
  if (g_stdout == nullptr || g_stdout == INVALID_HANDLE_VALUE) return 2;
  g_wake = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  g_uiThreadId = GetCurrentThreadId();

  // Make sure the message queue exists before other threads post to it.
  MSG msg;
  PeekMessageW(&msg, nullptr, WM_USER, WM_USER, PM_NOREMOVE);

  const HWINEVENTHOOK fgHook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, nullptr, onWinEvent, 0, 0, WINEVENT_OUTOFCONTEXT);
  if (!fgHook) {
    // Without the hook the worker still polls, just a little more slowly to react.
  }
  rehookNameChanges(GetForegroundWindow());

  std::thread(stdinThread).detach();
  std::thread(parentWatch).detach();
  std::thread worker(workerThread);

  while (!g_quit) {
    const BOOL r = GetMessageW(&msg, nullptr, 0, 0);
    if (r <= 0) break;
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }
  requestQuit();
  worker.join();
  if (g_nameHook) UnhookWinEvent(g_nameHook);
  if (fgHook) UnhookWinEvent(fgHook);
  return 0;
}
