import { describe, expect, it } from 'vitest';
import { computeSessionReward, earlyFinishReward, type RewardInput } from '../src/shared/utilities/rewards';
import { T0 } from './helpers';

const base: RewardInput = {
  minutes: 25,
  startedAt: T0,
  endedAt: T0 + 25 * 60_000,
  companionId: 'cat',
  companionLevel: 1,
  happiness: 50,
  category: 'other',
  streakDays: 0,
  boostActive: false,
  usedAmbient: false,
  tasksDuring: 0,
  firstOfDay: false,
  rng: () => 0.99,
};

describe('computeSessionReward', () => {
  it('pays the base XP and 10 coins', () => {
    expect(computeSessionReward(base)).toMatchObject({ xp: 25, coins: 10 });
  });
  it('adds streak and booster bonuses', () => {
    expect(computeSessionReward({ ...base, streakDays: 4, boostActive: true }).xp).toBe(Math.round(25 * 1.54));
  });
  it('applies hero powers', () => {
    expect(computeSessionReward({ ...base, companionId: 'volt' }).xp).toBe(Math.round(25 * 1.1));
    expect(computeSessionReward({ ...base, companionId: 'byte', category: 'coding', tasksDuring: 2 }).xp).toBe(Math.round(25 * 1.18) + 10);
    expect(computeSessionReward({ ...base, companionId: 'orbit', minutes: 90 }).xp).toBe(Math.round(110 * 1.26));
    expect(computeSessionReward({ ...base, companionId: 'allbeehero' }).coins).toBe(12);
    expect(computeSessionReward({ ...base, companionId: 'terra' }).chargesFreeze).toBe(true);
    expect(computeSessionReward({ ...base, companionId: 'blaze', firstOfDay: true, streakDays: 3 }).coins).toBe(16);
  });
  it('super XP doubles on a lucky roll', () => {
    expect(computeSessionReward({ ...base, companionId: 'nova', rng: () => 0 }).xp).toBe(50);
    expect(computeSessionReward({ ...base, companionId: 'nova', rng: () => 0.99 }).xp).toBe(25);
  });
  it('pets get the good-mood bonus only when happy', () => {
    expect(computeSessionReward({ ...base, happiness: 90 }).xp).toBe(Math.round(25 * 1.03));
    expect(computeSessionReward({ ...base, happiness: 60 }).xp).toBe(25);
  });
});

describe('earlyFinishReward', () => {
  it('pays half XP by default and nothing under 5 minutes', () => {
    expect(earlyFinishReward({ minutesDone: 20, plannedMinutes: 45, companionId: 'cat', companionLevel: 1 })).toMatchObject({ xp: 9, coins: 0, countsAsFull: false });
    expect(earlyFinishReward({ minutesDone: 3, plannedMinutes: 25, companionId: 'cat', companionLevel: 1 }).xp).toBe(0);
  });
  it('Guardian keeps more XP', () => {
    expect(earlyFinishReward({ minutesDone: 20, plannedMinutes: 25, companionId: 'guardian', companionLevel: 1 })).toMatchObject({ xp: 11, coins: 5 });
  });
  it('Frost counts a nearly finished session as full', () => {
    expect(earlyFinishReward({ minutesDone: 23, plannedMinutes: 25, companionId: 'frost', companionLevel: 1 }).countsAsFull).toBe(true);
    expect(earlyFinishReward({ minutesDone: 15, plannedMinutes: 25, companionId: 'frost', companionLevel: 1 }).countsAsFull).toBe(false);
  });
});
