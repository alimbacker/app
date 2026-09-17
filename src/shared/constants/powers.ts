import type { PowerId } from './characters';

export interface PowerDef {
  id: PowerId;
  name: string;
  /** Short symbol shown next to the name (text only, never used as artwork). */
  symbol: string;
  /** Description at a given power level (1..5). */
  describe: (level: number) => string;
}

const pct = (n: number) => `${Math.round(n)}%`;

/** Numeric strength of each power at power level p (1..5). Used by the reward rules. */
export const POWER_VALUES = {
  goodMood: (p: number) => 2 + p, // % XP while happiness >= 70
  speedBoost: (p: number) => 10 + 2.5 * (p - 1), // % XP on sessions <= 25 min
  motivationBoost: (p: number) => 10 + 5 * (p - 1), // max bonus coins on the first session of the day
  calmFocus: (p: number) => 8 + 2 * p, // % XP with an ambient sound
  productivityBoost: (p: number) => 4 + 2 * p, // % XP on every session
  streakProtection: (p: number) => 8 - p, // sessions needed to craft a streak freeze
  distractionShield: (p: number) => 2 + p, // coins each time Patrol turns you away
  xpBoost: (p: number) => 10 + 2.5 * p, // % XP on every session
  timeFreeze: (p: number) => 2 + p, // minutes before the end that still count as a full session
  focusProtection: (p: number) => 50 + 10 * p, // % of XP kept when finishing early
  superXp: (p: number) => 10 + 2.5 * p, // % chance of double XP
  codingBoost: (p: number) => 15 + 3 * p, // % XP on coding sessions
  longSessionBonus: (p: number) => 10 + 3 * p, // % XP on 45+ minute sessions (double at 90+)
  allbeeBoost: (p: number) => 10 + 3 * p, // % XP on every session, plus coins
} satisfies Record<PowerId, (p: number) => number>;

export const POWERS: Record<PowerId, PowerDef> = {
  goodMood: {
    id: 'goodMood',
    name: 'Good Mood',
    symbol: '♥',
    describe: (p) => `While happiness is 70% or more, finished sessions earn +${pct(POWER_VALUES.goodMood(p))} XP.`,
  },
  speedBoost: {
    id: 'speedBoost',
    name: 'Speed Boost',
    symbol: '⚡',
    describe: (p) => `Sessions of 25 minutes or less earn +${pct(POWER_VALUES.speedBoost(p))} XP.`,
  },
  motivationBoost: {
    id: 'motivationBoost',
    name: 'Motivation Boost',
    symbol: '🔥',
    describe: (p) => `Your first session each day earns +2 coins per streak day (up to +${POWER_VALUES.motivationBoost(p)}).`,
  },
  calmFocus: {
    id: 'calmFocus',
    name: 'Calm Focus',
    symbol: '🌊',
    describe: (p) => `+${pct(POWER_VALUES.calmFocus(p))} XP when a focus sound played during the session. Breaks restore 50% more energy.`,
  },
  productivityBoost: {
    id: 'productivityBoost',
    name: 'Productivity Boost',
    symbol: '🌪',
    describe: (p) => `Every finished session earns +${pct(POWER_VALUES.productivityBoost(p))} XP.`,
  },
  streakProtection: {
    id: 'streakProtection',
    name: 'Streak Protection',
    symbol: '🌱',
    describe: (p) => `Every ${POWER_VALUES.streakProtection(p)} finished sessions craft a streak freeze (hold up to 3).`,
  },
  distractionShield: {
    id: 'distractionShield',
    name: 'Distraction Shield',
    symbol: '🌑',
    describe: (p) => `+${POWER_VALUES.distractionShield(p)} coins each time Patrol turns you away from a limited site (up to 25 a day). Getting caught never lowers happiness.`,
  },
  xpBoost: {
    id: 'xpBoost',
    name: 'XP Boost',
    symbol: '☀',
    describe: (p) => `Every finished session earns +${pct(POWER_VALUES.xpBoost(p))} XP.`,
  },
  timeFreeze: {
    id: 'timeFreeze',
    name: 'Time Freeze',
    symbol: '❄',
    describe: (p) => `Finishing early within the last ${POWER_VALUES.timeFreeze(p)} minutes still counts as a full session.`,
  },
  focusProtection: {
    id: 'focusProtection',
    name: 'Focus Protection',
    symbol: '🛡',
    describe: (p) => `Finishing a session early keeps ${pct(POWER_VALUES.focusProtection(p))} of its XP instead of half.`,
  },
  superXp: {
    id: 'superXp',
    name: 'Super XP',
    symbol: '✦',
    describe: (p) => `Each finished session has a ${pct(POWER_VALUES.superXp(p))} chance to earn double XP.`,
  },
  codingBoost: {
    id: 'codingBoost',
    name: 'Coding Boost',
    symbol: '</>',
    describe: (p) => `Coding sessions earn +${pct(POWER_VALUES.codingBoost(p))} XP, and every task finished during a session adds +5 XP.`,
  },
  longSessionBonus: {
    id: 'longSessionBonus',
    name: 'Long Session Bonus',
    symbol: '🚀',
    describe: (p) => `Sessions of 45 minutes or more earn +${pct(POWER_VALUES.longSessionBonus(p))} XP, doubled for 90 minutes or more.`,
  },
  allbeeBoost: {
    id: 'allbeeBoost',
    name: 'AllBee Boost',
    symbol: '⬢',
    describe: (p) => `Every finished session earns +${pct(POWER_VALUES.allbeeBoost(p))} XP and +${1 + p} coins.`,
  },
};
