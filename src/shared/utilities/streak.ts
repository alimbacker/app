// Streaks: a day counts when at least one focus session is completed.
import { LIMITS } from '../constants/brand';
import type { StreakState } from '../types';
import { addDays, daysBetween } from './time';

/**
 * Called when a new local day starts. Missed days are bridged with freezes when available,
 * otherwise the streak resets. Returns the updated streak and the number of freezes left.
 */
export function rolloverStreak(streak: StreakState, today: string, freezes: number): { streak: StreakState; freezes: number; broken: boolean } {
  const s: StreakState = { ...streak, frozen: [...streak.frozen] };
  if (!s.lastDay || s.current === 0) return { streak: s, freezes, broken: false };
  const yesterday = addDays(today, -1);
  let broken = false;
  let guard = 0;
  while (s.lastDay < yesterday && guard++ < 400) {
    const missed = addDays(s.lastDay, 1);
    if (freezes > 0) {
      freezes -= 1;
      s.frozen.push(missed);
      s.lastDay = missed;
    } else {
      s.current = 0;
      broken = true;
      break;
    }
  }
  s.frozen = s.frozen.slice(-60);
  return { streak: s, freezes: Math.min(LIMITS.maxStreakFreezes, freezes), broken };
}

/** Marks `today` as active. Returns the new streak and whether it grew. */
export function markActiveDay(streak: StreakState, today: string): { streak: StreakState; grew: boolean } {
  const s: StreakState = { ...streak, frozen: [...streak.frozen] };
  if (s.lastDay === today) return { streak: s, grew: false };
  if (s.lastDay && daysBetween(s.lastDay, today) === 1 && s.current > 0) s.current += 1;
  else s.current = 1;
  s.lastDay = today;
  s.best = Math.max(s.best, s.current);
  return { streak: s, grew: true };
}

/** The streak as it should be displayed today (0 if already lost). */
export function displayStreak(streak: StreakState, today: string): number {
  if (!streak.lastDay) return 0;
  const gap = daysBetween(streak.lastDay, today);
  return gap <= 1 ? streak.current : 0;
}

/** Whether today still needs a session to keep the streak. */
export function streakAtRisk(streak: StreakState, today: string): boolean {
  return streak.current > 0 && streak.lastDay !== today;
}
