import type { CompanionKind, Rarity } from '../types';

export type PowerId =
  | 'goodMood'
  | 'speedBoost'
  | 'motivationBoost'
  | 'calmFocus'
  | 'productivityBoost'
  | 'streakProtection'
  | 'distractionShield'
  | 'xpBoost'
  | 'timeFreeze'
  | 'focusProtection'
  | 'superXp'
  | 'codingBoost'
  | 'longSessionBonus'
  | 'allbeeBoost';

export type Voice = 'cheerful' | 'gentle' | 'wise' | 'bold';

export interface Unlock {
  /** Player level needed before the companion can be unlocked (1 = from the start). */
  level: number;
  /** AllBee Coins to unlock once the level is reached (0 = free). */
  price: number;
  /** Achievement that must be earned first, if any. */
  achievement?: string;
  /** Available from the very first launch. */
  starter?: boolean;
}

export interface CharacterDef {
  id: string;
  kind: CompanionKind;
  /** Species (pets) or hero name */
  title: string;
  defaultName: string;
  rarity: Rarity;
  /** Personality traits from the design brief */
  traits: string[];
  blurb: string;
  unlock: Unlock;
  power: PowerId;
  voice: Voice;
  /** Accent colour used for card glows and badges */
  accent: string;
  /** How the companion travels along the screen */
  locomotion: 'walk' | 'hop' | 'waddle' | 'hover' | 'fly';
}

type Extra = Pick<CharacterDef, 'voice' | 'accent' | 'locomotion'>;

const pet = (
  id: string,
  title: string,
  defaultName: string,
  rarity: Rarity,
  traits: string[],
  blurb: string,
  unlock: Unlock,
  extra: Partial<Extra> & Pick<Extra, 'voice' | 'accent'>,
): CharacterDef => ({
  id,
  kind: 'pet',
  title,
  defaultName,
  rarity,
  traits,
  blurb,
  unlock,
  power: 'goodMood',
  locomotion: 'walk',
  ...extra,
});

const hero = (
  id: string,
  title: string,
  rarity: Rarity,
  traits: string[],
  blurb: string,
  unlock: Unlock,
  power: PowerId,
  extra: Partial<Extra> & Pick<Extra, 'voice' | 'accent'>,
): CharacterDef => ({
  id,
  kind: 'hero',
  title,
  defaultName: title,
  rarity,
  traits,
  blurb,
  unlock,
  power,
  locomotion: 'walk',
  ...extra,
});

const START: Unlock = { level: 1, price: 0, starter: true };

