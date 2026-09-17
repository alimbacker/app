import type { AccessorySlot, CompanionKind, DecorSlot, Rarity } from '../types';

export type ItemCategory = 'food' | 'toy' | 'boost' | 'accessory' | 'decor' | 'theme';

export interface ItemEffect {
  energy?: number;
  happiness?: number;
  boostSessions?: number;
  streakFreeze?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: Rarity;
  price: number;
  description: string;
  /** Accessory slot */
  slot?: AccessorySlot;
  /** Decoration slot */
  decorSlot?: DecorSlot;
  /** Which space a decoration or theme belongs to. 'both' fits the pet room and the hero base. */
  space?: CompanionKind | 'both';
  /** Consumable effect */
  effect?: ItemEffect;
  /** Owned from the start */
  starter?: boolean;
  /** Can't be bought; only earned from the 7th daily reward */
  earnedOnly?: boolean;
}

export const DECOR_SLOTS: { id: DecorSlot; label: string }[] = [
  { id: 'bed', label: 'Bed' },
  { id: 'bowl', label: 'Food bowl' },
  { id: 'desk', label: 'Desk' },
  { id: 'plant', label: 'Plants' },
  { id: 'books', label: 'Books' },
  { id: 'toys', label: 'Toys' },
  { id: 'lights', label: 'Lights' },
  { id: 'rug', label: 'Rug' },
  { id: 'poster', label: 'Poster' },
];

export const ACCESSORY_SLOT_LABEL: Record<AccessorySlot, string> = {
  head: 'Head',
  face: 'Face',
  neck: 'Neck',
  back: 'Back',
};

const consumable = (
  id: string,
  name: string,
  category: 'food' | 'toy' | 'boost',
  rarity: Rarity,
  price: number,
  description: string,
  effect: ItemEffect,
): ItemDef => ({ id, name, category, rarity, price, description, effect });

const acc = (id: string, name: string, slot: AccessorySlot, rarity: Rarity, price: number, description: string): ItemDef => ({
  id,
  name,
  category: 'accessory',
  slot,
  rarity,
  price,
  description,
});

const decor = (
  id: string,
  name: string,
  decorSlot: DecorSlot,
  space: CompanionKind | 'both',
  rarity: Rarity,
  price: number,
  description: string,
  extra: Partial<ItemDef> = {},
): ItemDef => ({ id, name, category: 'decor', decorSlot, space, rarity, price, description, ...extra });

const theme = (id: string, name: string, space: CompanionKind, rarity: Rarity, price: number, description: string, starter = false): ItemDef => ({
  id,
  name,
  category: 'theme',
  space,
  rarity,
  price,
  description,
  starter,
});

