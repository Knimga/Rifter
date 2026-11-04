// The new player's hints (data/world/hints.ts): each shown once, one at a time, the rest waiting in the order they
// were triggered. `trigger` brings up a trigger's hints not yet seen; `dismiss` sends one away (the player closed it),
// `done` every hint pointing at a target (the player did what they say, e.g. opened the party window).
import { useCallback, useState } from 'react';
import { HINTS, type HintData, type HintTarget, type HintTrigger } from '../data/world/hints';

export function useHints() {
  // Waiting to show (the first is showing), and every hint ever brought up (none comes up twice)
  const [queue, setQueue] = useState<readonly HintData[]>([]);
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());

  const trigger = useCallback((t: HintTrigger) => {
    const fresh = HINTS.filter((h) => h.trigger === t && !seen.has(h.id));
    if (!fresh.length) return;
    setSeen((prev) => new Set([...prev, ...fresh.map((h) => h.id)]));
    setQueue((prev) => [...prev, ...fresh]);
  }, [seen]);

  const dismiss = useCallback((id: string) => setQueue((prev) => prev.filter((h) => h.id !== id)), []);

  const done = useCallback((target: HintTarget) => setQueue((prev) => (prev.some((h) => h.target === target) ? prev.filter((h) => h.target !== target) : prev)), []);

  return { current: queue[0] ?? null, trigger, dismiss, done };
}
