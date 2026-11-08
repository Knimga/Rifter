// Words typed out letter by letter (an NPC's dialogue, the opening's narration), moved on with a right-click.
import { useEffect, useRef, useState } from 'react';
import { useLatest } from './useLatest';

/** How fast words are typed: one character per this many ms. */
const TYPE_MS = 22;
/** How far (px) the pointer may move between pressing and releasing the right button and still be a click (further: a pan). */
const CLICK_SLOP = 5;

/**
 * How much of `text` is typed so far (`typed` characters; `done` once all of it), starting over with each new text;
 * `instant`: all of it at once. `finish` shows the rest at once.
 */
export function useTypewriter(text: string, instant = false): { typed: number; done: boolean; finish: () => void } {
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    setTyped(instant ? text.length : 0);
    if (instant) return;
    const id = setInterval(() => setTyped((n) => {
      if (n + 1 >= text.length) clearInterval(id);
      return n + 1;
    }), TYPE_MS);
    return () => clearInterval(id);
  }, [text, instant]);
  return { typed, done: typed >= text.length, finish: () => setTyped(text.length) };
}

/**
 * Right-click anywhere calls `onClick`: a press and release of the right button that didn't move (a right-drag pans
 * the map instead). Nothing else under the cursor takes the right-click meanwhile, and never the browser's menu.
 */
export function useRightClick(onClick: () => void): void {
  const pressed = useRef<{ x: number; y: number } | null>(null);
  // Listened for once, always calling the latest handler (not re-subscribed every render)
  const latest = useLatest(onClick);
  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (e.button === 2) pressed.current = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      const p = pressed.current;
      if (e.button !== 2 || !p) return;
      pressed.current = null;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_SLOP) return;
      // The browser's menu comes after the release: blocked here, on its own, since the click may end what listens
      // (the last line said, its narration or dialogue gone, its own blocker with it)
      const block = (m: MouseEvent) => m.preventDefault();
      window.addEventListener('contextmenu', block, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('contextmenu', block, true), 300);
      latest.current();
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('contextmenu', onContext, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('contextmenu', onContext, true);
    };
  }, [latest]);
}
