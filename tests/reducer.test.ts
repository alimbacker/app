import { describe, expect, it } from 'vitest';
import { totalXpFor } from '../src/shared/utilities/xp';
import { dayKey } from '../src/shared/utilities/time';
import { Harness, MIN, at } from './helpers';

describe('focus timer', () => {
  it('runs a full session and pays rewards', () => {
    const h = new Harness();
    const ev = h.session(25);
    const done = ev.find((e) => e.type === 'sessionComplete');
    // 25 base XP + 1% streak + 3% Good Mood (the bee starts happy)
    expect(done).toMatchObject({ minutes: 25, xp: Math.round(25 * 1.04), coins: 10, full: true });
    const d = h.data;
    expect(d.companions.bee.xp).toBeGreaterThanOrEqual(25);
    expect(d.profile.coins).toBeGreaterThan(50);
    expect(d.counters.sessions).toBe(1);
    expect(d.days[dayKey(h.now)].focusMinutes).toBe(25);
    expect(d.streak.current).toBe(1);
    expect(d.history).toHaveLength(1);
    // missions: first session + streak + speed mission paid automatically
    const ids = h.events.filter((e) => e.type === 'missionComplete').map((e) => (e as { id: string }).id);
    expect(ids).toEqual(expect.arrayContaining(['d_session', 'd_streak', 'h_speed']));
    expect(d.achievements.first_focus).toBeTruthy();
  });

  it('auto-starts a break and moves to a long break every 4th session', () => {
    const h = new Harness();
    for (let i = 0; i < 3; i++) {
      h.ok({ type: 'timer/start', phase: 'focus', minutes: 10 }, h.now + MIN);
      h.ok({ type: '@timer/complete' }, h.now + 10 * MIN);
      expect(h.data.timer).toMatchObject({ phase: 'shortBreak', status: 'running' });
      h.ok({ type: '@timer/complete' }, h.data.timer.endsAt!);
      expect(h.data.timer).toMatchObject({ phase: 'focus', status: 'idle' });
    }
    h.ok({ type: 'timer/start' }, h.now + MIN);
    h.ok({ type: '@timer/complete' }, h.data.timer.endsAt!);
    expect(h.data.timer.phase).toBe('longBreak');
    h.ok({ type: '@timer/complete' }, h.data.timer.endsAt!);
    expect(h.data.timer.completedInCycle).toBe(0);
  });

  it('pauses and resumes without losing time', () => {
    const h = new Harness();
    h.ok({ type: 'timer/start', minutes: 25 });
    h.ok({ type: 'timer/pause' }, h.now + 10 * MIN);
    expect(h.data.timer.remainingMs).toBe(15 * MIN);
    h.ok({ type: 'timer/resume' }, h.now + 60 * MIN);
    expect(h.data.timer.endsAt).toBe(h.now + 15 * MIN);
    // completing too early is ignored
    h.ok({ type: '@timer/complete' }, h.now + 5 * MIN);
    expect(h.data.timer.status).toBe('running');
    expect(h.err({ type: 'timer/start' })).toMatch(/already/);
  });

  it('finish early pays half XP and counts the minutes', () => {
    const h = new Harness();
    h.ok({ type: 'timer/start', minutes: 45 });
    const ev = h.ok({ type: 'timer/finishEarly' }, h.now + 20 * MIN);
    expect(ev.find((e) => e.type === 'sessionEnded')).toMatchObject({ minutes: 20, xp: 9 });
    expect(h.data.counters.sessions).toBe(0);
    expect(h.data.counters.focusMinutes).toBe(20);
    expect(h.data.timer).toMatchObject({ status: 'idle', phase: 'shortBreak' });
    expect(h.data.streak.current).toBe(0);
  });

  it('finish early under 5 minutes earns nothing', () => {
    const h = new Harness();
    h.ok({ type: 'timer/start', minutes: 25 });
    const ev = h.ok({ type: 'timer/finishEarly' }, h.now + 3 * MIN);
    expect(ev.find((e) => e.type === 'sessionEnded')).toMatchObject({ minutes: 3, xp: 0 });
    expect(h.data.timer.phase).toBe('focus');
  });

  it('pays the daily goal once', () => {
    const h = new Harness(undefined, (d) => (d.settings.dailyGoalMinutes = 30));
    h.session(25);
    const ev = h.session(10, h.now + MIN);
    expect(ev.filter((e) => e.type === 'goalMet')).toHaveLength(1);
    const ev2 = h.session(10, h.now + MIN);
    expect(ev2.filter((e) => e.type === 'goalMet')).toHaveLength(0);
  });

  it('coding sessions count for the Coding Hero achievement', () => {
    const h = new Harness();
    h.session(25, h.now, { category: 'coding' });
    expect(h.data.counters.codingSessions).toBe(1);
    expect(h.data.days[dayKey(h.now)].categories.coding).toBe(25);
  });
});

