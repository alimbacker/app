import { describe, expect, it } from 'vitest';
import { matchRule, normalizePattern, parseAddress } from '../src/shared/utilities/url';
import type { SiteRule } from '../src/shared/types';

const rule = (id: string, pattern: string, enabled = true): SiteRule => ({ id, pattern, limitMinutes: 5, enabled, createdAt: 0 });

describe('normalizePattern', () => {
  it('accepts the documented URL shapes', () => {
    expect(normalizePattern('youtube.com')).toBe('youtube.com');
    expect(normalizePattern('www.youtube.com')).toBe('youtube.com');
    expect(normalizePattern('youtube.com/shorts')).toBe('youtube.com/shorts');
    expect(normalizePattern('https://www.instagram.com/reel/')).toBe('instagram.com/reel');
    expect(normalizePattern('  X.com ')).toBe('x.com');
    expect(normalizePattern('tiktok.com')).toBe('tiktok.com');
    expect(normalizePattern('m.facebook.com')).toBe('facebook.com');
  });
  it('rejects things that are not websites', () => {
    expect(normalizePattern('')).toBeNull();
    expect(normalizePattern('funny cat videos')).toBeNull();
    expect(normalizePattern('chrome://settings')).toBeNull();
    expect(normalizePattern('localhost')).toBeNull();
    expect(normalizePattern('youtube')).toBeNull();
  });
});

describe('parseAddress', () => {
  it('handles Chrome-style elided addresses', () => {
    expect(parseAddress('youtube.com/shorts/abc123')).toEqual({ host: 'youtube.com', path: '/shorts/abc123' });
    expect(parseAddress('https://www.reddit.com/r/all?sort=top#x')).toEqual({ host: 'reddit.com', path: '/r/all' });
  });
  it('ignores search text and internal pages', () => {
    expect(parseAddress('how to focus better')).toBeNull();
    expect(parseAddress('about:blank')).toBeNull();
    expect(parseAddress('edge://newtab')).toBeNull();
    expect(parseAddress('file:///C:/x.html')).toBeNull();
  });
});

describe('matchRule', () => {
  const rules = [rule('a', 'youtube.com'), rule('b', 'youtube.com/shorts'), rule('c', 'reddit.com', false)];
  it('prefers the most specific rule', () => {
    expect(matchRule(parseAddress('youtube.com/shorts/xyz'), rules)?.id).toBe('b');
    expect(matchRule(parseAddress('youtube.com/watch?v=1'), rules)?.id).toBe('a');
  });
  it('matches subdomains but not look-alikes', () => {
    expect(matchRule(parseAddress('music.youtube.com'), rules)?.id).toBe('a');
    expect(matchRule(parseAddress('notyoutube.com'), rules)).toBeNull();
    expect(matchRule(parseAddress('youtube.com/shortsy'), rules)?.id).toBe('a');
  });
  it('skips disabled rules', () => {
    expect(matchRule(parseAddress('reddit.com/r/all'), rules)).toBeNull();
  });
});
