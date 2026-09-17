// Turns reducer events into sounds, notifications, companion reactions and celebrations.
import { CHARACTERS, getCharacter } from '@shared/constants/characters';
import { ITEM_BY_ID } from '@shared/constants/items';
import type { AppEvent } from '@shared/types';
import { ACHIEVEMENT_BY_ID } from '@shared/utilities/achievements';
import { MISSION_BY_ID } from '@shared/utilities/missions';
import { streakAtRisk } from '@shared/utilities/streak';
import { dayKey } from '@shared/utilities/time';
import { siteLabel } from '@shared/utilities/url';
import { stageName } from '@shared/utilities/xp';
import type { CompanionController } from '../companion/companion-controller';
import type { Notifier } from '../notifications/notifier';
import type { WindowManager } from '../windows';
import type { AudioBridge } from './audio';
import type { Engine } from './engine';

export interface ReactionDeps {
  engine: Engine;
  windows: WindowManager;
  notifier: Notifier;
  companion: CompanionController;
  audio: AudioBridge;
}

export function wireReactions(deps: ReactionDeps): () => void {
  const { engine, windows, notifier, companion, audio } = deps;
  const toast = (text: string, tone: 'info' | 'success' | 'error' = 'success') => windows.sendUi({ kind: 'toast', tone, text });

  const handle = (ev: AppEvent) => {
    const d = engine.data;
    switch (ev.type) {
      case 'phaseStarted':
        if (ev.phase === 'focus') {
          audio.chime('start');
          companion.react('happy', 1200);
          companion.sayTopic('focusStart', 'normal', { n: ev.minutes });
        } else {
          companion.sayTopic('breakStart', 'normal');
        }
        break;
      case 'sessionComplete': {
        audio.chime('focusDone');
        const name = d.companions[ev.companionId]?.name ?? 'Your companion';
        notifier.show('🎉 Focus Session Complete!', `Great work. ${name} is proud of you. +${ev.xp} XP · +${ev.coins} coins`, { page: 'focus' });
        companion.react('celebrate', 3200);
        companion.sayTopic('focusDone', 'high');
        windows.sendUi({ kind: 'celebrate', celebration: { kind: 'session', minutes: ev.minutes, xp: ev.xp, coins: ev.coins, notes: ev.notes, companionId: ev.companionId, full: ev.full } });
        break;
      }
      case 'sessionEnded':
        if (ev.minutes >= 5) {
          companion.react('happy', 1500);
          companion.sayTopic('earlyDone', 'normal');
          if (ev.xp > 0) toast(`Session ended early: ${ev.minutes} min · +${ev.xp} XP`, 'info');
        }
        break;
      case 'breakComplete':
        audio.chime('breakDone');
        notifier.show('Time to focus!', 'Your break is over. Ready for another session?', { page: 'focus', key: 'break-done', gapMs: 30_000 });
        companion.sayTopic('breakDone', 'normal');
        break;
      case 'levelUp': {
        audio.chime('levelUp');
        const c = d.companions[ev.companionId];
        const name = c?.name ?? getCharacter(ev.companionId).title;
        notifier.show(
          ev.evolved ? `✨ ${name} evolved!` : `Your companion reached Level ${ev.level}!`,
          ev.evolved ? `${name} is now ${stageName(ev.stage)} and their power grew stronger.` : `${name} is now Level ${ev.level}. Keep it up!`,
          { page: 'companion' },
        );
        companion.react('levelup', 3500);
        companion.sayTopic(ev.evolved ? 'evolved' : 'levelUp', 'high', { n: ev.level });
        windows.sendUi({ kind: 'celebrate', celebration: { kind: 'levelUp', companionId: ev.companionId, level: ev.level, stage: ev.stage, evolved: ev.evolved } });
        break;
      }
      case 'playerLevel': {
        const fresh = CHARACTERS.filter((c) => !c.unlock.starter && c.unlock.level === ev.level && !d.companions[c.id]);
        if (fresh.length) toast(`Level ${ev.level}! ${fresh.map((c) => c.title).join(' and ')} can now be unlocked.`);
        else toast(`You reached Level ${ev.level}.`, 'info');
        break;
      }
      case 'missionComplete': {
        audio.chime('reward');
        const def = MISSION_BY_ID[ev.id];
        companion.react('mission', 2600);
        companion.sayTopic('mission', 'high');
        windows.sendUi({ kind: 'celebrate', celebration: { kind: 'mission', id: ev.id, xp: ev.xp, coins: ev.coins } });
        if (!windows.mainVisible) notifier.show('Mission complete!', `${def?.title ?? 'Mission'} · +${ev.xp} XP · +${ev.coins} coins`, { page: 'missions' });
        break;
      }
      case 'achievement': {
        audio.chime('reward');
        const def = ACHIEVEMENT_BY_ID[ev.id];
        windows.sendUi({ kind: 'celebrate', celebration: { kind: 'achievement', id: ev.id, coins: ev.coins } });
        if (!windows.mainVisible) notifier.show('Achievement unlocked', `${def?.title ?? ev.id} · +${ev.coins} coins`, { page: 'achievements' });
        companion.sayTopic('achievement', 'normal');
        break;
      }
      case 'goalMet':
        audio.chime('levelUp');
        notifier.show('🎉 Daily goal achieved!', `Excellent work today! +${ev.coins} coins`, { page: 'statistics' });
        companion.react('celebrate', 3200);
        companion.sayTopic('goal', 'high');
        windows.sendUi({ kind: 'celebrate', celebration: { kind: 'goal', minutes: ev.minutes, coins: ev.coins } });
        break;
      case 'streak':
        companion.sayTopic('streak', 'normal', { n: ev.days });
        if (ev.coins > 0) toast(`${ev.days}-day streak! +${ev.coins} coins`);
        break;
      case 'streakSaved':
        toast(ev.days === 1 ? 'A streak freeze kept your streak alive.' : `${ev.days} streak freezes kept your streak alive.`, 'info');
        break;
      case 'streakLost':
        toast(`Your ${ev.days}-day streak ended. Start a new one today!`, 'info');
        break;
      case 'purchased':
        audio.chime('tap');
        toast(`${ITEM_BY_ID[ev.itemId]?.name ?? 'Item'} added to your collection.`);
        break;
      case 'unlocked':
        audio.chime('levelUp');
        companion.sayTopic('unlocked', 'normal');
        windows.sendUi({ kind: 'celebrate', celebration: { kind: 'unlocked', companionId: ev.companionId } });
        break;
      case 'itemUsed':
        companion.react('happy', 1600);
        companion.say(companion.line('fed'), 'normal', true);
        break;
      case 'dailyReward':
        audio.chime('reward');
        companion.sayTopic('reward', 'normal');
        break;
      case 'limitReached':
        notifier.show('Website allowance expired.', `${siteLabel(ev.pattern)} is over today’s limit.`, {
          page: 'sites',
          key: `limit:${ev.ruleId}`,
          gapMs: 10 * 60_000,
        });
        break;
      case 'taskDone':
        audio.chime('tap');
        companion.sayTopic('taskDone', 'normal');
        break;
      case 'newDay':
        if (d.onboarded) notifier.show('New missions available!', 'Fresh daily missions are waiting for you.', { page: 'missions', key: `day:${ev.day}`, gapMs: 12 * 3_600_000 });
        break;
      case 'tabClosed':
      case 'petted':
        break;
    }
  };

  engine.on('events', (events) => {
    for (const ev of events) {
      try {
        handle(ev);
      } catch {
        /* reactions must never break the app */
      }
    }
  });

  // Evening reminder when today's streak day is still missing.
  let remindedFor = '';
  const reminder = setInterval(() => {
    const d = engine.data;
    const now = Date.now();
    const today = dayKey(now);
    if (!d.onboarded || remindedFor === today || new Date(now).getHours() < 20) return;
    if (d.streak.current >= 2 && streakAtRisk(d.streak, today)) {
      remindedFor = today;
      notifier.show('Don’t lose your streak!', `A short session keeps your ${d.streak.current}-day streak going.`, { page: 'focus' });
      companion.say(`Don’t lose your ${d.streak.current}-day streak!`, 'normal');
    }
  }, 10 * 60_000);

  return () => clearInterval(reminder);
}
