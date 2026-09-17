import { createDefaultData } from '../src/shared/utilities/defaults';
import { reduce, type ReduceContext } from '../src/shared/utilities/reducer';
import type { Action } from '../src/shared/utilities/actions';
import type { AppData, AppEvent } from '../src/shared/types';

/** Local-time timestamp helper: day offset from a fixed Wednesday + hour. */
export const T0 = new Date(2026, 8, 16, 9, 0, 0, 0).getTime(); // Wed 16 Sep 2026, 09:00
export const MIN = 60_000;
export const at = (dayOffset: number, hour = 9, minute = 0) => new Date(2026, 8, 16 + dayOffset, hour, minute, 0, 0).getTime();

export class Harness {
  data: AppData;
  now: number;
  events: AppEvent[] = [];
  lastError?: string;
  rng = () => 0.99;
  monitorOk = false;
  constructor(now = T0, mutate?: (d: AppData) => void) {
    this.now = now;
    this.data = createDefaultData(now);
    this.data.onboarded = true;
    mutate?.(this.data);
  }
  do(action: Action, now = this.now): AppEvent[] {
    this.now = now;
    const ctx: ReduceContext = { now, rng: this.rng, monitorOk: this.monitorOk };
    const res = reduce(this.data, action, ctx);
    this.data = res.data;
    this.lastError = res.error;
    this.events.push(...res.events);
    return res.events;
  }
  ok(action: Action, now = this.now): AppEvent[] {
    const ev = this.do(action, now);
    if (this.lastError) throw new Error(`Unexpected error for ${action.type}: ${this.lastError}`);
    return ev;
  }
  err(action: Action, now = this.now): string {
    this.do(action, now);
    if (!this.lastError) throw new Error(`Expected ${action.type} to fail`);
    return this.lastError;
  }
  /** Runs a full focus session of `minutes` starting at `start`. */
  session(minutes: number, start = this.now, extra: Partial<Extract<Action, { type: 'timer/start' }>> = {}): AppEvent[] {
    this.ok({ type: 'timer/start', phase: 'focus', minutes, ...extra }, start);
    const ev = this.ok({ type: '@timer/complete' }, start + minutes * MIN);
    // leave the timer idle for the next call
    if (this.data.timer.status !== 'idle') this.ok({ type: 'timer/skipBreak' });
    return ev;
  }
}
