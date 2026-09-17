// The single place where AppData changes. Pure: time and randomness are injected,
// so every rule here is unit-testable.
import { LIMITS } from '../constants/brand';
import { CATEGORY_IDS } from '../constants/categories';
import { CHARACTER_BY_ID, getCharacter } from '../constants/characters';
import {
  DAILY_REWARDS,
  ITEM_BY_ID,
  SPECIAL_FALLBACK_COINS,
  SPECIAL_REWARD_POOL,
  fitsSpace,
  isConsumable,
} from '../constants/items';
import { POWER_VALUES } from '../constants/powers';
import type { AppData, AppEvent, CompanionProgress, DayStats, TaskPriority, TimerPhase, WorkCategory } from '../types';
import { ACHIEVEMENT_BY_ID, newlyUnlocked } from './achievements';
import { ACCESSORY_SLOTS, AMBIENT_IDS, DECOR_SLOT_IDS, PAGE_IDS, PRIORITIES, type Action, type OnboardingPayload, type TaskInput } from './actions';
import { unlockState } from './companion';
import { emptyDay, idleTimer, makeRule, newCompanion, phaseMinutesOf } from './defaults';
import { clamp, clampInt, newId } from './ids';
import { MISSION_BY_ID, advanceMissions, refreshMissions, type MissionMetric } from './missions';
import {
  breakEnergy,
  computeSessionReward,
  earlyFinishReward,
  sessionEnergyGain,
  sessionHappinessGain,
} from './rewards';
import { cleanText, oneOf, sanitizeCategory, sanitizeDueDate, sanitizePatrol, sanitizeSettings, sanitizeTimerSettings } from './sanitize';
import { markActiveDay, rolloverStreak } from './streak';
import { MINUTE, addDays, dayKey, daysBetween, hourOf, weekKey } from './time';
import { normalizePattern } from './url';
import { DAILY_GOAL_COINS, STREAK_WEEK_COINS, levelFromXp, powerLevel, stageFor } from './xp';

export interface ReduceContext {
  now: number;
  rng: () => number;
  /** Website monitoring is running right now (decides whether a new session is "guarded"). */
  monitorOk?: boolean;
}

export interface ReduceResult {
  data: AppData;
  events: AppEvent[];
  error?: string;
  changed: boolean;
}

export class ActionError extends Error {}
const fail = (msg: string): never => {
  throw new ActionError(msg);
};

// ---------------------------------------------------------------------------
// helpers

export function dayStats(d: AppData, key: string): DayStats {
  if (!d.days[key]) {
    d.days[key] = emptyDay();
    const keys = Object.keys(d.days);
    if (keys.length > LIMITS.maxDays) {
      keys.sort();
      for (const k of keys.slice(0, keys.length - LIMITS.maxDays)) delete d.days[k];
    }
  }
  return d.days[key];
}

export function activeCompanion(d: AppData): CompanionProgress {
  return d.companions[d.activeCompanionId] ?? Object.values(d.companions)[0];
}

function addCoins(d: AppData, amount: number, now: number) {
  if (amount <= 0) return;
  d.profile.coins += amount;
  d.profile.lifetimeCoins += amount;
  dayStats(d, dayKey(now)).coins += amount;
}

function grantXp(d: AppData, companion: CompanionProgress, amount: number, ev: AppEvent[], now: number) {
  if (amount <= 0) return;
  const before = levelFromXp(companion.xp);
  const playerBefore = levelFromXp(d.profile.totalXp);
  companion.xp += amount;
  d.profile.totalXp += amount;
  dayStats(d, dayKey(now)).xp += amount;
  const after = levelFromXp(companion.xp);
  if (after > before) {
    const evolved = stageFor(after) > stageFor(before);
    if (evolved) d.counters.evolutions += 1;
    ev.push({ type: 'levelUp', companionId: companion.id, level: after, stage: stageFor(after), evolved });
  }
  const playerAfter = levelFromXp(d.profile.totalXp);
  if (playerAfter > playerBefore) ev.push({ type: 'playerLevel', level: playerAfter });
}

function advance(d: AppData, metric: MissionMetric, value: number, ev: AppEvent[], now: number) {
  for (const id of advanceMissions(d.missions, metric, value)) {
    const def = MISSION_BY_ID[id];
    const m = d.missions.daily.find((x) => x.id === id) ?? d.missions.weekly.find((x) => x.id === id);
    if (!def || !m || m.done) continue;
    m.done = true;
    d.counters.missionsDone += 1;
    addCoins(d, def.coins, now);
    grantXp(d, activeCompanion(d), def.xp, ev, now);
    ev.push({ type: 'missionComplete', id, xp: def.xp, coins: def.coins });
  }
}

function addHappiness(c: CompanionProgress, n: number) {
  c.happiness = clamp(Math.round(c.happiness + n), 0, 100);
}
function addEnergy(c: CompanionProgress, n: number) {
  c.energy = clamp(Math.round(c.energy + n), 0, 100);
}

function elapsedMs(d: AppData, now: number): number {
  const t = d.timer;
  if (t.status === 'running' && t.endsAt) return clamp(t.durationMs - (t.endsAt - now), 0, t.durationMs);
  if (t.status === 'paused') return clamp(t.durationMs - t.remainingMs, 0, t.durationMs);
  return 0;
}

