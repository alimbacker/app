// The only way into the main process from a window.
//
// Two checks run before anything happens. First, the request has to come from the window
// that is allowed to send it: the dashboard cannot drive the companion, and the companion
// cannot change settings. Comparing the sender against the WebContents we created is what
// makes that real; the --allbee-role= argument only tells the preload which API to build.
// Second, the payload is checked field by field, because anything crossing this boundary
// is untrusted input even though we wrote the window on the other side.
import { ipcMain, type WebContents } from 'electron';
import { IPC, type CommandResult, type DispatchResult } from '@shared/constants/ipc';
import type { Snapshot } from '@shared/types';
import { validateAction } from '@shared/utilities/actions';
import { validateCommand, validatePointer } from '@shared/utilities/commands';
import type { CompanionController } from '../companion/companion-controller';
import type { AudioBridge } from '../engine/audio';
import { log } from '../system/logger';
import { runCommand, type CommandDeps } from './commands';

const DENIED = 'That request isn’t allowed.';
const UNKNOWN = 'That request wasn’t understood.';

export interface RouterDeps extends CommandDeps {
  companion: CompanionController;
  audio: AudioBridge;
}

/** Only log the shape of a rejected payload, never its contents. */
function describe(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) return typeof raw;
  const t = (raw as { type?: unknown }).type;
  return typeof t === 'string' ? t.slice(0, 40) : 'no type';
}

export function registerIpc(deps: RouterDeps): () => void {
  const fromMain = (sender: WebContents): boolean => {
    const win = deps.windows.main;
    return !!win && !win.isDestroyed() && sender === win.webContents;
  };
  const fromAudio = (sender: WebContents): boolean => {
    const win = deps.windows.audio;
    return !!win && !win.isDestroyed() && sender === win.webContents;
  };

  ipcMain.handle(IPC.getSnapshot, (e): Snapshot => {
    if (!fromMain(e.sender)) throw new Error(DENIED);
    return deps.engine.snapshot();
  });

  ipcMain.handle(IPC.dispatch, (e, raw: unknown): DispatchResult => {
    if (!fromMain(e.sender)) return { ok: false, error: DENIED };
    const action = validateAction(raw);
    if (!action) {
      log.warn('rejected malformed action:', describe(raw));
      return { ok: false, error: UNKNOWN };
    }
    return deps.engine.dispatch(action);
  });

  ipcMain.handle(IPC.command, async (e, raw: unknown): Promise<CommandResult> => {
    if (!fromMain(e.sender)) return { ok: false, error: DENIED };
    const cmd = validateCommand(raw);
    if (!cmd) {
      log.warn('rejected malformed command:', describe(raw));
      return { ok: false, error: UNKNOWN };
    }
    try {
      return await runCommand(cmd, deps);
    } catch (err) {
      log.error('command failed', cmd.type, err);
      return { ok: false, error: 'Something went wrong. Please try again.' };
    }
  });

  ipcMain.on(IPC.companionPointer, (e, raw: unknown) => {
    if (!deps.companion.isCompanionSender(e.sender)) return;
    const pointer = validatePointer(raw);
    if (pointer) deps.companion.pointer(pointer);
  });

  ipcMain.on(IPC.companionReady, (e) => {
    if (!deps.companion.isCompanionSender(e.sender)) return;
    log.info('companion window ready');
    deps.companion.markReady(e.sender);
  });

  ipcMain.on(IPC.audioReady, (e) => {
    if (!fromAudio(e.sender)) return;
    log.info('audio window ready');
    deps.audio.markReady();
  });

  return () => {
    for (const channel of [IPC.getSnapshot, IPC.dispatch, IPC.command]) ipcMain.removeHandler(channel);
    for (const channel of [IPC.companionPointer, IPC.companionReady, IPC.audioReady]) ipcMain.removeAllListeners(channel);
  };
}
