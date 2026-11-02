import { useState, useCallback, useRef } from 'react';
import type { FloatIcon, FloatLook, FloatingText } from '../components/FloatingCombatText';

/**
 * The least time between two floats starting over the same tile: several at once (a hit, its crit, a trigger) go up
 * one after another, each risen clear of the one before it, instead of on top of each other.
 */
const FLOAT_STAGGER_MS = 450;

export function useFloatingText() {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const nextId = useRef(0);
  // Per tile ('x,y'): when its next float may start (FLOAT_STAGGER_MS after the last one)
  const nextStart = useRef(new Map<string, number>());
  // Floats waiting for their turn (cancelled by clearFloats)
  const waiting = useRef(new Set<ReturnType<typeof setTimeout>>());

  /** `icon`: shown before the text (the coin, for gold picked up). `look`: a special look (a level-up's, larger and glowing). */
  const spawnFloat = useCallback((gridX: number, gridY: number, text: string, color: FloatingText['color'], icon?: FloatIcon, look?: FloatLook) => {
    const id = nextId.current++;
    const show = () => setFloatingTexts(prev => [...prev, { id, gridX, gridY, text, color, ...(icon ? { icon } : {}), ...(look ? { look } : {}) }]);
    const tile = `${gridX},${gridY}`, now = performance.now();
    const start = Math.max(now, nextStart.current.get(tile) ?? 0);
    nextStart.current.set(tile, start + FLOAT_STAGGER_MS);
    if (start <= now) {
      show();
      return;
    }
    const timer = setTimeout(() => {
      waiting.current.delete(timer);
      show();
    }, start - now);
    waiting.current.add(timer);
  }, []);

  const removeFloat = useCallback((id: number) => {
    setFloatingTexts(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearFloats = useCallback(() => {
    waiting.current.forEach(clearTimeout);
    waiting.current.clear();
    nextStart.current.clear();
    setFloatingTexts([]);
  }, []);

  return { floatingTexts, spawnFloat, removeFloat, clearFloats };
}

/** Show floating text over a tile (useFloatingText's spawnFloat), for the hooks that take it. */
export type SpawnFloat = ReturnType<typeof useFloatingText>['spawnFloat'];
