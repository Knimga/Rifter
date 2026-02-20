import { useEffect } from 'react';
import { TILE_SIZE } from '../data/constants';

export interface FloatingText {
  id: number;
  gridX: number;
  gridY: number;
  text: string;
  color: 'red' | 'white' | 'green' | 'purple';
}

const COLOR_CLASS: Record<FloatingText['color'], string> = {
  red: 'text-red-400',
  white: 'text-white',
  green: 'text-green-400',
  purple: 'text-purple-400',
};

const DURATION_MS = 1500;

interface Props {
  ft: FloatingText;
  onComplete: (id: number) => void;
}

export default function FloatingCombatText({ ft, onComplete }: Props) {
  useEffect(() => {
    const timer = setTimeout(() => onComplete(ft.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [ft.id, onComplete]);

  return (
    <div
      className="absolute pointer-events-none flex items-center justify-center"
      style={{ left: ft.gridX * TILE_SIZE, top: ft.gridY * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }}
    >
      <span
        className={`font-bold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${COLOR_CLASS[ft.color]}`}
        style={{ animation: `floatUp ${DURATION_MS}ms ease-out forwards` }}
      >
        {ft.text}
      </span>
    </div>
  );
}
