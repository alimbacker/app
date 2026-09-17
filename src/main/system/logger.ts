import fs from 'node:fs';
import path from 'node:path';

let logFile: string | null = null;
const MAX_BYTES = 1_000_000;

export function initLogger(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'allbee-focus.log');
    const st = fs.existsSync(logFile) ? fs.statSync(logFile) : null;
    if (st && st.size > MAX_BYTES) fs.renameSync(logFile, `${logFile}.1`);
  } catch {
    logFile = null;
  }
}

export function logFilePath(): string | null {
  return logFile;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function write(level: string, args: unknown[]): void {
  const text = args
    .map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ''}` : typeof a === 'string' ? a : safeJson(a)))
    .join(' ');
  const line = `${new Date().toISOString()} ${level} ${text}\n`;
  if (process.env.ALLBEE_DEBUG || !logFile) process.stdout.write(line);
  if (logFile) {
    try {
      fs.appendFileSync(logFile, line);
    } catch {
      /* ignore */
    }
  }
}

export const log = {
  info: (...args: unknown[]) => write('INFO ', args),
  warn: (...args: unknown[]) => write('WARN ', args),
  error: (...args: unknown[]) => write('ERROR', args),
};
