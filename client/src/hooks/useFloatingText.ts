import { useState, useCallback, useRef } from 'react';
import type { FloatingText } from '../components/FloatingCombatText';

export function useFloatingText() {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const nextId = useRef(0);

  const spawnFloat = useCallback((gridX: number, gridY: number, text: string, color: FloatingText['color']) => {
    const id = nextId.current++;
    setFloatingTexts(prev => {
      const count = prev.filter(f => f.gridX === gridX && f.gridY === gridY).length;
      // Spread floats at the same tile: 0, -18, +18, -36, +36, ...
      const offsetX = count === 0 ? 0 : count % 2 === 1 ? -(Math.ceil(count / 2) * 18) : Math.ceil(count / 2) * 18;
      return [...prev, { id, gridX, gridY, text, color, offsetX }];
    });
  }, []);

  const removeFloat = useCallback((id: number) => {
    setFloatingTexts(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearFloats = useCallback(() => setFloatingTexts([]), []);

  const spawnFloatRef = useRef(spawnFloat);
  spawnFloatRef.current = spawnFloat;

  return { floatingTexts, spawnFloat, removeFloat, clearFloats, spawnFloatRef };
}
