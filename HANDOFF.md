# AllBee Focus: work-in-progress handoff

Snapshot of the build so far, to resume from. The app **now starts and runs**, but it is
still not finished: there is no visible interface yet and no installer.

## Where things stand

| Area | State | Verified |
|---|---|---|
| Game rules and data model (`src/shared`) | Done | `npm run typecheck`, 87 unit tests pass |
| Native Windows monitor (`native/`, built exe in `resources/helper/`) | Done | Builds with mingw; protocol checked under Wine |
| Main process (`src/main`) | Done | Type-checks **and runs**: boots, saves, shuts down cleanly |
| IPC and commands (`src/main/ipc`) | Done | 22 unit tests + the end-to-end smoke test |
| Startup (`src/main/main.ts`) | Done | `npm run smoke` boots the real app headlessly |
| Preload bridge (`src/preload`) | Done | All three window roles exercised by the smoke test |
| Interface: pages, onboarding, focus mode, companion window, sounds (`src/renderer`) | Not started | — |
| Original character art (31 characters), room art, icons | Not started | — |
| Build scripts | `build-main.mjs` and `smoke.mjs` done; `dev.mjs` not started | Used on every run |
| Packaging (electron-builder) | Config written | Portable `.exe` builds from Linux; **NSIS needs Wine** |
| Docs (`docs/`) | Not started | — |

## What was added last session

### IPC and commands (`src/main/ipc/`)
- **`router.ts`** — the only way in from a window. Two checks run before anything happens:
  the request must come from the window allowed to send it (`event.sender` is compared
  against the `WebContents` we created, so the `--allbee-role=` argument is never trusted
  as identity), and the payload is then checked field by field.
- **`commands.ts`** — all 16 commands: export, import and reset behind native dialogs,
  history, test notification, restart monitor, snooze answer, window controls, and the
  dev-only `dev/simulate`.
- **`reset.ts`** — `buildResetData`, kept separate and free of Electron so the rule can be
  tested. Reset keeps settings, patrol and timer settings, site rules and tasks, and
  clears levels, coins, companions, history, days, streaks, missions and achievements.
  Tasks keep their title, notes and estimate but lose the focus time counted against them.
- **`broadcast.ts`** — batches data and runtime pushes on a 50 ms timer, so one finished
  session (XP, coins, a mission and an achievement) becomes one message, not four.

### Startup (`src/main/main.ts`)
Single-instance lock, app ID, stays alive in the tray when every window closes,
`--hidden` start, native confirmation before quitting, and a shutdown path that stops each
part in turn and saves. It also wires two things that nothing was calling yet:
`applyLoginItem` when "Start with Windows" changes, and `applyTheme` when the theme does.

### Preload (`src/preload/preload.ts`)
Reads `--allbee-role=` and exposes only that role's API on `window.allbee`. No Node, no
`ipcRenderer`, and no raw event objects (they carry a reference to the sender).
`global.d.ts` types `window.allbee` for the renderer.

### Shared
`utilities/commands.ts` holds `validateCommand` and `validatePointer`, next to the
existing `validateAction` and sharing its field checker.

### Scripts
- `scripts/build-main.mjs` — esbuild, bundles main and preload to `dist/main` as CommonJS
  with `electron` external. The preload is bundled because a sandboxed preload cannot
  require anything else.
- `scripts/smoke.mjs` — boots the real main process against stand-in pages and checks the
  whole chain: preload, IPC, validation, reducer, storage, and the pushes back out. The
  stand-in dashboard reports its results by adding a task called `SMOKE ...`, so a pass has
  to survive the round trip onto disk to be seen at all.

## Three bugs found and fixed

1. **The companion window came back during shutdown.** `companion.stop()` saves the
   companion's position, which changes the data, which lands back in `sync()` — and since
   the window had already closed, a new one was built as the app was quitting. `sync()` now
   refuses to build a window while `windows.quitting` is set.
