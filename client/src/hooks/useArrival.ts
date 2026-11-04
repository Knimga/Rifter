// The game's opening arrival (GameScreen): the party comes into the Dark Tunnel through portals. Once the map has
// faded in, a portal opens on the leader's tile and the leader fades in from it (MapUnit.fadeIn); it closes. Then a
// portal opens on each other member's tile, and they fade in; those close too. Then the arrival is told (Narration,
// ARRIVAL_LINES) over the dimmed map, and when that is done the game begins.
import { useEffect, useState } from 'react';

/** Where the arrival is, in order: the last ('told') lasts until the narration is done. */
type Step = 'wait' | 'leaderPortal' | 'leader' | 'leaderClose' | 'portals' | 'followers' | 'close' | 'told';
const STEPS: readonly Step[] = ['wait', 'leaderPortal', 'leader', 'leaderClose', 'portals', 'followers', 'close', 'told'];

/**
 * How long each step lasts before the next (ms): the map's slow fade in, a portal opening (its 'open' animation) before
 * a member steps out of it, the member fading in (FADE_IN_MS) with a beat to spare, a portal closing ('close').
 */
const STEP_MS: Record<Exclude<Step, 'told'>, number> = {
  wait: 1700, leaderPortal: 800, leader: 1300, leaderClose: 900, portals: 800, followers: 1300, close: 900,
};

/** A portal open on a member's tile (its party index), opening or (`closing`) collapsing. */
export interface ArrivalPortal {
  member: number;
  closing: boolean;
}

/**
 * The arrival, once `running` (the map is shown): how many members are on the map yet (the first `shown`, in party
 * order), the portals open, and whether it is being told (the narration's turn).
 */
export function useArrival(running: boolean): { shown: number; portals: ArrivalPortal[]; telling: boolean } {
  const [step, setStep] = useState<Step>('wait');
  useEffect(() => {
    if (!running || step === 'told') return;
    const id = setTimeout(() => setStep(STEPS[STEPS.indexOf(step) + 1]), STEP_MS[step]);
    return () => clearTimeout(id);
  }, [running, step]);

  const at = STEPS.indexOf(step);
  const past = (s: Step) => at >= STEPS.indexOf(s);
  const shown = past('followers') ? 3 : past('leader') ? 1 : 0;
  const portals: ArrivalPortal[] =
    step === 'leaderPortal' || step === 'leader' ? [{ member: 0, closing: false }]
      : step === 'leaderClose' ? [{ member: 0, closing: true }]
        : step === 'portals' || step === 'followers' ? [1, 2].map((member) => ({ member, closing: false }))
          : step === 'close' ? [1, 2].map((member) => ({ member, closing: true }))
            : [];
  return { shown, portals, telling: step === 'told' };
}
