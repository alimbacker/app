// Windows notification-area icon and menu.
import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron';
import { formatClock, formatCountdown } from '@shared/utilities/time';
import type { Engine } from './engine/engine';
import { log } from './system/logger';
import { iconPath } from './system/paths';
import type { WindowManager } from './windows';

export interface TrayActions {
  toggleCompanion(): void;
  quit(): void;
}

export class TrayController {
  private tray: Tray | null = null;
  private lastMenuKey = '';
  private tooltipTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly windows: WindowManager,
    private readonly actions: TrayActions,
  ) {}

  start(): void {
    try {
      const file = iconPath(process.platform === 'win32' ? 'tray.ico' : 'tray.png');
      const image = nativeImage.createFromPath(file);
      this.tray = new Tray(image.isEmpty() ? nativeImage.createFromPath(iconPath('app.png')) : image);
    } catch (err) {
      log.error('tray could not be created', err);
      return;
    }
    this.tray.setToolTip('AllBee Focus');
    this.tray.on('click', () => this.windows.toggleMain());
    this.tray.on('double-click', () => this.windows.showMain());
    this.engine.on('data', () => this.refresh());
    this.engine.on('runtime', () => this.refresh());
    this.tooltipTimer = setInterval(() => this.updateTooltip(), 15_000);
    this.refresh();
  }

  stop(): void {
    if (this.tooltipTimer) clearInterval(this.tooltipTimer);
    this.tray?.destroy();
    this.tray = null;
  }

  private refresh(): void {
    if (!this.tray) return;
    const d = this.engine.data;
    const rt = this.engine.runtime;
    const now = Date.now();
    const snoozed = d.patrol.snoozedUntil && d.patrol.snoozedUntil > now ? d.patrol.snoozedUntil : null;
    const key = JSON.stringify([d.timer.status, d.timer.phase, rt.companionShown, d.settings.companionVisible, snoozed, d.patrol.enabled, d.patrol.snoozeMinutes, d.onboarded]);
    this.updateTooltip();
    if (key === this.lastMenuKey) return;
    this.lastMenuKey = key;
    const t = d.timer;
    const go = (page: Parameters<WindowManager['showMain']>[0]) => () => this.windows.showMain(page);
    const template: MenuItemConstructorOptions[] = [
      { label: 'ALLBEE FOCUS', enabled: false },
      { type: 'separator' },
      { label: d.settings.companionVisible ? 'Hide Companion' : 'Show Companion', enabled: d.onboarded, click: () => this.actions.toggleCompanion() },
      {
        label: t.phase === 'focus' ? 'Start Focus' : 'Start Break',
        enabled: d.onboarded && t.status === 'idle',
        click: () => this.engine.dispatch({ type: 'timer/start' }),
      },
      {
        label: t.status === 'paused' ? 'Resume Focus' : 'Pause Focus',
        enabled: t.status !== 'idle',
        click: () => this.engine.dispatch({ type: t.status === 'paused' ? 'timer/resume' : 'timer/pause' }),
      },
      { label: 'Focus', click: go('focus') },
      { label: 'Change Companion', click: go('companion') },
      snoozed
        ? { label: `Snoozed until ${formatClock(snoozed)} · Resume Patrol`, click: () => this.engine.dispatch({ type: 'patrol/unsnooze' }) }
        : { label: `Snooze Patrol (${d.patrol.snoozeMinutes} min)`, enabled: d.patrol.enabled && d.onboarded, click: () => this.engine.dispatch({ type: 'patrol/snooze' }) },
      { label: 'Missions', click: go('missions') },
      { label: 'Settings', click: go('settings') },
      { type: 'separator' },
      { label: 'Quit AllBee Focus', click: () => this.actions.quit() },
    ];
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  private updateTooltip(): void {
    if (!this.tray) return;
    const t = this.engine.data.timer;
    let tip = 'AllBee Focus';
    if (t.status === 'running' && t.endsAt) {
      const label = t.phase === 'focus' ? 'Focus' : 'Break';
      tip = `AllBee Focus · ${label} · ${formatCountdown(t.endsAt - Date.now())} left`;
    } else if (t.status === 'paused') {
      tip = `AllBee Focus · Paused · ${formatCountdown(t.remainingMs)} left`;
    }
    this.tray.setToolTip(tip);
  }
}
