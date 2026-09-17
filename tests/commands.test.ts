import { describe, expect, it } from 'vitest';
import { validateAction } from '../src/shared/utilities/actions';
import { validateCommand, validatePointer } from '../src/shared/utilities/commands';

describe('validateCommand', () => {
  it('accepts every command that takes no fields', () => {
    const bare = [
      'window/minimize',
      'window/close',
      'app/quit',
      'app/openWebsite',
      'data/export',
      'data/import',
      'data/reset',
      'data/openFolder',
      'save/retry',
      'notifications/test',
      'monitor/restart',
    ];
    for (const type of bare) expect(validateCommand({ type }), type).toEqual({ type });
  });

  it('accepts commands with well-formed fields', () => {
    expect(validateCommand({ type: 'companion/show', show: false })).toEqual({ type: 'companion/show', show: false });
    expect(validateCommand({ type: 'focusMode/set', on: true })).toEqual({ type: 'focusMode/set', on: true });
    expect(validateCommand({ type: 'patrol/snoozeChoice', snooze: true })).toEqual({ type: 'patrol/snoozeChoice', snooze: true });
    expect(validateCommand({ type: 'history/get', limit: 25 })).toEqual({ type: 'history/get', limit: 25 });
    expect(validateCommand({ type: 'dev/simulate', url: 'https://youtube.com' })).toBeTruthy();
    expect(validateCommand({ type: 'dev/simulate', url: null })).toBeTruthy();
  });

  it('refuses anything that is not a plain object', () => {
    for (const raw of [null, undefined, 7, 'app/quit', [], [{ type: 'app/quit' }], true]) {
      expect(validateCommand(raw)).toBeNull();
    }
  });

  it('refuses unknown command names', () => {
    expect(validateCommand({ type: 'app/formatDisk' })).toBeNull();
    expect(validateCommand({ type: '' })).toBeNull();
    expect(validateCommand({})).toBeNull();
    // Inherited keys must not count as a command name.
    expect(validateCommand({ type: 'toString' })).toBeNull();
  });

  it('refuses fields of the wrong type', () => {
    expect(validateCommand({ type: 'companion/show', show: 'yes' })).toBeNull();
    expect(validateCommand({ type: 'history/get', limit: '25' })).toBeNull();
    expect(validateCommand({ type: 'history/get', limit: Number.NaN })).toBeNull();
    expect(validateCommand({ type: 'history/get', limit: Number.POSITIVE_INFINITY })).toBeNull();
    expect(validateCommand({ type: 'dev/simulate', url: 42 })).toBeNull();
  });

  it('refuses missing required fields', () => {
    expect(validateCommand({ type: 'history/get' })).toBeNull();
    expect(validateCommand({ type: 'focusMode/set' })).toBeNull();
    expect(validateCommand({ type: 'dev/simulate' })).toBeNull();
  });

  it('refuses extra fields, including a smuggled prototype', () => {
    expect(validateCommand({ type: 'app/quit', force: true })).toBeNull();
    expect(validateCommand({ type: 'history/get', limit: 5, andAlso: 'this' })).toBeNull();
    // An own "__proto__" key, which only JSON.parse produces.
    expect(validateCommand(JSON.parse('{"type":"app/quit","__proto__":{"polluted":true}}'))).toBeNull();
  });

  it('keeps a very long url out', () => {
    expect(validateCommand({ type: 'dev/simulate', url: 'h'.repeat(5000) })).toBeNull();
  });
});

describe('validatePointer', () => {
  it('accepts the events the companion window sends', () => {
    expect(validatePointer({ type: 'hover', over: true })).toEqual({ type: 'hover', over: true });
    expect(validatePointer({ type: 'down', screenX: 10, screenY: 20, button: 0 })).toEqual({ type: 'down', screenX: 10, screenY: 20, button: 0 });
    expect(validatePointer({ type: 'move', screenX: -5, screenY: 0 })).toEqual({ type: 'move', screenX: -5, screenY: 0 });
    expect(validatePointer({ type: 'up', screenX: 1, screenY: 2, moved: true })).toEqual({ type: 'up', screenX: 1, screenY: 2, moved: true });
    expect(validatePointer({ type: 'context' })).toEqual({ type: 'context' });
    expect(validatePointer({ type: 'prompt', answer: 'snooze' })).toEqual({ type: 'prompt', answer: 'snooze' });
    expect(validatePointer({ type: 'prompt', answer: 'cancel' })).toEqual({ type: 'prompt', answer: 'cancel' });
  });

  it('drops the extra fields rather than passing them on', () => {
    expect(validatePointer({ type: 'context', evil: 1 })).toEqual({ type: 'context' });
    expect(validatePointer({ type: 'hover', over: false, evil: 1 })).toEqual({ type: 'hover', over: false });
  });

  it('refuses coordinates that are not real numbers', () => {
    expect(validatePointer({ type: 'move', screenX: Number.NaN, screenY: 0 })).toBeNull();
    expect(validatePointer({ type: 'move', screenX: Number.POSITIVE_INFINITY, screenY: 0 })).toBeNull();
    expect(validatePointer({ type: 'move', screenX: '10', screenY: 20 })).toBeNull();
    expect(validatePointer({ type: 'down', screenX: 1, screenY: 2 })).toBeNull();
    expect(validatePointer({ type: 'up', screenX: 1, screenY: 2 })).toBeNull();
  });

  it('refuses unknown or malformed events', () => {
    expect(validatePointer({ type: 'wheel', screenX: 1, screenY: 2 })).toBeNull();
    expect(validatePointer({ type: 'prompt', answer: 'quit' })).toBeNull();
    expect(validatePointer({ type: 'hover', over: 'yes' })).toBeNull();
    for (const raw of [null, undefined, 'context', 5, [], [{ type: 'context' }]]) expect(validatePointer(raw)).toBeNull();
  });
});

describe('validateAction', () => {
  it('accepts a well-formed action', () => {
    expect(validateAction({ type: 'timer/pause' })).toEqual({ type: 'timer/pause' });
    expect(validateAction({ type: 'rules/add', pattern: 'youtube.com', limitMinutes: 15 })).toBeTruthy();
  });

  it('refuses internal actions arriving from a window', () => {
    // Only the main process may commit usage or resolve a patrol hit.
    expect(validateAction({ type: '@usage/commit', ruleId: 'r1', ms: 1000 })).toBeNull();
    expect(validateAction({ type: '@timer/complete' })).toBeNull();
    expect(validateAction({ type: '@patrol/position', edge: 'free', x: 0, y: 0 })).toBeNull();
  });

  it('refuses extra fields, including inherited ones', () => {
    expect(validateAction({ type: 'timer/pause', sneaky: 1 })).toBeNull();
    expect(validateAction(JSON.parse('{"type":"timer/pause","__proto__":{"polluted":true}}'))).toBeNull();
    expect(validateAction(JSON.parse('{"type":"timer/pause","constructor":{"polluted":true}}'))).toBeNull();
    expect(validateAction(JSON.parse('{"type":"timer/pause","toString":"nope"}'))).toBeNull();
  });
});
