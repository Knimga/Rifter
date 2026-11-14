import { useEffect } from 'react';
import { FaCoins } from 'react-icons/fa';
import { TILE_SIZE } from '../viewEngine/board';

/** An icon a float can show before its text: 'gold', the coin (gold picked up). */
export type FloatIcon = 'gold';

export interface FloatingText {
  id: number;
  gridX: number;
  gridY: number;
  text: string;
  color: string;
  icon?: FloatIcon;
}

const DURATION_MS = 1500;

interface Props {
  ft: FloatingText;
  /** Where the text starts on the board (px): its tile's projected center, a little above the floor. */
  at: { left: number; top: number };
  onComplete: (id: number) => void;
  /** Not drawn (over a tile the party doesn't see), but it still ends on time: it never shows up later, out of turn. */
  hidden?: boolean;
}

export default function FloatingCombatText({ ft, at, onComplete, hidden = false }: Props) {
  useEffect(() => {
    const timer = setTimeout(() => onComplete(ft.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [ft.id, onComplete]);

  if (hidden) return null;
  return (
    <div
      className="absolute z-30 pointer-events-none flex items-center justify-center"
      style={{ left: at.left - TILE_SIZE / 2, top: at.top - TILE_SIZE / 2, width: TILE_SIZE, height: TILE_SIZE }}
    >
      {/* As wide as its text, up to a few words' worth before it wraps (not the tile's narrow width), centered on it */}
      <span
        className={`shrink-0 w-max max-w-[240px] text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] font-bold text-sm ${ft.icon ? 'inline-flex items-center gap-1 whitespace-nowrap' : ''}`}
        style={{ color: ft.color, animation: `floatUp ${DURATION_MS}ms ease-out forwards` }}
      >
        {ft.icon === 'gold' && <FaCoins aria-hidden="true" className="w-3 h-3 shrink-0" style={{ color: 'var(--rift-gold)' }} />}
        {ft.text}
      </span>
    </div>
  );
}
