// Controls the floating desktop companion: where it is, how it moves, what it says,
// and how it reacts to clicks, drags and Patrol.
import { BrowserWindow, Menu, nativeTheme, screen, systemPreferences, type Display, type MenuItemConstructorOptions } from 'electron';
import { IPC, type CompanionPointer } from '@shared/constants/ipc';
import { getCharacter } from '@shared/constants/characters';
import type { CompanionPose, CompanionView, PageId, PatrolEdge } from '@shared/types';
import type { Action } from '@shared/utilities/actions';
import { activeCharacter } from '@shared/utilities/companion';
import { clamp } from '@shared/utilities/ids';
import { pickLine, type SpeechTopic } from '@shared/utilities/speech';
import { formatClock } from '@shared/utilities/time';
import { siteLabel } from '@shared/utilities/url';
import { levelFromXp, stageFor } from '@shared/utilities/xp';
import type { Engine } from '../engine/engine';
import type { PatrolReaction } from '../monitoring/patrol-engine';
import { log } from '../system/logger';
import type { WindowManager } from '../windows';

const BASE_SPRITE = 140;
const SNAP_DISTANCE = 90;
const SPEEDS = { slow: 38, normal: 68, fast: 112 } as const;
const GAP_BETWEEN_LINES = 20_000;

export interface CompanionHandlers {
  holdForSnooze(): boolean;
  answerSnooze(snooze: boolean): void;
  openMain(page: PageId): void;
  quit(): void;
}

