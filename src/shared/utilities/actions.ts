// Actions that change AppData. Public actions may come from renderer windows and are
// validated structurally here; the reducer clamps and checks every value again.
import type {
  AccessorySlot,
  AmbientId,
  CompanionKind,
  DecorSlot,
  PageId,
  PatrolEdge,
  PatrolMode,
  PatrolSettings,
  Settings,
  TaskPriority,
  TimerPhase,
  TimerSettings,
  WorkCategory,
} from '../types';

export interface OnboardingPayload {
  companionId: string;
  companionName: string;
  userName: string;
  dailyGoalMinutes: number;
  rules: { pattern: string; limitMinutes: number }[];
  patrolEnabled: boolean;
  mode: PatrolMode;
  countdownSeconds: number;
  notifications: boolean;
  sounds: boolean;
  startWithWindows: boolean;
}

export interface TaskInput {
  title?: string;
  notes?: string;
  priority?: TaskPriority;
  dueDate?: string | null;
  estimateMinutes?: number;
  category?: WorkCategory;
}

export type PatrolPatch = Partial<Pick<PatrolSettings, 'enabled' | 'mode' | 'countdownSeconds' | 'snoozeMinutes' | 'edge' | 'wander' | 'strictDuringFocus'>>;

export type PublicAction =
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'patrol/update'; patch: PatrolPatch }
  | { type: 'patrol/snooze'; minutes?: number }
  | { type: 'patrol/unsnooze' }
  | { type: 'rules/add'; pattern: string; limitMinutes: number }
  | { type: 'rules/update'; id: string; pattern?: string; limitMinutes?: number; enabled?: boolean }
  | { type: 'rules/remove'; id: string }
  | { type: 'rules/resetToday'; id: string }
  | { type: 'timerSettings/update'; patch: Partial<TimerSettings> }
  | { type: 'timer/start'; phase?: TimerPhase; minutes?: number; taskId?: string | null; category?: WorkCategory }
  | { type: 'timer/pause' }
  | { type: 'timer/resume' }
  | { type: 'timer/toggle' }
  | { type: 'timer/finishEarly' }
  | { type: 'timer/skipBreak' }
  | { type: 'timer/setTask'; taskId: string | null }
  | { type: 'timer/setCategory'; category: WorkCategory }
  | { type: 'tasks/add'; task: TaskInput }
  | { type: 'tasks/edit'; id: string; task: TaskInput }
  | { type: 'tasks/toggle'; id: string }
  | { type: 'tasks/remove'; id: string }
  | { type: 'tasks/move'; id: string; dir: number }
  | { type: 'tasks/clearDone' }
  | { type: 'companion/select'; id: string }
  | { type: 'companion/rename'; id: string; name: string }
  | { type: 'companion/pet' }
  | { type: 'companion/unlock'; id: string }
  | { type: 'shop/buy'; itemId: string }
  | { type: 'item/use'; itemId: string }
  | { type: 'item/equip'; slot: AccessorySlot; itemId: string | null }
  | { type: 'decor/place'; space: CompanionKind; slot: DecorSlot; itemId: string | null }
  | { type: 'theme/set'; space: CompanionKind; itemId: string }
  | { type: 'daily/claim' }
  | { type: 'ambient/set'; id?: AmbientId; playing?: boolean; volume?: number }
  | { type: 'onboarding/finish'; payload: OnboardingPayload }
  | { type: 'ui/page'; page: PageId };

export type InternalAction =
  | { type: '@tick' }
  | { type: '@timer/complete' }
  | { type: '@timer/unguard' }
  /** A session that ended long ago while the app was closed: reset without rewards. */
  | { type: '@timer/abandon' }
  | { type: '@usage/commit'; ruleId: string; ms: number }
  | { type: '@patrol/hit'; ruleId: string }
  | { type: '@patrol/resolved'; ruleId: string; how: 'closed' | 'left' }
  | { type: '@patrol/position'; edge: PatrolEdge; offset?: number; x?: number; y?: number };

export type Action = PublicAction | InternalAction;

export type FieldKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'string?'
  | 'number?'
  | 'boolean?'
  | 'nullable-string'
  | 'nullable-string?';

export type Shape = Record<string, FieldKind>;

