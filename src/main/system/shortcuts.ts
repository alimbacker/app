// Optional system-wide shortcuts. In-app shortcuts always work (handled by the renderer).
import { globalShortcut } from 'electron';
import type { Engine } from '../engine/engine';
import { log } from './logger';

export interface ShortcutActions {
  toggleTimer(): void;
  openSettings(): void;
  toggleCompanion(): void;
}

const MAP: [accelerator: string, key: keyof ShortcutActions][] = [
  ['CommandOrControl+Shift+F', 'toggleTimer'],
  ['CommandOrControl+Shift+S', 'openSettings'],
  ['CommandOrControl+Shift+P', 'toggleCompanion'],
];

export class Shortcuts {
  private enabled: boolean | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly actions: ShortcutActions,
  ) {}

  start(): void {
    this.engine.on('data', () => this.apply());
    this.apply();
  }

  stop(): void {
    globalShortcut.unregisterAll();
  }

  private apply(): void {
    const want = this.engine.data.settings.globalShortcuts && this.engine.data.onboarded;
    if (want === this.enabled) return;
    this.enabled = want;
    globalShortcut.unregisterAll();
    const failed: string[] = [];
    if (want) {
      for (const [acc, key] of MAP) {
        try {
          if (!globalShortcut.register(acc, () => this.actions[key]())) failed.push(acc.replace('CommandOrControl', 'Ctrl'));
        } catch (err) {
          log.warn('shortcut failed', acc, err);
          failed.push(acc.replace('CommandOrControl', 'Ctrl'));
        }
      }
    }
    this.engine.setRuntime({ shortcuts: { global: want && failed.length < MAP.length, failed } });
  }
}
