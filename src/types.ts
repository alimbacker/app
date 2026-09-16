export type CompanionKind='pet'|'hero';
export type Companion={id:string;name:string;kind:CompanionKind;personality:string;power:string;rarity:string;unlockLevel:number};
export type Task={id:string;title:string;description:string;priority:'low'|'medium'|'high';due?:string;estimate:number;completed:boolean};
export type Rule={id:string;site:string;minutes:number;enabled:boolean;remaining:number;usedToday:number};
export type Mission={id:string;title:string;description:string;rewardXp:number;rewardCoins:number;progress:number;target:number;done:boolean};
export type Stats={focusMinutes:number;sessions:number;tasksCompleted:number;currentStreak:number;longestStreak:number;lastFocusDate?:string};
export type State={userName:string;companionName:string;companionId:string;level:number;xp:number;coins:number;happiness:number;energy:number;dailyGoal:number;focusMinutesToday:number;timerMinutes?:number;timerReward?:number;rules:Rule[];tasks:Task[];missions:Mission[];stats:Stats;settings:{patrol:boolean;enforcement:'close'|'complain';countdown:number;snooze:number;position:'bottom'|'top'|'left'|'right'|'free';wander:boolean;size:number;speed:number;alwaysOnTop:boolean;speech:boolean;notifications:boolean;startup:boolean;theme:'dark'|'light'|'system'};streakDates:string[];unlocked:string[]};
