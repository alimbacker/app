// Sends sound state and chimes to the hidden audio window.
import { IPC, type AudioStateMessage } from '@shared/constants/ipc';
import type { ChimeId } from '@shared/types';
import type { WindowManager } from '../windows';
import type { Engine } from './engine';

export class AudioBridge {
  private ready = false;
  private lastState = '';

  constructor(
    private readonly engine: Engine,
    private readonly windows: WindowManager,
  ) {}

  start(): void {
    this.engine.on('data', () => this.push());
  }

  markReady(): void {
    this.ready = true;
    this.lastState = '';
    this.push();
  }

  private push(): void {
    const win = this.windows.audio;
    if (!this.ready || !win || win.isDestroyed()) return;
    const d = this.engine.data;
    const msg: AudioStateMessage = { ambient: d.ambient, chimeVolume: d.settings.sounds ? d.settings.soundVolume : 0 };
    const key = JSON.stringify(msg);
    if (key === this.lastState) return;
    this.lastState = key;
    win.webContents.send(IPC.audioState, msg);
  }

  chime(id: ChimeId): void {
    const d = this.engine.data;
    const win = this.windows.audio;
    if (!d.settings.sounds || !this.ready || !win || win.isDestroyed()) return;
    win.webContents.send(IPC.audioChime, { id, volume: d.settings.soundVolume });
  }
}
