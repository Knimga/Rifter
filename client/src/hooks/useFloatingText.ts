import { useState, useCallback, useRef } from 'react';
import type { FloatIcon, FloatLook, FloatingText } from '../components/FloatingCombatText';

/**
 * The least time between two floats starting over the same tile: several at once (a hit, its crit, a trigger) go up
 * one after another, each risen clear of the one before it, instead of on top of each other.
 */
const FLOAT_STAGGER_MS = 450;
/**
 * The least time between two announcements (announce: a quest taken, moved on or completed, a rift key picked up),
 * wherever they show: each lands on its own before the next.
 */
const ANNOUNCE_GAP_MS = 1000;

export function useFloatingText() {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const nextId = useRef(0);
  // Per tile ('x,y'): when its next float may start (FLOAT_STAGGER_MS after the last one)
  const nextStart = useRef(new Map<string, number>());
  // When the next announcement may start (ANNOUNCE_GAP_MS after the last one)
  const nextAnnounce = useRef(0);
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

  /** A float that announces something (a quest's news, a rift key found): one at a time, ANNOUNCE_GAP_MS apart. */
  const announce = useCallback((gridX: number, gridY: number, text: string, color: FloatingText['color']) => {
    const now = performance.now(), start = Math.max(now, nextAnnounce.current);
    nextAnnounce.current = start + ANNOUNCE_GAP_MS;
    if (start <= now) {
      spawnFloat(gridX, gridY, text, color);
      return;
    }
    const timer = setTimeout(() => {
      waiting.current.delete(timer);
      spawnFloat(gridX, gridY, text, color);
    }, start - now);
    waiting.current.add(timer);
  }, [spawnFloat]);

  const removeFloat = useCallback((id: number) => {
    setFloatingTexts(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearFloats = useCallback(() => {
    waiting.current.forEach(clearTimeout);
    waiting.current.clear();
    nextStart.current.clear();
    nextAnnounce.current = 0;
    setFloatingTexts([]);
  }, []);

  return { floatingTexts, spawnFloat, announce, removeFloat, clearFloats };
}

/** Show floating text over a tile (useFloatingText's spawnFloat), for the hooks that take it. */
export type SpawnFloat = ReturnType<typeof useFloatingText>['spawnFloat'];
