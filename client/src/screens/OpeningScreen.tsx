// The game's opening, between forming the party and waking in the Dark Tunnel: out of black, a swirl of see-through
// violet and blue light fades in slowly (VoidSwirl), and the fall is told (Narration: FALLING_LINES); then it fades
// slowly back to black and the game begins (App: GameScreen's opening).
import { useEffect, useState } from 'react';
import Narration from '../components/Narration';
import VoidSwirl from '../components/ui/VoidSwirl';
import { FALLING_LINES } from '../data/world/opening';

/** How long the screen takes to fade in from black, and back to it (ms): slow, like falling asleep. */
export const OPENING_FADE_MS = 1500;

export default function OpeningScreen({ onDone }: { onDone: () => void }) {
  // Fading in (the narration waits for it), telling, or fading out
  const [phase, setPhase] = useState<'in' | 'telling' | 'out'>('in');
  useEffect(() => {
    if (phase === 'telling') return;
    const id = setTimeout(phase === 'in' ? () => setPhase('telling') : onDone, OPENING_FADE_MS);
    return () => clearTimeout(id);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps -- onDone is App's, called once

  return (
    <div className="fixed inset-0 bg-[var(--rift-black)]">
      <VoidSwirl className="absolute inset-0" />
      <div className="absolute inset-0 flex items-center justify-center">
        {phase === 'telling' && <Narration lines={FALLING_LINES} onDone={() => setPhase('out')} />}
      </div>
      {/* Black, lifting as it opens (a CSS animation from the first frame), then falling again to close */}
      <div aria-hidden="true" className="absolute inset-0 bg-[var(--rift-black)] pointer-events-none"
        style={{ animation: `${phase === 'out' ? 'rf-dim-in' : 'rf-uncover'} ${OPENING_FADE_MS}ms ease-in-out both` }} />
    </div>
  );
}
