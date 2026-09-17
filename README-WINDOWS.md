# AllBee Focus — Windows build

## Development
1. Install Node.js LTS on Windows.
2. Open PowerShell in this folder.
3. Run `npm install`.
4. Run `npm start`.

## Installer
Run `npm run dist`.
The `dist` folder will contain `AllBee-Focus-Setup.exe` and a portable Windows build.

## Browser monitoring
Chrome/Edge/Brave can use the included Manifest V3 extension. Load the `extension` folder from the browser's extension developer page. The desktop app exposes a localhost bridge and does not fake URL monitoring when the extension is absent.

## Architecture
- `main.js`: Electron main process, tray, persistent storage, main window, companion window.
- `preload.js`: secure IPC bridge.
- `renderer/`: dashboard and transparent companion UI.
- `extension/`: active-tab bridge.
