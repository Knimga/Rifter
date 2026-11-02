// A pulse of color around the edge of the game screen, played once when it mounts (render it with a new key to play it
// again): a gradient in from all four edges that fades up and away. A level-up's is the level-up yellow, reaching
// about 200px in; combat starting gives a quicker dark red one, reaching about 250px. Over the map, under the HUD; it
// never takes a click.
import type { CSSProperties } from 'react';

/** Each pulse: its color, how far in (px) its gradient reaches, and how long it lasts (ms). */
const PULSES = {
  levelUp: { color: 'var(--rift-levelup)', reach: 200, ms: 1800 },
  combat: { color: 'var(--pulse-combat)', reach: 250, ms: 900 },
} as const;

export default function EdgePulse({ kind }: { kind: keyof typeof PULSES }) {
  const { color, reach, ms } = PULSES[kind];
  return (
    <div aria-hidden="true" className="rf-edge-pulse"
      style={{ ['--pc' as string]: color, ['--reach' as string]: `${reach}px`, animationDuration: `${ms}ms` } as CSSProperties} />
  );
}
