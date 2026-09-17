// What "Reset progress" keeps and what it clears.
//
// Kept separate from the command that calls it so the rule can be read, and tested,
// without starting Electron.
import type { AppData } from '@shared/types';
import { createDefaultData } from '@shared/utilities/defaults';
import { sanitizeData } from '@shared/utilities/sanitize';

/**
 * A fresh start that keeps what the user set up by hand: their settings, their site
 * rules and their task list. Progress — levels, coins, companions, session history,
 * streaks, missions and achievements — goes back to day one.
 */
export function buildResetData(prev: AppData, now: number): AppData {
  const fresh = createDefaultData(now);
  const kept: AppData = {
    ...fresh,
    createdAt: prev.createdAt,
    onboarded: prev.onboarded,
    settings: { ...prev.settings },
    patrol: { ...prev.patrol, snoozedUntil: null },
    timerSettings: { ...prev.timerSettings },
    rules: prev.rules.map((r) => ({ ...r })),
    // Tasks stay, but the focus time counted against each one is part of the progress
    // being cleared.
    tasks: prev.tasks.map((t) => ({ ...t, sessions: 0, focusMinutes: 0 })),
  };
  return sanitizeData(kept, now);
}