/** Spreads focus minutes over the hours in which they happened. */
function addHours(stats: DayStats, endedAt: number, minutes: number) {
  for (let i = 0; i < minutes; i++) {
    const h = hourOf(endedAt - (i + 0.5) * MINUTE);
    stats.hours[h] = Math.min(60, stats.hours[h] + 1);
  }
}

function checkGoal(d: AppData, stats: DayStats, now: number, ev: AppEvent[]) {
  if (stats.goalMet || stats.focusMinutes < d.settings.dailyGoalMinutes) return;
  stats.goalMet = true;
  d.counters.goalDays += 1;
  addCoins(d, DAILY_GOAL_COINS, now);
  ev.push({ type: 'goalMet', minutes: d.settings.dailyGoalMinutes, coins: DAILY_GOAL_COINS });
}

/** Books focus minutes into today's stats, lifetime counters, the companion and the task. */
function addFocusMinutes(d: AppData, minutes: number, now: number, ev: AppEvent[]) {
  if (minutes <= 0) return;
  const t = d.timer;
  const stats = dayStats(d, dayKey(now));
  stats.focusMinutes = Math.min(1440, stats.focusMinutes + minutes);
  stats.categories[t.category] = Math.min(1440, (stats.categories[t.category] ?? 0) + minutes);
  addHours(stats, now, minutes);
  d.counters.focusMinutes += minutes;
  activeCompanion(d).focusMinutes += minutes;
  const task = t.taskId ? d.tasks.find((x) => x.id === t.taskId) : undefined;
  if (task) task.focusMinutes += minutes;
  advance(d, 'minutes', minutes, ev, now);
  if (t.guarded) {
    stats.guardedMinutes = Math.min(1440, stats.guardedMinutes + minutes);
    advance(d, 'guardedMinutes', minutes, ev, now);
    advance(d, 'dayMaxGuarded', stats.guardedMinutes, ev, now);
  }
  checkGoal(d, stats, now, ev);
}

function registerStreakDay(d: AppData, now: number, ev: AppEvent[]) {
  const res = markActiveDay(d.streak, dayKey(now));
  d.streak = res.streak;
  if (!res.grew) return;
  advance(d, 'streakDay', 1, ev, now);
  if (d.streak.current > 1) {
    const bonus = d.streak.current % 7 === 0 ? STREAK_WEEK_COINS : 0;
    addCoins(d, bonus, now);
    ev.push({ type: 'streak', days: d.streak.current, coins: bonus });
  }
}

function pushHistory(d: AppData, rec: AppData['history'][number]) {
  d.history.push(rec);
  if (d.history.length > LIMITS.maxHistory) d.history.splice(0, d.history.length - LIMITS.maxHistory);
}

function startPhase(
  d: AppData,
  phase: TimerPhase,
  minutes: number,
  taskId: string | null,
  category: WorkCategory,
  ctx: ReduceContext,
  ev: AppEvent[],
) {
  const durationMs = Math.round(minutes * MINUTE);
  const completedInCycle = d.timer.completedInCycle;
  d.timer = {
    phase,
    status: 'running',
    durationMs,
    startedAt: ctx.now,
    endsAt: ctx.now + durationMs,
    remainingMs: durationMs,
    taskId: phase === 'focus' ? taskId : d.timer.taskId,
    category,
    completedInCycle,
    usedAmbient: d.ambient.playing,
    tasksDuring: 0,
    pauses: 0,
    guarded: phase === 'focus' && !!ctx.monitorOk && d.patrol.enabled && d.rules.some((r) => r.enabled),
  };
  ev.push({ type: 'phaseStarted', phase, minutes });
}

function setIdle(d: AppData, phase: TimerPhase) {
  const keepTask = d.timer.taskId;
  const cycle = d.timer.completedInCycle;
  const category = d.timer.category;
  d.timer = idleTimer(d.timerSettings, phase, cycle, category);
  d.timer.taskId = keepTask && d.tasks.some((t) => t.id === keepTask && !t.done) ? keepTask : null;
}

function nextBreak(d: AppData, completedInCycle: number): TimerPhase {
  return completedInCycle > 0 && completedInCycle % d.timerSettings.longBreakEvery === 0 ? 'longBreak' : 'shortBreak';
}

interface CompleteOptions {
  /** Minutes actually focused (Time Freeze may finish a little early). */
  statMinutes?: number;
  extraNotes?: string[];
}

