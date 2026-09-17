import type { PublicAction } from '../utilities/actions';
import type {
  AmbientState,
  AppCommand,
  ChimeId,
  CompanionView,
  RuntimeState,
  SessionRecord,
  Snapshot,
  UiEvent,
  ViewData,
} from '../types';

export const IPC = {
  getSnapshot: 'allbee:snapshot:get',
  dispatch: 'allbee:dispatch',
  command: 'allbee:command',
  data: 'allbee:data',
  runtime: 'allbee:runtime',
  uiEvent: 'allbee:ui-event',
  companionView: 'allbee:companion:view',
  companionPointer: 'allbee:companion:pointer',
  companionReady: 'allbee:companion:ready',
  audioState: 'allbee:audio:state',
  audioChime: 'allbee:audio:chime',
  audioReady: 'allbee:audio:ready',
} as const;

export interface DispatchResult {
  ok: boolean;
  error?: string;
}

export interface CommandResult {
  ok: boolean;
  error?: string;
  /** Command-specific payload (e.g. session history) */
  value?: unknown;
  /** The user dismissed a dialog */
  cancelled?: boolean;
  message?: string;
}

/** API exposed to the main (settings) window. */
export interface MainApi {
  role: 'main';
  platform: string;
  getSnapshot(): Promise<Snapshot>;
  dispatch(action: PublicAction): Promise<DispatchResult>;
  command(cmd: AppCommand): Promise<CommandResult>;
  onData(cb: (data: ViewData) => void): () => void;
  onRuntime(cb: (runtime: RuntimeState) => void): () => void;
  onUiEvent(cb: (event: UiEvent) => void): () => void;
}

export type CompanionPointer =
  | { type: 'hover'; over: boolean }
  | { type: 'down'; screenX: number; screenY: number; button: number }
  | { type: 'move'; screenX: number; screenY: number }
  | { type: 'up'; screenX: number; screenY: number; moved: boolean }
  | { type: 'context' }
  | { type: 'prompt'; answer: 'snooze' | 'cancel' };

export interface CompanionApi {
  role: 'companion';
  platform: string;
  onView(cb: (view: CompanionView) => void): () => void;
  pointer(evt: CompanionPointer): void;
  ready(): void;
}

export interface AudioStateMessage {
  ambient: AmbientState;
  /** Master volume for chimes 0..1, or 0 when sounds are off */
  chimeVolume: number;
}

export interface AudioApi {
  role: 'audio';
  onState(cb: (state: AudioStateMessage) => void): () => void;
  onChime(cb: (chime: { id: ChimeId; volume: number }) => void): () => void;
  ready(): void;
}

export type HistoryResult = SessionRecord[];
