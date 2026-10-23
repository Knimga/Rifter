// ─── Shared randomness helpers ────────────────────────────────────────────────

/** Inclusive random integer in [min, max]. */
export function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Random real number in [min, max). */
export const randFloat = (min: number, max: number): number => min + Math.random() * (max - min);

/** Uniformly random element of a non-empty array. */
export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Unbiased (Fisher–Yates) shuffled copy. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A random element of a non-empty array, each as likely as its weight. */
export function pickWeighted<T>(items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((s, it) => s + weight(it), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= weight(it);
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

/** True with probability p (0–1). */
export const chance = (p: number) => Math.random() < p;
