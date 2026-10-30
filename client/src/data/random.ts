// ─── Shared randomness helpers ────────────────────────────────────────────────

/** Inclusive random integer in [min, max]. */
export function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * An authored range [min, max] with a flat `bonus` added, stretched around its average so its spread stays the
 * same share of it: 7–11 (avg 9) +18 → 21–33 (avg 27). The average gains exactly `bonus`; a range whose average is
 * 0 or less just shifts; a penalty that leaves nothing gives 0–0. Damage and heals roll it, and tooltips show it.
 */
export function scaledRange(min: number, max: number, bonus: number): [number, number] {
  const avg = (min + max) / 2;
  if (avg <= 0) return [min + bonus, max + bonus];
  const k = Math.max(0, (avg + bonus) / avg);
  return [Math.round(min * k), Math.round(max * k)];
}

/** A roll of `scaledRange`. */
export const rollScaled = (min: number, max: number, bonus: number): number => randInt(...scaledRange(min, max, bonus));

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

/**
 * How many times something happens, by a rate read as count and chance: its whole part happens for sure, its
 * fraction is the chance of one more (0.3: a 30% chance of once; 1.2: once, and a 20% chance of twice).
 */
export function rollCount(rate: number): number {
  const whole = Math.floor(rate);
  return whole + (chance(rate - whole) ? 1 : 0);
}
