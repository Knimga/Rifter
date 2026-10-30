import { useState, useCallback, useRef } from 'react';
import type { FloatIcon, FloatingText } from '../components/FloatingCombatText';

export function useFloatingText() {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const nextId = useRef(0);

  /** `icon`: shown before the text (the coin, for gold picked up). */
  const spawnFloat = useCallback((gridX: number, gridY: number, text: string, color: FloatingText['color'], icon?: FloatIcon) => {
    const id = nextId.current++;
    setFloatingTexts(prev => {
      const count = prev.filter(f => f.gridX === gridX && f.gridY === gridY).length;
      // Spread floats at the same tile: 0, -18, +18, -36, +36, ...
      const offsetX = count === 0 ? 0 : count % 2 === 1 ? -(Math.ceil(count / 2) * 18) : Math.ceil(count / 2) * 18;
      return [...prev, { id, gridX, gridY, text, color, offsetX, ...(icon ? { icon } : {}) }];
    });
  }, []);

  const removeFloat = useCallback((id: number) => {
    setFloatingTexts(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearFloats = useCallback(() => setFloatingTexts([]), []);

  return { floatingTexts, spawnFloat, removeFloat, clearFloats };
}

/** Show floating text over a tile (useFloatingText's spawnFloat), for the hooks that take it. */
export type SpawnFloat = ReturnType<typeof useFloatingText>['spawnFloat'];
