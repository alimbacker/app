// The in-memory half of the app state: what the windows need to know about this run
// (monitor status, save status, platform) but that is never written to disk.
import { Notification, app } from 'electron';
import os from 'node:os';
import type { RuntimeState } from '@shared/types';
import { loginItemSupported } from './startup';

export interface RuntimeSeed {
  /** Folder the data file lives in, shown on the Settings page. */
  dataPath: string;
  /** Set when start-up had to repair or replace the data file. */
  loadWarning: string | null;
  simulated: boolean;
}

/** The Windows account name, used for greetings until the user sets their own. */
export function osUserName(): string {
  try {
    return os.userInfo().username || '';
  } catch {
    return '';
  }
}

function notificationsSupported(): boolean {
  try {
    return Notification.isSupported();
  } catch {
    return false;
  }
}

export function createRuntime(seed: RuntimeSeed): RuntimeState {
  const now = Date.now();
  return {
    monitor: { state: 'off', message: 'Patrol is off. Your companion stays on the desktop, but websites aren’t watched.', since: now },
    foreground: null,
    active: null,
    enforcement: null,
    focusMode: false,
    companionShown: false,
    save: { state: 'saved', at: now },
    loadWarning: seed.loadWarning,
    notifications: { supported: notificationsSupported(), error: null },
    loginItem: { supported: loginItemSupported(), enabled: false },
    shortcuts: { global: false, failed: [] },
    osUserName: osUserName(),
    platform: process.platform,
    version: app.getVersion(),
    isDev: !app.isPackaged,
    simulated: seed.simulated,
    dataPath: seed.dataPath,
  };
}
