// Things a window can ask the main process to do that are not state changes: open
// dialogs, move windows, export and import the data file, restart the monitor.
// Every command has already been checked by validateCommand before it gets here.
import { dialog, shell, type BrowserWindow, type MessageBoxOptions, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import path from 'node:path';
import { ALLBEE_WEBSITE_URL, APP_NAME, LIMITS } from '@shared/constants/brand';
import type { CommandResult } from '@shared/constants/ipc';
import type { AppCommand, SessionRecord } from '@shared/types';
import { clamp } from '@shared/utilities/ids';
import { dayKey } from '@shared/utilities/time';
import type { Engine } from '../engine/engine';
import type { MonitorService } from '../monitoring/monitor-service';
import type { Notifier } from '../notifications/notifier';
import { friendlyFsError, type DataStore } from '../storage/data-store';
import { log } from '../system/logger';
import type { WindowManager } from '../windows';
import { buildResetData } from './reset';

export interface CommandDeps {
  engine: Engine;
  windows: WindowManager;
  store: DataStore;
  notifier: Notifier;
  monitor: MonitorService;
  /** Developer mode: dev/simulate is accepted. */
  simulate: boolean;
  /** Asks to quit, showing the confirmation dialog. */
  requestQuit(): void;
}

const GENERIC_SAVE_ERROR = 'Your latest changes couldn’t be saved.';

function parentWindow(windows: WindowManager): BrowserWindow | null {
  const win = windows.main;
  return win && !win.isDestroyed() ? win : null;
}

// Electron has separate overloads with and without a parent window.
const askSave = (win: BrowserWindow | null, opts: SaveDialogOptions) => (win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts));
const askOpen = (win: BrowserWindow | null, opts: OpenDialogOptions) => (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts));
const askBox = (win: BrowserWindow | null, opts: MessageBoxOptions) => (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts));

const JSON_FILTER = [{ name: 'AllBee Focus backup', extensions: ['json'] }];

async function exportData(deps: CommandDeps): Promise<CommandResult> {
  const win = parentWindow(deps.windows);
  const res = await askSave(win, {
    title: 'Export AllBee Focus data',
    defaultPath: `allbee-focus-backup-${dayKey(Date.now())}.json`,
    filters: JSON_FILTER,
  });
  if (res.canceled || !res.filePath) return { ok: true, cancelled: true };
  try {
    deps.store.exportTo(res.filePath, deps.engine.data);
  } catch (err) {
    log.error('export failed', err);
    return { ok: false, error: friendlyFsError(err) };
  }
  return { ok: true, message: `Saved to ${path.basename(res.filePath)}` };
}

async function importData(deps: CommandDeps): Promise<CommandResult> {
  const win = parentWindow(deps.windows);
  const picked = await askOpen(win, {
    title: 'Import AllBee Focus data',
    properties: ['openFile'],
    filters: JSON_FILTER,
  });
  if (picked.canceled || !picked.filePaths.length) return { ok: true, cancelled: true };
  const read = deps.store.readImport(picked.filePaths[0], Date.now());
  if ('error' in read) return { ok: false, error: read.error };
  const confirm = await askBox(win, {
    type: 'warning',
    buttons: ['Replace my data', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: 'Import data',
    message: 'Replace everything with the imported file?',
    detail: 'Your current progress, settings, tasks and site rules will all be replaced. This can’t be undone.',
  });
  if (confirm.response !== 0) return { ok: true, cancelled: true };
  const ok = deps.engine.replaceData(read.data);
  return ok ? { ok: true, message: 'Your data was imported.' } : { ok: false, error: GENERIC_SAVE_ERROR };
}

async function resetData(deps: CommandDeps): Promise<CommandResult> {
  const win = parentWindow(deps.windows);
  const confirm = await askBox(win, {
    type: 'warning',
    buttons: ['Reset progress', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: 'Reset progress',
    message: 'Start again from day one?',
    detail:
      'Levels, coins, companions, session history, streaks, missions and achievements will all be cleared.\n\nYour settings, site rules and tasks are kept. This can’t be undone, so export your data first if you want a copy.',
  });
  if (confirm.response !== 0) return { ok: true, cancelled: true };
  const ok = deps.engine.replaceData(buildResetData(deps.engine.data, Date.now()));
  return ok ? { ok: true, message: 'Your progress was reset.' } : { ok: false, error: GENERIC_SAVE_ERROR };
}

function recentHistory(engine: Engine, limit: number): SessionRecord[] {
  const all = engine.data.history;
  const want = clamp(Math.round(limit), 1, LIMITS.maxHistory);
  // Stored oldest first; the UI wants the newest at the top.
  return all.slice(Math.max(0, all.length - want)).reverse();
}

export async function runCommand(cmd: AppCommand, deps: CommandDeps): Promise<CommandResult> {
  const { engine, windows } = deps;
  switch (cmd.type) {
    case 'window/minimize': {
      const win = parentWindow(windows);
      win?.minimize();
      return { ok: true };
    }
    case 'window/close': {
      // The window manager turns this into "hide", so the app keeps running in the tray.
      const win = parentWindow(windows);
      win?.close();
      return { ok: true };
    }
    case 'app/quit':
      deps.requestQuit();
      return { ok: true };
    case 'app/openWebsite': {
      const url = ALLBEE_WEBSITE_URL.trim();
      if (!/^https:\/\//i.test(url)) return { ok: false, error: 'The AllBee website address hasn’t been set yet.' };
      void shell.openExternal(url);
      return { ok: true };
    }
    case 'companion/show':
      return engine.dispatch({ type: 'settings/update', patch: { companionVisible: cmd.show } });
    case 'focusMode/set':
      engine.setRuntime({ focusMode: cmd.on });
      windows.sendUi({ kind: 'focusMode', on: cmd.on });
      return { ok: true };
    case 'data/export':
      return exportData(deps);
    case 'data/import':
      return importData(deps);
    case 'data/reset':
      return resetData(deps);
    case 'data/openFolder': {
      const err = await shell.openPath(deps.store.dir);
      return err ? { ok: false, error: 'Windows couldn’t open the data folder.' } : { ok: true };
    }
    case 'save/retry':
      return engine.retrySave() ? { ok: true, message: 'Your progress was saved.' } : { ok: false, error: engine.runtime.save.error ?? GENERIC_SAVE_ERROR };
    case 'notifications/test': {
      const shown = deps.notifier.show(APP_NAME, 'Notifications are working. Reminders will look like this.', { force: true });
      return shown ? { ok: true, message: 'Test notification sent.' } : { ok: false, error: engine.runtime.notifications.error ?? 'Windows couldn’t show the notification.' };
    }
    case 'monitor/restart':
      deps.monitor.restart();
      return { ok: true, message: 'Restarting the website monitor…' };
    case 'patrol/snoozeChoice':
      deps.monitor.answerSnooze(cmd.snooze);
      return { ok: true };
    case 'history/get':
      return { ok: true, value: recentHistory(engine, cmd.limit) };
    case 'dev/simulate': {
      if (!deps.simulate) return { ok: false, error: 'Developer simulation is switched off.' };
      return deps.monitor.simulate(cmd.url) ? { ok: true } : { ok: false, error: 'Simulation isn’t available.' };
    }
    default: {
      const never: never = cmd;
      log.warn('unhandled command', (never as { type: string }).type);
      return { ok: false, error: 'That request wasn’t understood.' };
    }
  }
}
