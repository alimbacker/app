// Achievements unlock automatically and pay a small coin reward.
import { CHARACTER_BY_ID } from '../constants/characters';
import type { AppData } from '../types';
import { levelFromXp } from './xp';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  coins: number;
  /** lucide icon name used by the renderer */
  icon: string;
  progress: (d: AppData) => [current: number, target: number];
}

const maxLevel = (d: AppData) => Math.max(1, ...Object.values(d.companions).map((c) => levelFromXp(c.xp)));
const ownedOf = (d: AppData, kind: 'pet' | 'hero') => Object.keys(d.companions).filter((id) => CHARACTER_BY_ID[id]?.kind === kind).length;
const hours = (d: AppData) => Math.floor(d.counters.focusMinutes / 60);

const count = (
  id: string,
  title: string,
  description: string,
  coins: number,
  icon: string,
  target: number,
  get: (d: AppData) => number,
): AchievementDef => ({ id, title, description, coins, icon, progress: (d) => [Math.min(target, Math.max(0, get(d))), target] });

export const ACHIEVEMENTS: AchievementDef[] = [
  count('first_focus', 'First Focus', 'Complete your first focus session.', 20, 'Target', 1, (d) => d.counters.sessions),
  count('hours_5', 'Focus Beginner', 'Reach 5 hours of focus.', 50, 'Flame', 5, hours),
  count('hours_50', 'Focus Master', 'Reach 50 hours of focus.', 250, 'Flame', 50, hours),
  count('hours_100', 'Focus Legend', 'Reach 100 hours of focus.', 500, 'Flame', 100, hours),
  count('streak_7', '7 Day Streak', 'Focus 7 days in a row.', 100, 'CalendarCheck', 7, (d) => d.streak.best),
  count('streak_30', '30 Day Streak', 'Focus 30 days in a row.', 400, 'CalendarHeart', 30, (d) => d.streak.best),
  count('pets_5', 'Pet Collector', 'Unlock 5 pets.', 100, 'PawPrint', 5, (d) => ownedOf(d, 'pet')),
  count('heroes_5', 'Hero Collector', 'Unlock 5 heroes.', 100, 'ShieldHalf', 5, (d) => ownedOf(d, 'hero')),
  count('tasks_100', 'Task Master', 'Complete 100 tasks.', 250, 'Trophy', 100, (d) => d.counters.tasksDone),
  count('coding_25', 'Coding Hero', 'Complete 25 coding sessions.', 150, 'Code', 25, (d) => d.counters.codingSessions),
  count('sessions_100', 'AllBee Champion', 'Reach 100 finished focus sessions.', 300, 'Hexagon', 100, (d) => d.counters.sessions),
  count('tasks_10', 'Getting Things Done', 'Complete 10 tasks.', 40, 'ListChecks', 10, (d) => d.counters.tasksDone),
  count('deep_focus', 'Deep Focus', 'Complete a 90-minute session.', 80, 'Waves', 90, (d) => d.counters.longestSession),
  count('goal_getter', 'Goal Getter', 'Reach your daily focus goal.', 40, 'Flag', 1, (d) => d.counters.goalDays),
  count('evolved', 'Growth Spurt', 'Evolve a companion for the first time.', 50, 'Sparkles', 5, maxLevel),
  count('level_10', 'Rising Star', 'Reach level 10 with a companion.', 100, 'Star', 10, maxLevel),
  count('early_bird', 'Early Bird', 'Finish a session that started before 8:00.', 40, 'Sunrise', 1, (d) => d.counters.earlySessions),
  count('night_owl', 'Night Owl', 'Finish a session that ended after 22:00.', 40, 'MoonStar', 1, (d) => d.counters.lateSessions),
  count('interior', 'Interior Designer', 'Place 5 decorations.', 60, 'Sofa', 5, (d) => d.counters.decorPlaced),
  count('guarded', 'Well Guarded', 'Let Patrol turn you away from limited sites 10 times.', 60, 'ShieldCheck', 10, (d) => d.counters.tabsClosed + d.counters.turnedAway),
  count('missions_20', 'Mission Runner', 'Complete 20 missions.', 80, 'Medal', 20, (d) => d.counters.missionsDone),
  count('loyal', 'Loyal Friend', 'Claim all 7 daily rewards in a row.', 70, 'Gift', 1, (d) => d.dailyReward.cycles),
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Ids of achievements whose condition is met but that aren't unlocked yet. */
export function newlyUnlocked(d: AppData): string[] {
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (d.achievements[a.id]) continue;
    const [cur, target] = a.progress(d);
    if (cur >= target) out.push(a.id);
  }
  return out;
}
