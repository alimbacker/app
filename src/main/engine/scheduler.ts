// Fires time-based actions: timer completion, snooze expiry, midnight and passive ticks.
import { powerMonitor } from 'electron';
import { nextMidnight } from '@shared/utilities/time';
import type { Engine } from './engine';

const MAX_DELAY = 2_147_000_000;
const ABANDON_AFTER = 6 * 3_600_000;

export class Scheduler {
  private timerT: NodeJS.Timeout | null = null;
  private snoozeT: NodeJS.Timeout | null = null;
  private midnightT: NodeJS.Timeout | null = null;
  private periodic: NodeJS.Timeout | null = null;
  private armedFor = '';

  constructor(private readonly engine: Engine) {}

  start(): void {
    this.engine.on('data', () => this.arm());
    this.periodic = setInterval(() => this.engine.dispatch({ type: '@tick' }), 5 * 60_000);
    powerMonitor.on('resume', () => this.wake());
    powerMonitor.on('unlock-screen', () => this.wake());
    this.checkTimer();
    this.engine.dispatch({ type: '@tick' });
    this.arm();
    this.armMidnight();
  }

  stop(): void {
    for (const t of [this.timerT, this.snoozeT, this.midnightT]) if (t) clearTimeout(t);
    if (this.periodic) clearInterval(this.periodic);
  }

  private wake(): void {
    this.engine.dispatch({ type: '@tick' });
    this.checkTimer();
    this.armMidnight();
  }

  private arm(): void {
    const { timer, patrol } = this.engine.data;
    const key = `${timer.status}:${timer.endsAt}:${patrol.snoozedUntil}`;
    if (key === this.armedFor) return;
    this.armedFor = key;
    const now = Date.now();
    if (this.timerT) clearTimeout(this.timerT);
    this.timerT = null;
    if (timer.status === 'running' && timer.endsAt) {
      this.timerT = setTimeout(() => this.checkTimer(), Math.min(MAX_DELAY, Math.max(0, timer.endsAt - now + 30)));
    }
    if (this.snoozeT) clearTimeout(this.snoozeT);
    this.snoozeT = null;
    if (patrol.snoozedUntil) {
      this.snoozeT = setTimeout(() => this.engine.dispatch({ type: '@tick' }), Math.min(MAX_DELAY, Math.max(0, patrol.snoozedUntil - now + 50)));
    }
  }

  private checkTimer(): void {
    const t = this.engine.data.timer;
    const now = Date.now();
    if (t.status !== 'running' || !t.endsAt) return;
    if (now < t.endsAt - 1000) {
      this.armedFor = '';
      this.arm();
      return;
    }
    if (now - t.endsAt > ABANDON_AFTER) this.engine.dispatch({ type: '@timer/abandon' });
    else this.engine.dispatch({ type: '@timer/complete' });
  }

  private armMidnight(): void {
    if (this.midnightT) clearTimeout(this.midnightT);
    const now = Date.now();
    this.midnightT = setTimeout(() => {
      this.engine.dispatch({ type: '@tick' });
      this.armMidnight();
    }, Math.min(MAX_DELAY, nextMidnight(now) - now + 1500));
  }
}
