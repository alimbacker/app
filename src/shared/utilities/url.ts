// URL normalisation and site-rule matching.
// Rules are "host[/path]" patterns. Hosts match themselves and their subdomains;
// paths match on segment boundaries ("/shorts" matches "/shorts/abc" but not "/shortsy").

import type { SiteRule } from '../types';

export interface HostPath {
  host: string;
  path: string;
}

const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;
const LOCAL_RE = /^(localhost|\d{1,3}(?:\.\d{1,3}){3})$/;

/** Strips noise prefixes that don't change which site you are on. */
export function canonicalHost(host: string): string {
  let h = host.trim().toLowerCase().replace(/\.$/, '');
  h = h.replace(/:\d+$/, '');
  for (;;) {
    const next = h.replace(/^(www\d?|m|mobile)\./, '');
    if (next === h || !next.includes('.')) break;
    h = next;
  }
  return h;
}

function cleanPath(path: string): string {
  let p = path.split(/[?#]/)[0] ?? '';
  try {
    p = decodeURI(p);
  } catch {
    /* keep raw */
  }
  p = p.toLowerCase().replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  if (p && !p.startsWith('/')) p = `/${p}`;
  return p;
}

/**
 * Parses what a browser address bar shows ("youtube.com/shorts/x", "https://www.reddit.com/r/a?b").
 * Returns null for search text, internal pages and anything that isn't a web address.
 */
export function parseAddress(raw: string): HostPath | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s || /\s/.test(s) || s.length > 2048) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s);
  if (scheme) {
    const proto = scheme[1].toLowerCase();
    if (proto !== 'http' && proto !== 'https') return null;
    s = s.slice(scheme[0].length);
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/]+:\d+/.test(s)) {
    // about:, chrome:, edge:, file:, view-source: ...
    return null;
  }
  s = s.replace(/^[^@/]*@/, ''); // credentials
  const slash = s.search(/[/?#]/);
  const hostPart = slash === -1 ? s : s.slice(0, slash);
  const rest = slash === -1 ? '' : s.slice(slash);
  const host = canonicalHost(hostPart);
  if (!HOST_RE.test(host) && !LOCAL_RE.test(host)) return null;
  return { host, path: cleanPath(rest) };
}

/** Normalises user input into a rule pattern, or null if it isn't a valid site. */
export function normalizePattern(input: string): string | null {
  const parsed = parseAddress(input.trim().replace(/^\*\./, ''));
  if (!parsed) return null;
  if (LOCAL_RE.test(parsed.host)) return null;
  return parsed.path ? `${parsed.host}${parsed.path}` : parsed.host;
}

export function splitPattern(pattern: string): HostPath {
  const i = pattern.indexOf('/');
  return i === -1 ? { host: pattern, path: '' } : { host: pattern.slice(0, i), path: pattern.slice(i) };
}

export function hostMatches(host: string, ruleHost: string): boolean {
  return host === ruleHost || host.endsWith(`.${ruleHost}`);
}

export function pathMatches(path: string, rulePath: string): boolean {
  if (!rulePath) return true;
  return path === rulePath || path.startsWith(`${rulePath}/`);
}

export function patternMatches(pattern: string, target: HostPath): boolean {
  const rule = splitPattern(pattern);
  return hostMatches(target.host, rule.host) && pathMatches(target.path, rule.path);
}

/** The most specific enabled rule matching the address, if any. */
export function matchRule(target: HostPath | null, rules: SiteRule[]): SiteRule | null {
  if (!target) return null;
  let best: SiteRule | null = null;
  for (const r of rules) {
    if (!r.enabled || !patternMatches(r.pattern, target)) continue;
    if (!best || r.pattern.length > best.pattern.length) best = r;
  }
  return best;
}

/** Suggestions shown in the add-site dialog. */
export const SITE_SUGGESTIONS = [
  'youtube.com/shorts',
  'instagram.com/reel',
  'reddit.com',
  'tiktok.com',
  'x.com',
  'facebook.com',
  'twitch.tv',
  'netflix.com',
  'news.ycombinator.com',
];

const BRANDS: Record<string, string> = {
  youtube: 'YouTube',
  youtu: 'YouTube',
  instagram: 'Instagram',
  reddit: 'Reddit',
  tiktok: 'TikTok',
  x: 'X',
  twitter: 'Twitter',
  facebook: 'Facebook',
  twitch: 'Twitch',
  netflix: 'Netflix',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
  discord: 'Discord',
  tumblr: 'Tumblr',
  primevideo: 'Prime Video',
  disneyplus: 'Disney+',
  hulu: 'Hulu',
  ycombinator: 'Hacker News',
  '9gag': '9GAG',
  imgur: 'Imgur',
  quora: 'Quora',
  threads: 'Threads',
  bsky: 'Bluesky',
  spotify: 'Spotify',
};

const PATH_WORDS: Record<string, string> = { shorts: 'Shorts', reel: 'Reels', reels: 'Reels', explore: 'Explore', watch: 'Watch', live: 'Live' };

/** Friendly name for a rule pattern: "youtube.com/shorts" -> "YouTube Shorts". */
export function siteLabel(pattern: string): string {
  const { host, path } = splitPattern(pattern);
  const labels = host.split('.');
  const main = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  const sub = labels.length >= 3 ? labels[labels.length - 3] : '';
  let name = BRANDS[main] ?? (main ? main.charAt(0).toUpperCase() + main.slice(1) : host);
  if (main === 'ycombinator' && sub !== 'news') name = 'Y Combinator';
  const parts = path.split('/').filter(Boolean);
  if (parts.length) {
    if (parts[0] === 'r' && parts[1]) return `${name} r/${parts[1]}`;
    const word = PATH_WORDS[parts[0]];
    return word ? `${name} ${word}` : pattern;
  }
  return name;
}
