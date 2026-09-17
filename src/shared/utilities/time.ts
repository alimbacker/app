// Local-time helpers. Day keys are local calendar dates (YYYY-MM-DD).

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function isDayKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d.getTime());
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = parseDay(a);
  const db = parseDay(b);
  return Math.round((db.getTime() - da.getTime()) / DAY);
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function nextMidnight(ts: number): number {
  const d = new Date(ts);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function hourOf(ts: number): number {
  return new Date(ts).getHours();
}

/** ISO-8601 week key, e.g. 2026-W38. Weeks start on Monday. */
export function weekKey(ts: number): string {
  const d = new Date(ts);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(week)}`;
}

/** Day keys (Mon..Sun) of the week containing ts. */
export function weekDays(ts: number): string[] {
  const d = new Date(ts);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  const monday = addDays(dayKey(ts), -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Last n day keys ending today (oldest first). */
export function lastDays(ts: number, n: number): string[] {
  const today = dayKey(ts);
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

/** mm:ss or h:mm:ss */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "1h 25m", "25m", "40s" */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatMinutes(min: number): string {
  return formatDuration(Math.round(min) * MINUTE);
}

/** "7:42 PM" in the user's locale. */
export function formatClock(ts: number, locale?: string): string {
  return new Date(ts).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}
