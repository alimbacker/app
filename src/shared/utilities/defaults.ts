import { SCHEMA_VERSION } from '../constants/brand';
import { DEFAULT_COMPANION, getCharacter } from '../constants/characters';
import { DEFAULT_HERO_DECOR, DEFAULT_HERO_THEME, DEFAULT_PET_DECOR, DEFAULT_PET_THEME, STARTER_ITEMS } from '../constants/items';
import type {
  AppData,
  CompanionProgress,
  Counters,
  DayStats,
  PatrolSettings,
  Settings,
  SiteRule,
  TimerSettings,
  TimerState,
  WorkCategory,
} from '../types';
import { newId } from './ids';
import { missionsFor } from './missions';
import { dayKey } from './time';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  userName: '',
  startWithWindows: false,
  minimizeToTray: true,
  notifications: true,
  sounds: true,
  soundVolume: 0.6,
  motion: 'system',
  highContrast: false,
  globalShortcuts: false,
  dailyGoalMinutes: 120,
  companionVisible: true,
  companionSize: 0.9,
  animationSpeed: 1,
  moveSpeed: 'normal',
  alwaysOnTop: true,
  speechBubbles: true,
  speech: 'normal',
};

export const DEFAULT_PATROL: PatrolSettings = {
  enabled: true,
  mode: 'complain',
  countdownSeconds: 3,
  snoozeMinutes: 5,
  edge: 'bottom',
  wander: true,
  snoozedUntil: null,
  freePosition: null,
  edgeOffset: 0.8,
  strictDuringFocus: true,
};

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
};

export const DEFAULT_RULES: { pattern: string; limitMinutes: number }[] = [
  { pattern: 'youtube.com/shorts', limitMinutes: 5 },
  { pattern: 'instagram.com/reel', limitMinutes: 20 },
  { pattern: 'reddit.com', limitMinutes: 15 },
];

export const STARTING_COINS = 50;

export function makeRule(pattern: string, limitMinutes: number, now: number): SiteRule {
  return { id: newId('site'), pattern, limitMinutes, enabled: true, createdAt: now };
}

export function phaseMinutesOf(settings: TimerSettings, phase: TimerState['phase']): number {
  return phase === 'focus' ? settings.focusMinutes : phase === 'shortBreak' ? settings.shortBreakMinutes : settings.longBreakMinutes;
}

export function idleTimer(
  settings: TimerSettings,
  phase: TimerState['phase'] = 'focus',
  completedInCycle = 0,
  category: WorkCategory = 'other',
): TimerState {
  const ms = phaseMinutesOf(settings, phase) * 60_000;
  return {
    phase,
    status: 'idle',
    durationMs: ms,
    startedAt: null,
    endsAt: null,
    remainingMs: ms,
    taskId: null,
    category,
    completedInCycle,
    usedAmbient: false,
    tasksDuring: 0,
    pauses: 0,
    guarded: false,
  };
}

export function newCompanion(id: string, now: number, name?: string): CompanionProgress {
  return {
    id,
    name: name?.trim() || getCharacter(id).defaultName,
    xp: 0,
    energy: 80,
    happiness: 75,
    unlockedAt: now,
    sessions: 0,
    focusMinutes: 0,
    accessories: {},
    powerCounter: 0,
  };
}

export function emptyDay(): DayStats {
  return {
    focusMinutes: 0,
    sessions: 0,
    completed: 0,
    tasksDone: 0,
    breaks: 0,
    limitHits: 0,
    tabsClosed: 0,
    xp: 0,
    coins: 0,
    goalMet: false,
    hours: Array.from({ length: 24 }, () => 0),
    greets: 0,
    shieldCoins: 0,
    guardedMinutes: 0,
    categories: {},
  };
}

export function emptyCounters(): Counters {
  return {
    sessions: 0,
    focusMinutes: 0,
    purchases: 0,
    tasksDone: 0,
    limitHits: 0,
    tabsClosed: 0,
    turnedAway: 0,
    cleanDays: 0,
    equips: 0,
    decorPlaced: 0,
    longestSession: 0,
    earlySessions: 0,
    lateSessions: 0,
    goalDays: 0,
    codingSessions: 0,
    missionsDone: 0,
    evolutions: 0,
  };
}

export function createDefaultData(now: number): AppData {
  const today = dayKey(now);
  const owned: Record<string, number> = {};
  for (const id of STARTER_ITEMS) owned[id] = 1;
  return {
    schema: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    onboarded: false,
    settings: { ...DEFAULT_SETTINGS },
    patrol: { ...DEFAULT_PATROL },
    rules: DEFAULT_RULES.map((r) => makeRule(r.pattern, r.limitMinutes, now)),
    usage: { day: today, ms: {}, hits: {}, closed: {} },
    timerSettings: { ...DEFAULT_TIMER_SETTINGS },
    timer: idleTimer(DEFAULT_TIMER_SETTINGS),
    tasks: [],
    companions: { [DEFAULT_COMPANION]: newCompanion(DEFAULT_COMPANION, now) },
    activeCompanionId: DEFAULT_COMPANION,
    profile: { coins: STARTING_COINS, lifetimeCoins: STARTING_COINS, totalXp: 0, boostSessions: 0, streakFreezes: 0 },
    inventory: {
      owned,
      petTheme: DEFAULT_PET_THEME,
      heroTheme: DEFAULT_HERO_THEME,
      petDecor: { ...DEFAULT_PET_DECOR },
      heroDecor: { ...DEFAULT_HERO_DECOR },
    },
    history: [],
    days: {},
    streak: { current: 0, best: 0, lastDay: null, frozen: [] },
    missions: missionsFor(now),
    achievements: {},
    dailyReward: { lastClaimDay: null, lastIndex: 0, cycles: 0 },
    ambient: { id: 'rain', playing: false, volume: 0.5 },
    counters: emptyCounters(),
    ui: { page: 'home', lastCategory: 'other' },
    lastTickAt: now,
    lastDay: today,
  };
}
