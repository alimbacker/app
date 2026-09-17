// Windows notifications (toasts). Respects the user's setting and reports failures.
import { Notification } from 'electron';
import type { PageId } from '@shared/types';
import type { Engine } from '../engine/engine';
import { log } from '../system/logger';
import { iconPath } from '../system/paths';
import type { WindowManager } from '../windows';

export class Notifier {
  private readonly recent = new Map<string, number>();
  private readonly alive = new Set<Notification>();

  constructor(
    private readonly engine: Engine,
    private readonly windows: WindowManager,
  ) {}

  get supported(): boolean {
    try {
      return Notification.isSupported();
    } catch {
      return false;
    }
  }

  /**
   * Shows a notification. `key` rate-limits repeats (same key within `gapMs` is dropped).
   * `force` ignores the user's setting (used by the test button).
   */
  show(title: string, body: string, opts: { page?: PageId; key?: string; gapMs?: number; force?: boolean } = {}): boolean {
    if (!opts.force && !this.engine.data.settings.notifications) return false;
    if (!this.supported) {
      this.report('Windows notifications aren’t available on this system.');
      return false;
    }
    const now = Date.now();
    if (opts.key) {
      const last = this.recent.get(opts.key) ?? 0;
      if (now - last < (opts.gapMs ?? 60_000)) return false;
      this.recent.set(opts.key, now);
    }
    try {
      const n = new Notification({
        title,
        body,
        silent: true,
        icon: iconPath(process.platform === 'win32' ? 'app.ico' : 'app.png'),
      });
      this.alive.add(n);
      const release = () => this.alive.delete(n);
      n.on('click', () => {
        release();
        this.windows.showMain(opts.page);
      });
      n.on('close', release);
      n.on('failed', (_e, error) => {
        release();
        log.warn('notification failed', error);
        this.report('Windows couldn’t show a notification. Check that notifications are allowed for AllBee Focus in Windows Settings.');
      });
      n.show();
      setTimeout(release, 60_000).unref();
      if (this.engine.runtime.notifications.error) this.engine.setRuntime({ notifications: { supported: true, error: null } });
      return true;
    } catch (err) {
      log.warn('notification error', err);
      this.report('Windows couldn’t show a notification.');
      return false;
    }
  }

  private report(error: string): void {
    this.engine.setRuntime({ notifications: { supported: this.supported, error } });
  }
}
