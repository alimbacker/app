export const APP_NAME = 'AllBee Focus';
export const APP_TAGLINE = 'Focus. Grow. Achieve.';
export const APP_ID = 'com.allbee.focus';
export const DATA_FILE = 'allbee-focus-data.json';
export const SCHEMA_VERSION = 1;

/**
 * Official AllBee website opened by "Visit AllBee" on the About page.
 * Left empty on purpose until the real address is confirmed; the button is disabled while empty.
 * Set it here (or with the ALLBEE_WEBSITE_URL environment variable at build time).
 */
export const ALLBEE_WEBSITE_URL = '';

/** Limits used by validation and the UI. */
export const LIMITS = {
  taskTitle: 140,
  taskNotes: 1000,
  companionName: 24,
  userName: 32,
  rulePattern: 120,
  maxRules: 60,
  maxTasks: 400,
  maxHistory: 3000,
  maxDays: 800,
  countdown: [0, 60] as const,
  snooze: [1, 60] as const,
  ruleMinutes: [0, 720] as const,
  focusMinutes: [1, 180] as const,
  breakMinutes: [1, 60] as const,
  longBreakEvery: [2, 8] as const,
  dailyGoal: [10, 720] as const,
  estimateMinutes: [0, 1440] as const,
  companionSize: [0.5, 2] as const,
  animationSpeed: [0.5, 2] as const,
  maxStreakFreezes: 3,
  /** Minimum focused minutes for a session to earn anything */
  minRewardMinutes: 5,
  petsPerDay: 6,
};

export const TIMER_PRESETS = [15, 25, 45, 60, 90] as const;
export const GOAL_PRESETS = [30, 60, 120, 240] as const;
export const SIZE_MARKS = [0.5, 1, 1.5, 2] as const;
export const SPEED_MARKS = [0.5, 1, 1.3, 1.5, 2] as const;
