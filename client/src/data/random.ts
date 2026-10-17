// ─── Shared randomness helpers ────────────────────────────────────────────────

/** Inclusive random integer in [min, max]. */
export function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

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

/** True with probability p (0–1). */
export const chance = (p: number) => Math.random() < p;
