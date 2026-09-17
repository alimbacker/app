// Shared domain model for AllBee Focus.
// `AppData` is persisted to disk; `RuntimeState` lives only in memory in the main process.

export type ThemePref = 'dark' | 'light' | 'system';
export type MotionPref = 'system' | 'reduce' | 'full';
export type SpeechFrequency = 'quiet' | 'normal' | 'chatty';
export type PatrolMode = 'close' | 'complain';
export type PatrolEdge = 'bottom' | 'top' | 'left' | 'right' | 'free';
export type MoveSpeed = 'slow' | 'normal' | 'fast';
export type CompanionKind = 'pet' | 'hero';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type TimerPhase = 'focus' | 'shortBreak' | 'longBreak';
export type TimerStatus = 'idle' | 'running' | 'paused';
export type AmbientId = 'rain' | 'forest' | 'ocean' | 'cafe' | 'fireplace' | 'white' | 'brown';
export type ChimeId = 'start' | 'focusDone' | 'breakDone' | 'levelUp' | 'reward' | 'warn' | 'tap';
export type BrowserId = 'chrome' | 'edge' | 'firefox' | 'brave';
export type AccessorySlot = 'head' | 'face' | 'neck' | 'back';
export type DecorSlot = 'bed' | 'bowl' | 'desk' | 'plant' | 'books' | 'toys' | 'lights' | 'rug' | 'poster';
export type TaskPriority = 'low' | 'medium' | 'high';
export type WorkCategory =
  | 'study'
  | 'coding'
  | 'business'
  | 'office'
  | 'freelance'
  | 'creative'
  | 'reading'
  | 'writing'
  | 'learning'
  | 'other';

export type PageId =
  | 'home'
  | 'focus'
  | 'tasks'
  | 'patrol'
  | 'sites'
  | 'companion'
  | 'missions'
  | 'statistics'
  | 'achievements'
  | 'collection'
  | 'shop'
  | 'settings'
  | 'about';

/** Visual/behavioural states the desktop companion can be in. */
export type CompanionPose =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sleep'
  | 'sit'
  | 'think'
  | 'happy'
  | 'wave'
  | 'jump'
  | 'celebrate'
  | 'concerned'
  | 'angry'
  | 'focusing'
  | 'levelup'
  | 'mission'
  | 'hover'
  | 'fly'
  | 'stand';

export type Mood = 'happy' | 'calm' | 'sleepy' | 'sad';

export interface Settings {
  theme: ThemePref;
  /** Shown in greetings. Empty means "use the Windows account name". */
  userName: string;
  startWithWindows: boolean;
  /** Minimize button sends the window to the tray instead of the taskbar. */
  minimizeToTray: boolean;
  notifications: boolean;
  /** Short chimes (session complete, level up...). */
  sounds: boolean;
  soundVolume: number; // 0..1
  motion: MotionPref;
  highContrast: boolean;
  /** Register Ctrl+Shift+F/S/P system-wide. Off by default: they clash with editors like VS Code. */
  globalShortcuts: boolean;
  dailyGoalMinutes: number;
  companionVisible: boolean;
  /** Companion scale, 0.5 .. 2 (default 0.9) */
  companionSize: number;
  /** Animation speed multiplier, 0.5 .. 2 (default 1.0) */
  animationSpeed: number;
  moveSpeed: MoveSpeed;
  alwaysOnTop: boolean;
  speechBubbles: boolean;
  speech: SpeechFrequency;
}

export interface PatrolSettings {
  enabled: boolean;
  mode: PatrolMode;
  /** Seconds between reaching a limit and acting on it. 0..60 */
  countdownSeconds: number;
  /** Length of a snooze, 1..60 minutes */
  snoozeMinutes: number;
  edge: PatrolEdge;
  wander: boolean;
  /** Epoch ms until which enforcement is paused. */
  snoozedUntil: number | null;
  /** Window position when edge === 'free' */
  freePosition: { x: number; y: number } | null;
  /** Where along the chosen edge the companion was last seen (0..1). */
  edgeOffset: number;
  /** During focus sessions, tracked sites count as over their limit. */
  strictDuringFocus: boolean;
}