2. **`validateAction` accepted inherited keys.** The extra-field check used
   `key in shape`, and `in` walks the prototype chain, so `__proto__`, `constructor`,
   `toString` and the rest were all accepted as known fields and passed into the reducer.
   Both validators now use `Object.prototype.hasOwnProperty.call`. (The *type* lookup
   already did this correctly; only the field loop was wrong.) Locked down by tests.
3. **Batching depended on `isVisible()`.** The broadcaster used to wait longer for a hidden
   window. That made how quickly the dashboard responds depend on a value that is not
   dependable everywhere — see the trap below, where it cost 750 ms per update. One
   interval now, for very little extra traffic.

## A trap to know about before the screenshot step

`createMain` uses `titleBarStyle: 'hidden'`, which is right for the Windows 11 custom title
bar. Under a virtual display with no window manager, **`ready-to-show` never fires for such
a window**, so it is never shown and `isVisible()` stays false. Calling `show()` explicitly
makes `ready-to-show` fire straight away and everything then behaves normally.

This is a Linux-only artefact of a Windows window style, not a fault in the app. It matters
because the plan is to run the app under a virtual display and screenshot every page: a
script that waits for `ready-to-show` will wait forever and capture nothing. Call `show()`
yourself. Note that `WindowManager.showMain()` returns early while `mainReady` is false, so
on Linux it will not open the window either.

## Commands that work today

```bash
npm install          # Node 22
npm run typecheck    # passes
npm test             # 87 tests pass
npm run build:main   # esbuild -> dist/main/main.js + preload.js
npm run smoke        # boots the app end to end; needs a display: xvfb-run -a npm run smoke
npm run build:helper # needs mingw-w64 (Linux) or MSYS2 MinGW (Windows)
```

`dev`, `icons`, `art:sheet` and `dist:win` still call files that do not exist, and the
electron-builder config is still not in `package.json`.

## Packaging: what works and what is missing

The electron-builder config now lives in `package.json` under `"build"`, and it has been
run. Two things came out of that:

- **The portable target builds from Linux with no Wine.** `npx electron-builder --win
  portable --x64` produces a single `release/AllBee-Focus.exe` of about 95 MB (Electron
  apps are large; a Tauri app of the same shape is nearer 2 MB). This is the "one file you
  just open" build.
- **The NSIS installer does not.** `--win nsis` gets as far as the installer step and then
  fails with `wine process failed ENOENT`, because electron-builder shells out to Wine to
  assemble the installer. Install Wine in the build container, or build the installer on a
  Windows machine.

Still to wire in once `scripts/generate-icons.mjs` exists (step 3 below): add
`"icon": "resources/icons/app.ico"` under `build.win`, and add
`{ "from": "resources/icons", "to": "icons" }` to `build.extraResources`. Until then
electron-builder falls back to the default Electron icon and says so.

**There is nothing worth packaging yet.** With no `src/renderer`, every window loads a file
that does not exist, so the packaged app starts, sits in the tray and shows an empty
window. The packaging step is only useful after step 1.

## Next steps, in order

1. **Interface (`src/renderer`, Vite multi-page: `index.html`, `companion.html`, `audio.html`):**
   - **Design:** dark navy with teal and soft blue. Colour tokens and fonts are in
     `PROGRESS.md` (Unbounded for headings, Figtree for text; a hexagon progress ring is
     the signature element).
   - **Layout:** sidebar, custom title bar and the "● Saved" badge.
   - **Pages:** Home/Today, Focus (timer + sounds), Tasks, Patrol, Site limits, My Companion
     (settings + room), Missions (plus daily rewards and the streak calendar), Statistics
     (charts), Achievements, Collection, Shop, Settings (incl. Data export/import/reset),
     About.
   - **Flows:** 6-screen onboarding, focus mode, celebration cards, toasts, confirm dialogs,
     and empty, loading and error states.
   - **Companion window:** transparent, with speech bubble, snooze prompt, countdown, and
     mouse click-through outside the character.
   - **Audio window:** generated rain/forest/ocean/cafe/fireplace/white/brown noise plus
     chimes (no copyrighted audio).
