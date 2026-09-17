import { describe, expect, it } from 'vitest';
import { buildResetData } from '../src/main/ipc/reset';
import { Harness, MIN, T0 } from './helpers';

/** A profile with some progress on it, plus the things a reset has to keep. */
function played() {
  const h = new Harness(T0, (d) => {
    d.settings.userName = 'Sam';
    d.settings.dailyGoalMinutes = 120;
    d.settings.companionSize = 1.4;
    d.timerSettings.focusMinutes = 45;
    d.patrol.mode = 'close';
    d.patrol.countdownSeconds = 20;
    d.patrol.snoozedUntil = T0 + 30 * MIN;
  });
  h.ok({ type: 'rules/add', pattern: 'youtube.com', limitMinutes: 15 });
  h.ok({ type: 'tasks/add', task: { title: 'Write the report', estimateMinutes: 50 } });
  h.session(45);
  h.session(25);
  return h.data;
}

describe('buildResetData', () => {
  it('keeps the settings the user chose', () => {
    const before = played();
    const after = buildResetData(before, T0 + 60 * MIN);
    expect(after.settings).toEqual(before.settings);
    expect(after.timerSettings.focusMinutes).toBe(45);
    expect(after.patrol.mode).toBe('close');
    expect(after.patrol.countdownSeconds).toBe(20);
  });

  it('keeps the site rules', () => {
    const before = played();
    const after = buildResetData(before, T0 + 60 * MIN);
    expect(after.rules.map((r) => r.pattern)).toEqual(before.rules.map((r) => r.pattern));
    expect(after.rules.map((r) => r.limitMinutes)).toEqual(before.rules.map((r) => r.limitMinutes));
  });

  it('keeps the tasks, without the focus time counted against them', () => {
    const before = played();
    const withWork = { ...before, tasks: before.tasks.map((t) => ({ ...t, sessions: 3, focusMinutes: 90 })) };
    const after = buildResetData(withWork, T0 + 60 * MIN);
    expect(after.tasks.map((t) => t.title)).toEqual(['Write the report']);
    expect(after.tasks[0].estimateMinutes).toBe(50);
    expect(after.tasks[0].sessions).toBe(0);
    expect(after.tasks[0].focusMinutes).toBe(0);
  });

  it('clears the progress', () => {
    const before = played();
    expect(before.profile.totalXp).toBeGreaterThan(0);
    expect(before.history.length).toBeGreaterThan(0);

    const after = buildResetData(before, T0 + 60 * MIN);
    expect(after.profile.totalXp).toBe(0);
    expect(after.profile.lifetimeCoins).toBe(after.profile.coins);
    expect(after.history).toEqual([]);
    expect(after.days).toEqual({});
    expect(after.achievements).toEqual({});
    expect(after.streak.current).toBe(0);
    expect(after.streak.best).toBe(0);
    expect(after.counters.sessions).toBe(0);
    expect(after.counters.focusMinutes).toBe(0);
  });

  it('puts the companions back to the starter', () => {
    const before = played();
    const after = buildResetData(before, T0 + 60 * MIN);
    expect(Object.keys(after.companions)).toEqual(['bee']);
    expect(after.activeCompanionId).toBe('bee');
    expect(after.companions.bee.xp).toBe(0);
  });

  it('does not send the user back through onboarding, and forgets any snooze', () => {
    const before = played();
    const after = buildResetData(before, T0 + 60 * MIN);
    expect(after.onboarded).toBe(true);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.patrol.snoozedUntil).toBeNull();
  });

  it('leaves the profile it was given untouched', () => {
    const before = played();
    const snapshot = structuredClone(before);
    buildResetData(before, T0 + 60 * MIN);
    expect(before).toEqual(snapshot);
  });
});
