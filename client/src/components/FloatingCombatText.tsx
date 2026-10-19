import { useEffect } from 'react';
import { TILE_SIZE } from '../viewEngine/board';

export interface FloatingText {
  id: number;
  gridX: number;
  gridY: number;
  text: string;
  color: string;
  offsetX: number;
}

const DURATION_MS = 1500;

interface Props {
  ft: FloatingText;
  /** Where the text starts on the board (px): its tile's projected center, a little above the floor. */
  at: { left: number; top: number };
  onComplete: (id: number) => void;
}

export default function FloatingCombatText({ ft, at, onComplete }: Props) {
  useEffect(() => {
    const timer = setTimeout(() => onComplete(ft.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [ft.id, onComplete]);

  return (
    <div
      className="absolute z-30 pointer-events-none flex items-center justify-center"
      style={{ left: at.left - TILE_SIZE / 2 + ft.offsetX, top: at.top - TILE_SIZE / 2, width: TILE_SIZE, height: TILE_SIZE }}
    >
      <span
        className="font-bold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
        style={{ color: ft.color, animation: `floatUp ${DURATION_MS}ms ease-out forwards` }}
      >
        {ft.text}
      </span>
    </div>
  );
}
