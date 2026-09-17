// Defensive validation. Loaded or imported data is repaired field by field, so a damaged
// file never crashes the app and never silently drops valid progress.
import { LIMITS, SCHEMA_VERSION } from '../constants/brand';
import { CATEGORY_IDS } from '../constants/categories';
import { CHARACTER_BY_ID } from '../constants/characters';
import { ITEM_BY_ID, STARTER_ITEMS, isConsumable } from '../constants/items';
import type {
  AppData,
  CompanionProgress,
  DayStats,
  DecorSlot,
  Inventory,
  MissionProgress,
  PatrolSettings,
  SessionRecord,
  Settings,
  SiteRule,
  Task,
  TimerSettings,
  TimerState,
  WorkCategory,
} from '../types';
import { ACCESSORY_SLOTS, AMBIENT_IDS, DECOR_SLOT_IDS, PAGE_IDS } from './actions';
import { DEFAULT_PATROL, DEFAULT_SETTINGS, DEFAULT_TIMER_SETTINGS, createDefaultData, emptyCounters, emptyDay, idleTimer } from './defaults';
import { clamp, clampInt, clampNum } from './ids';
import { MISSION_BY_ID } from './missions';
import { dayKey, isDayKey } from './time';
import { normalizePattern } from './url';

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string, max = 200) => (typeof v === 'string' ? v.slice(0, max) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
export const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const tsOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const round2 = (n: number) => Math.round(n * 100) / 100;
export const cleanText = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '';

export function sanitizeCategory(v: unknown, fallback: WorkCategory = 'other'): WorkCategory {
  return oneOf(v, CATEGORY_IDS, fallback);
}

export function sanitizeSettings(raw: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const r = isObj(raw) ? raw : {};
  return {
    theme: oneOf(r.theme, ['dark', 'light', 'system'], base.theme),
    userName: r.userName === undefined ? base.userName : cleanText(r.userName, LIMITS.userName),
    startWithWindows: bool(r.startWithWindows, base.startWithWindows),
    minimizeToTray: bool(r.minimizeToTray, base.minimizeToTray),
    notifications: bool(r.notifications, base.notifications),
    sounds: bool(r.sounds, base.sounds),
    soundVolume: round2(clampNum(r.soundVolume, 0, 1, base.soundVolume)),
    motion: oneOf(r.motion, ['system', 'reduce', 'full'], base.motion),
    highContrast: bool(r.highContrast, base.highContrast),
    globalShortcuts: bool(r.globalShortcuts, base.globalShortcuts),
    dailyGoalMinutes: clampInt(r.dailyGoalMinutes, LIMITS.dailyGoal[0], LIMITS.dailyGoal[1], base.dailyGoalMinutes),
    companionVisible: bool(r.companionVisible, base.companionVisible),
    companionSize: round2(clampNum(r.companionSize, LIMITS.companionSize[0], LIMITS.companionSize[1], base.companionSize)),
    animationSpeed: round2(clampNum(r.animationSpeed, LIMITS.animationSpeed[0], LIMITS.animationSpeed[1], base.animationSpeed)),
    moveSpeed: oneOf(r.moveSpeed, ['slow', 'normal', 'fast'], base.moveSpeed),
    alwaysOnTop: bool(r.alwaysOnTop, base.alwaysOnTop),
    speechBubbles: bool(r.speechBubbles, base.speechBubbles),
    speech: oneOf(r.speech, ['quiet', 'normal', 'chatty'], base.speech),
  };
}

export function sanitizePatrol(raw: unknown, base: PatrolSettings = DEFAULT_PATROL): PatrolSettings {
  const r = isObj(raw) ? raw : {};
  const fp = isObj(r.freePosition) ? r.freePosition : null;
  return {
    enabled: bool(r.enabled, base.enabled),
    mode: oneOf(r.mode, ['close', 'complain'], base.mode),
    countdownSeconds: clampInt(r.countdownSeconds, LIMITS.countdown[0], LIMITS.countdown[1], base.countdownSeconds),
    snoozeMinutes: clampInt(r.snoozeMinutes, LIMITS.snooze[0], LIMITS.snooze[1], base.snoozeMinutes),
    edge: oneOf(r.edge, ['bottom', 'top', 'left', 'right', 'free'], base.edge),
    wander: bool(r.wander, base.wander),
    snoozedUntil: r.snoozedUntil === undefined ? base.snoozedUntil : tsOrNull(r.snoozedUntil),
    freePosition:
      r.freePosition === undefined
        ? base.freePosition
        : fp
          ? { x: Math.round(clampNum(fp.x, -32000, 32000, 0)), y: Math.round(clampNum(fp.y, -32000, 32000, 0)) }
          : null,
    edgeOffset: round2(clampNum(r.edgeOffset, 0, 1, base.edgeOffset)),
    strictDuringFocus: bool(r.strictDuringFocus, base.strictDuringFocus),
  };
}

export function sanitizeTimerSettings(raw: unknown, base: TimerSettings = DEFAULT_TIMER_SETTINGS): TimerSettings {
  const r = isObj(raw) ? raw : {};
  return {
    focusMinutes: clampInt(r.focusMinutes, LIMITS.focusMinutes[0], LIMITS.focusMinutes[1], base.focusMinutes),
    shortBreakMinutes: clampInt(r.shortBreakMinutes, LIMITS.breakMinutes[0], LIMITS.breakMinutes[1], base.shortBreakMinutes),
    longBreakMinutes: clampInt(r.longBreakMinutes, LIMITS.breakMinutes[0], LIMITS.breakMinutes[1], base.longBreakMinutes),
    longBreakEvery: clampInt(r.longBreakEvery, LIMITS.longBreakEvery[0], LIMITS.longBreakEvery[1], base.longBreakEvery),
    autoStartBreaks: bool(r.autoStartBreaks, base.autoStartBreaks),
    autoStartFocus: bool(r.autoStartFocus, base.autoStartFocus),
  };
}

function sanitizeTimer(raw: unknown, settings: TimerSettings): TimerState {
  const r = isObj(raw) ? raw : {};
  const phase = oneOf(r.phase, ['focus', 'shortBreak', 'longBreak'], 'focus');
  const category = sanitizeCategory(r.category);
  const base = idleTimer(settings, phase, clampInt(r.completedInCycle, 0, 99, 0), category);
  const status = oneOf(r.status, ['idle', 'running', 'paused'], 'idle');
  const durationMs = clampInt(r.durationMs, 60_000, 180 * 60_000, base.durationMs);
  const taskId = typeof r.taskId === 'string' ? r.taskId.slice(0, 80) : null;
  const t: TimerState = {
    ...base,
    status,
    durationMs,
    startedAt: tsOrNull(r.startedAt),
    endsAt: tsOrNull(r.endsAt),
    remainingMs: clampInt(r.remainingMs, 0, durationMs, durationMs),
    taskId,
    usedAmbient: bool(r.usedAmbient, false),
    tasksDuring: clampInt(r.tasksDuring, 0, 999, 0),
    pauses: clampInt(r.pauses, 0, 999, 0),
    guarded: bool(r.guarded, false),
  };
  if (t.status === 'running' && (!t.endsAt || !t.startedAt)) return { ...base, taskId };
  if (t.status === 'paused' && !t.startedAt) return { ...base, taskId };
  if (t.status === 'idle') return { ...base, taskId };
  return t;
}

function sanitizeRules(raw: unknown, now: number): SiteRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids = new Set<string>();
  const out: SiteRule[] = [];
  for (const item of raw.slice(0, LIMITS.maxRules)) {
    if (!isObj(item)) continue;
    const pattern = typeof item.pattern === 'string' ? normalizePattern(item.pattern) : null;
    if (!pattern || seen.has(pattern)) continue;
    let id = str(item.id, '', 80);
    if (!id || ids.has(id)) id = `site_${out.length}_${now.toString(36)}`;
    seen.add(pattern);
    ids.add(id);
    out.push({
      id,
      pattern,
      limitMinutes: clampInt(item.limitMinutes, LIMITS.ruleMinutes[0], LIMITS.ruleMinutes[1], 15),
      enabled: bool(item.enabled, true),
      createdAt: num(item.createdAt, now),
    });
  }
  return out;
}