function completeFocus(d: AppData, ctx: ReduceContext, ev: AppEvent[], opts: CompleteOptions = {}) {
  const { now } = ctx;
  const t = d.timer;
  const plannedMinutes = Math.round(t.durationMs / MINUTE);
  const minutes = opts.statMinutes ?? plannedMinutes;
  const stats = dayStats(d, dayKey(now));
  const c = activeCompanion(d);
  const firstOfDay = stats.completed === 0;
  const startedAt = t.startedAt ?? now - t.durationMs;

  if (minutes >= LIMITS.minRewardMinutes) registerStreakDay(d, now, ev);

  const reward = computeSessionReward({
    minutes: plannedMinutes,
    startedAt,
    endedAt: now,
    companionId: c.id,
    companionLevel: levelFromXp(c.xp),
    happiness: c.happiness,
    category: t.category,
    streakDays: d.streak.current,
    boostActive: d.profile.boostSessions > 0,
    usedAmbient: t.usedAmbient,
    tasksDuring: t.tasksDuring,
    firstOfDay,
    rng: ctx.rng,
  });
  if (d.profile.boostSessions > 0 && reward.xp > 0) d.profile.boostSessions -= 1;
  const notes = [...(opts.extraNotes ?? []), ...reward.notes];

  stats.sessions += 1;
  stats.completed += 1;
  d.counters.sessions += 1;
  d.counters.longestSession = Math.max(d.counters.longestSession, minutes);
  if (hourOf(startedAt) < 8) d.counters.earlySessions += 1;
  const endHour = hourOf(now);
  if (endHour >= 22 || endHour < 4) d.counters.lateSessions += 1;
  if (t.category === 'coding' && minutes >= LIMITS.minRewardMinutes) d.counters.codingSessions += 1;

  c.sessions += 1;
  addEnergy(c, sessionEnergyGain(minutes));
  addHappiness(c, sessionHappinessGain(minutes, t.tasksDuring));

  if (reward.chargesFreeze) {
    c.powerCounter += 1;
    const needed = POWER_VALUES.streakProtection(powerLevel(levelFromXp(c.xp)));
    if (c.powerCounter >= needed) {
      c.powerCounter = 0;
      if (d.profile.streakFreezes < LIMITS.maxStreakFreezes) {
        d.profile.streakFreezes += 1;
        notes.push('Streak Protection crafted a streak freeze');
      }
    }
  }

  const task = t.taskId ? d.tasks.find((x) => x.id === t.taskId) : undefined;
  if (task) task.sessions += 1;

  grantXp(d, c, reward.xp, ev, now);
  addCoins(d, reward.coins, now);
  pushHistory(d, {
    id: newId('s'),
    startedAt,
    endedAt: now,
    minutes,
    completed: true,
    taskId: t.taskId,
    companionId: c.id,
    category: t.category,
    xp: reward.xp,
    coins: reward.coins,
  });
  ev.push({ type: 'sessionComplete', minutes, xp: reward.xp, coins: reward.coins, notes, companionId: c.id, taskId: t.taskId, full: true });

  addFocusMinutes(d, minutes, now, ev);
  advance(d, 'sessions', 1, ev, now);
  advance(d, 'dayMaxSessions', stats.completed, ev, now);
  if (minutes >= 25) advance(d, 'session25', 1, ev, now);
  if (minutes >= 90) advance(d, 'session90', 1, ev, now);

  // next phase
  const completedInCycle = t.completedInCycle + 1;
  d.timer.completedInCycle = completedInCycle;
  const next = nextBreak(d, completedInCycle);
  if (d.timerSettings.autoStartBreaks) startPhase(d, next, phaseMinutesOf(d.timerSettings, next), t.taskId, t.category, ctx, ev);
  else setIdle(d, next);
}

function finishEarly(d: AppData, ctx: ReduceContext, ev: AppEvent[]) {
  const { now } = ctx;
  const t = d.timer;
  if (t.phase !== 'focus' || t.status === 'idle') fail('No focus session is running.');
  const minutesDone = Math.floor(elapsedMs(d, now) / MINUTE);
  const plannedMinutes = Math.round(t.durationMs / MINUTE);
  const c = activeCompanion(d);
  const early = earlyFinishReward({ minutesDone, plannedMinutes, companionId: c.id, companionLevel: levelFromXp(c.xp) });
  if (early.countsAsFull) {
    completeFocus(d, ctx, ev, { statMinutes: minutesDone, extraNotes: early.notes });
    return;
  }
  const stats = dayStats(d, dayKey(now));
  if (minutesDone >= 1) {
    stats.sessions += 1;
    addFocusMinutes(d, minutesDone, now, ev);
    grantXp(d, c, early.xp, ev, now);
    addCoins(d, early.coins, now);
    if (minutesDone >= LIMITS.minRewardMinutes) {
      addEnergy(c, Math.round(sessionEnergyGain(minutesDone) / 2));
      addHappiness(c, 2);
    }
    pushHistory(d, {
      id: newId('s'),
      startedAt: t.startedAt ?? now - minutesDone * MINUTE,
      endedAt: now,
      minutes: minutesDone,
      completed: false,
      taskId: t.taskId,
      companionId: c.id,
      category: t.category,
      xp: early.xp,
      coins: early.coins,
    });
  }
  ev.push({ type: 'sessionEnded', minutes: minutesDone, xp: early.xp });
  setIdle(d, minutesDone >= LIMITS.minRewardMinutes ? nextBreak(d, t.completedInCycle) : 'focus');
}

function completeBreak(d: AppData, ctx: ReduceContext, ev: AppEvent[]) {
  const { now } = ctx;
  const t = d.timer;
  const minutes = Math.round(t.durationMs / MINUTE);
  const long = t.phase === 'longBreak';
  dayStats(d, dayKey(now)).breaks += 1;
  const c = activeCompanion(d);
  addEnergy(c, breakEnergy(minutes, long, c.id));
  ev.push({ type: 'breakComplete', long });
  if (long) d.timer.completedInCycle = 0;
  if (d.timerSettings.autoStartFocus) startPhase(d, 'focus', d.timerSettings.focusMinutes, t.taskId, t.category, ctx, ev);
  else setIdle(d, 'focus');
}

