// Talking to the Sanctum's NPCs, and what dialogue and the party's deeds do to its quests (GameScreen). The NPC the
// leader is speaking to (its window open), the conversation it speaks, and where each NPC faces: it turns to the
// leader when spoken to, and back to its own way (the tile in front of it) when the talk ends.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAdjacent, type Pos } from '../data/world/grid';
import { SANCTUM, type NpcPlacement } from '../data/world/sanctum';
import { npc } from '../data/world/npcs';
import { conversationOf, npcQuestMark, type Conversation, type DialogueEffect, type DialogueTopic, type QuestMark } from '../data/world/dialogue';
import { quest, questsFinishedBy, stepIndex, type QuestEvent } from '../data/world/quests';
import type { DungeonKey } from '../data/world/dungeons';
import { keyReceived } from '../data/world/rifts';
import type { UnitAim } from '../components/ModelLayer';
import type { useQuests } from './useQuests';
import type { Announce } from './useAnnouncements';
import { useGreeting, type useScenes } from './useScenes';

type Scenes = ReturnType<typeof useScenes>;

/** The color a quest's news is announced in. */
const QUEST_NEWS_COLOR = 'var(--rift-quest-pale)';

export function useDialogue({ quests, scenes, location, playerPos, otherWindowOpen, announce, addKey, endVisit }: {
  quests: ReturnType<typeof useQuests>;
  scenes: Pick<Scenes, 'scene' | 'greetingDue' | 'end'>;
  location: 'sanctum' | 'dungeon';
  /** The leader's tile: a talk lasts while it stays beside the NPC. */
  playerPos: Pos;
  /** Another window is open (the party's, the Rifter's, the testing tools'): it ends the talk. */
  otherWindowOpen: boolean;
  /** Announces a quest's news or a key received, over the map (useAnnouncements). */
  announce: Announce;
  /** Put a rift key on the keyring (useKeyring). */
  addKey: (key: DungeonKey) => void;
  /** The vendor's visit is over (useVendor). */
  endVisit: () => void;
}) {
  const [talkingTo, setTalkingTo] = useState<NpcPlacement | null>(null);
  // Each talk's number: a new talk with a speaking NPC starts its conversation over
  const [talkCount, setTalkCount] = useState(0);
  // The conversation a speaking NPC speaks this talk: the one that held as the talk began (it stays the same while
  // the talk changes the party's quests)
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [npcAims, setNpcAims] = useState<Record<string, UnitAim>>({});
  const npcAimSeq = useRef(0);
  const aimNpc = (id: string, at: Pos) => setNpcAims(prev => ({ ...prev, [id]: { x: at.x, y: at.y, seq: ++npcAimSeq.current } }));

  /** Speak to an NPC, the leader at `leaderAt` (after a walk up to it, not yet the leader's tile here). */
  const talkTo = (id: string, leaderAt: Pos = playerPos) => {
    const placed = SANCTUM.npcs.find(n => n.id === id);
    if (!placed) return;
    setTalkingTo(placed);
    setTalkCount(n => n + 1);
    setConversation(conversationOf(id, quests.log) ?? null);
    aimNpc(id, leaderAt);
  };
  const endTalk = useCallback(() => {
    if (!talkingTo) return;
    aimNpc(talkingTo.id, { x: talkingTo.pos.x + talkingTo.facing[0], y: talkingTo.pos.y + talkingTo.facing[1] });
    setTalkingTo(null);
    endVisit(); // a trade can only be undone during the visit it was made in
  }, [talkingTo, endVisit]);
  // Walking away (the leader no longer beside it) or leaving the Sanctum ends the talk, as does opening any window
  // (a service NPC's own window is its talk)
  useEffect(() => {
    if (talkingTo && (location !== 'sanctum' || !isAdjacent(playerPos, talkingTo.pos) || otherWindowOpen)) endTalk();
  }, [talkingTo, location, playerPos, otherWindowOpen, endTalk]);

  /**
   * What finishing a conversation or topic does: a quest taken, moved on or completed, a rift key put on the keyring
   * (each announced over the map).
   */
  const runDialogueEffects = (effects: readonly DialogueEffect[] | undefined) => {
    for (const e of effects ?? []) {
      if (e.kind === 'giveQuest') {
        quests.take(e.quest);
        announce(`New quest: ${quest(e.quest).name}`, QUEST_NEWS_COLOR);
      } else if (e.kind === 'advanceQuest') {
        const next = quest(e.quest).steps?.[stepIndex(quests.log, e.quest) + 1];
        quests.advance(e.quest);
        if (next) announce(`New objective: ${next.objective}`, QUEST_NEWS_COLOR);
      } else if (e.kind === 'completeQuest') {
        quests.complete(e.quest);
        announce(`Quest complete: ${quest(e.quest).name}`, QUEST_NEWS_COLOR);
      } else if (e.kind === 'giveKey') {
        addKey(e.key);
        const received = keyReceived(e.key);
        announce(received.text, received.color);
      }
    }
  };
  /** The speaking NPC finished a topic it was asked about: what it does (its effects). */
  const finishTopic = (topic: DialogueTopic) => runDialogueEffects(topic.effects);
  /** The speaking NPC finished its conversation: what it does (a topic-less one's effects), and the talk ends. */
  const finishConversation = () => {
    if (talkingTo) runDialogueEffects(conversation?.effects);
    endTalk();
    if (scenes.scene === 'greeting') scenes.end();
  };
  useGreeting(scenes.greetingDue, talkingTo, talkTo);

  /**
   * The party did something (entered a dungeon, picked up a key there): the quests waiting on it move on, their next
   * objective announced over the map.
   */
  const questDid = (event: QuestEvent) => {
    for (const id of questsFinishedBy(quests.log, event)) {
      const next = quest(id).steps?.[stepIndex(quests.log, id) + 1];
      if (next) announce(`New objective: ${next.objective}`, QUEST_NEWS_COLOR);
    }
    quests.event(event);
  };

  // The quest marker over each NPC (! a quest to take, ? one to hand in), from what it would say now
  const questMarks = useMemo(() => {
    const out: Record<string, QuestMark> = {};
    for (const n of SANCTUM.npcs) {
      const mark = npcQuestMark(n.id, quests.log);
      if (mark) out[n.id] = mark;
    }
    return out;
  }, [quests.log]);

  return {
    /** The NPC the leader is talking to (a service NPC's window open, or its conversation). */
    talkingTo,
    talkTo,
    endTalk,
    npcAims,
    /** The NPC speaking now, if the party is talking to one without a service (a service opens its window instead). */
    speaking: talkingTo && !npc(talkingTo.id).service && conversation ? { npcId: talkingTo.id, talk: talkCount, conversation } : null,
    runDialogueEffects,
    finishTopic,
    finishConversation,
    questDid,
    questMarks,
  };
}
