import { describe, expect, it } from 'vitest';
import { createDefaultData } from '../src/shared/utilities/defaults';
import { sanitizeData, looksLikeAppData } from '../src/shared/utilities/sanitize';
import { validateAction } from '../src/shared/utilities/actions';
import { T0 } from './helpers';

describe('sanitizeData', () => {
  it('returns defaults for garbage', () => {
    for (const junk of [null, 42, 'x', [], { schema: 'no' }]) {
      const d = sanitizeData(junk, T0);
      expect(d.companions.bee).toBeTruthy();
      expect(d.settings.theme).toBe('dark');
    }
  });

  it('round-trips valid data unchanged', () => {
    const d = createDefaultData(T0);
    expect(sanitizeData(JSON.parse(JSON.stringify(d)), T0)).toEqual(d);
  });

  it('repairs damaged fields but keeps valid progress', () => {
    const d = JSON.parse(JSON.stringify(createDefaultData(T0)));
    d.companions.bee.xp = 1234;
    d.companions.ghost = { xp: 5 };
    d.activeCompanionId = 'ghost';
    d.settings.companionSize = 99;
    d.settings.theme = 'neon';
    d.patrol.countdownSeconds = -4;
    d.rules.push({ id: 'x', pattern: 'NOT A SITE', limitMinutes: 3 });
    d.tasks = [{ id: 't1', title: 'Write', priority: 'urgent', dueDate: 'tomorrow' }, { title: 'no id' }];
    d.inventory.owned = { hat_party: 1, fake_item: 3, food_berries: 500 };
    d.inventory.petDecor = { bed: 'bed_pod', lights: 'lights_fairy' };
    d.timer = { status: 'running', phase: 'focus' };
    const s = sanitizeData(d, T0);
    expect(s.companions.bee.xp).toBe(1234);
    expect(s.companions.ghost).toBeUndefined();
    expect(s.activeCompanionId).toBe('bee');
    expect(s.settings.companionSize).toBe(2);
    expect(s.settings.theme).toBe('dark');
    expect(s.patrol.countdownSeconds).toBe(0);
    expect(s.rules.map((r) => r.pattern)).toEqual(['youtube.com/shorts', 'instagram.com/reel', 'reddit.com']);
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0]).toMatchObject({ priority: 'medium', dueDate: null });
    expect(s.inventory.owned).toMatchObject({ hat_party: 1, food_berries: 99 });
    expect(s.inventory.owned.fake_item).toBeUndefined();
    expect(s.inventory.petDecor).toEqual({});
    expect(s.timer.status).toBe('idle');
    expect(looksLikeAppData(d)).toBe(true);
    expect(looksLikeAppData({ hello: 1 })).toBe(false);
  });
});

describe('validateAction', () => {
  it('accepts well-formed actions and rejects everything else', () => {
    expect(validateAction({ type: 'timer/start', minutes: 25 })).toBeTruthy();
    expect(validateAction({ type: 'timer/start', minutes: '25' })).toBeNull();
    expect(validateAction({ type: '@timer/complete' })).toBeNull();
    expect(validateAction({ type: 'rules/add', pattern: 'x.com', limitMinutes: 5, extra: 1 })).toBeNull();
    expect(validateAction({ type: 'constructor' })).toBeNull();
    expect(validateAction(null)).toBeNull();
    expect(validateAction({ type: 'item/equip', slot: 'head', itemId: null })).toBeTruthy();
  });
});
