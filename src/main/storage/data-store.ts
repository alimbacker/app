// Local JSON storage with atomic writes and a rolling backup.
// The file lives in the per-user app data folder; nothing leaves the computer.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_FILE } from '@shared/constants/brand';
import type { AppData } from '@shared/types';
import { createDefaultData } from '@shared/utilities/defaults';
import { looksLikeAppData, sanitizeData } from '@shared/utilities/sanitize';
import { log } from '../system/logger';

export type SaveState = 'saved' | 'saving' | 'error';

export interface LoadResult {
  data: AppData;
  warning: string | null;
  fresh: boolean;
}

const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function friendlyFsError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === 'ENOSPC') return 'The disk is full, so your progress couldn’t be saved.';
  if (code === 'EACCES' || code === 'EPERM' || code === 'EBUSY') return 'Windows blocked writing to the data folder. Another program may be using the file.';
  if (code === 'EROFS') return 'The data folder is read-only.';
  return 'Your latest changes couldn’t be saved.';
}

export class DataStore {
  readonly file: string;
  private readonly bak: string;
  private readonly tmp: string;
  private timer: NodeJS.Timeout | null = null;
  private pending: AppData | null = null;
  private lastBackupAt = 0;
  private listener: (state: SaveState, error?: string) => void = () => {};

  constructor(readonly dir: string) {
    this.file = path.join(dir, DATA_FILE);
    this.bak = `${this.file}.bak`;
    this.tmp = `${this.file}.tmp`;
  }

  onStatus(cb: (state: SaveState, error?: string) => void): void {
    this.listener = cb;
  }

  load(now: number): LoadResult {
    fs.mkdirSync(this.dir, { recursive: true });
    const primary = this.readJson(this.file);
    if (primary.ok) return { data: sanitizeData(primary.value, now), warning: null, fresh: false };
    if (primary.missing) {
      const backup = this.readJson(this.bak);
      if (backup.ok) {
        return { data: sanitizeData(backup.value, now), warning: 'Your data file was missing, so AllBee Focus restored the latest backup.', fresh: false };
      }
      return { data: createDefaultData(now), warning: null, fresh: true };
    }
    // The main file exists but can't be used: keep a copy for support, then try the backup.
    const keep = path.join(this.dir, `${DATA_FILE}.damaged-${now}.json`);
    try {
      fs.copyFileSync(this.file, keep);
    } catch (err) {
      log.warn('could not keep damaged data file', err);
    }
    log.error('data file unreadable', primary.error);
    const backup = this.readJson(this.bak);
    if (backup.ok) {
      return {
        data: sanitizeData(backup.value, now),
        warning: 'Your data file was damaged. AllBee Focus restored the latest backup and kept a copy of the damaged file.',
        fresh: false,
      };
    }
    return {
      data: createDefaultData(now),
      warning: 'Your data file was damaged and no backup was available, so AllBee Focus started fresh. A copy of the damaged file was kept in the data folder.',
      fresh: true,
    };
  }

  private readJson(file: string): { ok: true; value: unknown } | { ok: false; missing: boolean; error?: unknown } {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      return { ok: false, missing: (err as NodeJS.ErrnoException).code === 'ENOENT', error: err };
    }
    try {
      const value = JSON.parse(text.replace(/^\uFEFF/, ''));
      if (!looksLikeAppData(value)) return { ok: false, missing: false, error: new Error('not AllBee Focus data') };
      return { ok: true, value };
    } catch (err) {
      return { ok: false, missing: false, error: err };
    }
  }

  /** Debounced save. */
  schedule(data: AppData, delay = 400): void {
    this.pending = data;
    this.listener('saving');
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, delay);
  }

  /** Writes any pending data now. Returns false if the write failed. */
  flush(): boolean {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const data = this.pending;
    if (!data) return true;
    this.pending = null;
    try {
      this.writeAtomic(data);
      this.listener('saved');
      return true;
    } catch (err) {
      log.error('save failed', err);
      this.pending = data;
      this.listener('error', friendlyFsError(err));
      return false;
    }
  }

  /** Replaces the file immediately (import / reset). */
  replace(data: AppData): boolean {
    this.pending = data;
    return this.flush();
  }

  private writeAtomic(data: AppData): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const json = JSON.stringify(data);
    const fd = fs.openSync(this.tmp, 'w');
    try {
      fs.writeSync(fd, json);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    const now = Date.now();
    if (now - this.lastBackupAt > 10 * 60_000 && fs.existsSync(this.file)) {
      try {
        fs.copyFileSync(this.file, this.bak);
        this.lastBackupAt = now;
      } catch (err) {
        log.warn('backup copy failed', err);
      }
    }
    // Antivirus scanners sometimes hold the file for a moment on Windows: retry briefly.
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(this.tmp, this.file);
        return;
      } catch (err) {
        if (attempt >= 5) throw err;
        sleepSync(40 * (attempt + 1));
      }
    }
  }

  exportTo(target: string, data: AppData): void {
    const payload = { ...data, exportedAt: new Date().toISOString(), app: 'AllBee Focus' };
    fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
  }

  readImport(source: string, now: number): { data: AppData } | { error: string } {
    let raw: unknown;
    try {
      const st = fs.statSync(source);
      if (st.size > 50_000_000) return { error: 'That file is too large to be an AllBee Focus export.' };
      raw = JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      return { error: 'That file isn’t valid JSON.' };
    }
    if (!looksLikeAppData(raw)) return { error: 'That file doesn’t look like an AllBee Focus export.' };
    return { data: sanitizeData(raw, now) };
  }
}
