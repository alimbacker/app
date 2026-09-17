// Daily missions and weekly hero missions. Rewards are paid automatically on completion.
import type { MissionProgress, MissionsState } from '../types';
import { dayKey, weekKey } from './time';

export type MissionMetric =
  | 'sessions'
  | 'minutes'
  | 'tasks'
  | 'guardedMinutes'
  | 'streakDay'
  | 'session25'
  | 'session90'
  | 'dayMaxSessions'
  | 'dayMaxGuarded';

/** Metrics whose progress is the best single-day value rather than a running total. */
const MAX_METRICS: MissionMetric[] = ['dayMaxSessions', 'dayMaxGuarded'];

export interface MissionDef {
  id: string;
  scope: 'daily' | 'hero';
  title: string;
  description: string;
  /** Short symbol shown in the list (text only). */
  symbol: string;
  metric: MissionMetric;
  target: number;
  xp: number;
  coins: number;
  /** Progress depends on website monitoring being available. */
  needsMonitor?: boolean;
  unit?: 'min';
}

export const DAILY_MISSIONS: MissionDef[] = [
  { id: 'd_session', scope: 'daily', symbol: '◎', title: 'Complete 1 focus session', description: 'Run any focus session to the end.', metric: 'sessions', target: 1, xp: 20, coins: 20 },
  { id: 'd_minutes', scope: 'daily', symbol: '◷', title: 'Focus for 60 minutes', description: 'Finished and early-finished sessions both count.', metric: 'minutes', target: 60, xp: 50, coins: 30, unit: 'min' },
  { id: 'd_tasks', scope: 'daily', symbol: '✓', title: 'Complete 3 tasks', description: 'Tick off three tasks from your list.', metric: 'tasks', target: 3, xp: 75, coins: 30 },
  { id: 'd_guard', scope: 'daily', symbol: '⛨', title: 'Avoid distractions for 2 hours', description: 'Focus with Patrol watching and never hit a site limit during those sessions.', metric: 'guardedMinutes', target: 120, xp: 100, coins: 50, needsMonitor: true, unit: 'min' },
  { id: 'd_streak', scope: 'daily', symbol: '🔥', title: 'Maintain your streak', description: 'Finish a focus session of 5 minutes or more today.', metric: 'streakDay', target: 1, xp: 50, coins: 20 },
];

export const HERO_MISSIONS: MissionDef[] = [
  { id: 'h_speed', scope: 'hero', symbol: '⚡', title: 'Speed Mission', description: 'Complete a 25-minute focus session.', metric: 'session25', target: 1, xp: 40, coins: 30 },
  { id: 'h_challenge', scope: 'hero', symbol: '🔥', title: 'Challenge Mission', description: 'Complete 3 sessions in a single day.', metric: 'dayMaxSessions', target: 3, xp: 60, coins: 40 },
  { id: 'h_defense', scope: 'hero', symbol: '🛡', title: 'Defense Mission', description: 'Avoid distracting websites for 2 hours in one day while Patrol watches.', metric: 'dayMaxGuarded', target: 120, xp: 80, coins: 60, needsMonitor: true, unit: 'min' },
  { id: 'h_long', scope: 'hero', symbol: '🚀', title: 'Long Mission', description: 'Complete a 90-minute session.', metric: 'session90', target: 1, xp: 100, coins: 80 },
  { id: 'h_allbee', scope: 'hero', symbol: '⬢', title: 'AllBee Mission', description: 'Complete 10 focus sessions this week.', metric: 'sessions', target: 10, xp: 100, coins: 100 },
];

export const MISSION_BY_ID: Record<string, MissionDef> = Object.fromEntries(
  [...DAILY_MISSIONS, ...HERO_MISSIONS].map((m) => [m.id, m]),
);

const fresh = (defs: MissionDef[]): MissionProgress[] => defs.map((m) => ({ id: m.id, progress: 0, target: m.target, done: false }));

export function missionsFor(ts: number): MissionsState {
  return { day: dayKey(ts), daily: fresh(DAILY_MISSIONS), week: weekKey(ts), weekly: fresh(HERO_MISSIONS) };
}

/** Starts new daily/weekly sets when the day or week changed. */
export function refreshMissions(state: MissionsState, ts: number): MissionsState {
  const day = dayKey(ts);
  const week = weekKey(ts);
  return {
    day,
    daily: state.day === day ? state.daily : fresh(DAILY_MISSIONS),
    week,
    weekly: state.week === week ? state.weekly : fresh(HERO_MISSIONS),
  };
}

/**
 * Advances every open mission tracking `metric`. For running totals `value` is added;
 * for best-of-day metrics it is the day's current value.
 * Returns ids of missions that just became complete.
 */
export function advanceMissions(state: MissionsState, metric: MissionMetric, value: number): string[] {
  const done: string[] = [];
  const isMax = MAX_METRICS.includes(metric);
  for (const list of [state.daily, state.weekly]) {
    for (const m of list) {
      const def = MISSION_BY_ID[m.id];
      if (!def || def.metric !== metric || m.done) continue;
      const next = isMax ? Math.max(m.progress, value) : m.progress + value;
      m.progress = Math.min(m.target, Math.max(0, Math.round(next)));
      if (m.progress >= m.target) done.push(m.id);
    }
  }
  return done;
}

export function findMission(state: MissionsState, id: string): MissionProgress | undefined {
  return state.daily.find((m) => m.id === id) ?? state.weekly.find((m) => m.id === id);
}