/** Day changes, passive energy, snooze expiry and mission refresh. Runs before every action. */
export function rollover(d: AppData, now: number, ev: AppEvent[]) {
  const today = dayKey(now);
  if (d.lastDay !== today) {
    const prev = d.lastDay;
    const gap = daysBetween(prev, today);
    if (gap > 0) {
      const prevStats = d.days[prev];
      if (prevStats && prevStats.focusMinutes > 0 && prevStats.limitHits === 0) d.counters.cleanDays += 1;
      // companions get a little sad on days without focus
      let quietDays = prevStats && prevStats.completed > 0 ? 0 : 1;
      quietDays += Math.max(0, gap - 1);
      if (quietDays > 0) {
        for (const c of Object.values(d.companions)) addHappiness(c, -6 * Math.min(3, quietDays));
      }
      const before = d.streak.current;
      const res = rolloverStreak(d.streak, today, d.profile.streakFreezes);
      const used = d.profile.streakFreezes - res.freezes;
      d.streak = res.streak;
      d.profile.streakFreezes = res.freezes;
      if (used > 0 && !res.broken) ev.push({ type: 'streakSaved', days: used });
      if (res.broken && before > 1) ev.push({ type: 'streakLost', days: before });
      ev.push({ type: 'newDay', day: today });
    }
    d.lastDay = today;
  }
  if (d.usage.day !== today) d.usage = { day: today, ms: {}, hits: {}, closed: {} };
  if (d.missions.day !== today || d.missions.week !== weekKey(now)) d.missions = refreshMissions(d.missions, now);
  if (d.patrol.snoozedUntil !== null && now >= d.patrol.snoozedUntil) d.patrol.snoozedUntil = null;

  if (now < d.lastTickAt) d.lastTickAt = now;
  const step = 30 * MINUTE;
  const steps = Math.floor((now - d.lastTickAt) / step);
  if (steps > 0) {
    const focusing = d.timer.status === 'running' && d.timer.phase === 'focus';
    for (const c of Object.values(d.companions)) {
      if (focusing && c.id === d.activeCompanionId) continue;
      if (c.energy > 10) c.energy = Math.max(10, c.energy - Math.min(48, steps));
    }
    d.lastTickAt += steps * step;
  }
}

function taskFields(input: TaskInput, base: { priority: TaskPriority; category: WorkCategory }) {
  const out: Partial<AppData['tasks'][number]> = {};
  if (input.title !== undefined) {
    const title = cleanText(input.title, LIMITS.taskTitle);
    if (!title) fail('Give the task a name.');
    out.title = title;
  }
  if (input.notes !== undefined) out.notes = cleanText(input.notes, LIMITS.taskNotes);
  if (input.priority !== undefined) out.priority = oneOf<TaskPriority>(input.priority, PRIORITIES, base.priority);
  if (input.dueDate !== undefined) {
    if (input.dueDate !== null && !sanitizeDueDate(input.dueDate)) fail('Pick a valid due date.');
    out.dueDate = sanitizeDueDate(input.dueDate);
  }
  if (input.estimateMinutes !== undefined)
    out.estimateMinutes = clampInt(input.estimateMinutes, LIMITS.estimateMinutes[0], LIMITS.estimateMinutes[1], 0);
  if (input.category !== undefined) out.category = sanitizeCategory(input.category, base.category);
  return out;
}

function applyOnboarding(d: AppData, p: OnboardingPayload, now: number) {
  const def = CHARACTER_BY_ID[p.companionId];
  if (!def) fail('Pick a companion to continue.');
  if (!d.companions[def!.id]) {
    if (!def!.unlock.starter) fail('That companion is still locked.');
    d.companions[def!.id] = newCompanion(def!.id, now);
  }
  const name = cleanText(p.companionName, LIMITS.companionName);
  d.companions[def!.id].name = name || def!.defaultName;
  d.activeCompanionId = def!.id;

  if (Array.isArray(p.rules)) {
    const seen = new Set<string>();
    const rules = [];
    for (const r of p.rules.slice(0, LIMITS.maxRules)) {
      const pattern = r && typeof r.pattern === 'string' ? normalizePattern(r.pattern) : null;
      if (!pattern || seen.has(pattern)) continue;
      seen.add(pattern);
      rules.push(makeRule(pattern, clampInt(r.limitMinutes, LIMITS.ruleMinutes[0], LIMITS.ruleMinutes[1], 15), now));
    }
    d.rules = rules;
  }
  d.patrol = sanitizePatrol({ mode: p.mode, enabled: p.patrolEnabled, countdownSeconds: p.countdownSeconds }, d.patrol);
  d.settings = sanitizeSettings(
    {
      userName: p.userName,
      dailyGoalMinutes: p.dailyGoalMinutes,
      notifications: p.notifications,
      sounds: p.sounds,
      startWithWindows: p.startWithWindows,
    },
    d.settings,
  );
  d.onboarded = true;
}