describe('streaks', () => {
  it('grows on consecutive days, pays at 7 and resets after a gap', () => {
    const h = new Harness();
    for (let day = 0; day < 7; day++) h.session(15, at(day, 10));
    expect(h.data.streak.current).toBe(7);
    expect(h.events.some((e) => e.type === 'streak' && e.days === 7 && e.coins === 100)).toBe(true);
    h.session(15, at(9, 10));
    expect(h.data.streak).toMatchObject({ current: 1, best: 7 });
  });

  it('a streak freeze bridges one missed day', () => {
    const h = new Harness(undefined, (d) => (d.profile.streakFreezes = 1));
    h.session(15, at(0));
    h.session(15, at(1));
    h.ok({ type: '@tick' }, at(3, 8));
    expect(h.data.profile.streakFreezes).toBe(0);
    h.session(15, at(3, 9));
    expect(h.data.streak.current).toBe(3);
  });
});

describe('day rollover', () => {
  it('resets site usage and missions, keeps rules', () => {
    const h = new Harness();
    const rule = h.data.rules[0];
    h.ok({ type: '@usage/commit', ruleId: rule.id, ms: 2 * MIN });
    h.session(25);
    expect(h.data.usage.ms[rule.id]).toBe(2 * MIN);
    h.ok({ type: '@tick' }, at(1, 7));
    expect(h.data.usage.ms[rule.id]).toBeUndefined();
    expect(h.data.missions.daily.every((m) => m.progress === 0 && !m.done)).toBe(true);
    expect(h.data.rules).toHaveLength(3);
  });

  it('expires the snooze', () => {
    const h = new Harness();
    h.ok({ type: 'patrol/snooze' });
    expect(h.data.patrol.snoozedUntil).toBe(h.now + 5 * MIN);
    h.ok({ type: '@tick' }, h.now + 6 * MIN);
    expect(h.data.patrol.snoozedUntil).toBeNull();
  });
});