function sanitizeRecordNumbers(raw: unknown, max: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw).slice(0, 500)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k.slice(0, 80)] = Math.min(max, Math.round(v));
  }
  return out;
}

export function sanitizeDueDate(v: unknown): string | null {
  return isDayKey(v) ? v : null;
}

function sanitizeTasks(raw: unknown, now: number): Task[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const out: Task[] = [];
  for (const t of raw.slice(0, LIMITS.maxTasks)) {
    if (!isObj(t)) continue;
    const title = cleanText(t.title, LIMITS.taskTitle);
    const id = str(t.id, '', 80);
    if (!title || !id || ids.has(id)) continue;
    ids.add(id);
    const done = bool(t.done, false);
    out.push({
      id,
      title,
      notes: cleanText(t.notes, LIMITS.taskNotes),
      priority: oneOf(t.priority, ['low', 'medium', 'high'], 'medium'),
      dueDate: sanitizeDueDate(t.dueDate),
      estimateMinutes: clampInt(t.estimateMinutes, LIMITS.estimateMinutes[0], LIMITS.estimateMinutes[1], 0),
      category: sanitizeCategory(t.category),
      done,
      createdAt: num(t.createdAt, now),
      completedAt: done ? (tsOrNull(t.completedAt) ?? now) : null,
      sessions: clampInt(t.sessions, 0, 9999, 0),
      focusMinutes: clampInt(t.focusMinutes, 0, 999999, 0),
      counted: bool(t.counted, done),
    });
  }
  return out;
}

