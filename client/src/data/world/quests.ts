// Quests: tasks NPCs give the party (a dialogue's effects give, advance and complete them: data/world/dialogue.ts). A
// quest may go through steps, each with its objective (what the tracker shows), done by a dialogue or by something the
// party does (entering a dungeon, picking up a rift key there: a QuestEvent). The party keeps a log of the quests it has taken (active, each at its step) and finished
// (completed); what NPCs say, and what can be used (the Rifter), can depend on it.
import type { DungeonKey } from './dungeons';

/**
 * Something the party does that can finish a quest step (QuestStep.until): enter a dungeon (through the Rifter's rift),
 * or pick up a rift key lying in a dungeon (a boss's drop).
 */
export type QuestEvent = { enterRift: DungeonKey } | { pickUpKeyIn: DungeonKey };

/** A step of a quest: its objective, and what finishes it if not a dialogue (`until`). */
export interface QuestStep {
  id: string;
  /** What the party must do now, as the quest tracker shows it under the quest's name. */
  objective: string;
  /** What the party does that finishes it (the quest moves on to its next step). */
  until?: QuestEvent;
  /**
   * Where its quest marker (?) shows while the quest is at it, besides NPCs': over the Rifter's receptacle, or over the
   * rift keys lying on the floor of the dungeon its `until` names.
   */
  marker?: 'rifter' | 'droppedKey';
}

export interface QuestData {
  id: string;
  /** Its name, as the quest tracker shows it. */
  name: string;
  /** Its steps, in order (none: one objective, its name). */
  steps?: readonly QuestStep[];
}

export const QUESTS: QuestData[] = [
  // The opening: the party finds a rift key in the Dark Tunnel, where it arrived, and must find its way out (Rix greets
  // it at the Sanctum's door, completing it)
  { id: 'escape-dark-tunnel', name: 'Escape the Dark Tunnel' },
  // Rix sends the party to Ardas
  { id: 'seek-ardas', name: 'Seek Out Ardas' },
  // Ardas sends the party to Ileena, who has it use its rift key in her Rifter: into the Crypt, past its guardian (the
  // keystone it drops picked up), and back to Ardas
  {
    id: 'use-the-rifter', name: 'Use the Rifter',
    steps: [
      { id: 'speak-ileena', objective: 'Speak with Ileena' },
      { id: 'enter-rift', objective: 'Enter the Rift', until: { enterRift: 'crypt' }, marker: 'rifter' },
      { id: 'defeat-guardian', objective: 'Defeat the Guardian', until: { pickUpKeyIn: 'crypt' }, marker: 'droppedKey' },
      { id: 'return-ardas', objective: 'Return to Ardas' },
    ],
  },
  // Ardas gives it on completing "Use the Rifter": the party keeps exploring rifts (its one step has no way to finish yet)
  {
    id: 'explore-the-rifts', name: 'Explore the Rifts',
    steps: [
      { id: 'keep-exploring', objective: 'Keep exploring rifts' },
    ],
  },
];

/** A quest by id. */
export function quest(id: string): QuestData {
  const q = QUESTS.find((x) => x.id === id);
  if (!q) throw new Error(`no quest '${id}' (data/world/quests.ts)`);
  return q;
}

/**
 * The party's quests: the ones it has taken and not yet finished (each at its step: `steps`, by quest id, its index;
 * absent, the first), and the ones it has finished, each in order.
 */
export interface QuestLog {
  active: readonly string[];
  completed: readonly string[];
  steps: Readonly<Record<string, number>>;
}

export const NO_QUESTS: QuestLog = { active: [], completed: [], steps: {} };

/** Whether the party has taken a quest at all (whether still active or completed). */
export const hasTaken = (log: QuestLog, id: string) => log.active.includes(id) || log.completed.includes(id);

/** The step an active quest is at (its index), or -1 if it isn't active. */
export const stepIndex = (log: QuestLog, id: string): number => (log.active.includes(id) ? log.steps[id] ?? 0 : -1);

/** The step an active quest is at, if it has steps. */
export const currentStep = (log: QuestLog, id: string): QuestStep | undefined => quest(id).steps?.[stepIndex(log, id)];

/** The log with a quest taken (once: one already taken stays as it is), at its first step. */
export const takeQuest = (log: QuestLog, id: string): QuestLog =>
  hasTaken(log, id) ? log : { ...log, active: [...log.active, id], steps: { ...log.steps, [id]: 0 } };

/** The log with an active quest moved on to its next step (one that isn't active, or is at its last, stays as it is). */
export function advanceQuest(log: QuestLog, id: string): QuestLog {
  const i = stepIndex(log, id), steps = quest(id).steps ?? [];
  return i < 0 || i + 1 >= steps.length ? log : { ...log, steps: { ...log.steps, [id]: i + 1 } };
}

/** The log with an active quest completed (one that isn't active stays as it is). */
export function completeQuest(log: QuestLog, id: string): QuestLog {
  if (!log.active.includes(id)) return log;
  const { [id]: _done, ...steps } = log.steps;
  return { active: log.active.filter((q) => q !== id), completed: [...log.completed, id], steps };
}

/** Whether a quest step is finished by what the party just did. */
const finishes = (until: QuestEvent | undefined, event: QuestEvent): boolean =>
  !!until && ('enterRift' in until ? 'enterRift' in event && event.enterRift === until.enterRift
    : 'pickUpKeyIn' in event && event.pickUpKeyIn === until.pickUpKeyIn);

/** The active quests whose step is finished by what the party just did. */
export const questsFinishedBy = (log: QuestLog, event: QuestEvent): string[] =>
  log.active.filter((id) => finishes(currentStep(log, id)?.until, event));

/** The log with every active quest whose step is finished by what the party just did moved on. */
export const questEvent = (log: QuestLog, event: QuestEvent): QuestLog =>
  questsFinishedBy(log, event).reduce(advanceQuest, log);

/**
 * Where the party stands with a quest: it is `active` (with `step`: at that step), `completed`, `notTaken` (neither
 * yet), or (`reached`) active at that step or a later one, or completed.
 */
export type QuestCondition =
  | { active: string; step?: string }
  | { completed: string }
  | { notTaken: string }
  | { reached: string; step: string };

/** Whether a quest condition holds for the log. */
export function questHolds(log: QuestLog, c: QuestCondition): boolean {
  if ('active' in c) return log.active.includes(c.active) && (!c.step || currentStep(log, c.active)?.id === c.step);
  if ('completed' in c) return log.completed.includes(c.completed);
  if ('reached' in c) {
    if (log.completed.includes(c.reached)) return true;
    const at = (quest(c.reached).steps ?? []).findIndex((s) => s.id === c.step);
    return stepIndex(log, c.reached) >= at && at >= 0;
  }
  return !hasTaken(log, c.notTaken);
}
