// Companion helpers shared by the main process and the renderer.
import { ACHIEVEMENT_BY_ID } from './achievements';
import { CHARACTER_BY_ID, getCharacter, type CharacterDef } from '../constants/characters';
import type { AppData, CompanionProgress, Mood, ViewData } from '../types';
import { levelFromXp, powerLevel, rankFor, stageFor } from './xp';

type DataLike = Pick<AppData, 'companions' | 'profile' | 'achievements' | 'activeCompanionId'> | ViewData;

export function moodOf(c: Pick<CompanionProgress, 'energy' | 'happiness'>): Mood {
  if (c.energy < 25) return 'sleepy';
  if (c.happiness >= 70) return 'happy';
  if (c.happiness >= 40) return 'calm';
  return 'sad';
}

export const MOOD_LABEL: Record<Mood, string> = { happy: 'Happy', calm: 'Calm', sleepy: 'Sleepy', sad: 'Needs attention' };

export function playerLevel(d: DataLike): number {
  return levelFromXp(d.profile.totalXp);
}

export function companionStats(c: CompanionProgress) {
  const level = levelFromXp(c.xp);
  return { level, stage: stageFor(level), power: powerLevel(level), rank: rankFor(level), mood: moodOf(c) };
}

export type UnlockState =
  | { state: 'owned' }
  | { state: 'available'; price: number }
  | { state: 'needsCoins'; price: number; missing: number }
  | { state: 'needsLevel'; level: number; price: number }
  | { state: 'needsAchievement'; achievement: string; title: string; level: number; price: number };

export function unlockState(d: DataLike, def: CharacterDef): UnlockState {
  if (d.companions[def.id]) return { state: 'owned' };
  const u = def.unlock;
  if (u.starter) return { state: 'available', price: 0 };
  if (playerLevel(d) < u.level) return { state: 'needsLevel', level: u.level, price: u.price };
  if (u.achievement && !d.achievements[u.achievement]) {
    return { state: 'needsAchievement', achievement: u.achievement, title: ACHIEVEMENT_BY_ID[u.achievement]?.title ?? u.achievement, level: u.level, price: u.price };
  }
  if (d.profile.coins < u.price) return { state: 'needsCoins', price: u.price, missing: u.price - d.profile.coins };
  return { state: 'available', price: u.price };
}

export function unlockLabel(s: UnlockState): string {
  switch (s.state) {
    case 'owned':
      return 'Unlocked';
    case 'available':
      return s.price > 0 ? `Unlock for ${s.price}` : 'Free';
    case 'needsCoins':
      return `${s.price} coins`;
    case 'needsLevel':
      return `Unlock at Level ${s.level}`;
    case 'needsAchievement':
      return `Earn “${s.title}”`;
  }
}

export function activeCharacter(d: DataLike): { def: CharacterDef; progress: CompanionProgress } {
  const progress = d.companions[d.activeCompanionId] ?? Object.values(d.companions)[0];
  return { def: getCharacter(progress.id), progress };
}

export function isKnownCharacter(id: string): boolean {
  return !!CHARACTER_BY_ID[id];
}
