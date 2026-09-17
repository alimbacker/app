// Levels, ranks, evolution and base session XP.
import { EVOLUTION_LEVELS, STAGE_NAMES } from '../constants/characters';

export const MAX_LEVEL = 99;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 40 + 20 * (Math.max(1, level) - 1);
}

/** Cumulative XP needed to reach `level` (level 1 needs 0). */
export function totalXpFor(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, level)) - 1;
  return 40 * n + 20 * ((n * (n - 1)) / 2);
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && totalXpFor(level + 1) <= xp) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  into: number;
  needed: number;
  pct: number;
  maxed: boolean;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, pct: 1, maxed: true };
  const base = totalXpFor(level);
  const needed = xpToNext(level);
  const into = Math.max(0, xp - base);
  return { level, into, needed, pct: Math.min(1, into / needed), maxed: false };
}

export const RANKS = [
  { name: 'Rookie', min: 1 },
  { name: 'Rising', min: 5 },
  { name: 'Focused', min: 10 },
  { name: 'Elite', min: 20 },
  { name: 'Master', min: 30 },
  { name: 'Legendary', min: 50 },
  { name: 'Mythic', min: 75 },
] as const;

export type RankName = (typeof RANKS)[number]['name'];

export function rankFor(level: number): RankName {
  let r: RankName = 'Rookie';
  for (const rank of RANKS) if (level >= rank.min) r = rank.name;
  return r;
}

export function nextRank(level: number): { name: RankName; min: number } | null {
  return RANKS.find((r) => r.min > level) ?? null;
}

/** Evolution stage index 0..4 for a level. */
export function stageFor(level: number): number {
  let s = 0;
  EVOLUTION_LEVELS.forEach((min, i) => {
    if (level >= min) s = i;
  });
  return s;
}

export function stageName(stage: number): string {
  return STAGE_NAMES[Math.max(0, Math.min(STAGE_NAMES.length - 1, stage))];
}

export function nextEvolutionLevel(level: number): number | null {
  return EVOLUTION_LEVELS.find((l) => l > level) ?? null;
}

/** Power level 1..5 grows with each evolution. */
export function powerLevel(level: number): number {
  return stageFor(level) + 1;
}

/**
 * Base XP for a finished focus session.
 * Anchors from the design brief: 15m=10, 25m=25, 45m=45, 60m=70, 90m=110.
 * Beyond 90 minutes XP keeps growing, but more slowly, so marathon sessions aren't over-rewarded.
 */
const ANCHORS: [number, number][] = [
  [15, 10],
  [25, 25],
  [45, 45],
  [60, 70],
  [90, 110],
];

export function sessionBaseXp(minutes: number): number {
  const m = Math.max(0, Math.min(180, minutes));
  if (m < 5) return 0;
  if (m <= 15) return Math.round((m / 15) * 10);
  for (let i = 1; i < ANCHORS.length; i++) {
    const [m1, x1] = ANCHORS[i];
    if (m <= m1) {
      const [m0, x0] = ANCHORS[i - 1];
      return Math.round(x0 + ((m - m0) / (m1 - m0)) * (x1 - x0));
    }
  }
  return Math.round(110 + (m - 90) * 0.6);
}

/** Coins for a finished focus session (+10 for sessions of 10 minutes or more). */
export function sessionBaseCoins(minutes: number): number {
  return minutes >= 10 ? 10 : 0;
}

export const DAILY_GOAL_COINS = 50;
export const STREAK_WEEK_COINS = 100;