// ---------------------------------------------------------------------------

function apply(d: AppData, action: Action, ctx: ReduceContext, ev: AppEvent[]) {
  const { now } = ctx;
  switch (action.type) {
    case '@tick':
      return;

    // -- settings ------------------------------------------------------------
    case 'settings/update':
      d.settings = sanitizeSettings(action.patch, d.settings);
      return;
    case 'patrol/update': {
      const p = action.patch as Record<string, unknown>;
      const allowed: Record<string, unknown> = {};
      for (const k of ['enabled', 'mode', 'countdownSeconds', 'snoozeMinutes', 'edge', 'wander', 'strictDuringFocus']) {
        if (p[k] !== undefined) allowed[k] = p[k];
      }
      d.patrol = sanitizePatrol(allowed, d.patrol);
      return;
    }
    case 'patrol/snooze': {
      const minutes = clampInt(action.minutes ?? d.patrol.snoozeMinutes, LIMITS.snooze[0], LIMITS.snooze[1], d.patrol.snoozeMinutes);
      d.patrol.snoozedUntil = now + minutes * MINUTE;
      return;
    }
    case 'patrol/unsnooze':
      d.patrol.snoozedUntil = null;
      return;
    case '@patrol/position': {
      d.patrol.edge = oneOf(action.edge, ['bottom', 'top', 'left', 'right', 'free'], d.patrol.edge);
      if (action.offset !== undefined) d.patrol.edgeOffset = Math.round(clamp(action.offset, 0, 1) * 100) / 100;
      if (action.x !== undefined && action.y !== undefined) {
        d.patrol.freePosition = { x: Math.round(clamp(action.x, -32000, 32000)), y: Math.round(clamp(action.y, -32000, 32000)) };
      }
      return;
    }

    // -- site rules -----------------------------------------------------------
    case 'rules/add': {
      const pattern = normalizePattern(action.pattern);
      if (!pattern) fail('Enter a website like youtube.com or reddit.com/r/all.');
      if (d.rules.some((r) => r.pattern === pattern)) fail(`${pattern} is already on your list.`);
      if (d.rules.length >= LIMITS.maxRules) fail(`You can track up to ${LIMITS.maxRules} sites.`);
      d.rules.push(makeRule(pattern!, clampInt(action.limitMinutes, LIMITS.ruleMinutes[0], LIMITS.ruleMinutes[1], 15), now));
      return;
    }
    case 'rules/update': {
      const rule = d.rules.find((r) => r.id === action.id) ?? fail('That site is no longer on your list.');
      if (action.pattern !== undefined) {
        const pattern = normalizePattern(action.pattern);
        if (!pattern) fail('Enter a website like youtube.com or reddit.com/r/all.');
        if (d.rules.some((r) => r.pattern === pattern && r.id !== rule.id)) fail(`${pattern} is already on your list.`);
        rule.pattern = pattern!;
      }
      if (action.limitMinutes !== undefined)
        rule.limitMinutes = clampInt(action.limitMinutes, LIMITS.ruleMinutes[0], LIMITS.ruleMinutes[1], rule.limitMinutes);
      if (action.enabled !== undefined) rule.enabled = !!action.enabled;
      return;
    }
    case 'rules/remove':
      if (!d.rules.some((r) => r.id === action.id)) fail('That site is no longer on your list.');
      d.rules = d.rules.filter((r) => r.id !== action.id);
      delete d.usage.ms[action.id];
      delete d.usage.hits[action.id];
      delete d.usage.closed[action.id];
      return;
    case 'rules/resetToday':
      delete d.usage.ms[action.id];
      return;
    case '@usage/commit': {
      if (!d.rules.some((r) => r.id === action.ruleId)) return;
      const ms = clamp(Math.round(action.ms), 0, 10 * MINUTE);
      d.usage.ms[action.ruleId] = Math.min(24 * 60 * MINUTE, (d.usage.ms[action.ruleId] ?? 0) + ms);
      return;
    }
    case '@patrol/hit': {
      d.usage.hits[action.ruleId] = (d.usage.hits[action.ruleId] ?? 0) + 1;
      dayStats(d, dayKey(now)).limitHits += 1;
      d.counters.limitHits += 1;
      const c = activeCompanion(d);
      if (getCharacter(c.id).power !== 'distractionShield') addHappiness(c, -3);
      if (d.timer.phase === 'focus' && d.timer.status !== 'idle') d.timer.guarded = false;
      const rule = d.rules.find((r) => r.id === action.ruleId);
      ev.push({ type: 'limitReached', ruleId: action.ruleId, pattern: rule?.pattern ?? '' });
      return;
    }
    case '@patrol/resolved': {
      const stats = dayStats(d, dayKey(now));
      const rule = d.rules.find((r) => r.id === action.ruleId);
      if (action.how === 'closed') {
        d.usage.closed[action.ruleId] = (d.usage.closed[action.ruleId] ?? 0) + 1;
        stats.tabsClosed += 1;
        d.counters.tabsClosed += 1;
        ev.push({ type: 'tabClosed', pattern: rule?.pattern ?? '' });
      } else {
        d.counters.turnedAway += 1;
      }
      const c = activeCompanion(d);
      if (getCharacter(c.id).power === 'distractionShield' && stats.shieldCoins < 25) {
        const amount = Math.min(POWER_VALUES.distractionShield(powerLevel(levelFromXp(c.xp))), 25 - stats.shieldCoins);
        stats.shieldCoins += amount;
        addCoins(d, amount, now);
      }
      return;
    }

    // -- timer ------------------------------------------------------------------
    case 'timerSettings/update':
      d.timerSettings = sanitizeTimerSettings(action.patch, d.timerSettings);
      if (d.timer.status === 'idle') setIdle(d, d.timer.phase);
      return;
    case 'timer/start': {
      if (d.timer.status !== 'idle') fail('A session is already in progress. Pause or finish it first.');
      const phase: TimerPhase = action.phase ? oneOf(action.phase, ['focus', 'shortBreak', 'longBreak'], d.timer.phase) : d.timer.phase;
      const limits = phase === 'focus' ? LIMITS.focusMinutes : LIMITS.breakMinutes;
      const minutes =
        action.minutes !== undefined
          ? clampInt(action.minutes, limits[0], limits[1], phaseMinutesOf(d.timerSettings, phase))
          : phase === d.timer.phase
            ? Math.round(d.timer.durationMs / MINUTE)
            : phaseMinutesOf(d.timerSettings, phase);
      let taskId = action.taskId !== undefined ? action.taskId : d.timer.taskId;
      const task = taskId ? d.tasks.find((t) => t.id === taskId && !t.done) : undefined;
      if (!task) taskId = null;
      const category =
        action.category !== undefined
          ? sanitizeCategory(action.category, d.timer.category)
          : action.taskId && task
            ? task.category
            : d.timer.category;
      d.ui.lastCategory = category;
      startPhase(d, phase, minutes, taskId, category, ctx, ev);
      return;
    }
    case 'timer/pause':
      if (d.timer.status !== 'running' || !d.timer.endsAt) fail('The timer isn’t running.');
      d.timer.remainingMs = clamp(d.timer.endsAt! - now, 0, d.timer.durationMs);
      d.timer.endsAt = null;
      d.timer.status = 'paused';
      d.timer.pauses += 1;
      return;
    case 'timer/resume':
      if (d.timer.status !== 'paused') fail('The timer isn’t paused.');
      d.timer.endsAt = now + d.timer.remainingMs;
      d.timer.status = 'running';
      return;
    case 'timer/toggle':
      if (d.timer.status === 'running') return apply(d, { type: 'timer/pause' }, ctx, ev);
      if (d.timer.status === 'paused') return apply(d, { type: 'timer/resume' }, ctx, ev);
      return apply(d, { type: 'timer/start' }, ctx, ev);
    case 'timer/finishEarly':
      finishEarly(d, ctx, ev);
      return;
    case 'timer/skipBreak': {
      const t = d.timer;
      if (t.phase === 'focus') fail('There’s no break to skip.');
      if (t.phase === 'longBreak') d.timer.completedInCycle = 0;
      setIdle(d, 'focus');
      return;
    }
    case '@timer/complete': {
      const t = d.timer;
      if (t.status !== 'running' || !t.endsAt || now < t.endsAt - 1500) return;
      if (t.phase === 'focus') completeFocus(d, ctx, ev);
      else completeBreak(d, ctx, ev);
      return;
    }
    case '@timer/unguard':
      d.timer.guarded = false;
      return;
    case '@timer/abandon':
      setIdle(d, 'focus');
      return;
    case 'timer/setTask': {
      if (action.taskId !== null) {
        const task = d.tasks.find((t) => t.id === action.taskId && !t.done) ?? fail('That task is not available.');
        if (d.timer.status === 'idle') d.timer.category = task.category;
      }
      d.timer.taskId = action.taskId;
      return;
    }
    case 'timer/setCategory': {
      const category = sanitizeCategory(action.category, d.timer.category);
      if (!CATEGORY_IDS.includes(action.category as WorkCategory)) fail('Unknown category.');
      d.timer.category = category;
      d.ui.lastCategory = category;
      return;
    }

    // -- tasks ------------------------------------------------------------------
    case 'tasks/add': {
      if (d.tasks.length >= LIMITS.maxTasks) fail('Your list is full. Clear finished tasks first.');
      if (!action.task.title || !cleanText(action.task.title, LIMITS.taskTitle)) fail('Give the task a name.');
      const fields = taskFields(action.task, { priority: 'medium', category: d.ui.lastCategory });
      d.tasks.push({
        id: newId('task'),
        title: fields.title!,
        notes: fields.notes ?? '',
        priority: fields.priority ?? 'medium',
        dueDate: fields.dueDate ?? null,
        estimateMinutes: fields.estimateMinutes ?? 0,
        category: fields.category ?? d.ui.lastCategory,
        done: false,
        createdAt: now,
        completedAt: null,
        sessions: 0,
        focusMinutes: 0,
        counted: false,
      });
      return;
    }
    case 'tasks/edit': {
      const task = d.tasks.find((t) => t.id === action.id) ?? fail('That task no longer exists.');
      Object.assign(task, taskFields(action.task, task));
      return;
    }
    case 'tasks/toggle': {
      const task = d.tasks.find((t) => t.id === action.id) ?? fail('That task no longer exists.');
      task.done = !task.done;
      task.completedAt = task.done ? now : null;
      if (task.done) {
        if (d.timer.taskId === task.id && d.timer.status === 'idle') d.timer.taskId = null;
        if (!task.counted) {
          task.counted = true;
          d.counters.tasksDone += 1;
          dayStats(d, dayKey(now)).tasksDone += 1;
          addHappiness(activeCompanion(d), 2);
          if (d.timer.status !== 'idle' && d.timer.phase === 'focus') d.timer.tasksDuring += 1;
          ev.push({ type: 'taskDone', taskId: task.id, title: task.title });
          advance(d, 'tasks', 1, ev, now);
        }
      }
      return;
    }
    case 'tasks/remove':
      if (!d.tasks.some((t) => t.id === action.id)) fail('That task no longer exists.');
      d.tasks = d.tasks.filter((t) => t.id !== action.id);
      if (d.timer.taskId === action.id) d.timer.taskId = null;
      return;
    case 'tasks/move': {
      const i = d.tasks.findIndex((t) => t.id === action.id);
      if (i < 0) fail('That task no longer exists.');
      const j = clamp(i + Math.sign(action.dir), 0, d.tasks.length - 1);
      if (i !== j) {
        const [t] = d.tasks.splice(i, 1);
        d.tasks.splice(j, 0, t);
      }
      return;
    }
    case 'tasks/clearDone':
      d.tasks = d.tasks.filter((t) => !t.done);
      if (d.timer.taskId && !d.tasks.some((t) => t.id === d.timer.taskId)) d.timer.taskId = null;
      return;

    // -- companions -----------------------------------------------------------
    case 'companion/select':
      if (!d.companions[action.id]) fail('Unlock this companion first.');
      d.activeCompanionId = action.id;
      return;
    case 'companion/rename': {
      const c = d.companions[action.id] ?? fail('Unlock this companion first.');
      const name = cleanText(action.name, LIMITS.companionName);
      c.name = name || getCharacter(c.id).defaultName;
      return;
    }
    case 'companion/pet': {
      const stats = dayStats(d, dayKey(now));
      stats.greets += 1;
      const c = activeCompanion(d);
      if (stats.greets <= LIMITS.petsPerDay) addHappiness(c, 2);
      ev.push({ type: 'petted', happiness: c.happiness });
      return;
    }
    case 'companion/unlock': {
      const def = CHARACTER_BY_ID[action.id] ?? fail('Unknown companion.');
      const st = unlockState(d, def);
      switch (st.state) {
        case 'owned':
          fail(`${def.title} is already on your team.`);
          break;
        case 'needsLevel':
          fail(`${def.title} unlocks at Level ${st.level}.`);
          break;
        case 'needsAchievement':
          fail(`Earn “${ACHIEVEMENT_BY_ID[st.achievement]?.title ?? st.title}” to unlock ${def.title}.`);
          break;
        case 'needsCoins':
          fail(`You need ${st.missing} more coins.`);
          break;
        case 'available':
          d.profile.coins -= st.price;
          if (st.price > 0) d.counters.purchases += 1;
          d.companions[def.id] = newCompanion(def.id, now);
          ev.push({ type: 'unlocked', companionId: def.id });
          break;
      }
      return;
    }

    // -- shop & inventory -------------------------------------------------------
    case 'shop/buy': {
      const item = ITEM_BY_ID[action.itemId] ?? fail('That item isn’t sold here.');
      if (item.earnedOnly || item.starter) fail('That item can’t be bought.');
      const consumable = isConsumable(item);
      if (!consumable && d.inventory.owned[item.id]) fail(`You already own ${item.name}.`);
      if (item.effect?.streakFreeze && d.profile.streakFreezes >= LIMITS.maxStreakFreezes)
        fail(`You can hold up to ${LIMITS.maxStreakFreezes} streak freezes.`);
      if (consumable && (d.inventory.owned[item.id] ?? 0) >= 99) fail('Your bag is full of those.');
      if (d.profile.coins < item.price) fail(`You need ${item.price - d.profile.coins} more coins.`);
      d.profile.coins -= item.price;
      if (item.effect?.streakFreeze) d.profile.streakFreezes += 1;
      else d.inventory.owned[item.id] = (d.inventory.owned[item.id] ?? 0) + 1;
      d.counters.purchases += 1;
      ev.push({ type: 'purchased', itemId: item.id });
      return;
    }
    case 'item/use': {
      const item = ITEM_BY_ID[action.itemId];
      if (!item || !isConsumable(item) || !item.effect) fail('That item can’t be used.');
      if ((d.inventory.owned[item!.id] ?? 0) < 1) fail(`You don’t have any ${item!.name}.`);
      const c = activeCompanion(d);
      const e = item!.effect!;
      const helps =
        (e.happiness !== undefined && c.happiness < 100) || (e.energy !== undefined && c.energy < 100) || e.boostSessions !== undefined;
      if (!helps) fail(`${c.name} is already full of energy and happiness.`);
      if (e.happiness) addHappiness(c, e.happiness);
      if (e.energy) addEnergy(c, e.energy);
      if (e.boostSessions) d.profile.boostSessions = Math.min(99, d.profile.boostSessions + e.boostSessions);
      d.inventory.owned[item!.id] -= 1;
      if (d.inventory.owned[item!.id] <= 0) delete d.inventory.owned[item!.id];
      ev.push({ type: 'itemUsed', itemId: item!.id });
      return;
    }
    case 'item/equip': {
      if (!ACCESSORY_SLOTS.includes(action.slot)) fail('Unknown slot.');
      const c = activeCompanion(d);
      if (action.itemId === null) {
        delete c.accessories[action.slot];
        return;
      }
      const item = ITEM_BY_ID[action.itemId];
      if (!item || item.slot !== action.slot) fail('That doesn’t fit there.');
      if (!d.inventory.owned[item!.id]) fail(`Get ${item!.name} in the shop first.`);
      c.accessories[action.slot] = item!.id;
      d.counters.equips += 1;
      return;
    }
    case 'decor/place': {
      const space = oneOf(action.space, ['pet', 'hero'], 'pet');
      if (!DECOR_SLOT_IDS.includes(action.slot)) fail('Unknown spot.');
      const target = space === 'pet' ? d.inventory.petDecor : d.inventory.heroDecor;
      if (action.itemId === null) {
        delete target[action.slot];
        return;
      }
      const item = ITEM_BY_ID[action.itemId];
      if (!item || item.category !== 'decor' || item.decorSlot !== action.slot) fail('That doesn’t go there.');
      if (!fitsSpace(item!, space)) fail(space === 'pet' ? 'That belongs in the hero base.' : 'That belongs in the pet room.');
      if (!d.inventory.owned[item!.id]) fail(`Get ${item!.name} in the shop first.`);
      if (target[action.slot] !== item!.id) {
        target[action.slot] = item!.id;
        d.counters.decorPlaced += 1;
      }
      return;
    }
    case 'theme/set': {
      const space = oneOf(action.space, ['pet', 'hero'], 'pet');
      const item = ITEM_BY_ID[action.itemId];
      if (!item || item.category !== 'theme' || item.space !== space) fail('That isn’t a theme for this space.');
      if (!d.inventory.owned[item!.id]) fail(`Get ${item!.name} in the shop first.`);
      if (space === 'pet') d.inventory.petTheme = item!.id;
      else d.inventory.heroTheme = item!.id;
      return;
    }

    // -- rewards ----------------------------------------------------------------
    case 'daily/claim': {
      const today = dayKey(now);
      const r = d.dailyReward;
      if (r.lastClaimDay === today) fail('Today’s reward is already claimed. Come back tomorrow.');
      const consecutive = r.lastClaimDay === addDays(today, -1);
      const index = consecutive ? (r.lastIndex % 7) + 1 : 1;
      const reward = DAILY_REWARDS[index - 1];
      r.lastClaimDay = today;
      r.lastIndex = index;
      let coins = reward.coins;
      let itemId: string | undefined;
      if (reward.special) {
        r.cycles += 1;
        itemId = SPECIAL_REWARD_POOL.find((id) => ITEM_BY_ID[id] && !d.inventory.owned[id]);
        if (itemId) d.inventory.owned[itemId] = 1;
        else coins = SPECIAL_FALLBACK_COINS;
      }
      addCoins(d, coins, now);
      ev.push({ type: 'dailyReward', index, coins, itemId });
      return;
    }

    // -- misc -------------------------------------------------------------------
    case 'ambient/set': {
      if (action.id !== undefined) {
        if (!AMBIENT_IDS.includes(action.id)) fail('Unknown sound.');
        d.ambient.id = action.id;
      }
      if (action.playing !== undefined) d.ambient.playing = action.playing;
      if (action.volume !== undefined) d.ambient.volume = Math.round(clamp(action.volume, 0, 1) * 100) / 100;
      if (d.ambient.playing && d.timer.status !== 'idle' && d.timer.phase === 'focus') d.timer.usedAmbient = true;
      return;
    }
    case 'onboarding/finish':
      applyOnboarding(d, action.payload, now);
      return;
    case 'ui/page':
      if (!PAGE_IDS.includes(action.page)) fail('Unknown page.');
      d.ui.page = action.page;
      return;
    default: {
      const never: never = action;
      fail(`Unsupported action ${(never as { type: string }).type}`);
    }
  }
}

export function reduce(prev: AppData, action: Action, ctx: ReduceContext): ReduceResult {
  const d = structuredClone(prev);
  const events: AppEvent[] = [];
  try {
    rollover(d, ctx.now, events);
    apply(d, action, ctx, events);
  } catch (err) {
    if (err instanceof ActionError) return { data: prev, events: [], error: err.message, changed: false };
    throw err;
  }
  for (const id of newlyUnlocked(d)) {
    const def = ACHIEVEMENT_BY_ID[id];
    d.achievements[id] = { unlockedAt: ctx.now };
    addCoins(d, def.coins, ctx.now);
    events.push({ type: 'achievement', id, coins: def.coins });
  }
  d.updatedAt = ctx.now;
  return { data: d, events, changed: true };
}