function sanitizeCompanion(id: string, raw: unknown, now: number): CompanionProgress | null {
  const def = CHARACTER_BY_ID[id];
  if (!def || !isObj(raw)) return null;
  const acc: CompanionProgress['accessories'] = {};
  if (isObj(raw.accessories)) {
    for (const slot of ACCESSORY_SLOTS) {
      const itemId = raw.accessories[slot];
      if (typeof itemId === 'string' && ITEM_BY_ID[itemId]?.slot === slot) acc[slot] = itemId;
    }
  }
  const name = cleanText(raw.name, LIMITS.companionName) || def.defaultName;
  return {
    id,
    name,
    xp: clampInt(raw.xp, 0, 10_000_000, 0),
    energy: clampInt(raw.energy, 0, 100, 80),
    happiness: clampInt(raw.happiness, 0, 100, 75),
    unlockedAt: num(raw.unlockedAt, now),
    sessions: clampInt(raw.sessions, 0, 1_000_000, 0),
    focusMinutes: clampInt(raw.focusMinutes, 0, 100_000_000, 0),
    accessories: acc,
    powerCounter: clampInt(raw.powerCounter, 0, 1000, 0),
  };
}

function sanitizeDay(raw: unknown): DayStats {
  const base = emptyDay();
  if (!isObj(raw)) return base;
  const hours = Array.isArray(raw.hours) ? raw.hours : [];
  const categories: DayStats['categories'] = {};
  if (isObj(raw.categories)) {
    for (const id of CATEGORY_IDS) {
      const v = raw.categories[id];
      if (typeof v === 'number' && v > 0) categories[id] = clampInt(v, 0, 1440, 0);
    }
  }
  return {
    focusMinutes: clampInt(raw.focusMinutes, 0, 1440, 0),
    sessions: clampInt(raw.sessions, 0, 1000, 0),
    completed: clampInt(raw.completed, 0, 1000, 0),
    tasksDone: clampInt(raw.tasksDone, 0, 10000, 0),
    breaks: clampInt(raw.breaks, 0, 1000, 0),
    limitHits: clampInt(raw.limitHits, 0, 100000, 0),
    tabsClosed: clampInt(raw.tabsClosed, 0, 100000, 0),
    xp: clampInt(raw.xp, 0, 1_000_000, 0),
    coins: clampInt(raw.coins, 0, 1_000_000, 0),
    goalMet: bool(raw.goalMet, false),
    hours: base.hours.map((_, i) => clampInt(hours[i], 0, 60, 0)),
    greets: clampInt(raw.greets, 0, 100000, 0),
    shieldCoins: clampInt(raw.shieldCoins, 0, 1000, 0),
    guardedMinutes: clampInt(raw.guardedMinutes, 0, 1440, 0),
    categories,
  };
}

function sanitizeMissionList(raw: unknown, fallback: MissionProgress[]): MissionProgress[] {
  if (!Array.isArray(raw)) return fallback;
  const byId = new Map<string, MissionProgress>();
  for (const m of raw.slice(0, 20)) {
    if (!isObj(m) || typeof m.id !== 'string') continue;
    const def = MISSION_BY_ID[m.id];
    if (!def) continue;
    byId.set(def.id, { id: def.id, target: def.target, progress: clampInt(m.progress, 0, def.target, 0), done: bool(m.done, false) });
  }
  // keep the canonical list and order; unknown or missing entries start fresh
  return fallback.map((f) => byId.get(f.id) ?? f);
}

