// Commands ask the main process to do something outside the reducer (dialogs, windows,
// the monitor). They arrive from a renderer window, so they are checked here the same way
// public actions are before anything acts on them.
import type { CompanionPointer } from '../constants/ipc';
import type { AppCommand } from '../types';
import { checkField, type Shape } from './actions';

const SHAPES: Record<AppCommand['type'], Shape> = {
  'window/minimize': {},
  'window/close': {},
  'app/quit': {},
  'app/openWebsite': {},
  'companion/show': { show: 'boolean' },
  'focusMode/set': { on: 'boolean' },
  'data/export': {},
  'data/import': {},
  'data/reset': {},
  'data/openFolder': {},
  'save/retry': {},
  'notifications/test': {},
  'monitor/restart': {},
  'patrol/snoozeChoice': { snooze: 'boolean' },
  'history/get': { limit: 'number' },
  'dev/simulate': { url: 'nullable-string' },
};

/** Returns the command if it is well formed, otherwise null. */
export function validateCommand(raw: unknown): AppCommand | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.type !== 'string' || !Object.prototype.hasOwnProperty.call(SHAPES, c.type)) return null;
  const shape = SHAPES[c.type as AppCommand['type']];
  for (const key of Object.keys(c)) {
    // See validateAction: `in` would accept inherited keys like __proto__.
    if (key !== 'type' && !Object.prototype.hasOwnProperty.call(shape, key)) return null;
  }
  for (const [key, kind] of Object.entries(shape)) {
    if (!checkField(c[key], kind)) return null;
  }
  return c as unknown as AppCommand;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Pointer events from the companion window carry screen coordinates that are used to
 * move a window, so they are checked like any other input.
 */
export function validatePointer(raw: unknown): CompanionPointer | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  switch (p.type) {
    case 'hover':
      return typeof p.over === 'boolean' ? { type: 'hover', over: p.over } : null;
    case 'down':
      return isNum(p.screenX) && isNum(p.screenY) && isNum(p.button) ? { type: 'down', screenX: p.screenX, screenY: p.screenY, button: p.button } : null;
    case 'move':
      return isNum(p.screenX) && isNum(p.screenY) ? { type: 'move', screenX: p.screenX, screenY: p.screenY } : null;
    case 'up':
      return isNum(p.screenX) && isNum(p.screenY) && typeof p.moved === 'boolean' ? { type: 'up', screenX: p.screenX, screenY: p.screenY, moved: p.moved } : null;
    case 'context':
      return { type: 'context' };
    case 'prompt':
      return p.answer === 'snooze' || p.answer === 'cancel' ? { type: 'prompt', answer: p.answer } : null;
    default:
      return null;
  }
}
