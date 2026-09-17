// Holds the authoritative app state in the main process. Every change goes through the
// shared reducer, is persisted, and is broadcast to the windows.
import { EventEmitter } from 'node:events';
import type { DispatchResult } from '@shared/constants/ipc';
import type { AppData, AppEvent, RuntimeState, Snapshot, ViewData } from '@shared/types';
import type { Action } from '@shared/utilities/actions';
import { reduce } from '@shared/utilities/reducer';
import type { DataStore } from '../storage/data-store';
import { log } from '../system/logger';

type EngineEvents = {
  data: [data: AppData, action: Action | null];
  runtime: [runtime: RuntimeState];
  events: [events: AppEvent[], action: Action];
};

export class Engine {
  data: AppData;
  runtime: RuntimeState;
  private readonly emitter = new EventEmitter();

  constructor(
    private readonly store: DataStore,
    data: AppData,
    runtime: RuntimeState,
  ) {
    this.data = data;
    this.runtime = runtime;
    this.emitter.setMaxListeners(50);
    store.onStatus((state, error) => {
      this.setRuntime({ save: { state, at: Date.now(), error } });
    });
  }

  on<K extends keyof EngineEvents>(event: K, cb: (...args: EngineEvents[K]) => void): void {
    this.emitter.on(event, cb as (...args: unknown[]) => void);
  }

  dispatch(action: Action): DispatchResult {
    let res;
    try {
      res = reduce(this.data, action, {
        now: Date.now(),
        rng: Math.random,
        monitorOk: this.runtime.monitor.state === 'running',
      });
    } catch (err) {
      log.error('reducer failed for', action.type, err);
      return { ok: false, error: 'Something went wrong. Please try again.' };
    }
    if (res.error) return { ok: false, error: res.error };
    if (!res.changed) return { ok: true };
    this.data = res.data;
    this.store.schedule(this.data);
    this.emitter.emit('data', this.data, action);
    if (res.events.length) this.emitter.emit('events', res.events, action);
    return { ok: true };
  }

  /** Swaps in a whole new data set (import / reset). */
  replaceData(data: AppData): boolean {
    this.data = data;
    const ok = this.store.replace(data);
    this.emitter.emit('data', this.data, null);
    return ok;
  }

  retrySave(): boolean {
    return this.store.replace(this.data);
  }

  setRuntime(patch: Partial<RuntimeState>): void {
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if ((this.runtime as unknown as Record<string, unknown>)[k] !== v) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.runtime = { ...this.runtime, ...patch };
    this.emitter.emit('runtime', this.runtime);
  }

  viewData(): ViewData {
    const { history, ...rest } = this.data;
    return { ...rest, historyCount: history.length };
  }

  snapshot(): Snapshot {
    return { data: this.viewData(), runtime: this.runtime };
  }

  flush(): boolean {
    return this.store.flush();
  }
}
