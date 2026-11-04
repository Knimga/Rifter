// NPC dialogue: what an NPC says when the party speaks to it. Each NPC has conversations (DIALOGUES, by its id); the
// first whose conditions hold for the party's quests (`when`) is the one spoken, so what an NPC says changes as quests
// are taken and completed. A conversation opens with its statements, said one at a time, the party asking a question
// between some of them (its only choice, before the NPC answers); then either it offers topics to ask about (each
// spoken through to its end, then back to the opening) or, with none, the talk ends and its effects happen (a quest
// given or moved on, a key given). Shown by NpcDialogue (components/NpcDialogue.tsx) over the NPC's head.
import type { DungeonKey } from './dungeons';
import { hasTaken, questHolds, type QuestCondition, type QuestLog } from './quests';

/**
 * What finishing a conversation or a topic does (GameScreen, runDialogueEffects): give the party a quest, move one it
 * has on to its next step, complete one, or put a rift key on the party's keyring (a key it found without knowing
 * what it was, named at last).
 */
export type DialogueEffect =
  | { kind: 'giveQuest'; quest: string }
  | { kind: 'advanceQuest'; quest: string }
  | { kind: 'completeQuest'; quest: string }
  | { kind: 'giveKey'; key: DungeonKey };

/** A topic the party can ask an NPC about. */
export interface DialogueTopic {
  id: string;
  /** What the party asks: the topic's choice under the opening. */
  prompt: string;
  /** What the NPC says, in order: each statement a few sentences, shown one at a time (none: a farewell's, maybe). */
  statements: string[];
  /** What finishing it does. */
  effects?: readonly DialogueEffect[];
  /** It ends the talk once said (a farewell), instead of going back to the opening. */
  ends?: boolean;
}

/**
 * A line of a conversation's opening: a statement the NPC says (a few sentences), or a question the party asks
 * (`ask`): offered under the statement before it as the party's only choice, the NPC's answer the statements after it.
 */
export type OpeningLine = string | { ask: string };

/** One of an NPC's conversations (see the file comment). */
export interface Conversation {
  /** When it is spoken: all of these hold (none: always, as the last of an NPC's, its usual words). */
  when?: readonly QuestCondition[];
  /**
   * What it says first, each statement shown one at a time, with the party's questions between some of them (each
   * after a statement, never first or last).
   */
  opening: OpeningLine[];
  /** Topics offered once the opening is said; none: the talk ends after the opening, and its `effects` happen. */
  topics?: DialogueTopic[];
  /** With no topics: what saying the opening through does. */
  effects?: readonly DialogueEffect[];
}

/** The usual last topic of a conversation with topics: the party takes its leave, and the talk ends at once. */
const FAREWELL: DialogueTopic = { id: 'farewell', prompt: 'Farewell.', statements: [], ends: true };