function sanitizeHistory(raw: unknown): SessionRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: SessionRecord[] = [];
  for (const s of raw.slice(-LIMITS.maxHistory)) {
    if (!isObj(s)) continue;
    const startedAt = tsOrNull(s.startedAt);
    const endedAt = tsOrNull(s.endedAt);
    if (!startedAt || !endedAt) continue;
    out.push({
      id: str(s.id, `s_${out.length}`, 80),
      startedAt,
      endedAt,
      minutes: clampInt(s.minutes, 0, 1440, 0),
      completed: bool(s.completed, false),
      taskId: typeof s.taskId === 'string' ? s.taskId.slice(0, 80) : null,
      companionId: typeof s.companionId === 'string' && CHARACTER_BY_ID[s.companionId] ? s.companionId : 'bee',
      category: sanitizeCategory(s.category),
      xp: clampInt(s.xp, 0, 100000, 0),
      coins: clampInt(s.coins, 0, 100000, 0),
    });
  }
  return out;
}

function sanitizeDecor(raw: unknown, owned: Record<string, number>, space: 'pet' | 'hero', fallback: Inventory['petDecor']): Inventory['petDecor'] {
  if (!isObj(raw)) return { ...fallback };
  const out: Partial<Record<DecorSlot, string>> = {};
  for (const slot of DECOR_SLOT_IDS) {
    const id = raw[slot];
    const item = typeof id === 'string' ? ITEM_BY_ID[id] : undefined;
    if (item && owned[item.id] && item.decorSlot === slot && (item.space === space || item.space === 'both')) out[slot] = item.id;
  }
  return out;
}

function sanitizeInventory(raw: unknown, def: Inventory): Inventory {
  const inv = isObj(raw) ? raw : {};
  const owned: Record<string, number> = {};
  if (isObj(inv.owned)) {
    for (const [id, n] of Object.entries(inv.owned)) {
      const item = ITEM_BY_ID[id];
      if (!item || typeof n !== 'number' || !Number.isFinite(n) || n <= 0) continue;
      owned[id] = isConsumable(item) ? Math.min(99, Math.floor(n)) : 1;
    }
  }
  for (const id of STARTER_ITEMS) owned[id] = owned[id] ?? 1;
  const themeOk = (id: unknown, space: 'pet' | 'hero'): id is string =>
    typeof id === 'string' && !!owned[id] && ITEM_BY_ID[id]?.category === 'theme' && ITEM_BY_ID[id]?.space === space;
  return {
    owned,
    petTheme: themeOk(inv.petTheme, 'pet') ? inv.petTheme : def.petTheme,
    heroTheme: themeOk(inv.heroTheme, 'hero') ? inv.heroTheme : def.heroTheme,
    petDecor: sanitizeDecor(inv.petDecor, owned, 'pet', def.petDecor),
    heroDecor: sanitizeDecor(inv.heroDecor, owned, 'hero', def.heroDecor),
  };
}

