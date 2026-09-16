# AllBee Focus - Windows Build

## Development
Open PowerShell in this folder:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\START-DEV-WINDOWS.ps1
```

## Create the Windows installer

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\BUILD-WINDOWS.ps1
```

The configured electron-builder targets are NSIS and portable Windows builds. The NSIS artifact is named `AllBee-Focus-Setup.exe`.

## Important
Install Node.js LTS first. The application requires Windows for the final Electron packaging and Windows tray/desktop integration.