/** Each speaking NPC's conversations, by its id (NPCS), the first that holds being spoken. */
export const DIALOGUES: Record<string, Conversation[]> = {
  rix: [
    // The party has just come through the door from the Dark Tunnel (he greets it at once: SANCTUM.doorGreeter): its
    // escape is over, and he sends it to Ardas
    {
      when: [{ notTaken: 'seek-ardas' }],
      opening: [
        "Newcomers! Three of you!",
        "It's been a while since there was a new face around here...",
        "You must be confused. Let me guess... you remember nothing? Just woke up in a dark hole? Heh... Judging by the voidblood on your weapons, at least you remember how to fight.",
        "Anyways... Welcome to the Sanctum. This is the only stable place in the In-Between. I'm Rix. And this is Gorn. He doesn't talk much. No mouth, you see.",
        "What's the In-Between? You ARE fresh out the rift, aren't you? Well... I hate to break it to you but...",
        "You're dead.",
        "You definitely died. Or at least... back in YOUR world you died. Seems like Voth had other plans for you though, and brought you here...",
        "Enough from me though. Go talk to Ardas - he'll be able to explain all this better. Maybe tell you what to do next. Take a minute to look around, catch your breath. Go see him when you're ready.",
        "And welcome to the end of nowhere. Good luck!"
    ],
      effects: [{ kind: 'completeQuest', quest: 'escape-dark-tunnel' }, { kind: 'giveQuest', quest: 'seek-ardas' }],
    },
    { 
      when: [{ active: 'seek-ardas' }],
      opening: ['Go speak to Ardas.'],
      topics: [FAREWELL]
    },
    {
      opening: ["Gorn and I guard this door. It's an ancient door, well-warded, but it's the only way in, and I can hear things scratching sometimes, from the other side..."]
    }
  ],
  ardas: [
    // The party comes from Rix: Ardas tells it where it is and what happened to it, completes Rix's quest and sends it
    // on to Ileena and the Rifter
    {
      when: [{notTaken: 'seek-ardas'}],
      opening: ["Newcomers! Ah... Has Rix spoken to you? He should've been guarding the door..."]
    },
    {
      when: [{ active: 'seek-ardas' }],
      opening: [
        "Ah... More have come through the Dark Tunnel. And three at once! Sit, if you are tired. I am Ardas, a friend, and lost, just like you.",
        "Wait... I can feel... What is that you hold? That glowing stone... Ah! A rift key! How on earth did you come to it?",
        "You simply FOUND it? Lying on the ground? It must've been placed there for you... This is certainly news!",
        "Forgive me — you have only just arrived. We will speak of the key. But first, I'm sure you have questions. I will try my best to answer.",
        { ask: 'What is this place?' },
        "This is the Sanctum. It is an ancient place, built long ago by someone powerful enough to place the implacable wards that protect it. The void presses on these stones from every side, you see. We're a tiny bubble of calm in an ocean of chaos.",
        { ask: "What do you mean 'the void'?" },
        "Our reality consists of many planes. The void is the space between them; the canvas upon which things are built. Just beyond these walls it churns, timeless and endless.",
        "You're in the void, right now. The 'In-Between' as some call it. It's the domain of Voth — a strange, aloof, primordial god of unguessable motivations.",
        { ask: 'Rix said I was dead...' },
        "Ah... He's never been one to soften the blow. Yes. By all accounts, you are dead in your plane of origin.",
        "Only Voth's hand could've plucked you from your realm as you were dying, interrupting your soul's normal journey to its afterlife. Why He did so is unknowable... But all of us here were so selected... and somehow washed up here.",
        "Some of us have been here for years. As a sage, I have tried to use my knowledge and skills to learn why we are here, and whether we might ever return to our own worlds. But I have been unsuccessful.",
        { ask: 'So what do I do now?' },
        "Now we speak of the stone you found. It is a rift key — no ordinary object. It allows passage to another realm.",
        "What's more, you said you simply 'found' it in the Dark Tunnel... That cannot be by chance. I surmise it was placed there, maybe by Voth Himself. He may have plans for you, or else He merely seeks entertainment.",
        "Either way, we shouldn't waste this opportunity. Exploring beyond the Sanctum is our only hope at solving the mystery of our continued existence.",
        "Our resident arcanist, Ileena, has constructed a device that reads a key's signature and opens a portal to its realm of origin. We call it the Rifter.",
        "If you want any hope of returning to your realm, speak with Ileena, and use the rift key.",
      ],
      // The strange object the party found in the Dark Tunnel is a rift key, now known: it goes on the keyring
      effects: [{ kind: 'completeQuest', quest: 'seek-ardas' }, { kind: 'giveKey', key: 'crypt' }, { kind: 'giveQuest', quest: 'use-the-rifter' }],
    },
    // Back from the rift, its boss defeated: Ardas completes Ileena's errand (placeholder text: Ardas's words to come)
    {
      when: [{ active: 'use-the-rifter', step: 'return-ardas' }],
      opening: ["[Ardas's words as the party returns from the rift.]"],
      effects: [{ kind: 'completeQuest', quest: 'use-the-rifter' }],
    },
    {
      when: [{ active: 'use-the-rifter', step: 'speak-ileena' }],
      opening: ['Have you spoken with Ileena?'],
      topics: [FAREWELL],
    },
    {
      opening: ["Ah... Still here. Good. What would you like to know?"],
      topics: [
        {
          id: 'sanctum',
          prompt: 'What is this place?',
          statements: [
            'This is the Sanctum. Old walls, older wards. Whoever raised them knew what waits beyond, and built against it.',
            'The void presses on these stones from every side. The sigils on the walls still hold, though fewer of them glow than once did.',
          ],
        },
        {
          id: 'ardas',
          prompt: 'Who are you?',
          statements: [
            'A keeper of what little is still written down. Names, mostly. Some of them were travellers like you.',
          ],
        },
        FAREWELL,
      ],
    },
  ],
  ileena: [
    // Ardas sent the party: she has it use its rift key in her Rifter
    {
      when: [{ active: 'use-the-rifter', step: 'speak-ileena' }],
      opening: [
        '...if I can just... invert the luminal vector... create a localized thaumic fold... the oscillator might just... vibrate the etheric weave... which would allow separate temporal filaments... AH!!',
        "Oh... Hi. Right. Hello. You're new. Welcome! Ah...",
        "You have a KEY? YES. FANTASTIC. This'll be a chance to finally test my calibration adjustments to the resonance stabilizer rods. A second test is necessary. I will NOT siphon power from the crystal-lattice again... Not after Tuesday.",
        "The Rifter? No no no... THIS is the Sympathetic Chrono-Spatial Astro-singularity Gateway Assembly. That silly Ardas... My device, my name! Not my fault he doesn't like consonants.",
        "Right. So. Here's what you need to know: we're in the void. The void sits between every plane, and every plane is built upon it. Therefore, the void is closer to all planes than the planes are to each other.",
        "Meaning planar travel HERE is far easier and requires far less energy. That's why I've been able to build this device with such paltry resources.",
        'Those rift keys... they lead to other planes. Mini-dimensions, so to speak, each with its own aspect. These are horribly dangerous places. Ardas did mention horrible danger, right? Terrible danger. Like I\'m staying right here. You go.',
        "Anyways... each mini-dimension contains a powerful guardian or master at the end. Defeating them is essential. You might die though. Well... you won't ACTUALLY die. You're already dead. You'll just return here, and you'll need to re-enter and try again.",
        'Place the key in the macro-aetheric contact aperture... er, the RECEPTACLE, I mean, there on the right. Enter the rift. Defeat the guardian at the end. Return to Ardas.',
      ],
      effects: [{ kind: 'advanceQuest', quest: 'use-the-rifter' }],
    },
    {
      when: [{active: 'use-the-rifter', step: 'enter-rift'}],
      opening: [
        "Use the key and defeat the guardian. I'll take measurements from here."
      ]
    },
    {
      opening: [
        "A chance to study trans-planar topology and dimensional vectoring from INSIDE the void itself?? I'm the luckiest girl alive. What do you want to know?"
      ],
      topics: [
        {
          id: '',
          prompt: '',
          statements: []
        },
        FAREWELL
      ]
    }
  ],
};