/** Repairs any parsed JSON into a complete, valid AppData. */
export function sanitizeData(raw: unknown, now: number): AppData {
  const def = createDefaultData(now);
  if (!isObj(raw)) return def;
  const r = raw;
  const settings = sanitizeSettings(r.settings);
  const timerSettings = sanitizeTimerSettings(r.timerSettings);

  const companions: Record<string, CompanionProgress> = {};
  if (isObj(r.companions)) {
    for (const [id, c] of Object.entries(r.companions)) {
      const s = sanitizeCompanion(id, c, now);
      if (s) companions[id] = s;
    }
  }
  if (!Object.keys(companions).length) Object.assign(companions, def.companions);
  const activeCompanionId =
    typeof r.activeCompanionId === 'string' && companions[r.activeCompanionId] ? r.activeCompanionId : Object.keys(companions)[0];

  const days: Record<string, DayStats> = {};
  if (isObj(r.days)) {
    const keys = Object.keys(r.days).filter(isDayKey).sort().slice(-LIMITS.maxDays);
    for (const k of keys) days[k] = sanitizeDay(r.days[k]);
  }

  const usageRaw = isObj(r.usage) ? r.usage : {};
  const today = dayKey(now);
  const usageDay = isDayKey(usageRaw.day) ? usageRaw.day : today;

  const profileRaw = isObj(r.profile) ? r.profile : {};
  const streakRaw = isObj(r.streak) ? r.streak : {};
  const missionsRaw = isObj(r.missions) ? r.missions : {};
  const achievements: AppData['achievements'] = {};
  if (isObj(r.achievements)) {
    for (const [id, a] of Object.entries(r.achievements)) {
      if (isObj(a) && typeof a.unlockedAt === 'number' && Number.isFinite(a.unlockedAt)) achievements[id.slice(0, 60)] = { unlockedAt: a.unlockedAt };
    }
  }
  const drRaw = isObj(r.dailyReward) ? r.dailyReward : {};
  const countersRaw = isObj(r.counters) ? r.counters : {};
  const counters = emptyCounters();
  for (const k of Object.keys(counters) as (keyof typeof counters)[]) counters[k] = clampInt(countersRaw[k], 0, 100_000_000, 0);
  const ambientRaw = isObj(r.ambient) ? r.ambient : {};
  const uiRaw = isObj(r.ui) ? r.ui : {};
  const tasks = sanitizeTasks(r.tasks, now);
  const timer = sanitizeTimer(r.timer, timerSettings);
  if (timer.taskId && !tasks.some((t) => t.id === timer.taskId)) timer.taskId = null;

  const missionDay = isDayKey(missionsRaw.day) ? missionsRaw.day : def.missions.day;
  const missionWeek = typeof missionsRaw.week === 'string' && /^\d{4}-W\d{2}$/.test(missionsRaw.week) ? missionsRaw.week : def.missions.week;

  return {
    schema: SCHEMA_VERSION,
    createdAt: num(r.createdAt, now),
    updatedAt: num(r.updatedAt, now),
    onboarded: bool(r.onboarded, false),
    settings,
    patrol: sanitizePatrol(r.patrol),
    rules: Array.isArray(r.rules) ? sanitizeRules(r.rules, now) : def.rules,
    usage: {
      day: usageDay,
      ms: sanitizeRecordNumbers(usageRaw.ms, 24 * 3_600_000),
      hits: sanitizeRecordNumbers(usageRaw.hits, 100000),
      closed: sanitizeRecordNumbers(usageRaw.closed, 100000),
    },
    timerSettings,
    timer,
    tasks,
    companions,
    activeCompanionId,
    profile: {
      coins: clampInt(profileRaw.coins, 0, 100_000_000, def.profile.coins),
      lifetimeCoins: clampInt(profileRaw.lifetimeCoins, 0, 100_000_000, def.profile.lifetimeCoins),
      totalXp: clampInt(profileRaw.totalXp, 0, 100_000_000, 0),
      boostSessions: clampInt(profileRaw.boostSessions, 0, 99, 0),
      streakFreezes: clampInt(profileRaw.streakFreezes, 0, LIMITS.maxStreakFreezes, 0),
    },
    inventory: sanitizeInventory(r.inventory, def.inventory),
    history: sanitizeHistory(r.history),
    days,
    streak: {
      current: clampInt(streakRaw.current, 0, 100000, 0),
      best: clampInt(streakRaw.best, 0, 100000, 0),
      lastDay: isDayKey(streakRaw.lastDay) ? streakRaw.lastDay : null,
      frozen: Array.isArray(streakRaw.frozen) ? streakRaw.frozen.filter(isDayKey).slice(-60) : [],
    },
    missions: {
      day: missionDay,
      daily: sanitizeMissionList(missionsRaw.daily, def.missions.daily),
      week: missionWeek,
      weekly: sanitizeMissionList(missionsRaw.weekly, def.missions.weekly),
    },
    achievements,
    dailyReward: {
      lastClaimDay: isDayKey(drRaw.lastClaimDay) ? drRaw.lastClaimDay : null,
      lastIndex: clampInt(drRaw.lastIndex, 0, 7, 0),
      cycles: clampInt(drRaw.cycles, 0, 100000, 0),
    },
    ambient: {
      id: oneOf(ambientRaw.id, AMBIENT_IDS, def.ambient.id),
      playing: bool(ambientRaw.playing, false),
      volume: round2(clamp(num(ambientRaw.volume, def.ambient.volume), 0, 1)),
    },
    counters,
    ui: { page: oneOf(uiRaw.page, PAGE_IDS, 'home'), lastCategory: sanitizeCategory(uiRaw.lastCategory) },
    lastTickAt: Math.min(now, num(r.lastTickAt, now)),
    lastDay: isDayKey(r.lastDay) ? r.lastDay : today,
  };
}

/** Quick structural check used before accepting an import file. */
export function looksLikeAppData(raw: unknown): boolean {
  return isObj(raw) && typeof raw.schema === 'number' && isObj(raw.settings) && isObj(raw.companions) && isObj(raw.profile);
}