describe('site rules and patrol', () => {
  it('adds, validates, updates and removes rules', () => {
    const h = new Harness();
    h.ok({ type: 'rules/add', pattern: 'https://www.TikTok.com/', limitMinutes: 10 });
    expect(h.data.rules.at(-1)).toMatchObject({ pattern: 'tiktok.com', limitMinutes: 10, enabled: true });
    expect(h.err({ type: 'rules/add', pattern: 'tiktok.com', limitMinutes: 5 })).toMatch(/already/);
    expect(h.err({ type: 'rules/add', pattern: 'not a site', limitMinutes: 5 })).toMatch(/Enter a website/);
    const id = h.data.rules.at(-1)!.id;
    h.ok({ type: 'rules/update', id, limitMinutes: 9999, enabled: false });
    expect(h.data.rules.at(-1)).toMatchObject({ limitMinutes: 720, enabled: false });
    h.ok({ type: 'rules/remove', id });
    expect(h.data.rules.some((r) => r.id === id)).toBe(false);
  });

  it('records hits and breaks the guard on a running session', () => {
    const h = new Harness();
    h.monitorOk = true;
    h.ok({ type: 'timer/start', minutes: 25 });
    expect(h.data.timer.guarded).toBe(true);
    const rule = h.data.rules[0];
    h.ok({ type: '@patrol/hit', ruleId: rule.id });
    expect(h.data.timer.guarded).toBe(false);
    expect(h.data.usage.hits[rule.id]).toBe(1);
    h.ok({ type: '@patrol/resolved', ruleId: rule.id, how: 'closed' });
    expect(h.data.counters.tabsClosed).toBe(1);
  });

  it('guarded minutes advance the distraction mission', () => {
    const h = new Harness();
    h.monitorOk = true;
    h.session(60);
    h.session(60, h.now + MIN);
    expect(h.data.days[dayKey(h.now)].guardedMinutes).toBe(120);
    expect(h.data.missions.daily.find((m) => m.id === 'd_guard')?.done).toBe(true);
    expect(h.data.missions.weekly.find((m) => m.id === 'h_defense')?.done).toBe(true);
  });

  it('sessions are not guarded when monitoring is unavailable', () => {
    const h = new Harness();
    h.monitorOk = false;
    h.session(60);
    expect(h.data.days[dayKey(h.now)].guardedMinutes).toBe(0);
  });

  it('Shadow earns coins when Patrol turns you away', () => {
    const h = new Harness(undefined, (d) => {
      d.companions.shadow = { ...d.companions.bee, id: 'shadow', name: 'Shadow' };
      d.activeCompanionId = 'shadow';
    });
    const coins = h.data.profile.coins;
    h.ok({ type: '@patrol/resolved', ruleId: h.data.rules[0].id, how: 'left' });
    expect(h.data.profile.coins).toBe(coins + 3);
  });
});

describe('tasks', () => {
  it('creates, edits, completes once and focuses on tasks', () => {
    const h = new Harness();
    h.ok({ type: 'tasks/add', task: { title: '  Complete website  ', priority: 'high', dueDate: '2026-09-20', estimateMinutes: 50, category: 'coding' } });
    const t = h.data.tasks[0];
    expect(t).toMatchObject({ title: 'Complete website', priority: 'high', dueDate: '2026-09-20', estimateMinutes: 50, category: 'coding' });
    expect(h.err({ type: 'tasks/add', task: { title: '   ' } })).toMatch(/name/);
    expect(h.err({ type: 'tasks/edit', id: t.id, task: { dueDate: '20/09/2026' } })).toMatch(/due date/);
    h.ok({ type: 'tasks/edit', id: t.id, task: { notes: 'Landing page first', priority: 'low' } });
    expect(h.data.tasks[0]).toMatchObject({ notes: 'Landing page first', priority: 'low' });

    h.ok({ type: 'timer/start', taskId: t.id, minutes: 25 });
    expect(h.data.timer).toMatchObject({ taskId: t.id, category: 'coding' });
    h.ok({ type: '@timer/complete' }, h.now + 25 * MIN);
    expect(h.data.tasks[0]).toMatchObject({ sessions: 1, focusMinutes: 25 });

    h.ok({ type: 'tasks/toggle', id: t.id });
    h.ok({ type: 'tasks/toggle', id: t.id });
    h.ok({ type: 'tasks/toggle', id: t.id });
    expect(h.data.counters.tasksDone).toBe(1);
  });

  it('three tasks complete the daily mission', () => {
    const h = new Harness();
    for (const title of ['a', 'b', 'c']) h.ok({ type: 'tasks/add', task: { title } });
    for (const t of [...h.data.tasks]) h.ok({ type: 'tasks/toggle', id: t.id });
    expect(h.data.missions.daily.find((m) => m.id === 'd_tasks')).toMatchObject({ progress: 3, done: true });
  });

  it('moves and clears tasks', () => {
    const h = new Harness();
    for (const title of ['a', 'b', 'c']) h.ok({ type: 'tasks/add', task: { title } });
    const c = h.data.tasks[2].id;
    h.ok({ type: 'tasks/move', id: c, dir: -1 });
    expect(h.data.tasks.map((t) => t.title)).toEqual(['a', 'c', 'b']);
    h.ok({ type: 'tasks/toggle', id: c });
    h.ok({ type: 'tasks/clearDone' });
    expect(h.data.tasks.map((t) => t.title)).toEqual(['a', 'b']);
  });
});