export interface SiteRule {
  id: string;
  /** Normalised "host[/path]" pattern, e.g. `youtube.com/shorts` */
  pattern: string;
  /** Daily allowance in minutes. 0 means never allowed. */
  limitMinutes: number;
  enabled: boolean;
  createdAt: number;
}

/** Per-rule usage for one local day. Times in ms. */
export interface SiteUsage {
  day: string;
  ms: Record<string, number>;
  hits: Record<string, number>;
  closed: Record<string, number>;
}

export interface TimerSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** A long break replaces every Nth short break. */
  longBreakEvery: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
}

export interface TimerState {
  phase: TimerPhase;
  status: TimerStatus;
  durationMs: number;
  /** Epoch ms the current phase was first started (null when idle). */
  startedAt: number | null;
  /** Epoch ms when a running phase ends. */
  endsAt: number | null;
  /** Remaining time while paused or idle. */
  remainingMs: number;
  taskId: string | null;
  category: WorkCategory;
  /** Completed focus sessions since the last long break. */
  completedInCycle: number;
  /** An ambient sound played during this phase. */
  usedAmbient: boolean;
  /** Tasks finished while this focus phase was running. */
  tasksDuring: number;
  pauses: number;
  /** Patrol was watching for the whole session and caught nothing. */
  guarded: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  priority: TaskPriority;
  /** Local day key (YYYY-MM-DD) or null */
  dueDate: string | null;
  /** Estimated focus time in minutes (0 = not set) */
  estimateMinutes: number;
  category: WorkCategory;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
  /** Completed focus sessions attributed to this task */
  sessions: number;
  /** Focus minutes attributed to this task */
  focusMinutes: number;
  /** Completion already counted toward stats (prevents double counting on re-toggle). */
  counted: boolean;
}

export interface CompanionProgress {
  id: string;
  name: string;
  /** Total XP earned by this companion */
  xp: number;
  energy: number; // 0..100
  happiness: number; // 0..100
  unlockedAt: number;
  sessions: number;
  focusMinutes: number;
  accessories: Partial<Record<AccessorySlot, string>>;
  /** Power charge counter (e.g. Terra crafts a streak freeze every few sessions). */
  powerCounter: number;
}

export interface Profile {
  coins: number;
  lifetimeCoins: number;
  /** All XP ever earned. Drives your player level, which unlocks companions. */
  totalXp: number;
  /** Remaining sessions that get the XP booster. */
  boostSessions: number;
  streakFreezes: number;
}

export interface Inventory {
  /** itemId -> count. Non-consumables are 1. */
  owned: Record<string, number>;
  petTheme: string;
  heroTheme: string;
  petDecor: Partial<Record<DecorSlot, string>>;
  heroDecor: Partial<Record<DecorSlot, string>>;
}

export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  completed: boolean;
  taskId: string | null;
  companionId: string;
  category: WorkCategory;
  xp: number;
  coins: number;
}

export interface DayStats {
  focusMinutes: number;
  /** Focus sessions ended this day, finished or not */
  sessions: number;
  /** Focus sessions that ran to the end */
  completed: number;
  tasksDone: number;
  breaks: number;
  limitHits: number;
  tabsClosed: number;
  xp: number;
  coins: number;
  goalMet: boolean;
  /** 24 buckets of focus minutes by local hour */
  hours: number[];
  greets: number;
  /** Coins paid today by the Distraction Shield power */
  shieldCoins: number;
  /** Focus minutes from sessions Patrol guarded without a single catch */
  guardedMinutes: number;
  /** Focus minutes by work category */
  categories: Partial<Record<WorkCategory, number>>;
}

export interface StreakState {
  current: number;
  best: number;
  lastDay: string | null;
  /** Days bridged by a streak freeze */
  frozen: string[];
}

export interface MissionProgress {
  id: string;
  progress: number;
  target: number;
  /** Reward paid (missions pay out automatically when complete). */
  done: boolean;
}

export interface MissionsState {
  day: string;
  daily: MissionProgress[];
  week: string;
  weekly: MissionProgress[];
}

export interface AchievementProgress {
  unlockedAt: number;
}

