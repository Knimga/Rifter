import { useState, useCallback, useRef } from 'react';
import type { FloatingText } from '../components/FloatingCombatText';

export function useFloatingText() {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const nextId = useRef(0);

  const spawnFloat = useCallback((gridX: number, gridY: number, text: string, color: FloatingText['color']) => {
    const id = nextId.current++;
    setFloatingTexts(prev => [...prev, { id, gridX, gridY, text, color }]);
  }, []);

  const removeFloat = useCallback((id: number) => {
    setFloatingTexts(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearFloats = useCallback(() => setFloatingTexts([]), []);

  const spawnFloatRef = useRef(spawnFloat);
  spawnFloatRef.current = spawnFloat;

  return { floatingTexts, spawnFloat, removeFloat, clearFloats, spawnFloatRef };
}
