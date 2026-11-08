// The party's quests (data/world/quests.ts): the ones it has taken (each at its step) and finished, shared by the whole
// party like the keyring. Dialogue gives, moves on and completes them (its effects: useDialogue); what the party does
// (a QuestEvent: entering a dungeon, picking up a key there) moves on the quests waiting on it.
import { useCallback, useState } from 'react';
import { NO_QUESTS, advanceQuest, completeQuest, questEvent, takeQuest, type QuestEvent, type QuestLog } from '../data/world/quests';

export function useQuests(start: QuestLog = NO_QUESTS) {
  const [log, setLog] = useState<QuestLog>(start);

  /** The party takes a quest (once). */
  const take = useCallback((id: string) => setLog((prev) => takeQuest(prev, id)), []);

  /** An active quest moves on to its next step. */
  const advance = useCallback((id: string) => setLog((prev) => advanceQuest(prev, id)), []);

  /** The party completes an active quest. */
  const complete = useCallback((id: string) => setLog((prev) => completeQuest(prev, id)), []);

  /** The party did something: the quests waiting on it move on. */
  const event = useCallback((e: QuestEvent) => setLog((prev) => questEvent(prev, e)), []);

  return { log, take, advance, complete, event };
}
