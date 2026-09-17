// Runs the native helper (Windows only) and speaks its JSON-lines protocol.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { log } from '../system/logger';

export interface HelperForeground {
  hwnd: string;
  pid: number;
  exe: string;
  name: string;
  browser: 'chrome' | 'edge' | 'firefox' | 'brave' | null;
  status: 'ok' | 'editing' | 'unreadable' | 'denied' | 'not-browser' | 'unsupported-browser' | 'none';
  url: string;
  self: boolean;
}

export interface CloseResult {
  ok: boolean;
  reason: string;
}

type HelperEvents = {
  hello: [info: { uia: boolean }];
  foreground: [fg: HelperForeground];
  down: [reason: string];
};

export class HelperClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private nextId = 1;
  private readonly waiting = new Map<number, (r: CloseResult) => void>();
  private readonly emitter = new EventEmitter();
  private stopping = false;

  constructor(private readonly exePath: string) {}

  on<K extends keyof HelperEvents>(event: K, cb: (...args: HelperEvents[K]) => void): void {
    this.emitter.on(event, cb as (...args: unknown[]) => void);
  }

  get running(): boolean {
    return !!this.child;
  }

  exists(): boolean {
    try {
      return fs.statSync(this.exePath).isFile();
    } catch {
      return false;
    }
  }

  start(): void {
    if (this.child) return;
    this.stopping = false;
    this.buffer = '';
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(this.exePath, ['--parent-pid', String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      log.error('helper spawn failed', err);
      this.emitter.emit('down', 'spawn-failed');
      return;
    }
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.onData(chunk));
    child.stderr.on('data', (chunk) => log.warn('helper stderr', String(chunk).slice(0, 500)));
    child.stdin.on('error', () => {});
    child.on('error', (err) => {
      log.error('helper error', err);
    });
    child.on('exit', (code, signal) => {
      this.child = null;
      for (const resolve of this.waiting.values()) resolve({ ok: false, reason: 'helper-stopped' });
      this.waiting.clear();
      if (!this.stopping) {
        log.warn('helper exited', code, signal);
        this.emitter.emit('down', `exit ${code ?? signal}`);
      }
    });
  }

  stop(): void {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    try {
      child.stdin.write('{"cmd":"quit"}\n');
      child.stdin.end();
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (!child.killed && child.exitCode === null) child.kill();
    }, 1500).unref();
    this.child = null;
  }

  sample(): void {
    this.send({ cmd: 'sample' });
  }

  close(hwnd: string, host: string, path: string): Promise<CloseResult> {
    if (!this.child) return Promise.resolve({ ok: false, reason: 'helper-stopped' });
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        resolve({ ok: false, reason: 'timeout' });
      }, 8000);
      this.waiting.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      this.send({ cmd: 'close', id, hwnd, host, path });
    });
  }

  private send(msg: Record<string, unknown>): void {
    if (!this.child) return;
    try {
      this.child.stdin.write(`${JSON.stringify(msg)}\n`);
    } catch (err) {
      log.warn('helper write failed', err);
    }
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > 1_000_000) this.buffer = '';
    let i: number;
    while ((i = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, i).trim();
      this.buffer = this.buffer.slice(i + 1);
      if (line) this.onLine(line);
    }
  }

  private onLine(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      log.warn('helper sent invalid JSON', line.slice(0, 200));
      return;
    }
    switch (msg.t) {
      case 'hello':
        this.emitter.emit('hello', { uia: msg.uia === true });
        break;
      case 'fg':
        this.emitter.emit('foreground', {
          hwnd: String(msg.hwnd ?? ''),
          pid: Number(msg.pid ?? 0),
          exe: String(msg.exe ?? ''),
          name: String(msg.name ?? ''),
          browser: (['chrome', 'edge', 'firefox', 'brave'] as const).find((b) => b === msg.browser) ?? null,
          status: (['ok', 'editing', 'unreadable', 'denied', 'not-browser', 'unsupported-browser', 'none'] as const).find((s) => s === msg.status) ?? 'none',
          url: typeof msg.url === 'string' ? msg.url : '',
          self: msg.self === true,
        });
        break;
      case 'closed': {
        const id = Number(msg.id);
        const resolve = this.waiting.get(id);
        if (resolve) {
          this.waiting.delete(id);
          resolve({ ok: msg.ok === true, reason: String(msg.reason ?? '') });
        }
        break;
      }
      case 'log':
        log.info('helper:', String(msg.msg ?? ''));
        break;
      default:
        break;
    }
  }
}
