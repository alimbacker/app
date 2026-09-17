// What companions say. `{name}` = companion name, `{user}` = your name, `{site}` = a site,
// `{n}` = a number, `{time}` = a clock time. Four voices keep personalities distinct.
import type { Voice } from '../constants/characters';

export type SpeechTopic =
  | 'greet'
  | 'idle'
  | 'poke'
  | 'focusStart'
  | 'focusHalf'
  | 'focusEnding'
  | 'focusDone'
  | 'earlyDone'
  | 'breakStart'
  | 'breakDone'
  | 'countdown'
  | 'complain'
  | 'complainAgain'
  | 'closed'
  | 'left'
  | 'snoozed'
  | 'levelUp'
  | 'evolved'
  | 'mission'
  | 'achievement'
  | 'sleepy'
  | 'taskDone'
  | 'goal'
  | 'streak'
  | 'reward'
  | 'focusGuard'
  | 'unlocked'
  | 'fed';

type Lines = Record<SpeechTopic, string[]>;

const SHARED: Partial<Lines> = {
  complain: ['Focus time is over. Let’s get back to work.'],
  focusEnding: ['Almost there!'],
  mission: ['Mission complete!'],
  streak: ['Your focus streak is growing!', '{n} days in a row!'],
};

const VOICES: Record<Voice, Lines> = {
  cheerful: {
    greet: ['Hi {user}! Ready to focus?', 'Hey {user}! Let’s do this!', 'I saved you a spot. Ready?'],
    idle: ['Just stretching my wings.', 'Your tabs look tidy today.', 'What should we tackle next?', 'Humming a little focus tune.'],
    poke: ['Hehe, that tickles!', 'Hi hi! Need a focus buddy?', 'You’re doing great today!', 'Boop!'],
    focusStart: ['Let’s do this! {n} minutes.', 'Focus time! I’ll keep watch.', 'Here we go!'],
    focusHalf: ['Halfway there. Stay focused.', 'Nice rhythm, keep going!'],
    focusEnding: ['Almost there!', 'Final stretch!'],
    focusDone: ['Great work!', 'Session done! Nice job!', 'Look at us go!'],
    earlyDone: ['Every minute counts. Nice job!', 'Wrapped up early. Still progress!'],
    breakStart: ['Break time! Grab some water.', 'Stretch those arms!'],
    breakDone: ['Break’s over. Back to work!', 'Feeling fresh? Let’s go!'],
    countdown: ['{site} time is up.', 'That’s the {site} limit!'],
    complain: ['Focus time is over. Let’s get back to work.', 'Psst… {site} is over the limit.'],
    complainAgain: ['Still on {site}? Come on, you’ve got this!', 'Back to work! Pretty please?'],
    closed: ['Poof! Distraction gone.', 'Tab closed. Back to it!'],
    left: ['Thank you! Back to the good stuff.', 'Yay, we’re back on track!'],
    snoozed: ['Okay! I’ll check again at {time}.', 'A little longer… until {time}.'],
    levelUp: ['Level {n}! I feel amazing!', 'Woohoo, level {n}!'],
    evolved: ['Whoa… I’ve grown!', 'Check out my new look!'],
    mission: ['Mission complete!', 'We did it!'],
    achievement: ['New badge! So shiny!', 'Achievement unlocked!'],
    sleepy: ['Yawn… a break would be nice.', 'I’m getting a little sleepy.'],
    taskDone: ['Checked off! Nice job!', 'One less thing!'],
    goal: ['Daily goal complete! Excellent work today!', 'Goal reached! You’re on fire!'],
    streak: ['Your focus streak is growing!', '{n} days in a row!'],
    reward: ['A present for you!', 'Daily reward, yay!'],
    focusGuard: ['Not during focus time!', 'That can wait until the break.'],
    unlocked: ['A new friend joined the hive!'],
    fed: ['Yum! Thank you!', 'Delicious!'],
  },
  gentle: {
    greet: ['Hello, {user}. Ready to focus?', 'Welcome back. Let’s take it one step at a time.', 'Hi {user}. Shall we begin?'],
    idle: ['Mm… peaceful today.', 'Take a slow breath with me.', 'I like it when it’s quiet like this.', 'Just resting my eyes.'],
    poke: ['Oh, hello there.', 'That’s nice.', 'Mm, I’m here.', 'You’re doing well.'],
    focusStart: ['Let’s settle in for {n} minutes.', 'Deep breath. Stay focused.', 'Quiet time begins.'],
    focusHalf: ['Halfway. Nice and steady.', 'You’re in a good flow.'],
    focusEnding: ['Almost there.', 'Just a little more.'],
    focusDone: ['Nicely done.', 'Great work. Rest a moment.', 'That was calm and steady.'],
    earlyDone: ['That still counts. Well done.', 'A gentle finish. Good work.'],
    breakStart: ['Time to rest your eyes.', 'Let’s breathe for a bit.'],
    breakDone: ['Feeling rested? Let’s continue.', 'Back to it, gently.'],
    countdown: ['{site} time is up.', 'That’s enough {site} for now.'],
    complain: ['Focus time is over. Let’s get back to work.', 'Let’s put {site} away for today.'],
    complainAgain: ['Still on {site}… shall we step away?', 'Let’s return to what matters.'],
    closed: ['There. Nice and quiet again.', 'Closed. Back to calm.'],
    left: ['Thank you. That’s better.', 'Good choice.'],
    snoozed: ['Alright. Until {time}, then.', 'I’ll wait until {time}.'],
    levelUp: ['Level {n}… I feel stronger.', 'We reached level {n}.'],
    evolved: ['Something changed… I’ve grown.', 'A new look, softly.'],
    mission: ['Mission complete.', 'We finished it together.'],
    achievement: ['A new achievement. Well earned.', 'Something to be proud of.'],
    sleepy: ['I’m a bit sleepy…', 'Could we rest soon?'],
    taskDone: ['One more done.', 'Checked off. Nice.'],
    goal: ['Daily goal complete. Excellent work today.', 'You reached today’s goal.'],
    streak: ['Your focus streak is growing.', '{n} calm days in a row.'],
    reward: ['A small gift for you.', 'Reward collected.'],
    focusGuard: ['Not now. We’re focusing.', 'Let’s save that for the break.'],
    unlocked: ['A new friend is here.'],
    fed: ['Thank you. That was lovely.', 'Mm, tasty.'],
  },
  wise: {
    greet: ['Good to see you, {user}. Ready to focus?', 'A fresh page, {user}. What’s first?', 'Let’s make today count.'],
    idle: ['Small steps compound.', 'Thinking about your next task.', 'Focus is a skill. You’re practising it.', 'Hmm… interesting.'],
    poke: ['Yes? I’m listening.', 'Curious, aren’t we?', 'Hello, partner.', 'Let’s stay sharp.'],
    focusStart: ['{n} minutes. One thing at a time.', 'Focus mode on. Stay focused.', 'Let’s think clearly.'],
    focusHalf: ['Halfway. Keep the thread.', 'Good progress so far.'],
    focusEnding: ['Almost there.', 'Finish the thought.'],
    focusDone: ['Well reasoned. Great work.', 'Session complete. Nice job.', 'That was productive.'],
    earlyDone: ['Progress is progress.', 'Ended early, but you moved forward.'],
    breakStart: ['Rest helps memory. Take a break.', 'Step back for a moment.'],
    breakDone: ['Break done. Back to work.', 'Refreshed? Let’s continue.'],
    countdown: ['{site} time is up.', 'The {site} allowance is spent.'],
    complain: ['Focus time is over. Let’s get back to work.', 'We agreed on {n} minutes for {site}.'],
    complainAgain: ['Still on {site}? Future you will thank you for leaving.', 'Back to work. You know it.'],
    closed: ['Distraction removed. Onward.', 'Tab closed. Let’s continue.'],
    left: ['Wise choice.', 'Good. Back to the task.'],
    snoozed: ['Snooze granted until {time}.', 'Noted. Back at {time}.'],
    levelUp: ['Level {n}. Knowledge grows.', 'Level {n} reached.'],
    evolved: ['I’ve evolved. Fascinating.', 'A new stage of growth.'],
    mission: ['Mission complete.', 'Objective reached.'],
    achievement: ['Achievement recorded.', 'That one’s worth remembering.'],
    sleepy: ['Energy low. A break is wise.', 'My thoughts are getting slow.'],
    taskDone: ['Task complete. Next.', 'Checked. Well done.'],
    goal: ['Daily goal complete. Excellent work today.', 'Goal reached. Consistency wins.'],
    streak: ['Your focus streak is growing.', '{n} days in a row. That’s a habit.'],
    reward: ['Reward collected.', 'A well-earned bonus.'],
    focusGuard: ['Not during focus time.', 'That can wait.'],
    unlocked: ['A new ally has joined.'],
    fed: ['Fuel for thought. Thanks.', 'Much appreciated.'],
  },
  bold: {
    greet: ['{user}! Let’s do this!', 'Ready to focus? I am!', 'Suit up, {user}. Time to work.'],
    idle: ['On patrol. All clear.', 'Standing by.', 'Nothing gets past me.', 'Ready when you are.'],
    poke: ['At your service!', 'Need backup?', 'Your focus is my mission!', 'Ha! Let’s go!'],
    focusStart: ['Mission started: {n} minutes!', 'Shields up. Stay focused!', 'Let’s do this!'],
    focusHalf: ['Halfway! Keep pushing!', 'Strong work. Hold the line.'],
    focusEnding: ['Almost there! Finish strong!', 'Final push!'],
    focusDone: ['Mission accomplished! Great work!', 'Victory! Nice job!', 'That’s how it’s done!'],
    earlyDone: ['Retreat is fine. We’ll win the next one.', 'Some progress beats none.'],
    breakStart: ['Recharge time.', 'Even heroes rest.'],
    breakDone: ['Recharged! Back to work!', 'Break over. Move out!'],
    countdown: ['{site} time is up!', 'Limit reached on {site}!'],
    complain: ['Focus time is over. Let’s get back to work.', '{site} is past its limit!'],
    complainAgain: ['Still on {site}? You’re stronger than that!', 'Back to work, partner!'],
    closed: ['Distraction neutralised!', 'Tab down. Back to it!'],
    left: ['That’s the spirit!', 'Good move!'],
    snoozed: ['Copy that. Standing down until {time}.', 'Fine. Back at {time}.'],
    levelUp: ['Power level up! Level {n}!', 'Level {n}! Unstoppable!'],
    evolved: ['Evolution complete!', 'New power unlocked!'],
    mission: ['Mission complete!', 'Objective secured!'],
    achievement: ['Medal earned!', 'Achievement secured!'],
    sleepy: ['Energy low… need a recharge.', 'Running on reserves.'],
    taskDone: ['Target cleared!', 'Task down!'],
    goal: ['Daily goal complete! Excellent work today!', 'Goal secured! Outstanding!'],
    streak: ['Your focus streak is growing!', '{n}-day streak! Legendary!'],
    reward: ['Supply drop received!', 'Reward secured!'],
    focusGuard: ['Negative! Focus time!', 'That site waits until the break.'],
    unlocked: ['A new hero joins the team!'],
    fed: ['Fuel up! Thanks!', 'Power restored!'],
  },
};

export function pickLine(voice: Voice, topic: SpeechTopic, vars: Record<string, string | number> = {}, rnd = Math.random): string {
  const pool = VOICES[voice]?.[topic] ?? SHARED[topic] ?? [];
  const line = pool[Math.floor(rnd() * pool.length)] ?? '';
  return line
    .replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined && vars[k] !== '' ? String(vars[k]) : k === 'user' ? 'friend' : ''))
    .replace(/\s+([!?.,])/g, '$1')
    .trim();
}