2. **Original art:** a single SVG character system for 18 pets and 13 heroes, with all poses
   from §14, 5 evolution stages and accessories. Also room and base scenes, decoration art,
   and a script that renders a preview sheet to review the art.
3. **Icons:** `scripts/generate-icons.mjs` (app + tray `.ico`/`.png` using @resvg/resvg-js).
4. **Build:** `scripts/dev.mjs`. The electron-builder config is already written and
   produces `AllBee-Focus-Setup.exe` (NSIS) and `AllBee-Focus.exe` (portable); it still
   needs the icon entries above, and Wine for the installer.
5. **Verify:** typecheck, tests, then `npm run smoke`, then run under a virtual display with
   `ALLBEE_SIMULATE=1` and screenshot every page and the companion (mind the trap above).
   Build both exes and try the installer silently under Wine.
6. **Docs** in `docs/`: README, build instructions, architecture, configuration, test checklist.

## What the renderer needs to know about the bridge

- `window.allbee.role` is `'main'`, `'companion'` or `'audio'`; narrow on it. Types come
  from `src/shared/constants/ipc.ts` and are applied to `window` by
  `src/preload/global.d.ts`.
- **Dashboard:** call `getSnapshot()` once on load, then keep up with `onData`, `onRuntime`
  and `onUiEvent`. Each `on...` returns its own unsubscribe function. `dispatch` takes a
  `PublicAction` and returns `{ ok, error? }`; `command` takes an `AppCommand` and returns
  `{ ok, error?, value?, cancelled?, message? }`. A `cancelled` result means the user closed
  a dialog, which is not an error and should not raise a toast.
- **`app/quit` already shows a native confirmation**, so do not add a second one in the UI.
  `window/close` hides to the tray rather than quitting, which is what the title-bar × should do.
- **Companion window:** call `ready()` once mounted, then `onView`. Send `pointer()` events;
  `hover` drives mouse click-through, so send it on enter and leave of the character itself.
- **Audio window:** call `ready()` once the audio graph can start, then `onState` and `onChime`.
- `ALLBEE_RENDERER_DIR` points the main process at a folder of pages, which is how the smoke
  test runs without the real renderer. `ALLBEE_DEV_SERVER` still wins over it.

## Decisions already made (and told to you)
- **Page names:** "Focus" is the timer page, and "Site limits" is the website allowance page
  (with the brief's subtitle). "Today" and "Settings" pages are added.
- **Patrol default:** Only complain. Closing tabs must be switched on by you.
- **Shortcuts:** Ctrl+Shift+F/S/P always work inside the app; system-wide use is opt-in
  because they clash with VS Code.
- **Monitor:** a native program, not PowerShell (lighter on the CPU and not blocked by
  work-PC policies).
- **Visit AllBee:** the About page button stays disabled until `ALLBEE_WEBSITE_URL` in
  `src/shared/constants/brand.ts` holds the real address, and the `app/openWebsite` command
  refuses while it is empty. **Needed from you: AllBee's official website URL.**

## Known limitations to keep in mind
- **Address reading:** untested on real Windows (Wine can't test it). Chrome and Edge show
  addresses without "https://"; the parser already handles that.
- **Unsigned exes:** these may trigger Windows SmartScreen until the app is code-signed.
  electron-builder logs "signing with signtool.exe" during the build, but with no
  certificate configured nothing is actually signed.
- **Firefox pinned tabs:** Ctrl+W may not close them. The app then falls back to complaining
  and says why.
- **The main process has only been run on Linux.** Everything Windows-specific — the tray
  icon, login item, notifications, the helper — degrades gracefully there rather than being
  exercised. It needs a run on a real Windows PC.