/** Whether an NPC has anything to say (any conversation). */
export const speaks = (npcId: string): boolean => !!DIALOGUES[npcId]?.length;

/** The conversation an NPC speaks now: its first whose conditions all hold for the party's quests. */
export const conversationOf = (npcId: string, log: QuestLog): Conversation | undefined =>
  DIALOGUES[npcId]?.find((c) => (c.when ?? []).every((w) => questHolds(log, w)));

/**
 * A quest marker: `!` where something gives the party a quest it hasn't taken, `?` where something completes one it
 * has (over an NPC, before a topic). Null: neither.
 */
export type QuestMark = '!' | '?';

/**
 * The marker for what a list of effects does: completing or moving on a quest the party has (?) over giving a new one
 * (!).
 */
export function effectsMark(effects: readonly DialogueEffect[] | undefined, log: QuestLog): QuestMark | null {
  if (effects?.some((e) => (e.kind === 'completeQuest' || e.kind === 'advanceQuest') && log.active.includes(e.quest))) return '?';
  if (effects?.some((e) => e.kind === 'giveQuest' && !hasTaken(log, e.quest))) return '!';
  return null;
}

/** The marker over an NPC: what its conversation now, or any of its topics, leads to (? over !). */
export function npcQuestMark(npcId: string, log: QuestLog): QuestMark | null {
  const c = conversationOf(npcId, log);
  if (!c) return null;
  const marks = [effectsMark(c.effects, log), ...(c.topics ?? []).map((t) => effectsMark(t.effects, log))];
  return marks.includes('?') ? '?' : marks.includes('!') ? '!' : null;
}
