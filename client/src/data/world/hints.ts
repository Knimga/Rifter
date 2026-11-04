// Hints: short tips for new players, each shown once, when something first happens in the game (its trigger), pointing
// at the part of the HUD it is about. One shows at a time, the rest waiting their turn (useHints); a hint goes once
// the player dismisses it or does what it says (opens the party window, for a hint pointing at the Party button).

/** What can bring hints up: the game beginning (the party's arrival told, the HUD shown). */
export type HintTrigger = 'gameStart';

/** What a hint points at, on the HUD. */
export type HintTarget = 'party';

export interface HintData {
  id: string;
  trigger: HintTrigger;
  target: HintTarget;
  /** What it says: plain text, the part in `strong` emphasized after it. */
  text: string;
  strong?: string;
}

export const HINTS: readonly HintData[] = [
  {
    id: 'party-window', trigger: 'gameStart', target: 'party',
    text: 'Your party: gear, stats, abilities and keys.', strong: 'Click Party or press I.',
  },
];
