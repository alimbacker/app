// Start-up. Loads the saved data, builds the parts of the app, wires them together and
// keeps them running in the notification area until the user really means to quit.
import { app, dialog, nativeTheme, type MessageBoxOptions } from 'electron';
import { APP_ID, APP_NAME } from '@shared/constants/brand';
import type { PageId, ThemePref } from '@shared/types';
import { CompanionController } from './companion/companion-controller';
import { AudioBridge } from './engine/audio';
import { Engine } from './engine/engine';
import { wireReactions } from './engine/reactions';
import { Scheduler } from './engine/scheduler';
import { Broadcaster } from './ipc/broadcast';
import { registerIpc } from './ipc/router';
import { MonitorService } from './monitoring/monitor-service';
import { Notifier } from './notifications/notifier';
import { DataStore } from './storage/data-store';
import { initLogger, log } from './system/logger';
import { applyUserDataOverride } from './system/paths';
import { createRuntime } from './system/runtime';
import { Shortcuts } from './system/shortcuts';
import { applyLoginItem, startedHidden } from './system/startup';
import { TrayController } from './tray';
import { WindowManager } from './windows';

/** Set once the app is built, so handlers registered before start-up can reach it. */
let live: { showMain(page?: PageId): void } | null = null;

function safely(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    log.error(`${label} failed`, err);
  }
}