export const ITEMS: ItemDef[] = [
  // Food
  consumable('food_berries', 'Berry bowl', 'food', 'common', 20, 'A handful of fresh berries. Restores 15 energy.', { energy: 15 }),
  consumable('food_toast', 'Honey toast', 'food', 'common', 35, 'Warm and golden. Restores 25 energy and adds 5 happiness.', { energy: 25, happiness: 5 }),
  consumable('food_smoothie', 'Power smoothie', 'food', 'uncommon', 45, 'Restores 20 energy and adds 10 happiness.', { energy: 20, happiness: 10 }),
  consumable('food_bento', 'Focus bento', 'food', 'uncommon', 60, 'A full meal for a long day. Restores 40 energy.', { energy: 40 }),
  // Toys
  consumable('toy_ball', 'Bouncy ball', 'toy', 'common', 25, 'A quick game of catch. Adds 15 happiness.', { happiness: 15 }),
  consumable('toy_yarn', 'Yarn ball', 'toy', 'common', 35, 'Endless tangles of fun. Adds 20 happiness.', { happiness: 20 }),
  consumable('toy_puzzle', 'Puzzle cube', 'toy', 'uncommon', 50, 'A brain teaser for break time. Adds 25 happiness.', { happiness: 25 }),
  consumable('toy_drone', 'Mini drone', 'toy', 'rare', 80, 'Zooms around the room. Adds 30 happiness and 5 energy.', { happiness: 30, energy: 5 }),
  // Boosts
  consumable('boost_xp', 'XP booster', 'boost', 'rare', 200, 'Your next 3 finished sessions earn +50% XP.', { boostSessions: 3 }),
  consumable('boost_freeze', 'Streak freeze', 'boost', 'uncommon', 150, 'Keeps your streak alive through one missed day. Hold up to 3.', { streakFreeze: 1 }),

  // Accessories
  acc('hat_party', 'Party hat', 'head', 'common', 60, 'For celebrating finished sessions.'),
  acc('hat_beanie', 'Knit beanie', 'head', 'common', 80, 'Cozy focus weather.'),
  acc('hat_flowers', 'Flower crown', 'head', 'uncommon', 150, 'Fresh blooms for a fresh start.'),
  acc('hat_grad', 'Study cap', 'head', 'rare', 280, 'For the ones who finish the reading list.'),
  acc('hat_crown', 'Honey crown', 'head', 'epic', 700, 'Royalty of the hive.'),
  acc('hat_halo', 'Glow halo', 'head', 'legendary', 1500, 'A quiet shine for legendary focus.'),
  acc('face_round', 'Round glasses', 'face', 'common', 70, 'For reading the fine print.'),
  acc('face_shades', 'Sunglasses', 'face', 'uncommon', 140, 'Too cool for distractions.'),
  acc('face_visor', 'Neon visor', 'face', 'epic', 520, 'Filters out everything but the task.'),
  acc('neck_scarf', 'Teal scarf', 'neck', 'common', 60, 'Soft, warm and on-brand.'),
  acc('neck_bowtie', 'Bow tie', 'neck', 'common', 70, 'Dressed for productivity.'),
  acc('neck_bandana', 'Bandana', 'neck', 'uncommon', 120, 'Ready for an adventure in focus.'),
  acc('neck_medal', 'Honey medal', 'neck', 'rare', 280, 'Awarded for steady effort.'),
  acc('back_pack', 'Mini backpack', 'back', 'uncommon', 160, 'Carries snacks for long sessions.'),
  acc('back_wings', 'Honey wings', 'back', 'rare', 420, 'Little wings, big ambitions.'),
  acc('back_cape', 'Starry cape', 'back', 'epic', 650, 'Flutters when a session ends.'),

  // Decorations: pet room
  decor('bed_cushion', 'Cloud cushion', 'bed', 'pet', 'common', 80, 'A soft round cushion for naps.', { starter: true }),
  decor('bed_honey', 'Honeycomb bed', 'bed', 'pet', 'rare', 240, 'A hexagon bed with a honey-yellow blanket.'),
  decor('bowl_ceramic', 'Ceramic bowl', 'bowl', 'pet', 'common', 40, 'Simple, sturdy, always full.', { starter: true }),
  decor('bowl_honeypot', 'Honey pot', 'bowl', 'pet', 'uncommon', 90, 'A pot with a little dipper.'),
  decor('desk_tiny', 'Tiny desk', 'desk', 'pet', 'common', 120, 'Just big enough for a notebook.'),
  decor('desk_nook', 'Study nook', 'desk', 'pet', 'rare', 300, 'A desk with a lamp and a pencil cup.'),
  decor('plant_fern', 'Potted fern', 'plant', 'pet', 'common', 50, 'Green, leafy and easy to keep alive.'),
  decor('plant_flowers', 'Flower planter', 'plant', 'pet', 'uncommon', 100, 'Three blooms in a wooden box.'),
  decor('books_stack', 'Book stack', 'books', 'pet', 'common', 60, 'A wobbly tower of favourites.'),
  decor('books_shelf', 'Bookshelf', 'books', 'pet', 'uncommon', 140, 'Two shelves of stories.'),
  decor('toys_basket', 'Toy basket', 'toys', 'pet', 'common', 70, 'Balls, yarn and a squeaky carrot.'),
  decor('toys_tower', 'Play tower', 'toys', 'pet', 'uncommon', 160, 'Platforms for climbing and lounging.'),
  decor('lights_fairy', 'Fairy lights', 'lights', 'pet', 'common', 70, 'A string of warm little bulbs.'),
  decor('lights_moon', 'Moon lamp', 'lights', 'pet', 'rare', 220, 'A glowing moon for late sessions.'),
  decor('rug_round', 'Round rug', 'rug', 'pet', 'common', 60, 'Soft under paws.'),
  decor('rug_hex', 'Hex rug', 'rug', 'pet', 'uncommon', 120, 'A honeycomb pattern in teal and cream.'),
  decor('poster_sunny', 'Sunny poster', 'poster', 'pet', 'common', 40, 'Hills, a sun and good vibes.'),
  decor('poster_map', 'Map poster', 'poster', 'pet', 'uncommon', 90, 'A map of places to explore someday.'),
  // Decorations: hero base
  decor('bed_pod', 'Recharge pod', 'bed', 'hero', 'uncommon', 150, 'A capsule that restores heroic energy.'),
  decor('bed_hover', 'Hover cot', 'bed', 'hero', 'rare', 260, 'Floats a few centimetres off the floor.'),
  decor('bowl_station', 'Energy station', 'bowl', 'hero', 'uncommon', 120, 'Dispenses snacks and power cells.'),
  decor('bowl_fuel', 'Fuel dispenser', 'bowl', 'hero', 'rare', 200, 'High-octane smoothies on tap.'),
  decor('desk_console', 'Command console', 'desk', 'hero', 'uncommon', 180, 'Screens for mission planning.'),
  decor('desk_holo', 'Holo desk', 'desk', 'hero', 'epic', 450, 'Projects your task list in mid-air.'),
  decor('plant_bio', 'Bio pod', 'plant', 'hero', 'uncommon', 110, 'A glass pod with glowing sprouts.'),
  decor('plant_crystal', 'Crystal plant', 'plant', 'hero', 'rare', 220, 'Grows faceted leaves.'),
  decor('books_data', 'Data shelf', 'books', 'hero', 'uncommon', 140, 'Blinking drives full of field notes.'),
  decor('books_archive', 'Archive tower', 'books', 'hero', 'rare', 240, 'Every mission report, neatly filed.'),
  decor('toys_dummy', 'Training dummy', 'toys', 'hero', 'uncommon', 150, 'Takes a hit, never complains.'),
  decor('toys_target', 'Target board', 'toys', 'hero', 'rare', 230, 'For practising precision.'),
  decor('lights_neon', 'Neon strip', 'lights', 'hero', 'uncommon', 130, 'A teal glow along the ceiling.'),
  decor('lights_plasma', 'Plasma lamp', 'lights', 'hero', 'epic', 400, 'Crackling light in a glass globe.'),
  decor('rug_tile', 'Hex floor tile', 'rug', 'hero', 'common', 60, 'A training mat with a hex grid.', { starter: true }),
  decor('rug_pad', 'Launch pad', 'rug', 'hero', 'rare', 260, 'Ready for take-off.'),
  decor('poster_board', 'Mission board', 'poster', 'hero', 'uncommon', 110, 'Pins, notes and a big red goal.'),
  decor('poster_stars', 'Star chart', 'poster', 'hero', 'rare', 200, 'Constellations you plan to visit.'),
  // Exclusive daily-reward decorations
  decor('lights_hive', 'Golden hive lamp', 'lights', 'both', 'legendary', 0, 'A glowing honeycomb lamp. Only from daily rewards.', { earnedOnly: true }),
  decor('poster_aurora', 'Aurora poster', 'poster', 'both', 'epic', 0, 'Northern lights over the hills. Only from daily rewards.', { earnedOnly: true }),
  decor('bed_royal', 'Royal cushion', 'bed', 'pet', 'epic', 0, 'Velvet and gold. Only from daily rewards.', { earnedOnly: true }),
  decor('rug_victory', 'Victory mat', 'rug', 'hero', 'epic', 0, 'Stitched with a golden star. Only from daily rewards.', { earnedOnly: true }),

  // Room themes
  theme('theme_cozy', 'Cozy Room', 'pet', 'common', 0, 'Warm walls, a big window and a soft lamp.', true),
  theme('theme_study', 'Study Room', 'pet', 'common', 150, 'Shelves, a chalkboard and quiet light.'),
  theme('theme_nature', 'Nature Room', 'pet', 'uncommon', 250, 'Leaves, sunlight and a view of the hills.'),
  theme('theme_beach', 'Beach Room', 'pet', 'uncommon', 300, 'Sand-coloured floors and the sea outside.'),
  theme('theme_gaming', 'Gaming Room', 'pet', 'rare', 380, 'Soft neon and a cosy beanbag corner.'),
  theme('theme_space', 'Space Room', 'pet', 'epic', 520, 'Stars on the ceiling and a planet in the window.'),
  theme('base_hq', 'Hero Headquarters', 'hero', 'common', 0, 'A city rooftop HQ with a view of the skyline.', true),
  theme('base_training', 'Training Room', 'hero', 'common', 200, 'Mats, lights and a scoreboard.'),
  theme('base_lab', 'Tech Lab', 'hero', 'uncommon', 280, 'Benches, gadgets and a humming core.'),
  theme('base_secret', 'Secret Base', 'hero', 'rare', 380, 'Hidden behind a waterfall.'),
  theme('base_cyber', 'Cyber Lab', 'hero', 'rare', 450, 'Circuits glowing through the walls.'),
  theme('base_station', 'Space Station', 'hero', 'epic', 600, 'Earth rising in the window.'),
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const STARTER_ITEMS = ITEMS.filter((i) => i.starter).map((i) => i.id);
export const DEFAULT_PET_THEME = 'theme_cozy';
export const DEFAULT_HERO_THEME = 'base_hq';
export const DEFAULT_PET_DECOR = { bed: 'bed_cushion', bowl: 'bowl_ceramic' } as const;
export const DEFAULT_HERO_DECOR = { rug: 'rug_tile' } as const;

export function getItem(id: string): ItemDef | undefined {
  return ITEM_BY_ID[id];
}

export function isConsumable(item: ItemDef): boolean {
  return item.category === 'food' || item.category === 'toy' || item.category === 'boost';
}

export function fitsSpace(item: ItemDef, space: CompanionKind): boolean {
  return item.space === 'both' || item.space === space;
}

/** Daily login rewards, day 1..7. Day 7 is a special item. */
export const DAILY_REWARDS: { coins: number; special?: boolean }[] = [
  { coins: 10 },
  { coins: 20 },
  { coins: 30 },
  { coins: 50 },
  { coins: 75 },
  { coins: 100 },
  { coins: 0, special: true },
];

/** Picked in order for the day-7 reward; the first one not owned yet is given. */
export const SPECIAL_REWARD_POOL = ['lights_hive', 'poster_aurora', 'bed_royal', 'rug_victory', 'hat_crown', 'back_cape', 'face_visor'];
/** Coins given instead when every special item is already owned. */
export const SPECIAL_FALLBACK_COINS = 150;
