import { describe, expect, it } from 'vitest';
import { PatrolEngine, type PatrolReaction } from '../src/main/monitoring/patrol-engine';
import { parseAddress } from '../src/shared/utilities/url';
import type { ActiveSite, Enforcement } from '../src/shared/types';
import { Harness, MIN } from './helpers';

function setup(opts: { mode?: 'close' | 'complain'; countdown?: number; closeResult?: { ok: boolean; reason: string } } = {}) {
  const h = new Harness();
  h.data.patrol.mode = opts.mode ?? 'complain';
  h.data.patrol.countdownSeconds = opts.countdown ?? 3;
  let now = h.now;
  const reactions: PatrolReaction[] = [];
  const closes: string[] = [];
  let active: ActiveSite | null = null;
  let enforcement: Enforcement | null = null;
  const pendingCloses: Array<() => void> = [];
  const engine = new PatrolEngine({
    now: () => now,
    data: () => h.data,
    dispatch: (a) => {
      h.ok(a, now);
    },
    publish: (a, e) => {
      active = a;
      enforcement = e;
    },
    close: (hwnd, host, path) => {
      closes.push(`${hwnd}:${host}${path}`);
      return new Promise((resolve) => pendingCloses.push(() => resolve(opts.closeResult ?? { ok: true, reason: '' })));
    },
    react: (r) => reactions.push(r),
    setTicking: () => {},
  });
  const view = (url: string | null) => engine.observe(url === null ? null : { hwnd: 'abc', target: parseAddress(url) });
  const advance = (ms: number, step = 1000) => {
    for (let t = 0; t < ms; t += step) {
      now += step;
      engine.tick();
    }
  };
  return {
    h,
    engine,
    view,
    advance,
    reactions,
    closes,
    pendingCloses,
    get active() {
      return active;
    },
    get enforcement() {
      return enforcement;
    },
    get now() {
      return now;
    },
  };
}

const shortsRule = (h: Harness) => h.data.rules.find((r) => r.pattern === 'youtube.com/shorts')!;

describe('PatrolEngine', () => {
  it('counts time only while the site is in front, and persists it', () => {
    const s = setup();
    s.view('youtube.com/shorts/abc');
    s.advance(40_000);
    s.view('github.com/me');
    s.advance(60_000);
    const used = s.h.data.usage.ms[shortsRule(s.h).id];
    expect(used).toBe(40_000);
    expect(s.active).toBeNull();
    s.view('https://www.youtube.com/shorts/xyz');
    s.advance(10_000);
    expect(s.active?.pendingMs).toBe(10_000);
  });

  it('complain mode: countdown, then complaints, never closes', () => {
    const s = setup({ mode: 'complain' });
    s.view('youtube.com/shorts/abc');
    s.advance(5 * MIN);
    expect(s.enforcement?.phase).toBe('countdown');
    expect(s.reactions.some((r) => r.kind === 'countdown')).toBe(true);
    s.advance(3000);
    expect(s.enforcement?.phase).toBe('complaining');
    expect(s.closes).toHaveLength(0);
    s.advance(61_000);
    expect(s.reactions.filter((r) => r.kind === 'complain')).toHaveLength(2);
    expect(s.h.data.usage.hits[shortsRule(s.h).id]).toBe(1);
    s.view('docs.google.com');
    expect(s.enforcement).toBeNull();
    expect(s.h.data.counters.turnedAway).toBe(1);
  });

  it('close mode asks the helper to close the matching tab', async () => {
    const s = setup({ mode: 'close', countdown: 2 });
    s.view('youtube.com/shorts/abc');
    s.advance(5 * MIN + 2000);
    expect(s.enforcement?.phase).toBe('closing');
    expect(s.closes).toEqual(['abc:youtube.com/shorts']);
    s.pendingCloses.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.enforcement?.phase).toBe('closed');
    expect(s.h.data.counters.tabsClosed).toBe(1);
    s.view('github.com');
    expect(s.enforcement).toBeNull();
  });

  it('falls back to complaining when the tab could not be closed', async () => {
    const s = setup({ mode: 'close', countdown: 0, closeResult: { ok: false, reason: 'keys-held' } });
    s.view('youtube.com/shorts/abc');
    s.advance(5 * MIN);
    s.pendingCloses.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.enforcement?.phase).toBe('complaining');
    expect(s.enforcement?.note).toMatch(/Keys/);
  });

  it('clicking the companion holds the countdown; snoozing stops enforcement', () => {
    const s = setup({ countdown: 10 });
    s.view('youtube.com/shorts/abc');
    s.advance(5 * MIN);
    s.advance(2000);
    expect(s.engine.hold()).toBe(true);
    expect(s.enforcement?.phase).toBe('held');
    s.advance(10_000);
    expect(s.enforcement?.phase).toBe('held');
    s.engine.answer(true);
    expect(s.enforcement).toBeNull();
    expect(s.h.data.patrol.snoozedUntil).toBeGreaterThan(s.now);
    // usage keeps counting while snoozed, but nothing happens
    s.advance(60_000);
    expect(s.enforcement).toBeNull();
    // after the snooze ends, enforcement starts again
    s.h.ok({ type: '@tick' }, s.now + 5 * MIN);
    s.advance(5 * MIN);
    expect(s.enforcement).not.toBeNull();
  });

  it('cancelling the prompt resumes the countdown', () => {
    const s = setup({ countdown: 10 });
    s.view('youtube.com/shorts/abc');
    s.advance(5 * MIN + 3000);
    s.engine.hold();
    s.engine.answer(false);
    expect(s.enforcement?.phase).toBe('countdown');
    s.advance(10_000);
    expect(s.enforcement?.phase).toBe('complaining');
  });

  it('strict focus blocks tracked sites during a focus session', () => {
    const s = setup();
    s.h.ok({ type: 'timer/start', minutes: 25 }, s.now);
    s.view('reddit.com/r/all');
    expect(s.enforcement?.reason).toBe('focus');
    s.h.data.patrol.strictDuringFocus = false;
    s.engine.refresh();
    expect(s.enforcement).toBeNull();
  });

  it('does nothing when patrol is off', () => {
    const s = setup();
    s.h.data.patrol.enabled = false;
    s.view('youtube.com/shorts/abc');
    s.advance(10 * MIN);
    expect(s.enforcement).toBeNull();
    expect(s.active).toBeNull();
  });

  it('a limit of zero acts immediately', () => {
    const s = setup();
    s.h.ok({ type: 'rules/add', pattern: 'tiktok.com', limitMinutes: 0 });
    s.view('tiktok.com/@someone');
    expect(s.enforcement?.phase).toBe('countdown');
  });
});
