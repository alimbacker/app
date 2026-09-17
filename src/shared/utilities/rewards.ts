// Session reward calculation including companion powers and boosters.
import { LIMITS } from '../constants/brand';
import { getCharacter } from '../constants/characters';
import { POWERS, POWER_VALUES } from '../constants/powers';
import type { WorkCategory } from '../types';
import { powerLevel, sessionBaseCoins, sessionBaseXp } from './xp';

export interface RewardInput {
  minutes: number;
  startedAt: number;
  endedAt: number;
  companionId: string;
  companionLevel: number;
  happiness: number;
  category: WorkCategory;
  streakDays: number;
  boostActive: boolean;
  usedAmbient: boolean;
  tasksDuring: number;
  firstOfDay: boolean;
  rng: () => number;
}

export interface RewardResult {
  xp: number;
  coins: number;
  notes: string[];
  /** Terra's power: this session charges a streak freeze */
  chargesFreeze: boolean;
}

const pctText = (n: number) => `${Math.round(n)}%`;

export function computeSessionReward(input: RewardInput): RewardResult {
  const def = getCharacter(input.companionId);
  const p = powerLevel(input.companionLevel);
  const power = POWERS[def.power];
  const baseXp = sessionBaseXp(input.minutes);
  let coins = sessionBaseCoins(input.minutes);
  const notes: string[] = [];
  let bonusPct = 0;
  let flatXp = 0;
  let chargesFreeze = false;
  let double = false;

  if (baseXp === 0) return { xp: 0, coins: 0, notes, chargesFreeze };

  const streakPct = Math.min(10, Math.max(0, input.streakDays));
  if (streakPct > 0) {
    bonusPct += streakPct;
    notes.push(`Streak bonus +${streakPct}% XP`);
  }
  if (input.boostActive) {
    bonusPct += 50;
    notes.push('XP booster +50% XP');
  }

  const add = (pct: number) => {
    bonusPct += pct;
    notes.push(`${power.name} +${pctText(pct)} XP`);
  };

  switch (def.power) {
    case 'goodMood':
      if (input.happiness >= 70) add(POWER_VALUES.goodMood(p));
      break;
    case 'speedBoost':
      if (input.minutes <= 25) add(POWER_VALUES.speedBoost(p));
      break;
    case 'motivationBoost':
      if (input.firstOfDay && input.streakDays > 0) {
        const bonus = Math.min(POWER_VALUES.motivationBoost(p), input.streakDays * 2);
        coins += bonus;
        notes.push(`${power.name} +${bonus} coins`);
      }
      break;
    case 'calmFocus':
      if (input.usedAmbient) add(POWER_VALUES.calmFocus(p));
      break;
    case 'productivityBoost':
      add(POWER_VALUES.productivityBoost(p));
      break;
    case 'streakProtection':
      chargesFreeze = true;
      break;
    case 'xpBoost':
      add(POWER_VALUES.xpBoost(p));
      break;
    case 'codingBoost':
      if (input.category === 'coding') add(POWER_VALUES.codingBoost(p));
      if (input.tasksDuring > 0) {
        flatXp += 5 * input.tasksDuring;
        notes.push(`${power.name} +${5 * input.tasksDuring} XP for tasks`);
      }
      break;
    case 'longSessionBonus':
      if (input.minutes >= 90) add(POWER_VALUES.longSessionBonus(p) * 2);
      else if (input.minutes >= 45) add(POWER_VALUES.longSessionBonus(p));
      break;
    case 'allbeeBoost':
      add(POWER_VALUES.allbeeBoost(p));
      coins += 1 + p;
      notes.push(`${power.name} +${1 + p} coins`);
      break;
    case 'superXp':
      if (input.rng() * 100 < POWER_VALUES.superXp(p)) {
        double = true;
        notes.push(`${power.name}: double XP!`);
      }
      break;
    default:
      // distractionShield, timeFreeze and focusProtection work outside finished sessions
      break;
  }

  let xp = Math.round(baseXp * (1 + bonusPct / 100)) + flatXp;
  if (double) xp *= 2;
  return { xp, coins, notes, chargesFreeze };
}

export interface EarlyInput {
  minutesDone: number;
  plannedMinutes: number;
  companionId: string;
  companionLevel: number;
}

export interface EarlyResult {
  /** Counts as a full session (Frost's Time Freeze) */
  countsAsFull: boolean;
  xp: number;
  coins: number;
  notes: string[];
}

/** Rewards for a focus session finished before its time. */
export function earlyFinishReward(input: EarlyInput): EarlyResult {
  const def = getCharacter(input.companionId);
  const p = powerLevel(input.companionLevel);
  const notes: string[] = [];
  const left = input.plannedMinutes - input.minutesDone;
  if (def.power === 'timeFreeze' && left <= POWER_VALUES.timeFreeze(p) && input.minutesDone >= LIMITS.minRewardMinutes) {
    notes.push(`${POWERS.timeFreeze.name}: counted as a full session`);
    return { countsAsFull: true, xp: 0, coins: 0, notes };
  }
  if (input.minutesDone < LIMITS.minRewardMinutes) return { countsAsFull: false, xp: 0, coins: 0, notes };
  let keep = 50;
  let coins = 0;
  if (def.power === 'focusProtection') {
    keep = POWER_VALUES.focusProtection(p);
    notes.push(`${POWERS.focusProtection.name} kept ${keep}% of the XP`);
    if (input.minutesDone * 2 >= input.plannedMinutes) coins = 5;
  } else {
    notes.push('Finished early: half XP');
  }
  return { countsAsFull: false, xp: Math.round((sessionBaseXp(input.minutesDone) * keep) / 100), coins, notes };
}

/** Energy gained from a finished focus session. */
export function sessionEnergyGain(minutes: number): number {
  return Math.min(12, 3 + Math.round(minutes / 10));
}

/** Happiness gained from a finished focus session. */
export function sessionHappinessGain(minutes: number, tasksDuring: number): number {
  return Math.min(14, 5 + Math.round(minutes / 15) + tasksDuring * 2);
}

/** Energy restored by a finished break. Long breaks restore the most. */
export function breakEnergy(minutes: number, long: boolean, companionId: string): number {
  const base = long ? Math.min(45, 15 + minutes * 2) : Math.min(15, 4 + minutes);
  return getCharacter(companionId).power === 'calmFocus' ? Math.round(base * 1.5) : base;
}