describe('companions, shop and rooms', () => {
  it('requires player level, then coins, to unlock', () => {
    const h = new Harness();
    expect(h.err({ type: 'companion/unlock', id: 'fox' })).toMatch(/Level 5/);
    h.data.profile.totalXp = totalXpFor(5);
    expect(h.err({ type: 'companion/unlock', id: 'fox' })).toMatch(/more coins/);
    h.data.profile.coins = 400;
    h.ok({ type: 'companion/unlock', id: 'fox' });
    expect(h.data.companions.fox).toBeTruthy();
    expect(h.data.profile.coins).toBe(100);
    h.ok({ type: 'companion/select', id: 'fox' });
    expect(h.data.activeCompanionId).toBe('fox');
    expect(h.err({ type: 'companion/select', id: 'dragon' })).toMatch(/Unlock/);
  });

  it('starter companions are free', () => {
    const h = new Harness();
    h.ok({ type: 'companion/unlock', id: 'volt' });
    expect(h.data.profile.coins).toBe(50);
  });

  it('achievement-gated companions need the achievement', () => {
    const h = new Harness(undefined, (d) => {
      d.profile.totalXp = totalXpFor(40);
      d.profile.coins = 5000;
    });
    expect(h.err({ type: 'companion/unlock', id: 'dragon' })).toMatch(/7 Day Streak/);
  });

  it('buys, uses, equips and decorates', () => {
    const h = new Harness(undefined, (d) => (d.profile.coins = 2000));
    h.data.companions.bee.energy = 50;
    h.ok({ type: 'shop/buy', itemId: 'food_bento' });
    h.ok({ type: 'item/use', itemId: 'food_bento' });
    expect(h.data.companions.bee.energy).toBe(90);
    expect(h.data.inventory.owned.food_bento).toBeUndefined();
    expect(h.err({ type: 'item/use', itemId: 'food_bento' })).toMatch(/don’t have/);

    h.ok({ type: 'shop/buy', itemId: 'hat_party' });
    expect(h.err({ type: 'shop/buy', itemId: 'hat_party' })).toMatch(/already own/);
    h.ok({ type: 'item/equip', slot: 'head', itemId: 'hat_party' });
    expect(h.data.companions.bee.accessories.head).toBe('hat_party');
    expect(h.err({ type: 'item/equip', slot: 'face', itemId: 'hat_party' })).toMatch(/fit/);

    h.ok({ type: 'shop/buy', itemId: 'lights_fairy' });
    h.ok({ type: 'decor/place', space: 'pet', slot: 'lights', itemId: 'lights_fairy' });
    expect(h.data.inventory.petDecor.lights).toBe('lights_fairy');
    expect(h.err({ type: 'decor/place', space: 'hero', slot: 'lights', itemId: 'lights_fairy' })).toMatch(/pet room/);
    h.ok({ type: 'shop/buy', itemId: 'theme_space' });
    h.ok({ type: 'theme/set', space: 'pet', itemId: 'theme_space' });
    expect(h.data.inventory.petTheme).toBe('theme_space');
    expect(h.err({ type: 'theme/set', space: 'hero', itemId: 'theme_space' })).toMatch(/theme/);

    expect(h.err({ type: 'shop/buy', itemId: 'lights_hive' })).toMatch(/can’t be bought/);
    h.data.profile.coins = 10;
    expect(h.err({ type: 'shop/buy', itemId: 'boost_xp' })).toMatch(/more coins/);
  });

  it('streak freezes are capped', () => {
    const h = new Harness(undefined, (d) => (d.profile.coins = 5000));
    for (let i = 0; i < 3; i++) h.ok({ type: 'shop/buy', itemId: 'boost_freeze' });
    expect(h.data.profile.streakFreezes).toBe(3);
    expect(h.err({ type: 'shop/buy', itemId: 'boost_freeze' })).toMatch(/up to 3/);
  });

  it('XP booster boosts the next 3 sessions', () => {
    const h = new Harness(undefined, (d) => (d.inventory.owned.boost_xp = 1));
    h.ok({ type: 'item/use', itemId: 'boost_xp' });
    expect(h.data.profile.boostSessions).toBe(3);
    const ev = h.session(25);
    expect(ev.find((e) => e.type === 'sessionComplete')).toMatchObject({ xp: Math.round(25 * 1.54) });
    expect(h.data.profile.boostSessions).toBe(2);
  });

  it('levels up and evolves', () => {
    const h = new Harness(undefined, (d) => (d.companions.bee.xp = totalXpFor(5) - 5));
    const ev = h.session(25);
    expect(ev.find((e) => e.type === 'levelUp')).toMatchObject({ level: 5, stage: 1, evolved: true });
    expect(h.data.achievements.evolved).toBeTruthy();
  });

  it('petting is capped per day', () => {
    const h = new Harness();
    h.data.companions.bee.happiness = 50;
    for (let i = 0; i < 10; i++) h.ok({ type: 'companion/pet' });
    expect(h.data.companions.bee.happiness).toBe(62);
  });
});