const SHAPES: Record<PublicAction['type'], Shape> = {
  'settings/update': { patch: 'object' },
  'patrol/update': { patch: 'object' },
  'patrol/snooze': { minutes: 'number?' },
  'patrol/unsnooze': {},
  'rules/add': { pattern: 'string', limitMinutes: 'number' },
  'rules/update': { id: 'string', pattern: 'string?', limitMinutes: 'number?', enabled: 'boolean?' },
  'rules/remove': { id: 'string' },
  'rules/resetToday': { id: 'string' },
  'timerSettings/update': { patch: 'object' },
  'timer/start': { phase: 'string?', minutes: 'number?', taskId: 'nullable-string?', category: 'string?' },
  'timer/pause': {},
  'timer/resume': {},
  'timer/toggle': {},
  'timer/finishEarly': {},
  'timer/skipBreak': {},
  'timer/setTask': { taskId: 'nullable-string' },
  'timer/setCategory': { category: 'string' },
  'tasks/add': { task: 'object' },
  'tasks/edit': { id: 'string', task: 'object' },
  'tasks/toggle': { id: 'string' },
  'tasks/remove': { id: 'string' },
  'tasks/move': { id: 'string', dir: 'number' },
  'tasks/clearDone': {},
  'companion/select': { id: 'string' },
  'companion/rename': { id: 'string', name: 'string' },
  'companion/pet': {},
  'companion/unlock': { id: 'string' },
  'shop/buy': { itemId: 'string' },
  'item/use': { itemId: 'string' },
  'item/equip': { slot: 'string', itemId: 'nullable-string' },
  'decor/place': { space: 'string', slot: 'string', itemId: 'nullable-string' },
  'theme/set': { space: 'string', itemId: 'string' },
  'daily/claim': {},
  'ambient/set': { id: 'string?', playing: 'boolean?', volume: 'number?' },
  'onboarding/finish': { payload: 'object' },
  'ui/page': { page: 'string' },
};

export function checkField(v: unknown, kind: FieldKind): boolean {
  const optional = kind.endsWith('?');
  const k = optional ? kind.slice(0, -1) : kind;
  if (v === undefined) return optional;
  switch (k) {
    case 'string':
      return typeof v === 'string' && v.length <= 2000;
    case 'number':
      return typeof v === 'number' && Number.isFinite(v);
    case 'boolean':
      return typeof v === 'boolean';
    case 'object':
      return typeof v === 'object' && v !== null && !Array.isArray(v);
    case 'array':
      return Array.isArray(v) && v.length <= 1000;
    case 'nullable-string':
      return v === null || (typeof v === 'string' && v.length <= 200);
    default:
      return false;
  }
}

/** Returns the action if it is a well-formed public action, otherwise null. */
export function validateAction(raw: unknown): PublicAction | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.type !== 'string' || !Object.prototype.hasOwnProperty.call(SHAPES, a.type)) return null;
  const shape = SHAPES[a.type as PublicAction['type']];
  for (const key of Object.keys(a)) {
    // hasOwnProperty, not `in`: keys such as __proto__, constructor and toString exist
    // on every object's prototype, so `in` would wave them straight through.
    if (key !== 'type' && !Object.prototype.hasOwnProperty.call(shape, key)) return null;
  }
  for (const [key, kind] of Object.entries(shape)) {
    if (!checkField(a[key], kind)) return null;
  }
  return a as unknown as PublicAction;
}

export const PAGE_IDS: PageId[] = [
  'home',
  'focus',
  'tasks',
  'patrol',
  'sites',
  'companion',
  'missions',
  'statistics',
  'achievements',
  'collection',
  'shop',
  'settings',
  'about',
];

export const AMBIENT_IDS: AmbientId[] = ['rain', 'forest', 'ocean', 'cafe', 'fireplace', 'white', 'brown'];
export const ACCESSORY_SLOTS: AccessorySlot[] = ['head', 'face', 'neck', 'back'];
export const DECOR_SLOT_IDS: DecorSlot[] = ['bed', 'bowl', 'desk', 'plant', 'books', 'toys', 'lights', 'rug', 'poster'];
export const PRIORITIES: TaskPriority[] = ['high', 'medium', 'low'];
