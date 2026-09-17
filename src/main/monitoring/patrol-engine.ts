// Website allowance tracking and enforcement. No Electron imports: fully unit-testable.
//
// Flow for a limited site:
//   viewing → allowance used up → countdown (click companion to snooze) →
//     "close" mode: ask the helper to close the tab (re-verified by the helper)
//     "complain" mode: the companion complains, nothing is closed
//   leaving the site at any point resolves the episode.
import type { ActiveSite, AppData, Enforcement, SiteRule } from '@shared/types';
import type { Action } from '@shared/utilities/actions';
import { matchRule, splitPattern, type HostPath } from '@shared/utilities/url';

export interface Observation {
  /** Window handle of the front window (helper format) */
  hwnd: string;
  /** Address shown in the front browser window, or null when not a readable web page */
  target: HostPath | null;
}

export type PatrolReaction =
  | { kind: 'countdown'; pattern: string; seconds: number; reason: 'limit' | 'focus' }
  | { kind: 'complain'; pattern: string; limitMinutes: number; again: boolean; note: string | null; reason: 'limit' | 'focus' }
  | { kind: 'closed'; pattern: string }
  | { kind: 'left'; pattern: string }
  | { kind: 'cleared' };

export interface PatrolDeps {
  now(): number;
  data(): Pick<AppData, 'patrol' | 'rules' | 'usage' | 'timer'>;
  dispatch(action: Action): void;
  publish(active: ActiveSite | null, enforcement: Enforcement | null): void;
  close(hwnd: string, host: string, path: string): Promise<{ ok: boolean; reason: string }>;
  react(reaction: PatrolReaction): void;
  setTicking(on: boolean): void;
}

export const COMMIT_EVERY_MS = 30_000;
export const COMPLAIN_EVERY_MS = 60_000;
export const CLOSED_HOLD_MS = 1_500;
export const HELD_TIMEOUT_MS = 30_000;
const MAX_STEP_MS = 5_000;

type LiveEnforcement = Enforcement & { hwnd: string; closedAt?: number; heldAt?: number; lastComplainAt?: number };

export function closeFailureText(reason: string): string {
  switch (reason) {
    case 'keys-held':
      return 'Keys were being held down, so the tab was left open.';
    case 'editing':
      return 'You were typing in the address bar, so the tab was left open.';
    case 'input-blocked':
    case 'still-open':
      return 'The browser didn’t let AllBee Focus close the tab.';
    case 'unreadable':
    case 'denied':
      return 'AllBee Focus couldn’t confirm the page, so nothing was closed.';
    case 'timeout':
    case 'helper-stopped':
      return 'The website monitor stopped responding, so nothing was closed.';
    default:
      return 'The tab couldn’t be closed.';
  }
}

export class PatrolEngine {
  private obs: Observation | null = null;
  private active: (ActiveSite & { lastAt: number }) | null = null;
  private enf: LiveEnforcement | null = null;
  private busy = false;
  private again = false;
  private lastPublished = '';

  constructor(private readonly deps: PatrolDeps) {}

  /** New foreground observation (null = nothing trackable: other app, locked screen, monitor down). */
  observe(obs: Observation | null): void {
    this.obs = obs;
    this.evaluate();
  }

  /** Called every second while a site is active or an enforcement is running. */
  tick(): void {
    this.evaluate();
  }

  /** Settings, rules or usage changed. */
  refresh(): void {
    this.evaluate();
  }

  get enforcement(): Enforcement | null {
    return this.enf;
  }

  stop(): void {
    this.accrue(this.deps.now());
    this.commit();
    this.active = null;
    if (this.enf) this.clearEnforcement();
    this.obs = null;
    this.publish();
    this.deps.setTicking(false);
  }

  /**
   * The user clicked the companion. Returns true when a snooze prompt should be shown
   * (the countdown is paused until the user answers).
   */
  hold(): boolean {
    const e = this.enf;
    if (!e) return false;
    const now = this.deps.now();
    if (e.phase === 'countdown') {
      e.remainingMs = Math.max(0, (e.endsAt ?? now) - now);
      e.endsAt = null;
      e.phase = 'held';
      e.heldAt = now;
      this.publish();
      return true;
    }
    return e.phase === 'held' || e.phase === 'complaining';
  }

