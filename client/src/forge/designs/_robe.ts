// Robes: a creature's robe lofted from its outline, a ring at each height from the hem up (the Goblin Shaman's,
// the Sporemother's), and where its surface is between the rings. Files starting with "_" are NOT registered as
// designs.
import type { BuildCtx } from '../core/ctx';
import type { ColorFn } from '../core/mesh';
import { loft, wobbleRing } from '../core/primitives';
import type { RGB } from '../core/vec';

/**
 * One ring of a robe's outline: its height, half-width and half-depth (scaled by the robe's width), how far
 * forward its middle sits, and how much its edge wobbles (a share of its radius: wobbleRing).
 */
export type RobeRing = [y: number, rx: number, rz: number, dz: number, jag: number];

/** A robe lofted from `profile` (its rings, from the hem up), its width and depth scaled by `W`, its edge wobbling. */
export function loftRobe(c: BuildCtx, profile: readonly RobeRing[], W: number, color: RGB | ColorFn): void {
  loft(c.mesh, profile.map(([y, rx, rz, dz, jag]) => wobbleRing([0, y, dz], rx * W, rz * W, 12, jag, c.R)), color, { j: 0.16, bandCenters: true });
}

/** A robe's outline at height y, between its rings: half-width, half-depth (scaled by `W`), and its middle's forward offset. */
export function robeAt(profile: readonly RobeRing[], W: number, y: number): { rx: number; rz: number; dz: number } {
  const i = Math.max(0, Math.min(profile.length - 2, profile.findIndex((p) => p[0] > y) - 1));
  const [y0, rx0, rz0, dz0] = profile[i], [y1, rx1, rz1, dz1] = profile[i + 1];
  const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
  return { rx: (rx0 + (rx1 - rx0) * t) * W, rz: (rz0 + (rz1 - rz0) * t) * W, dz: dz0 + (dz1 - dz0) * t };
}