export const PETS: CharacterDef[] = [
  pet('bee', 'AllBee Bee', 'Allie', 'common', ['Friendly', 'Productive', 'Helpful'], 'The original AllBee buddy. Hums along while you work and keeps the hive tidy.', START, { voice: 'cheerful', accent: '#2BC5B4', locomotion: 'hover' }),
  pet('cat', 'Cat', 'Mochi', 'common', ['Calm', 'Sleepy', 'Friendly'], 'Naps when you rest and keeps one sleepy eye on your tabs.', START, { voice: 'gentle', accent: '#F0A868' }),
  pet('dog', 'Dog', 'Biscuit', 'common', ['Energetic', 'Encouraging', 'Loyal'], 'Cheers the loudest for every session you finish.', START, { voice: 'cheerful', accent: '#D9A066' }),
  pet('hamster', 'Hamster', 'Peanut', 'common', ['Tiny', 'Tireless', 'Upbeat'], 'Believes every small step on the wheel counts.', { level: 2, price: 120 }, { voice: 'cheerful', accent: '#F2C18D' }),
  pet('rabbit', 'Rabbit', 'Clover', 'common', ['Fast', 'Cheerful', 'Playful'], 'Hops ahead to keep your momentum going.', { level: 3, price: 150 }, { voice: 'cheerful', accent: '#E9D5DC', locomotion: 'hop' }),
  pet('frog', 'Frog', 'Lily', 'common', ['Patient', 'Chill', 'Steady'], 'Waits calmly on the lily pad for the right moment to leap.', { level: 4, price: 180 }, { voice: 'wise', accent: '#7CCB6B', locomotion: 'hop' }),
  pet('fox', 'Fox', 'Juniper', 'uncommon', ['Smart', 'Curious', 'Clever'], 'Spots a distraction from a mile away.', { level: 5, price: 300 }, { voice: 'wise', accent: '#F08A4B' }),
  pet('penguin', 'Penguin', 'Pebble', 'uncommon', ['Steady', 'Polite', 'Cool-headed'], 'Keeps cool under deadline pressure.', { level: 6, price: 320 }, { voice: 'wise', accent: '#8FB8F0', locomotion: 'waddle' }),
  pet('monkey', 'Monkey', 'Coco', 'uncommon', ['Lively', 'Funny', 'Quick'], 'Swings into action the moment a session starts.', { level: 7, price: 350 }, { voice: 'cheerful', accent: '#C08A5B' }),
  pet('owl', 'Owl', 'Sage', 'rare', ['Study-focused', 'Wise'], 'Loves quiet rooms, open books and late study sessions.', { level: 8, price: 500 }, { voice: 'wise', accent: '#B39B7A', locomotion: 'hop' }),
  pet('panda', 'Panda', 'Bao', 'rare', ['Relaxed', 'Calm'], 'Takes breaks seriously so work can stay focused.', { level: 10, price: 550 }, { voice: 'gentle', accent: '#A7B3C2' }),
  pet('koala', 'Koala', 'Kodi', 'rare', ['Easygoing', 'Steady', 'Cuddly'], 'Slow and steady finishes the task list.', { level: 11, price: 550 }, { voice: 'gentle', accent: '#9AA7B5' }),
  pet('deer', 'Deer', 'Fern', 'rare', ['Gentle', 'Graceful', 'Mindful'], 'Moves softly and keeps your mind calm.', { level: 12, price: 600 }, { voice: 'gentle', accent: '#C9925E' }),
  pet('redpanda', 'Red Panda', 'Maple', 'epic', ['Shy', 'Determined', 'Cozy'], 'Rarely seen, always on task.', { level: 15, price: 900 }, { voice: 'gentle', accent: '#E0673A' }),
  pet('lion', 'Lion', 'Rory', 'epic', ['Confident', 'Motivational'], 'Roars with pride for long, deep sessions.', { level: 16, price: 950 }, { voice: 'bold', accent: '#E8B04A' }),
  pet('tiger', 'Tiger', 'Tora', 'epic', ['Strong', 'Determined'], 'Stalks your goals with total concentration.', { level: 18, price: 1000 }, { voice: 'bold', accent: '#F28C38' }),
  pet('dragon', 'Dragon', 'Cinder', 'epic', ['Rare', 'Powerful'], 'Guards the hoard of hours you have earned.', { level: 25, price: 1500, achievement: 'streak_7' }, { voice: 'bold', accent: '#4FC3A1' }),
  pet('unicorn', 'Unicorn', 'Luma', 'legendary', ['Dreamy', 'Kind', 'Magical'], 'Turns steady effort into something a little magical.', { level: 30, price: 2000, achievement: 'hours_50' }, { voice: 'gentle', accent: '#C8A6F2', locomotion: 'hop' }),
];

