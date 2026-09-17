// Aggregations for the statistics page.
import type { DayStats } from '../types';
import { addDays, dayKey, parseDay, weekDays } from './time';

export interface Totals {
  focusMinutes: number;
  sessions: number;
  completed: number;
  tasksDone: number;
  days: number;
  avgSession: number;
}

type DaysMap = Record<string, DayStats>;

export function sumDays(days: DaysMap, keys: string[]): Totals {
  let focusMinutes = 0;
  let sessions = 0;
  let completed = 0;
  let tasksDone = 0;
  let activeDays = 0;
  for (const k of keys) {
    const d = days[k];
    if (!d) continue;
    focusMinutes += d.focusMinutes;
    sessions += d.sessions;
    completed += d.completed;
    tasksDone += d.tasksDone;
    if (d.focusMinutes > 0) activeDays += 1;
  }
  return { focusMinutes, sessions, completed, tasksDone, days: activeDays, avgSession: sessions ? Math.round(focusMinutes / sessions) : 0 };
}

export function allTotals(days: DaysMap): Totals {
  return sumDays(days, Object.keys(days));
}

/** Day keys of the calendar month containing ts. */
export function monthDays(ts: number): string[] {
  const d = new Date(ts);
  const first = new Date(d.getFullYear(), d.getMonth(), 1, 12);
  const out: string[] = [];
  for (let k = dayKey(first.getTime()); parseDay(k).getMonth() === first.getMonth(); k = addDays(k, 1)) out.push(k);
  return out;
}

export interface ChartPoint {
  key: string;
  label: string;
  value: number;
  /** Tooltip detail */
  detail: string;
}

const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dailySeries(days: DaysMap, now: number, n: number): ChartPoint[] {
  const today = dayKey(now);
  return Array.from({ length: n }, (_, i) => {
    const key = addDays(today, i - (n - 1));
    const d = parseDay(key);
    const v = days[key]?.focusMinutes ?? 0;
    return { key, label: n <= 7 ? SHORT_DAY[d.getDay()] : `${d.getDate()}`, value: v, detail: `${SHORT_DAY[d.getDay()]} ${d.getDate()} ${SHORT_MONTH[d.getMonth()]}` };
  });
}

export function weeklySeries(days: DaysMap, now: number, n: number): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const keys = weekDays(now - i * 7 * 86_400_000);
    const total = sumDays(days, keys).focusMinutes;
    const start = parseDay(keys[0]);
    out.push({ key: keys[0], label: `${start.getDate()} ${SHORT_MONTH[start.getMonth()]}`, value: total, detail: `Week of ${start.getDate()} ${SHORT_MONTH[start.getMonth()]}` });
  }
  return out;
}

export function monthlySeries(days: DaysMap, now: number, n: number): ChartPoint[] {
  const out: ChartPoint[] = [];
  const base = new Date(now);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(base.getFullYear(), base.getMonth() - i, 15, 12);
    const keys = monthDays(m.getTime());
    out.push({
      key: `${m.getFullYear()}-${m.getMonth() + 1}`,
      label: SHORT_MONTH[m.getMonth()],
      value: sumDays(days, keys).focusMinutes,
      detail: `${SHORT_MONTH[m.getMonth()]} ${m.getFullYear()}`,
    });
  }
  return out;
}

/** 7 x N grid (Mon-first) of day keys ending with the current week, for the streak calendar. */
export function calendarWeeks(now: number, weeks: number): string[][] {
  const out: string[][] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push(weekDays(now - i * 7 * 86_400_000));
  return out;
}
