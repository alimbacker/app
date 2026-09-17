// Decides when website monitoring runs, turns helper output into ForegroundInfo,
// and reports an honest status to the UI.
import { app, powerMonitor } from 'electron';
import type { ForegroundInfo, MonitorState } from '@shared/types';
import { parseAddress } from '@shared/utilities/url';
import { log } from '../system/logger';
import { helperPath } from '../system/paths';
import type { Engine } from '../engine/engine';
import { HelperClient, type HelperForeground } from './helper-client';
import { PatrolEngine, type PatrolReaction } from './patrol-engine';

const BROWSER_NAMES: Record<string, string> = { chrome: 'Google Chrome', edge: 'Microsoft Edge', firefox: 'Firefox', brave: 'Brave' };

export interface MonitorOptions {
  /** Developer mode: no helper; the foreground is set through the dev command. */
  simulate: boolean;
  onReaction(r: PatrolReaction): void;
}

export class MonitorService {
  private readonly helper: HelperClient;
  readonly patrol: PatrolEngine;
  private ticker: NodeJS.Timeout | null = null;
  private locked = false;
  private restarts: number[] = [];
  private gaveUp = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private uia = true;
  private lastHelperFg: HelperForeground | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly opts: MonitorOptions,
  ) {
    this.helper = new HelperClient(helperPath());
    this.patrol = new PatrolEngine({
      now: () => Date.now(),
      data: () => this.engine.data,
      dispatch: (a) => {
        const r = this.engine.dispatch(a);
        if (!r.ok) log.warn('patrol action rejected', a.type, r.error);
      },
      publish: (active, enforcement) => this.engine.setRuntime({ active, enforcement }),
      close: (hwnd, host, path) => this.helper.close(hwnd, host, path),
      react: (r) => this.opts.onReaction(r),
      setTicking: (on) => this.setTicking(on),
    });
    this.helper.on('hello', ({ uia }) => this.onHello(uia));
    this.helper.on('foreground', (fg) => this.onForeground(fg));
    this.helper.on('down', (reason) => this.onDown(reason));
  }

  start(): void {
    this.engine.on('data', () => this.sync());
    const lock = () => {
      this.locked = true;
      this.patrol.observe(null);
    };
    const unlock = () => {
      this.locked = false;
      if (this.helper.running) this.helper.sample();
    };
    powerMonitor.on('lock-screen', lock);
    powerMonitor.on('suspend', lock);
    powerMonitor.on('unlock-screen', unlock);
    powerMonitor.on('resume', unlock);
    this.sync();
  }

  stop(): void {
    this.patrol.stop();
    this.helper.stop();
    this.setTicking(false);
    if (this.restartTimer) clearTimeout(this.restartTimer);
  }

  restart(): void {
    this.gaveUp = false;
    this.restarts = [];
    this.helper.stop();
    this.setStatus('starting', 'Starting the website monitor…');
    setTimeout(() => this.sync(), 300);
  }

  /** Called by the companion when clicked. */
  holdForSnooze(): boolean {
    return this.patrol.hold();
  }

  answerSnooze(snooze: boolean): void {
    this.patrol.answer(snooze);
  }

  /** Developer mode only: pretend a browser shows `url`. */
  simulate(url: string | null, appName = 'Google Chrome'): boolean {
    if (!this.opts.simulate) return false;
    const target = url ? parseAddress(url) : null;
    this.engine.setRuntime({
      foreground: {
        app: url ? 'chrome.exe' : 'code.exe',
        appName: url ? appName : 'Visual Studio Code',
        browser: url ? 'chrome' : null,
        host: target?.host ?? null,
        path: target?.path ?? null,
        urlStatus: url ? 'ok' : 'not-browser',
        self: false,
        at: Date.now(),
      },
    });
    this.patrol.observe(this.locked ? null : { hwnd: 'sim', target });
    return true;
  }

  private sync(): void {
    const d = this.engine.data;
    const want = d.onboarded && d.patrol.enabled;
    if (!want) {
      if (this.helper.running) this.helper.stop();
      this.patrol.stop();
      this.engine.setRuntime({ foreground: null });
      this.setStatus('off', 'Patrol is off. Your companion stays on the desktop, but websites aren’t watched.');
      return;
    }
    if (this.opts.simulate) {
      this.setStatus('running', 'Simulated website monitor (developer mode).');
      this.patrol.refresh();
      return;
    }
    if (process.platform !== 'win32') {
      this.setStatus('unsupported', 'Website monitoring works on Windows 10 and 11 only.');
      return;
    }
    if (!this.helper.exists()) {
      this.setStatus('unavailable', 'The website monitor is missing from this installation. Reinstall AllBee Focus to restore it.');
      return;
    }
    if (!this.helper.running && !this.gaveUp && !this.restartTimer) {
      this.helper.start();
      if (this.engine.runtime.monitor.state !== 'running') this.setStatus('starting', 'Starting the website monitor…');
    }
    this.patrol.refresh();
  }

  private onHello(uia: boolean): void {
    this.uia = uia;
    if (uia) this.setStatus('running', 'Watching Chrome, Edge, Firefox and Brave.');
    else this.setStatus('unavailable', 'Windows UI Automation isn’t available on this PC, so website addresses can’t be read.');
    log.info('helper ready, uia =', uia);
  }

  private onForeground(h: HelperForeground): void {
    this.lastHelperFg = h;
    const target = h.status === 'ok' ? parseAddress(h.url) : null;
    const fg: ForegroundInfo = {
      app: h.exe,
      appName: h.self ? app.getName() : h.name || (h.browser ? BROWSER_NAMES[h.browser] : h.exe) || 'Unknown app',
      browser: h.browser,
      host: target?.host ?? null,
      path: target?.path ?? null,
      urlStatus: h.self ? 'not-browser' : h.status,
      self: h.self,
      at: Date.now(),
    };
    const prev = this.engine.runtime.foreground;
    if (
      !prev ||
      prev.app !== fg.app ||
      prev.appName !== fg.appName ||
      prev.host !== fg.host ||
      prev.path !== fg.path ||
      prev.urlStatus !== fg.urlStatus ||
      prev.self !== fg.self
    ) {
      this.engine.setRuntime({ foreground: fg });
    }
    if (this.uia && this.engine.runtime.monitor.state !== 'running') this.setStatus('running', 'Watching Chrome, Edge, Firefox and Brave.');
    this.patrol.observe(this.locked ? null : { hwnd: h.hwnd, target });
  }

  private onDown(reason: string): void {
    log.warn('website monitor stopped:', reason);
    this.patrol.observe(null);
    this.engine.setRuntime({ foreground: null });
    const now = Date.now();
    this.restarts = this.restarts.filter((t) => now - t < 3 * 60_000);
    this.restarts.push(now);
    if (this.restarts.length >= 5) {
      this.gaveUp = true;
      this.setStatus('unavailable', 'The website monitor keeps stopping. Use “Restart monitor” to try again.');
      return;
    }
    const delay = [1000, 2000, 5000, 10000, 30000][this.restarts.length - 1] ?? 30000;
    this.setStatus('starting', 'The website monitor stopped. Restarting…');
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.sync();
    }, delay);
  }

  private setStatus(state: MonitorState, message: string): void {
    const cur = this.engine.runtime.monitor;
    if (cur.state === state && cur.message === message) return;
    this.engine.setRuntime({ monitor: { state, message, since: Date.now() } });
    // A session can only count as distraction-free while monitoring runs.
    const t = this.engine.data.timer;
    if (state !== 'running' && t.guarded && t.status !== 'idle') this.engine.dispatch({ type: '@timer/unguard' });
  }

  private setTicking(on: boolean): void {
    if (on && !this.ticker) this.ticker = setInterval(() => this.patrol.tick(), 1000);
    if (!on && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  get lastForeground(): HelperForeground | null {
    return this.lastHelperFg;
  }
}