  /** Answer to the snooze prompt. */
  answer(snooze: boolean): void {
    if (snooze) {
      this.deps.dispatch({ type: 'patrol/snooze' });
      if (this.enf) this.clearEnforcement();
      this.evaluate();
      return;
    }
    const e = this.enf;
    if (e && e.phase === 'held') {
      e.phase = 'countdown';
      e.endsAt = this.deps.now() + Math.max(1000, e.remainingMs);
      e.heldAt = undefined;
      this.evaluate();
    }
  }

  private evaluate(): void {
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    try {
      let guard = 0;
      do {
        this.again = false;
        this.evaluateOnce();
      } while (this.again && ++guard < 5);
    } finally {
      this.busy = false;
    }
  }

  private evaluateOnce(): void {
    const now = this.deps.now();
    this.accrue(now);
    const d = this.deps.data();
    const obs = this.obs;
    const rule = d.patrol.enabled && obs?.target ? matchRule(obs.target, d.rules) : null;

    if (!rule) {
      this.commit();
      this.active = null;
      if (this.enf && this.enf.phase !== 'closing') this.resolveLeft();
      this.finish();
      return;
    }

    if (!this.active || this.active.ruleId !== rule.id) {
      this.commit();
      this.active = { ruleId: rule.id, pattern: rule.pattern, since: now, pendingMs: 0, lastAt: now };
      if (this.enf && this.enf.ruleId !== rule.id && this.enf.phase !== 'closing') this.resolveLeft();
    }

    const used = (d.usage.ms[rule.id] ?? 0) + this.active.pendingMs;
    const overLimit = used >= rule.limitMinutes * 60_000;
    const focusBlock = d.patrol.strictDuringFocus && d.timer.phase === 'focus' && d.timer.status === 'running';
    const snoozed = d.patrol.snoozedUntil !== null && now < d.patrol.snoozedUntil;
    const shouldAct = (overLimit || focusBlock) && !snoozed;

    if (!shouldAct) {
      if (this.enf && this.enf.phase !== 'closing') this.clearEnforcement();
    } else if (!this.enf) {
      this.begin(rule, overLimit ? 'limit' : 'focus', obs!.hwnd, now, d.patrol.countdownSeconds, d.patrol.mode);
    } else {
      this.progress(rule, now, d.patrol.countdownSeconds, d.patrol.mode, overLimit ? 'limit' : 'focus');
    }

    if (this.active && this.active.pendingMs >= COMMIT_EVERY_MS) this.commit();
    this.finish();
  }

  private finish(): void {
    this.publish();
    this.deps.setTicking(!!this.active || !!this.enf);
  }

  private begin(rule: SiteRule, reason: 'limit' | 'focus', hwnd: string, now: number, seconds: number, mode: 'close' | 'complain'): void {
    this.deps.dispatch({ type: '@patrol/hit', ruleId: rule.id });
    this.enf = {
      ruleId: rule.id,
      pattern: rule.pattern,
      phase: 'countdown',
      startedAt: now,
      endsAt: now + seconds * 1000,
      remainingMs: seconds * 1000,
      reason,
      note: null,
      hwnd,
    };
    this.deps.react({ kind: 'countdown', pattern: rule.pattern, seconds, reason });
    if (seconds <= 0) this.act(rule, now, mode);
  }

