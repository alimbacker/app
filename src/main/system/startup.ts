// "Start with Windows" (per-user login item).
import { app } from 'electron';
import { log } from './logger';

export const HIDDEN_ARG = '--hidden';

function exePath(): string {
  // electron-builder's portable build unpacks to a temp folder; register the real .exe instead.
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

export function loginItemSupported(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin';
}

export function applyLoginItem(enabled: boolean): { supported: boolean; enabled: boolean } {
  if (!loginItemSupported()) return { supported: false, enabled: false };
  if (!app.isPackaged) return { supported: true, enabled }; // never register the dev Electron binary
  try {
    const path = exePath();
    app.setLoginItemSettings({ openAtLogin: enabled, path, args: [HIDDEN_ARG], name: 'AllBee Focus' });
    const state = app.getLoginItemSettings({ path, args: [HIDDEN_ARG] });
    return { supported: true, enabled: state.openAtLogin };
  } catch (err) {
    log.warn('login item update failed', err);
    return { supported: true, enabled: false };
  }
}

export function startedHidden(): boolean {
  return process.argv.includes(HIDDEN_ARG);
}