function start(): void {
  const dir = app.getPath('userData');
  initLogger(dir);
  log.info(`${APP_NAME} ${app.getVersion()} starting · ${process.platform} · electron ${process.versions.electron}`);

  const store = new DataStore(dir);
  const loaded = store.load(Date.now());
  if (loaded.warning) log.warn('data:', loaded.warning);

  // Developer mode only: the website monitor is faked instead of running the helper.
  const simulate = process.env.ALLBEE_SIMULATE === '1' && !app.isPackaged;
  if (simulate) log.info('website monitoring is simulated (developer mode)');

  const engine = new Engine(store, loaded.data, createRuntime({ dataPath: dir, loadWarning: loaded.warning, simulated: simulate }));
  const windows = new WindowManager(engine);
  const notifier = new Notifier(engine, windows);
  const audio = new AudioBridge(engine, windows);
  const broadcaster = new Broadcaster(engine, windows);

  // ---------------------------------------------------------------------------
  // quitting

  let quitting = false;
  let asking = false;

  function quitNow(): void {
    if (quitting) return;
    quitting = true;
    // The main window refuses to close until this is set; without it the app would
    // hide itself instead of shutting down.
    windows.quitting = true;
    app.quit();
  }

  /** Quitting hides the companion and stops Patrol, so it is always confirmed first. */
  async function requestQuit(): Promise<void> {
    if (quitting || asking) return;
    asking = true;
    try {
      const running = engine.data.timer.status === 'running';
      const opts: MessageBoxOptions = {
        type: 'question',
        buttons: ['Quit', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: `Quit ${APP_NAME}?`,
        message: `Quit ${APP_NAME}?`,
        detail: running
          ? 'Your companion and Patrol will stop. The session you have running will be finished for you the next time you open the app.'
          : 'Your companion and Patrol will stop until you open the app again.',
      };
      const parent = windows.main && !windows.main.isDestroyed() && windows.main.isVisible() ? windows.main : null;
      const { response } = parent ? await dialog.showMessageBox(parent, opts) : await dialog.showMessageBox(opts);
      if (response === 0) quitNow();
    } finally {
      asking = false;
    }
  }

  // ---------------------------------------------------------------------------
  // the parts, and the knots between them

  const companion = new CompanionController(engine, windows, {
    holdForSnooze: () => monitor.holdForSnooze(),
    answerSnooze: (snooze) => monitor.answerSnooze(snooze),
    openMain: (page) => windows.showMain(page),
    quit: () => void requestQuit(),
  });

  const monitor = new MonitorService(engine, {
    simulate,
    onReaction: (reaction) => companion.onPatrol(reaction),
  });

  const tray = new TrayController(engine, windows, {
    toggleCompanion: () => toggleCompanion(),
    quit: () => void requestQuit(),
  });

  const shortcuts = new Shortcuts(engine, {
    toggleTimer: () => engine.dispatch({ type: 'timer/toggle' }),
    openSettings: () => windows.showMain('settings'),
    toggleCompanion: () => toggleCompanion(),
  });

  const scheduler = new Scheduler(engine);

  function toggleCompanion(): void {
    engine.dispatch({ type: 'settings/update', patch: { companionVisible: !engine.data.settings.companionVisible } });
  }

  const stopReactions = wireReactions({ engine, windows, notifier, companion, audio });
  const unregisterIpc = registerIpc({ engine, windows, store, notifier, monitor, companion, audio, simulate, requestQuit: () => void requestQuit() });

  // ---------------------------------------------------------------------------
  // settings that reach outside the app

  let lastTheme: ThemePref | null = null;
  let lastLoginItem: boolean | null = null;

  function syncSystemSettings(): void {
    const s = engine.data.settings;
    if (s.theme !== lastTheme) {
      lastTheme = s.theme;
      safely('theme', () => windows.applyTheme());
    }
    if (s.startWithWindows !== lastLoginItem) {
      lastLoginItem = s.startWithWindows;
      safely('start with Windows', () => engine.setRuntime({ loginItem: applyLoginItem(s.startWithWindows) }));
    }
  }

  engine.on('data', () => syncSystemSettings());
  nativeTheme.on('updated', () => windows.applyTheme());
  syncSystemSettings();

  windows.onFirstHide = () => {
    notifier.show(APP_NAME, `${APP_NAME} is still running in the notification area, so your companion and Patrol keep going.`, {
      key: 'hidden-tip',
      gapMs: 24 * 3_600_000,
    });
  };

  live = { showMain: (page) => windows.showMain(page) };

  // ---------------------------------------------------------------------------
  // go

  const hidden = startedHidden();
  windows.createAudio();
  if (hidden) log.info('started hidden; the window opens from the tray');
  else windows.createMain(true);

  broadcaster.start();
  audio.start();
  companion.start();
  monitor.start();
  tray.start();
  shortcuts.start();
  // Last: starting the scheduler can immediately finish a session that ended while the
  // app was closed, and everything that reacts to that has to be listening already.
  scheduler.start();

  app.on('before-quit', () => {
    quitting = true;
    windows.quitting = true;
  });

  app.on('will-quit', () => {
    log.info('shutting down');
    safely('ipc', unregisterIpc);
    safely('reactions', stopReactions);
    safely('scheduler', () => scheduler.stop());
    safely('monitor', () => monitor.stop());
    // Saves where the companion was standing, so it comes back to the same place.
    safely('companion', () => companion.stop());
    safely('tray', () => tray.stop());
    safely('shortcuts', () => shortcuts.stop());
    safely('broadcaster', () => broadcaster.stop());
    if (!engine.flush()) log.error('the final save did not succeed');
  });

  // Ctrl+C in a terminal, or the OS asking us to stop: skip the confirmation.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => quitNow());

  log.info('ready');
}

// ---------------------------------------------------------------------------
// bootstrap

applyUserDataOverride();

if (!app.requestSingleInstanceLock()) {
  // Another copy is already running; it will bring its window forward.
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);

  app.on('second-instance', () => live?.showMain());
  // Closing every window is not a reason to quit: the app lives in the tray.
  app.on('window-all-closed', () => {});
  app.on('activate', () => live?.showMain());

  process.on('uncaughtException', (err) => log.error('uncaught exception', err));
  process.on('unhandledRejection', (err) => log.error('unhandled rejection', err));

  app
    .whenReady()
    .then(start)
    .catch((err) => {
      log.error('start-up failed', err);
      dialog.showErrorBox(APP_NAME, `${APP_NAME} could not start.\n\n${err instanceof Error ? err.message : String(err)}`);
      app.exit(1);
    });
}