  private progress(rule: SiteRule, now: number, seconds: number, mode: 'close' | 'complain', reason: 'limit' | 'focus'): void {
    const e = this.enf!;
    switch (e.phase) {
      case 'countdown':
        if (e.endsAt !== null && now >= e.endsAt) this.act(rule, now, mode);
        break;
      case 'held':
        if (e.heldAt !== undefined && now - e.heldAt >= HELD_TIMEOUT_MS) {
          e.phase = 'countdown';
          e.endsAt = now + Math.max(1000, e.remainingMs);
          e.heldAt = undefined;
        }
        break;
      case 'closing':
        break;
      case 'closed':
        // Still on a matching page after a close (another tab of the same site): start over.
        if (now - (e.closedAt ?? now) >= CLOSED_HOLD_MS) {
          this.enf = null;
          this.begin(rule, reason, this.obs?.hwnd ?? '', now, seconds, mode);
        }
        break;
      case 'complaining':
        if (now - (e.lastComplainAt ?? 0) >= COMPLAIN_EVERY_MS) {
          e.lastComplainAt = now;
          this.deps.react({ kind: 'complain', pattern: e.pattern, limitMinutes: rule.limitMinutes, again: true, note: e.note, reason: e.reason });
        }
        break;
    }
  }

  private act(rule: SiteRule, now: number, mode: 'close' | 'complain'): void {
    const e = this.enf!;
    e.endsAt = null;
    e.remainingMs = 0;
    if (mode === 'close' && e.hwnd) {
      e.phase = 'closing';
      const { ruleId, pattern } = e;
      const { host, path } = splitPattern(pattern);
      void this.deps.close(e.hwnd, host, path).then((res) => {
        const cur = this.enf;
        if (!cur || cur.ruleId !== ruleId || cur.phase !== 'closing') return;
        const t = this.deps.now();
        if (res.ok) {
          this.deps.dispatch({ type: '@patrol/resolved', ruleId, how: 'closed' });
          this.accrue(t);
          this.commit();
          this.active = null;
          cur.phase = 'closed';
          cur.closedAt = t;
          this.deps.react({ kind: 'closed', pattern });
        } else if (res.reason === 'moved-on' || res.reason === 'not-foreground') {
          // The user left on their own just before Patrol acted.
          this.deps.dispatch({ type: '@patrol/resolved', ruleId, how: 'left' });
          this.enf = null;
          this.deps.react({ kind: 'left', pattern });
        } else {
          cur.phase = 'complaining';
          cur.note = closeFailureText(res.reason);
          cur.lastComplainAt = t;
          this.deps.react({ kind: 'complain', pattern, limitMinutes: rule.limitMinutes, again: false, note: cur.note, reason: cur.reason });
        }
        this.evaluate();
      });
    } else {
      e.phase = 'complaining';
      e.lastComplainAt = now;
      this.deps.react({ kind: 'complain', pattern: e.pattern, limitMinutes: rule.limitMinutes, again: false, note: null, reason: e.reason });
    }
  }

  private resolveLeft(): void {
    const e = this.enf;
    if (!e) return;
    this.enf = null;
    if (e.phase === 'closed') return;
    this.deps.dispatch({ type: '@patrol/resolved', ruleId: e.ruleId, how: 'left' });
    this.deps.react({ kind: 'left', pattern: e.pattern });
  }

  private clearEnforcement(): void {
    this.enf = null;
    this.deps.react({ kind: 'cleared' });
  }

  private accrue(now: number): void {
    const a = this.active;
    if (!a) return;
    const delta = Math.min(MAX_STEP_MS, Math.max(0, now - a.lastAt));
    a.pendingMs += delta;
    a.lastAt = now;
  }

  private commit(): void {
    const a = this.active;
    if (!a || a.pendingMs <= 0) return;
    const ms = Math.round(a.pendingMs);
    a.pendingMs = 0;
    this.deps.dispatch({ type: '@usage/commit', ruleId: a.ruleId, ms });
  }

  private publish(): void {
    const active: ActiveSite | null = this.active
      ? { ruleId: this.active.ruleId, pattern: this.active.pattern, since: this.active.since, pendingMs: Math.round(this.active.pendingMs) }
      : null;
    const e = this.enf;
    const enforcement: Enforcement | null = e
      ? {
          ruleId: e.ruleId,
          pattern: e.pattern,
          phase: e.phase,
          startedAt: e.startedAt,
          endsAt: e.endsAt,
          remainingMs: e.remainingMs,
          reason: e.reason,
          note: e.note,
        }
      : null;
    const key = JSON.stringify([active, enforcement]);
    if (key === this.lastPublished) return;
    this.lastPublished = key;
    this.deps.publish(active, enforcement);
  }
}
