# AllBee Focus

Windows 10/11 productivity companion — **Focus. Grow. Achieve.**

## Stack
- Electron + React + TypeScript + Vite
- electron-store for local persistence
- WebSocket bridge + browser extension for real URL monitoring
- electron-builder for NSIS + portable Windows builds

## Run
1. Install Node.js 20+.
2. `npm install`
3. `npm run dev`

## Build Windows installer
On Windows:
1. `npm install`
2. `npm run build`
3. Output is produced in `release/` as `AllBee-Focus-Setup.exe` and a portable executable.

## Browser monitoring
Install `extension/` as an unpacked extension in Chrome/Edge/Brave developer mode. Firefox requires adapting the manifest/background service worker to the Firefox extension format. The extension sends the active tab URL to the local AllBee Focus process at `127.0.0.1:18765`. The desktop app never pretends URL detection works when the bridge is unavailable.

## Architecture
`src/` contains the React UI, state model and product screens. `electron/` owns the secure desktop process, tray, transparent companion window, local persistence, Windows notifications and browser bridge. `extension/` is the optional browser-side URL integration.

## Safety
Website closing is intentionally not wired to arbitrary process termination. Enforcement should only act on a browser tab through the extension after the user explicitly selects **Close it**.