export type SpeechPriority = 'high' | 'normal' | 'low';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class CompanionController {
  private win: BrowserWindow | null = null;
  private ready = false;
  private shown = false;
  private size = { w: 0, h: 0 };
  private pos = { x: 0, y: 0 };
  /** Unrounded position while walking, so slow speeds still make progress. */
  private fpos = { x: 0, y: 0 };
  private placed = false;
  private offset: number;
  private edge: PatrolEdge;
  private moving = false;
  private moveTimer: NodeJS.Timeout | null = null;
  private moveTarget: { x: number; y: number } | null = null;
  private lastStepAt = 0;
  private restUntil = Date.now() + 6000;
  private idlePose: CompanionPose = 'idle';
  private facing: 'left' | 'right' = 'left';
  private temp: { pose: CompanionPose; until: number } | null = null;
  private speech: { id: number; text: string; until: number } | null = null;
  private prompt: { id: number; minutes: number; until: number } | null = null;
  private seq = 0;
  private lastSpeechAt = 0;
  private nextChatterAt = Date.now() + 6 * 60_000;
  private drag: { offX: number; offY: number; startX: number; startY: number; moved: boolean } | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private lastViewKey = '';
  private timerMarks = new Set<string>();
  private positionDirty = false;
  private lastPersist = Date.now();
  private alwaysOnTop: boolean | null = null;
  private greeted = false;

  constructor(
    private readonly engine: Engine,
    private readonly windows: WindowManager,
    private readonly handlers: CompanionHandlers,
  ) {
    this.offset = engine.data.patrol.edgeOffset;
    this.edge = engine.data.patrol.edge;
  }

  start(): void {
    this.engine.on('data', () => this.sync());
    this.engine.on('runtime', () => this.push());
    nativeTheme.on('updated', () => this.push());
    const replace = () => this.place();
    screen.on('display-metrics-changed', replace);
    screen.on('display-removed', replace);
    screen.on('display-added', replace);
    this.heartbeat = setInterval(() => this.beat(), 1000);
    this.sync();
  }

  stop(): void {
    this.persist(true);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.stopMove();
  }

  get visible(): boolean {
    return this.shown;
  }

  markReady(sender: Electron.WebContents): void {
    if (!this.win || sender !== this.win.webContents) return;
    this.ready = true;
    this.lastViewKey = '';
    this.sync();
    if (!this.greeted) {
      this.greeted = true;
      setTimeout(() => this.sayTopic('greet', 'normal'), 1200);
    }
  }

  isCompanionSender(sender: Electron.WebContents): boolean {
    return !!this.win && !this.win.isDestroyed() && sender === this.win.webContents;
  }

  // ---------------------------------------------------------------------------
  // state sync

  private reducedMotion(): boolean {
    const m = this.engine.data.settings.motion;
    if (m === 'reduce') return true;
    if (m === 'full') return false;
    try {
      return systemPreferences.getAnimationSettings().prefersReducedMotion;
    } catch {
      return false;
    }
  }

  private sync(): void {
    const d = this.engine.data;
    const want = d.onboarded && d.settings.companionVisible;
    const scale = d.settings.companionSize;
    const sprite = Math.round(BASE_SPRITE * scale);
    const size = { w: Math.max(250, sprite + 80), h: sprite + 124 };
    const sizeChanged = size.w !== this.size.w || size.h !== this.size.h;
    this.size = size;

    if (d.patrol.edge !== this.edge) {
      this.edge = d.patrol.edge;
      this.offset = d.patrol.edgeOffset;
      this.stopMove();
      this.placed = false;
    }

    // Saving the companion's position on the way out changes the data, which lands back
    // here; without this guard the window would be built again as the app closes.
    if (want && !this.win && !this.windows.quitting) {
      const b = this.computeBounds();
      this.pos = { x: b.x, y: b.y };
      this.placed = true;
      this.alwaysOnTop = d.settings.alwaysOnTop;
      this.win = this.windows.createCompanion(b, d.settings.alwaysOnTop);
      this.ready = false;
      this.win.on('closed', () => {
        this.win = null;
        this.ready = false;
        this.shown = false;
        this.stopMove();
        this.engine.setRuntime({ companionShown: false });
      });
    }
    const win = this.win;
    if (win && !win.isDestroyed()) {
      if (this.alwaysOnTop !== d.settings.alwaysOnTop) {
        this.alwaysOnTop = d.settings.alwaysOnTop;
        win.setAlwaysOnTop(d.settings.alwaysOnTop, 'floating');
      }
      if (sizeChanged || !this.placed) this.place();
      if (want && this.ready && !this.shown) {
        win.showInactive();
        this.shown = true;
        this.engine.setRuntime({ companionShown: true });
      } else if (!want && this.shown) {
        this.stopMove();
        win.hide();
        this.shown = false;
        this.speech = null;
        this.prompt = null;
        this.engine.setRuntime({ companionShown: false });
      }
    }
    this.push();
  }

  private currentPose(now: number): CompanionPose {
    const d = this.engine.data;
    const { def, progress } = activeCharacter(d);
    const flyer = def.locomotion === 'hover' || def.locomotion === 'fly';
    if (this.drag?.moved) return flyer ? 'fly' : 'happy';
    if (this.temp && this.temp.until > now) return this.temp.pose;
    const e = this.engine.runtime.enforcement;
    if (e) return e.phase === 'complaining' ? 'angry' : e.phase === 'closed' ? 'happy' : 'concerned';
    if (this.moving) {
      if (flyer) return def.locomotion === 'fly' ? 'fly' : 'hover';
      return d.settings.moveSpeed === 'fast' ? 'run' : 'walk';
    }
    if (d.timer.status === 'running' && d.timer.phase === 'focus') return 'focusing';
    if (progress.energy < 25) return 'sleep';
    if (d.timer.status === 'running') return 'sit';
    return this.idlePose;
  }

  private buildView(): CompanionView {
    const now = Date.now();
    const d = this.engine.data;
    const { progress } = activeCharacter(d);
    const level = levelFromXp(progress.xp);
    const e = this.engine.runtime.enforcement;
    return {
      characterId: progress.id,
      name: progress.name,
      level,
      stage: stageFor(level),
      accessories: progress.accessories,
      pose: this.currentPose(now),
      facing: this.facing,
      moving: this.moving,
      edge: this.edge,
      scale: d.settings.companionSize,
      animationSpeed: d.settings.animationSpeed,
      reducedMotion: this.reducedMotion(),
      theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
      speech: this.speech && this.speech.until > now ? { id: this.speech.id, text: this.speech.text } : null,
      prompt: this.prompt ? { id: this.prompt.id, kind: 'snooze', minutes: this.prompt.minutes } : null,
      countdown:
        e && (e.phase === 'countdown' || e.phase === 'held')
          ? { endsAt: e.endsAt, remainingMs: e.remainingMs, pattern: siteLabel(e.pattern) }
          : null,
      timer:
        d.timer.status !== 'idle'
          ? { phase: d.timer.phase, status: d.timer.status, endsAt: d.timer.endsAt, remainingMs: d.timer.remainingMs }
          : null,
    };
  }

  push(): void {
    const win = this.win;
    if (!this.ready || !win || win.isDestroyed()) return;
    const view = this.buildView();
    const key = JSON.stringify(view);
    if (key === this.lastViewKey) return;
    this.lastViewKey = key;
    win.webContents.send(IPC.companionView, view);
  }

  // ---------------------------------------------------------------------------
  // placement & movement

  private display(): Display {
    if (this.placed) {
      return screen.getDisplayNearestPoint({ x: Math.round(this.pos.x + this.size.w / 2), y: Math.round(this.pos.y + this.size.h / 2) });
    }
    const fp = this.engine.data.patrol.freePosition;
    if (this.edge === 'free' && fp) return screen.getDisplayNearestPoint(fp);
    return screen.getPrimaryDisplay();
  }

  private computeBounds() {
    const { w, h } = this.size;
    const wa = this.display().workArea;
    const spanX = Math.max(0, wa.width - w);
    const spanY = Math.max(0, wa.height - h);
    let x: number;
    let y: number;
    switch (this.edge) {
      case 'top':
        x = wa.x + this.offset * spanX;
        y = wa.y;
        break;
      case 'left':
        x = wa.x;
        y = wa.y + this.offset * spanY;
        break;
      case 'right':
        x = wa.x + spanX;
        y = wa.y + this.offset * spanY;
        break;
      case 'free': {
        const fp = this.engine.data.patrol.freePosition ?? { x: wa.x + spanX - 40, y: wa.y + spanY - 40 };
        const area = screen.getDisplayNearestPoint(fp).workArea;
        x = clamp(fp.x, area.x, area.x + Math.max(0, area.width - w));
        y = clamp(fp.y, area.y, area.y + Math.max(0, area.height - h));
        break;
      }
      default:
        x = wa.x + this.offset * spanX;
        y = wa.y + spanY;
    }
    return { x: Math.round(x), y: Math.round(y), width: w, height: h };
  }

  private place(): void {
    const b = this.computeBounds();
    this.pos = { x: b.x, y: b.y };
    this.fpos = { x: b.x, y: b.y };
    this.placed = true;
    const win = this.win;
    if (win && !win.isDestroyed()) win.setBounds(b);
  }

  private setPos(x: number, y: number, keepFloat = false): void {
    if (!keepFloat) this.fpos = { x, y };
    this.pos = { x: Math.round(x), y: Math.round(y) };
    const win = this.win;
    if (win && !win.isDestroyed()) win.setBounds({ x: this.pos.x, y: this.pos.y, width: this.size.w, height: this.size.h });
  }

  private canWander(now: number): boolean {
    const d = this.engine.data;
    if (!this.shown || !d.patrol.wander || this.drag || this.moving || this.prompt) return false;
    if (now < this.restUntil || this.reducedMotion()) return false;
    if (this.engine.runtime.enforcement) return false;
    if (d.timer.status === 'running' && d.timer.phase === 'focus') return false;
    if (activeCharacter(d).progress.energy < 25) return false;
    if (this.temp && this.temp.until > now) return false;
    return true;
  }

  private wander(): void {
    const { w, h } = this.size;
    const wa = this.display().workArea;
    if (this.edge === 'free') {
      const tx = rand(wa.x, wa.x + Math.max(0, wa.width - w));
      const ty = rand(wa.y, wa.y + Math.max(0, wa.height - h));
      this.startMove({ x: tx, y: ty });
      return;
    }
    const horizontal = this.edge === 'bottom' || this.edge === 'top';
    const span = Math.max(1, horizontal ? wa.width - w : wa.height - h);
    let next = Math.random();
    for (let i = 0; i < 6 && Math.abs(next - this.offset) * span < 140; i++) next = Math.random();
    const target = horizontal ? { x: wa.x + next * span, y: this.pos.y } : { x: this.pos.x, y: wa.y + next * span };
    this.startMove(target);
  }

  private startMove(target: { x: number; y: number }): void {
    this.moveTarget = target;
    this.fpos = { ...this.pos };
    this.moving = true;
    this.lastStepAt = Date.now();
    if (target.x !== this.pos.x) this.facing = target.x < this.pos.x ? 'left' : 'right';
    if (this.moveTimer) clearInterval(this.moveTimer);
    this.moveTimer = setInterval(() => this.step(), 33);
    this.push();
  }

  private stopMove(): void {
    if (this.moveTimer) clearInterval(this.moveTimer);
    this.moveTimer = null;
    this.moveTarget = null;
    if (this.moving) {
      this.moving = false;
      this.push();
    }
  }

  private step(): void {
    const t = this.moveTarget;
    if (!t || !this.win || this.win.isDestroyed()) {
      this.stopMove();
      return;
    }
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastStepAt) / 1000);
    this.lastStepAt = now;
    const s = this.engine.data.settings;
    const speed = SPEEDS[s.moveSpeed] * s.animationSpeed * Math.sqrt(s.companionSize);
    const dx = t.x - this.fpos.x;
    const dy = t.y - this.fpos.y;
    const dist = Math.hypot(dx, dy);
    const stepPx = speed * dt;
    if (dist <= stepPx + 0.5) {
      this.setPos(t.x, t.y);
      this.arrive();
      return;
    }
    this.fpos = { x: this.fpos.x + (dx / dist) * stepPx, y: this.fpos.y + (dy / dist) * stepPx };
    const rx = Math.round(this.fpos.x);
    const ry = Math.round(this.fpos.y);
    if (rx !== this.pos.x || ry !== this.pos.y) this.setPos(this.fpos.x, this.fpos.y, true);
  }

  private arrive(): void {
    this.stopMove();
    const wa = this.display().workArea;
    if (this.edge === 'bottom' || this.edge === 'top') this.offset = clamp((this.pos.x - wa.x) / Math.max(1, wa.width - this.size.w), 0, 1);
    else if (this.edge === 'left' || this.edge === 'right') this.offset = clamp((this.pos.y - wa.y) / Math.max(1, wa.height - this.size.h), 0, 1);
    this.positionDirty = true;
    const speed = this.engine.data.settings.animationSpeed;
    this.restUntil = Date.now() + rand(7000, 22000) / speed;
    const { def } = activeCharacter(this.engine.data);
    const poses: CompanionPose[] = def.kind === 'hero' ? ['stand', 'idle', 'think', 'stand'] : ['idle', 'sit', 'idle', 'think'];
    if (def.locomotion === 'hover' || def.locomotion === 'fly') poses.push('hover');
    this.idlePose = poses[Math.floor(Math.random() * poses.length)];
    this.push();
  }

  /** Saves the current spot so the companion comes back there after a restart. */
  persist(force = false): void {
    const now = Date.now();
    if (!this.positionDirty || (!force && now - this.lastPersist < 10 * 60_000)) return;
    this.positionDirty = false;
    this.lastPersist = now;
    const action: Action =
      this.edge === 'free'
        ? { type: '@patrol/position', edge: 'free', x: this.pos.x, y: this.pos.y }
        : { type: '@patrol/position', edge: this.edge, offset: this.offset };
    this.engine.dispatch(action);
  }

  // ---------------------------------------------------------------------------
  // heartbeat: expiry, speech timing, wandering

  private beat(): void {
    const now = Date.now();
    if (this.temp && this.temp.until <= now) this.temp = null;
    if (this.speech && this.speech.until <= now) this.speech = null;
    if (this.prompt && this.prompt.until <= now) {
      this.prompt = null;
      this.handlers.answerSnooze(false);
    }
    const d = this.engine.data;
    const t = d.timer;
    if (t.status === 'running' && t.phase === 'focus' && t.endsAt && t.startedAt) {
      const left = t.endsAt - now;
      const half = `${t.startedAt}:half`;
      const end = `${t.startedAt}:end`;
      if (left <= t.durationMs / 2 && t.durationMs >= 20 * 60_000 && !this.timerMarks.has(half)) {
        this.timerMarks.add(half);
        if (d.settings.speech === 'chatty') this.sayTopic('focusHalf', 'low');
      }
      if (left <= 2 * 60_000 && t.durationMs >= 10 * 60_000 && !this.timerMarks.has(end)) {
        this.timerMarks.add(end);
        this.sayTopic('focusEnding', 'normal');
      }
      if (this.timerMarks.size > 40) this.timerMarks.clear();
    }
    if (now >= this.nextChatterAt) {
      const freq = d.settings.speech;
      this.nextChatterAt = now + (freq === 'chatty' ? rand(8, 15) : rand(30, 50)) * 60_000;
      const busy = this.engine.runtime.enforcement || (t.status === 'running' && t.phase === 'focus');
      if (freq !== 'quiet' && !busy) {
        const sleepy = activeCharacter(d).progress.energy < 25;
        this.sayTopic(sleepy ? 'sleepy' : 'idle', 'low');
      }
    }
    if (this.canWander(now)) this.wander();
    this.persist();
    this.push();
  }

  // ---------------------------------------------------------------------------
  // speech & reactions

  private userName(): string {
    const n = this.engine.data.settings.userName.trim() || this.engine.runtime.osUserName;
    return n.split(/\s+/)[0] ?? '';
  }

  line(topic: SpeechTopic, vars: Record<string, string | number> = {}): string {
    const { def, progress } = activeCharacter(this.engine.data);
    return pickLine(def.voice, topic, { name: progress.name, user: this.userName(), ...vars });
  }

  say(text: string, priority: SpeechPriority, userInitiated = false): void {
    const s = this.engine.data.settings;
    if (!text || !s.speechBubbles || !this.shown) return;
    const now = Date.now();
    if (!userInitiated) {
      if (s.speech === 'quiet' && priority !== 'high') return;
      if (priority !== 'high' && now - this.lastSpeechAt < GAP_BETWEEN_LINES) return;
    }
    const duration = clamp(2600 + text.length * 55, 3500, 8000);
    this.speech = { id: ++this.seq, text, until: now + duration };
    this.lastSpeechAt = now;
    this.push();
  }

  sayTopic(topic: SpeechTopic, priority: SpeechPriority, vars: Record<string, string | number> = {}): void {
    this.say(this.line(topic, vars), priority);
  }

  react(pose: CompanionPose, ms: number): void {
    this.temp = { pose, until: Date.now() + ms };
    this.push();
  }

  onPatrol(r: PatrolReaction): void {
    switch (r.kind) {
      case 'countdown':
        if (r.reason === 'focus') this.sayTopic('focusGuard', 'high');
        else this.sayTopic('countdown', 'high', { site: siteLabel(r.pattern) });
        break;
      case 'complain':
        this.react('angry', 2500);
        if (r.note) this.say(r.note, 'high');
        else if (r.reason === 'focus') this.sayTopic('focusGuard', 'high');
        else this.sayTopic(r.again ? 'complainAgain' : 'complain', 'high', { site: siteLabel(r.pattern), n: r.limitMinutes });
        break;
      case 'closed':
        this.prompt = null;
        this.react('happy', 2000);
        this.sayTopic('closed', 'high');
        break;
      case 'left':
        this.prompt = null;
        this.react('happy', 1800);
        this.sayTopic('left', 'normal');
        break;
      case 'cleared':
        this.prompt = null;
        this.push();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // pointer input from the companion window

  pointer(evt: CompanionPointer): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    switch (evt.type) {
      case 'hover':
        if (!this.drag) win.setIgnoreMouseEvents(!evt.over, { forward: true });
        break;
      case 'down':
        if (evt.button !== 0) return;
        this.stopMove();
        this.drag = { offX: evt.screenX - this.pos.x, offY: evt.screenY - this.pos.y, startX: evt.screenX, startY: evt.screenY, moved: false };
        break;
      case 'move': {
        const dr = this.drag;
        if (!dr) return;
        if (!dr.moved && Math.hypot(evt.screenX - dr.startX, evt.screenY - dr.startY) > 5) {
          dr.moved = true;
          this.speech = null;
        }
        if (dr.moved) {
          const bounds = screen.getDisplayNearestPoint({ x: Math.round(evt.screenX), y: Math.round(evt.screenY) }).bounds;
          const x = clamp(evt.screenX - dr.offX, bounds.x - this.size.w / 3, bounds.x + bounds.width - (this.size.w * 2) / 3);
          const y = clamp(evt.screenY - dr.offY, bounds.y - this.size.h / 3, bounds.y + bounds.height - this.size.h / 2);
          this.setPos(x, y);
          this.push();
        }
        break;
      }
      case 'up': {
        const dr = this.drag;
        this.drag = null;
        if (!dr) return;
        if (dr.moved) this.drop();
        else this.click();
        break;
      }
      case 'context':
        this.menu();
        break;
      case 'prompt':
        this.answer(evt.answer === 'snooze');
        break;
    }
  }

  private drop(): void {
    const { w, h } = this.size;
    const wa = screen.getDisplayNearestPoint({ x: Math.round(this.pos.x + w / 2), y: Math.round(this.pos.y + h / 2) }).workArea;
    const x = clamp(this.pos.x, wa.x, wa.x + Math.max(0, wa.width - w));
    const y = clamp(this.pos.y, wa.y, wa.y + Math.max(0, wa.height - h));
    const dist = {
      bottom: wa.y + wa.height - (y + h),
      top: y - wa.y,
      left: x - wa.x,
      right: wa.x + wa.width - (x + w),
    };
    const nearest = (Object.keys(dist) as (keyof typeof dist)[]).reduce((a, b) => (dist[b] < dist[a] ? b : a), 'bottom');
    let action: Action;
    if (dist[nearest] <= SNAP_DISTANCE) {
      this.edge = nearest;
      this.offset =
        nearest === 'bottom' || nearest === 'top'
          ? clamp((x - wa.x) / Math.max(1, wa.width - w), 0, 1)
          : clamp((y - wa.y) / Math.max(1, wa.height - h), 0, 1);
      action = { type: '@patrol/position', edge: nearest, offset: this.offset };
    } else {
      this.edge = 'free';
      action = { type: '@patrol/position', edge: 'free', x, y };
    }
    this.positionDirty = false;
    this.lastPersist = Date.now();
    this.engine.dispatch(action);
    this.place();
    this.restUntil = Date.now() + 10_000;
    this.react('happy', 1200);
  }

  private click(): void {
    if (this.handlers.holdForSnooze()) {
      this.prompt = { id: ++this.seq, minutes: this.engine.data.patrol.snoozeMinutes, until: Date.now() + 30_000 };
      this.speech = null;
      this.push();
      return;
    }
    this.pet();
  }

  pet(): void {
    const res = this.engine.dispatch({ type: 'companion/pet' });
    if (!res.ok) log.warn('pet failed', res.error);
    const { progress } = activeCharacter(this.engine.data);
    this.restUntil = Math.max(this.restUntil, Date.now() + 5000);
    if (progress.energy < 25) {
      this.react('sleep', 2500);
      this.say(this.line('sleepy'), 'normal', true);
      return;
    }
    const poses: CompanionPose[] = ['happy', 'wave', 'jump', 'celebrate'];
    this.react(poses[Math.floor(Math.random() * poses.length)], 1800);
    this.say(this.line('poke'), 'normal', true);
  }

  private answer(snooze: boolean): void {
    this.prompt = null;
    this.handlers.answerSnooze(snooze);
    if (snooze) {
      const until = this.engine.data.patrol.snoozedUntil;
      this.react('happy', 1500);
      if (until) this.say(this.line('snoozed', { time: formatClock(until) }), 'high', true);
    }
    this.push();
  }

  private menu(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const d = this.engine.data;
    const now = Date.now();
    const snoozedUntil = d.patrol.snoozedUntil && d.patrol.snoozedUntil > now ? d.patrol.snoozedUntil : null;
    const template: MenuItemConstructorOptions[] = [
      { label: 'Focus', click: () => this.handlers.openMain('focus') },
      { label: 'Change Companion', click: () => this.handlers.openMain('companion') },
      snoozedUntil
        ? { label: `Snoozed until ${formatClock(snoozedUntil)} · Resume`, click: () => this.engine.dispatch({ type: 'patrol/unsnooze' }) }
        : {
            label: `Snooze (${d.patrol.snoozeMinutes} min)`,
            enabled: d.patrol.enabled,
            click: () => {
              if (this.engine.runtime.enforcement) this.answer(true);
              else this.engine.dispatch({ type: 'patrol/snooze' });
            },
          },
      { label: 'Pet / Interact', click: () => this.pet() },
      { type: 'separator' },
      { label: 'Open Dashboard', click: () => this.handlers.openMain('home') },
      { label: 'Settings', click: () => this.handlers.openMain('settings') },
      { label: 'Hide Companion', click: () => this.engine.dispatch({ type: 'settings/update', patch: { companionVisible: false } }) },
      { type: 'separator' },
      { label: 'Quit', click: () => this.handlers.quit() },
    ];
    Menu.buildFromTemplate(template).popup({ window: win });
  }

  /** For reactions that need the companion's personality. */
  characterName(): string {
    return activeCharacter(this.engine.data).progress.name;
  }

  characterTitle(id: string): string {
    return getCharacter(id).title;
  }
}