export interface DailyRewardState {
  lastClaimDay: string | null;
  /** Index (1..7) of the reward claimed last. */
  lastIndex: number;
  /** Completed full 7-day cycles */
  cycles: number;
}

export interface Counters {
  /** Completed focus sessions, lifetime */
  sessions: number;
  /** Focus minutes (completed and partial), lifetime */
  focusMinutes: number;
  purchases: number;
  tasksDone: number;
  limitHits: number;
  tabsClosed: number;
  /** Times you left a limited site after Patrol caught you */
  turnedAway: number;
  cleanDays: number;
  equips: number;
  decorPlaced: number;
  longestSession: number;
  earlySessions: number;
  lateSessions: number;
  goalDays: number;
  codingSessions: number;
  missionsDone: number;
  evolutions: number;
}

export interface AmbientState {
  id: AmbientId;
  playing: boolean;
  volume: number;
}

export interface AppData {
  schema: number;
  createdAt: number;
  updatedAt: number;
  onboarded: boolean;
  settings: Settings;
  patrol: PatrolSettings;
  rules: SiteRule[];
  usage: SiteUsage;
  timerSettings: TimerSettings;
  timer: TimerState;
  tasks: Task[];
  companions: Record<string, CompanionProgress>;
  activeCompanionId: string;
  profile: Profile;
  inventory: Inventory;
  history: SessionRecord[];
  days: Record<string, DayStats>;
  streak: StreakState;
  missions: MissionsState;
  achievements: Record<string, AchievementProgress>;
  dailyReward: DailyRewardState;
  ambient: AmbientState;
  counters: Counters;
  ui: { page: PageId; lastCategory: WorkCategory };
  /** Epoch ms of the last passive (energy) update. */
  lastTickAt: number;
  /** Local day of the last day rollover processing. */
  lastDay: string;
}

/** The part of AppData sent to renderer windows (history is fetched on demand). */
export type ViewData = Omit<AppData, 'history'> & { historyCount: number };

// ---------------------------------------------------------------------------
// Runtime (not persisted)

export type MonitorState = 'off' | 'starting' | 'running' | 'unavailable' | 'unsupported';

export interface MonitorStatus {
  state: MonitorState;
  /** Plain-language explanation shown in the UI. */
  message: string;
  since: number;
}

export type UrlStatus =
  | 'ok'
  | 'unreadable'
  | 'editing'
  | 'denied'
  | 'not-browser'
  | 'unsupported-browser'
  | 'none';

export interface ForegroundInfo {
  /** Executable name, e.g. chrome.exe */
  app: string;
  /** Friendly app name, e.g. Google Chrome */
  appName: string;
  browser: BrowserId | null;
  host: string | null;
  path: string | null;
  urlStatus: UrlStatus;
  /** The foreground window belongs to AllBee Focus itself. */
  self: boolean;
  at: number;
}

export type EnforcementPhase = 'countdown' | 'held' | 'closing' | 'closed' | 'complaining';

export interface Enforcement {
  ruleId: string;
  pattern: string;
  phase: EnforcementPhase;
  startedAt: number;
  /** When the countdown finishes (countdown phase only). */
  endsAt: number | null;
  /** Remaining countdown while held. */
  remainingMs: number;
  /** Why enforcement started. */
  reason: 'limit' | 'focus';
  /** Set when closing failed and Patrol fell back to complaining. */
  note: string | null;
}

export interface ActiveSite {
  ruleId: string;
  pattern: string;
  since: number;
  /** Uncommitted usage in ms, added on top of `usage.ms[ruleId]` */
  pendingMs: number;
}

export interface RuntimeState {
  monitor: MonitorStatus;
  foreground: ForegroundInfo | null;
  active: ActiveSite | null;
  enforcement: Enforcement | null;
  focusMode: boolean;
  companionShown: boolean;
  save: { state: 'saved' | 'saving' | 'error'; at: number; error?: string };
  /** Data could not be read at start-up and a fresh profile was created. */
  loadWarning: string | null;
  notifications: { supported: boolean; error: string | null };
  loginItem: { supported: boolean; enabled: boolean };
  shortcuts: { global: boolean; failed: string[] };
  osUserName: string;
  platform: string;
  version: string;
  isDev: boolean;
  simulated: boolean;
  dataPath: string;
}