describe('daily rewards', () => {
  it('climbs the ladder on consecutive days and gives a special item on day 7', () => {
    const h = new Harness();
    const coins: number[] = [];
    for (let day = 0; day < 7; day++) {
      const ev = h.ok({ type: 'daily/claim' }, at(day, 12));
      const r = ev.find((e) => e.type === 'dailyReward') as { coins: number; itemId?: string; index: number };
      coins.push(r.coins);
      if (day === 6) expect(r.itemId).toBe('lights_hive');
    }
    expect(coins).toEqual([10, 20, 30, 50, 75, 100, 0]);
    expect(h.data.inventory.owned.lights_hive).toBe(1);
    expect(h.err({ type: 'daily/claim' }, at(6, 18))).toMatch(/already claimed/);
    expect(h.data.achievements.loyal).toBeTruthy();
  });

  it('restarts after a missed day', () => {
    const h = new Harness();
    h.ok({ type: 'daily/claim' }, at(0, 12));
    h.ok({ type: 'daily/claim' }, at(1, 12));
    const ev = h.ok({ type: 'daily/claim' }, at(3, 12));
    expect(ev.find((e) => e.type === 'dailyReward')).toMatchObject({ index: 1, coins: 10 });
  });
});

describe('onboarding', () => {
  it('applies the choices', () => {
    const h = new Harness();
    h.data.onboarded = false;
    h.ok({
      type: 'onboarding/finish',
      payload: {
        companionId: 'volt',
        companionName: 'Sparky',
        userName: 'Alim',
        dailyGoalMinutes: 240,
        rules: [{ pattern: 'youtube.com', limitMinutes: 30 }, { pattern: 'bad input', limitMinutes: 5 }],
        patrolEnabled: true,
        mode: 'close',
        countdownSeconds: 5,
        notifications: false,
        sounds: true,
        startWithWindows: true,
      },
    });
    const d = h.data;
    expect(d.onboarded).toBe(true);
    expect(d.activeCompanionId).toBe('volt');
    expect(d.companions.volt.name).toBe('Sparky');
    expect(d.settings).toMatchObject({ userName: 'Alim', dailyGoalMinutes: 240, notifications: false, startWithWindows: true });
    expect(d.rules.map((r) => r.pattern)).toEqual(['youtube.com']);
    expect(d.patrol).toMatchObject({ mode: 'close', countdownSeconds: 5 });
  });

  it('rejects locked companions', () => {
    const h = new Harness();
    const payload = {
      companionId: 'dragon', companionName: '', userName: '', dailyGoalMinutes: 60, rules: [],
      patrolEnabled: true, mode: 'complain' as const, countdownSeconds: 3, notifications: true, sounds: true, startWithWindows: false,
    };
    expect(h.err({ type: 'onboarding/finish', payload })).toMatch(/locked/);
  });
});
