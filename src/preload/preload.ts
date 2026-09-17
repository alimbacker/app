// The bridge between a window and the main process.
//
// Each window is told its role through --allbee-role= when it is created, and only ever
// gets the API for that role: the dashboard can dispatch actions and run commands, the
// companion can report pointer events, the audio window can only listen. The window can
// claim whatever it likes here — the main process checks the sender again on arrival —
// but building the right surface keeps the boundary obvious from both sides.
//
// Nothing else is exposed: no Node, no ipcRenderer, and no raw event objects (they carry
// a reference to the sender).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type AudioApi,
  type AudioStateMessage,
  type CommandResult,
  type CompanionApi,
  type CompanionPointer,
  type DispatchResult,
  type MainApi,
} from '@shared/constants/ipc';
import type { AppCommand, ChimeId, CompanionView, RuntimeState, Snapshot, UiEvent, ViewData } from '@shared/types';
import type { PublicAction } from '@shared/utilities/actions';

const ROLE_PREFIX = '--allbee-role=';

function role(): string {
  const arg = (process.argv || []).find((a) => a.startsWith(ROLE_PREFIX));
  return arg ? arg.slice(ROLE_PREFIX.length) : '';
}

/** Subscribes to a channel and returns an unsubscribe function. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => {
    try {
      cb(payload);
    } catch (err) {
      console.error(`AllBee: a ${channel} listener failed`, err);
    }
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

function mainApi(): MainApi {
  return {
    role: 'main',
    platform: process.platform,
    getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot) as Promise<Snapshot>,
    dispatch: (action: PublicAction) => ipcRenderer.invoke(IPC.dispatch, action) as Promise<DispatchResult>,
    command: (cmd: AppCommand) => ipcRenderer.invoke(IPC.command, cmd) as Promise<CommandResult>,
    onData: (cb: (data: ViewData) => void) => subscribe(IPC.data, cb),
    onRuntime: (cb: (runtime: RuntimeState) => void) => subscribe(IPC.runtime, cb),
    onUiEvent: (cb: (event: UiEvent) => void) => subscribe(IPC.uiEvent, cb),
  };
}

function companionApi(): CompanionApi {
  return {
    role: 'companion',
    platform: process.platform,
    onView: (cb: (view: CompanionView) => void) => subscribe(IPC.companionView, cb),
    pointer: (evt: CompanionPointer) => ipcRenderer.send(IPC.companionPointer, evt),
    ready: () => ipcRenderer.send(IPC.companionReady),
  };
}

function audioApi(): AudioApi {
  return {
    role: 'audio',
    onState: (cb: (state: AudioStateMessage) => void) => subscribe(IPC.audioState, cb),
    onChime: (cb: (chime: { id: ChimeId; volume: number }) => void) => subscribe(IPC.audioChime, cb),
    ready: () => ipcRenderer.send(IPC.audioReady),
  };
}

const BY_ROLE: Record<string, () => MainApi | CompanionApi | AudioApi> = {
  main: mainApi,
  companion: companionApi,
  audio: audioApi,
};

const build = BY_ROLE[role()];
if (build) {
  contextBridge.exposeInMainWorld('allbee', build());
} else {
  // Without a known role the window gets nothing at all rather than a guess.
  console.error('AllBee: this window has no role, so no API was exposed.');
}
