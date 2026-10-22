import { useId } from 'react';

/**
 * The AP a move costs, as pips in the move line's look (soft white, a faint glow), the size of the action
 * bar's AP dots: just below and right of where the line ends.
 */
export function MoveCostPips({ ap }: { ap: number }) {
  return (
    <span role="img" aria-label={`${ap} AP`} className="relative left-3 top-2.5 flex gap-[2px]">
      {Array.from({ length: ap }, (_, i) => (
        <span key={i} className="block w-1 h-1 rounded-full"
          style={{ background: 'rgba(255,255,255,0.4)', boxShadow: '0 0 4px rgba(255,255,255,0.25)' }} />
      ))}
    </span>
  );
}

interface Props {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Room around the line for its glow (stroke + blur), px. */
const PAD = 20;

/**
 * The animated dotted line from the mover to the hovered tile. The SVG (and its blur filters) covers only
 * the line's own box, not the whole map: the dashes animate every frame, and a blur the size of the map
 * would make the browser recompute and repaint all of it each time.
 */
export default function MoveLine({ x1, y1, x2, y2 }: Props) {
  // Filter ids of its own: an id shared between two lines would draw both with the first one's filter box
  const id = useId().replace(/:/g, '');
  const left = Math.min(x1, x2) - PAD, top = Math.min(y1, y2) - PAD;
  const w = Math.abs(x2 - x1) + PAD * 2, h = Math.abs(y2 - y1) + PAD * 2;
  // In the SVG's own coordinates
  x1 -= left; x2 -= left; y1 -= top; y2 -= top;
  return (
    <svg
      className="absolute pointer-events-none z-20"
      style={{ left, top }}
      width={w}
      height={h}
    >
      <defs>
        <filter id={`${id}-glow`} x="0" y="0" width={w} height={h} filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
        <filter id={`${id}-soft`} x="0" y="0" width={w} height={h} filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
        </filter>
      </defs>
      <style>{`@keyframes mlDash { to { stroke-dashoffset: -14; } }`}</style>
      {/* Wide hazy glow — animated dashes, heavily blurred */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="white" strokeWidth={6} strokeLinecap="round" opacity={0.25}
        strokeDasharray="8 6" filter={`url(#${id}-glow)`}
        style={{ animation: 'mlDash 0.4s linear infinite' }} />
      {/* Soft dashes — lightly blurred */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="rgba(255,255,255,0.55)" strokeWidth={2} strokeLinecap="round"
        strokeDasharray="8 6" filter={`url(#${id}-soft)`}
        style={{ animation: 'mlDash 0.4s linear infinite' }} />
    </svg>
  );
}
