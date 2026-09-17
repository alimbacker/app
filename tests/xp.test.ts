import { describe, expect, it } from 'vitest';
import { levelFromXp, levelProgress, powerLevel, rankFor, sessionBaseXp, stageFor, stageName, totalXpFor } from '../src/shared/utilities/xp';

describe('session XP', () => {
  it('matches the anchors from the brief', () => {
    expect(sessionBaseXp(15)).toBe(10);
    expect(sessionBaseXp(25)).toBe(25);
    expect(sessionBaseXp(45)).toBe(45);
    expect(sessionBaseXp(60)).toBe(70);
    expect(sessionBaseXp(90)).toBe(110);
  });
  it('keeps growing after 90 minutes, but more slowly', () => {
    expect(sessionBaseXp(120)).toBeGreaterThan(110);
    expect(sessionBaseXp(180) - sessionBaseXp(90)).toBeLessThan(sessionBaseXp(90));
  });
  it('gives nothing for very short sessions', () => {
    expect(sessionBaseXp(4)).toBe(0);
  });
});

describe('levels', () => {
  it('round-trips level thresholds', () => {
    for (const lvl of [1, 2, 5, 10, 20, 50, 99]) {
      expect(levelFromXp(totalXpFor(lvl))).toBe(lvl);
      if (lvl > 1) expect(levelFromXp(totalXpFor(lvl) - 1)).toBe(lvl - 1);
    }
  });
  it('reports progress within a level', () => {
    const p = levelProgress(totalXpFor(3) + 10);
    expect(p.level).toBe(3);
    expect(p.into).toBe(10);
    expect(p.pct).toBeGreaterThan(0);
  });
  it('names ranks and evolution stages from the brief', () => {
    expect(rankFor(1)).toBe('Rookie');
    expect(rankFor(12)).toBe('Focused');
    expect(rankFor(80)).toBe('Mythic');
    expect(stageName(stageFor(1))).toBe('Rookie');
    expect(stageName(stageFor(5))).toBe('Experienced');
    expect(stageName(stageFor(10))).toBe('Advanced');
    expect(stageName(stageFor(20))).toBe('Elite');
    expect(stageName(stageFor(50))).toBe('Legendary');
    expect(powerLevel(4)).toBe(1);
    expect(powerLevel(50)).toBe(5);
  });
});