export interface Snapshot {
  data: ViewData;
  runtime: RuntimeState;
}

// ---------------------------------------------------------------------------
// Events emitted by the reducer for UI reactions (toasts, speech, sounds, celebrations).

export type AppEvent =
  | { type: 'phaseStarted'; phase: TimerPhase; minutes: number }
  | {
      type: 'sessionComplete';
      minutes: number;
      xp: number;
      coins: number;
      notes: string[];
      companionId: string;
      taskId: string | null;
      /** false when the session was finished early */
      full: boolean;
    }
  | { type: 'sessionEnded'; minutes: number; xp: number }
  | { type: 'breakComplete'; long: boolean }
  | { type: 'levelUp'; companionId: string; level: number; stage: number; evolved: boolean }
  | { type: 'playerLevel'; level: number }
  | { type: 'missionComplete'; id: string; xp: number; coins: number }
  | { type: 'achievement'; id: string; coins: number }
  | { type: 'goalMet'; minutes: number; coins: number }
  | { type: 'streak'; days: number; coins: number }
  | { type: 'streakSaved'; days: number }
  | { type: 'streakLost'; days: number }
  | { type: 'purchased'; itemId: string }
  | { type: 'unlocked'; companionId: string }
  | { type: 'itemUsed'; itemId: string }
  | { type: 'dailyReward'; index: number; coins: number; itemId?: string }
  | { type: 'limitReached'; ruleId: string; pattern: string }
  | { type: 'tabClosed'; pattern: string }
  | { type: 'taskDone'; taskId: string; title: string }
  | { type: 'petted'; happiness: number }
  | { type: 'newDay'; day: string };

/** Big moments shown as a celebration card in the main window. */
export type Celebration =
  | { kind: 'session'; minutes: number; xp: number; coins: number; notes: string[]; companionId: string; full: boolean }
  | { kind: 'levelUp'; companionId: string; level: number; stage: number; evolved: boolean }
  | { kind: 'mission'; id: string; xp: number; coins: number }
  | { kind: 'goal'; minutes: number; coins: number }
  | { kind: 'achievement'; id: string; coins: number }
  | { kind: 'unlocked'; companionId: string };

/** Transient messages from main to renderers. */
export type UiEvent =
  | { kind: 'celebrate'; celebration: Celebration }
  | { kind: 'toast'; tone: 'info' | 'success' | 'error'; text: string }
  | { kind: 'navigate'; page: PageId }
  | { kind: 'focusMode'; on: boolean };

/** State pushed to the desktop companion window. */
export interface CompanionView {
  characterId: string;
  name: string;
  level: number;
  stage: number;
  accessories: Partial<Record<AccessorySlot, string>>;
  pose: CompanionPose;
  facing: 'left' | 'right';
  moving: boolean;
  edge: PatrolEdge;
  scale: number;
  animationSpeed: number;
  reducedMotion: boolean;
  theme: 'dark' | 'light';
  speech: { id: number; text: string } | null;
  prompt: { id: number; kind: 'snooze'; minutes: number } | null;
  countdown: { endsAt: number | null; remainingMs: number; pattern: string } | null;
  timer: { phase: TimerPhase; status: TimerStatus; endsAt: number | null; remainingMs: number } | null;
}

/** Commands the renderer can ask the main process to perform (outside the reducer). */
export type AppCommand =
  | { type: 'window/minimize' }
  | { type: 'window/close' }
  | { type: 'app/quit' }
  | { type: 'app/openWebsite' }
  | { type: 'companion/show'; show: boolean }
  | { type: 'focusMode/set'; on: boolean }
  | { type: 'data/export' }
  | { type: 'data/import' }
  | { type: 'data/reset' }
  | { type: 'data/openFolder' }
  | { type: 'save/retry' }
  | { type: 'notifications/test' }
  | { type: 'monitor/restart' }
  | { type: 'patrol/snoozeChoice'; snooze: boolean }
  | { type: 'history/get'; limit: number }
  /** Developer mode only (ALLBEE_SIMULATE=1): pretend a browser shows this address. */
  | { type: 'dev/simulate'; url: string | null };
