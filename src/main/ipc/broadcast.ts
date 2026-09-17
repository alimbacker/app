// Pushes state to the main window in small batches.
//
// A single user action can change the data and the runtime several times in a row (a
// finished session awards XP, coins, a mission and an achievement), and Patrol updates
// the runtime once a second while it counts down. Sending each of those on its own would
// mean needless traffic and re-renders, so changes are collected and sent on a short
// timer instead.
//
// The delay is deliberately the same whether the window is on screen or hidden in the
// tray. Using a longer delay for a hidden window would save very little — a hidden window
// receives at most about a message a second — and it would make how quickly the dashboard
// responds depend on BrowserWindow.isVisible(), which is not dependable everywhere: a
// window with a hidden title bar reports itself invisible under a virtual display. A
// window that does not exist at all is still skipped, because the next one to open asks
// for a full snapshot as it loads.
import type { Engine } from '../engine/engine';
import type { WindowManager } from '../windows';

/** Long enough to collect a burst of changes, short enough that nobody notices it. */
export const BATCH_MS = 50;

export class Broadcaster {
  private dataDirty = false;
  private runtimeDirty = false;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly engine: Engine,
    private readonly windows: WindowManager,
  ) {}

  start(): void {
    this.engine.on('data', () => {
      this.dataDirty = true;
      this.schedule();
    });
    this.engine.on('runtime', () => {
      this.runtimeDirty = true;
      this.schedule();
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Sends whatever is pending right now. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const data = this.dataDirty;
    const runtime = this.runtimeDirty;
    this.dataDirty = false;
    this.runtimeDirty = false;
    const win = this.windows.main;
    if (!win || win.isDestroyed()) return;
    if (data) this.windows.sendData(this.engine.viewData());
    if (runtime) this.windows.sendRuntime(this.engine.runtime);
  }

  private schedule(): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, BATCH_MS);
  }
}