export const HEROES: CharacterDef[] = [
  hero('volt', 'Volt', 'common', ['Fast', 'Energetic', 'Motivating'], 'Crackles with energy and charges up short, sharp sessions.', START, 'speedBoost', { voice: 'bold', accent: '#F5D547', locomotion: 'hover' }),
  hero('aqua', 'Aqua', 'common', ['Calm', 'Focused'], 'Flows steadily through the work and makes breaks truly restful.', START, 'calmFocus', { voice: 'gentle', accent: '#3FB7E8' }),
  hero('terra', 'Terra', 'common', ['Disciplined', 'Patient'], 'Grows roots one session at a time and protects your streak.', { level: 3, price: 200 }, 'streakProtection', { voice: 'wise', accent: '#77B255' }),
  hero('aero', 'Aero', 'uncommon', ['Playful', 'Fast'], 'Rides the wind and gives every session a tailwind.', { level: 5, price: 350 }, 'productivityBoost', { voice: 'cheerful', accent: '#9BD7E0', locomotion: 'fly' }),
  hero('blaze', 'Blaze', 'uncommon', ['Bold', 'Passionate'], 'Feeds on your streak and turns it into motivation.', { level: 6, price: 350 }, 'motivationBoost', { voice: 'bold', accent: '#F26B3A' }),
  hero('byte', 'Byte', 'uncommon', ['Smart', 'Technology-focused', 'Coding-focused'], 'Compiles your coding sessions into bonus XP.', { level: 7, price: 400 }, 'codingBoost', { voice: 'wise', accent: '#5BE3A7' }),
  hero('frost', 'Frost', 'rare', ['Calm', 'Precise'], 'Can freeze the clock just long enough to wrap up.', { level: 9, price: 600 }, 'timeFreeze', { voice: 'gentle', accent: '#9ED8F5' }),
  hero('orbit', 'Orbit', 'rare', ['Curious', 'Adventurous'], 'Loves long voyages and rewards deep, long sessions.', { level: 10, price: 600 }, 'longSessionBonus', { voice: 'wise', accent: '#8C8CF0', locomotion: 'fly' }),
  hero('shadow', 'Shadow', 'epic', ['Quiet', 'Mysterious'], 'Slips between distractions and shields you from them.', { level: 14, price: 900 }, 'distractionShield', { voice: 'wise', accent: '#8A7BD1' }),
  hero('guardian', 'Guardian', 'epic', ['Reliable', 'Protective'], 'Protects your progress even when a session ends early.', { level: 15, price: 950 }, 'focusProtection', { voice: 'bold', accent: '#6FA8DC' }),
  hero('solara', 'Solara', 'legendary', ['Positive', 'Encouraging'], 'Shines a warm light on every session you finish.', { level: 22, price: 1600 }, 'xpBoost', { voice: 'cheerful', accent: '#FFB547', locomotion: 'hover' }),
  hero('nova', 'Nova', 'legendary', ['Ambitious', 'Powerful'], 'Sometimes bursts into a supernova of double XP.', { level: 28, price: 2000, achievement: 'deep_focus' }, 'superXp', { voice: 'bold', accent: '#F28FD0', locomotion: 'fly' }),
  hero('allbeehero', 'AllBee Hero', 'mythic', ['Friendly', 'Intelligent', 'Motivational'], 'The hive’s own hero. Adds an AllBee Boost to every finished session.', { level: 35, price: 3000, achievement: 'sessions_100' }, 'allbeeBoost', { voice: 'cheerful', accent: '#2BC5B4', locomotion: 'hover' }),
];

export const CHARACTERS: CharacterDef[] = [...PETS, ...HEROES];
export const CHARACTER_BY_ID: Record<string, CharacterDef> = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
export const STARTER_IDS = CHARACTERS.filter((c) => c.unlock.starter).map((c) => c.id);
export const DEFAULT_COMPANION = 'bee';

export function getCharacter(id: string): CharacterDef {
  return CHARACTER_BY_ID[id] ?? CHARACTER_BY_ID[DEFAULT_COMPANION];
}

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  mythic: 'Mythic',
};

/** Evolution happens at these companion levels. */
export const EVOLUTION_LEVELS = [1, 5, 10, 20, 50] as const;
export const STAGE_NAMES = ['Rookie', 'Experienced', 'Advanced', 'Elite', 'Legendary'] as const;
