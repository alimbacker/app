// Creates and manages the three windows: the main dashboard, the transparent desktop
// companion and a hidden window that plays sounds.
import { BrowserWindow, nativeTheme, screen, shell, type BrowserWindowConstructorOptions } from 'electron';
import { IPC } from '@shared/constants/ipc';
import type { PageId, RuntimeState, UiEvent, ViewData } from '@shared/types';
import type { Engine } from './engine/engine';
import { log } from './system/logger';
import { iconPath, preloadPath, rendererTarget } from './system/paths';

const DARK = { bg: '#0E1726', symbol: '#C9D4E5' };
const LIGHT = { bg: '#F4F7FB', symbol: '#1E2B40' };
export const TITLEBAR_HEIGHT = 40;

function load(win: BrowserWindow, page: 'index' | 'companion' | 'audio'): void {
  const t = rendererTarget(page);
  const p = t.url ? win.loadURL(t.url) : win.loadFile(t.file!);
  p.catch((err) => log.error(`failed to load ${page}`, err));
}

function isAllowedUrl(url: string): boolean {
  const dev = process.env.ALLBEE_DEV_SERVER;
  if (dev && url.startsWith(dev)) return true;
  return url.startsWith('file://');
}

/** Blocks navigation, new windows and permission prompts in every app window. */
function harden(win: BrowserWindow): void {
  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (!isAllowedUrl(url)) e.preventDefault();
  });
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  wc.session.setPermissionCheckHandler(() => false);
  wc.on('render-process-gone', (_e, details) => {
    log.error('renderer gone', details.reason, details.exitCode);
    if (details.reason !== 'clean-exit' && !win.isDestroyed()) setTimeout(() => !win.isDestroyed() && wc.reload(), 1000);
  });
}

export class WindowManager {
  main: BrowserWindow | null = null;
  companion: BrowserWindow | null = null;
  audio: BrowserWindow | null = null;
  quitting = false;
  private mainReady = false;
  private pendingPage: PageId | null = null;
  private hiddenTipShown = false;
  onFirstHide: () => void = () => {};

  constructor(private readonly engine: Engine) {}

  private colors() {
    return nativeTheme.shouldUseDarkColors ? DARK : LIGHT;
  }

  private webPrefs(role: 'main' | 'companion' | 'audio', extra: Partial<BrowserWindowConstructorOptions['webPreferences']> = {}) {
    return {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: !!process.env.ALLBEE_DEV_SERVER || !!process.env.ALLBEE_DEVTOOLS,
      additionalArguments: [`--allbee-role=${role}`],
      ...extra,
    };
  }

  createMain(show: boolean): BrowserWindow {
    if (this.main && !this.main.isDestroyed()) return this.main;
    const wa = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.min(1240, Math.max(1000, Math.round(wa.width * 0.72)));
    const height = Math.min(820, Math.max(640, Math.round(wa.height * 0.86)));
    const c = this.colors();
    const win = new BrowserWindow({
      width,
      height,
      minWidth: 980,
      minHeight: 620,
      show: false,
      title: 'AllBee Focus',
      icon: iconPath(process.platform === 'win32' ? 'app.ico' : 'app.png'),
      backgroundColor: c.bg,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: c.bg, symbolColor: c.symbol, height: TITLEBAR_HEIGHT },
      autoHideMenuBar: true,
      webPreferences: this.webPrefs('main'),
    });
    win.setMenu(null);
    harden(win);
    this.main = win;
    this.mainReady = false;
    win.once('ready-to-show', () => {
      this.mainReady = true;
      if (show) {
        win.show();
        win.focus();
      }
    });
    win.webContents.on('did-finish-load', () => {
      if (this.pendingPage) {
        this.sendUi({ kind: 'navigate', page: this.pendingPage });
        this.pendingPage = null;
      }
    });
    win.on('close', (e) => {
      if (this.quitting) return;
      e.preventDefault();
      win.hide();
      if (!this.hiddenTipShown) {
        this.hiddenTipShown = true;
        this.onFirstHide();
      }
    });
    win.on('minimize', () => {
      if (this.engine.data.settings.minimizeToTray && process.platform === 'win32') {
        win.hide();
      }
    });
    win.on('closed', () => {
      this.main = null;
    });
    load(win, 'index');
    return win;
  }

  showMain(page?: PageId): void {
    const win = this.createMain(true);
    if (page) {
      if (this.mainReady && !win.webContents.isLoading()) this.sendUi({ kind: 'navigate', page });
      else this.pendingPage = page;
    }
    if (!this.mainReady) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  toggleMain(): void {
    const win = this.main;
    if (win && win.isVisible() && !win.isMinimized() && win.isFocused()) win.hide();
    else this.showMain();
  }

  get mainVisible(): boolean {
    return !!this.main && this.main.isVisible() && !this.main.isMinimized();
  }

  applyTheme(): void {
    const theme = this.engine.data.settings.theme;
    if (nativeTheme.themeSource !== theme) nativeTheme.themeSource = theme;
    const c = this.colors();
    const win = this.main;
    if (win && !win.isDestroyed()) {
      try {
        win.setTitleBarOverlay({ color: c.bg, symbolColor: c.symbol, height: TITLEBAR_HEIGHT });
      } catch {
        /* not supported on this platform */
      }
      win.setBackgroundColor(c.bg);
    }
  }

  sendUi(event: UiEvent): void {
    const win = this.main;
    if (win && !win.isDestroyed()) win.webContents.send(IPC.uiEvent, event);
  }

  sendData(data: ViewData): void {
    const win = this.main;
    if (win && !win.isDestroyed()) win.webContents.send(IPC.data, data);
  }

  sendRuntime(rt: RuntimeState): void {
    const win = this.main;
    if (win && !win.isDestroyed()) win.webContents.send(IPC.runtime, rt);
  }

  createCompanion(bounds: { x: number; y: number; width: number; height: number }, alwaysOnTop: boolean): BrowserWindow {
    const win = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      alwaysOnTop,
      backgroundColor: '#00000000',
      title: 'AllBee Focus companion',
      type: process.platform === 'win32' ? 'toolbar' : undefined,
      webPreferences: this.webPrefs('companion', { backgroundThrottling: false }),
    });
    if (alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setMenu(null);
    harden(win);
    load(win, 'companion');
    this.companion = win;
    win.on('closed', () => {
      this.companion = null;
    });
    return win;
  }

  createAudio(): BrowserWindow {
    const win = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: this.webPrefs('audio', { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }),
    });
    harden(win);
    load(win, 'audio');
    this.audio = win;
    win.on('closed', () => {
      this.audio = null;
    });
    return win;
  }

  destroyAll(): void {
    for (const w of [this.companion, this.audio, this.main]) {
      if (w && !w.isDestroyed()) w.destroy();
    }
  }
}
