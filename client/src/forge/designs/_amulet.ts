// Amulets (AMULETS in data/gear/jewelry.ts; forge section "Rings & Amulets"): one shape, an oval cabochon in a metal
// setting on its chain, in each amulet's stone and metal. Files starting with "_" are NOT registered as designs.
import type { Design } from '../core/types';
import type { Mesh } from '../core/mesh';
import { frustum, loft } from '../core/primitives';
import { mixC, mulC, type RGB, type Vec3 } from '../core/vec';
import { jewelryEntry } from './_ring';

/** The stone's oval (model units; the fit scales it): half its width (x), half its height (y), and its dome. */
const SX = 0.16, SY = 0.216, DOME = 0.096;
/** Points around an oval, and rings up the stone's dome. */
const AROUND = 14, RINGS = 4;

/** A point on the stone's oval, `k` times its size, at depth z. */
const oval = (t: number, k: number, z: number): Vec3 => [Math.cos(t) * SX * k, Math.sin(t) * SY * k, z];

/** A closed path around the oval (its first point repeated at the end), `k` times its size, at depth z. */
const ovalPath = (k: number, z: number): Vec3[] => Array.from({ length: AROUND + 1 }, (_, i) => oval((i / AROUND) * Math.PI * 2, k, z));

/**
 * The chain, lying loose on the surface the amulet rests on: one wavering loop from the bail (`bail`, the loop's
 * lowest point) out and around and back to it. A list of points along it, under the setting.
 */
function chainPath(bail: Vec3, rf: (a: number, b: number) => number): Vec3[] {
  const N = 48, rx = 0.5, ry = 0.34;
  const p1 = rf(0, Math.PI * 2), p2 = rf(0, Math.PI * 2);
  const waver = (th: number) => 1 + 0.26 * Math.sin(3 * th + p1) + 0.13 * Math.sin(5 * th + p2);
  const side = rf(0, 1) < 0.5 ? 1 : -1; // which way the loop runs from the bail
  const start = -Math.PI / 2;
  const at = (u: number): Vec3 => {
    const th = start + side * u * Math.PI * 2, w = waver(th);
    return [Math.cos(th) * rx * w, Math.sin(th) * ry * w, 0];
  };
  // Placed so the loop's start (its lowest point) is at the bail; it ends there too
  const s = at(0);
  return Array.from({ length: N + 1 }, (_, i) => {
    const u = i / N, p = at(u);
    // Where it lies over itself one strand is on top: it rises and falls a little along its length
    return [bail[0] + p[0] - s[0], bail[1] + p[1] - s[1], -0.03 + 0.012 * Math.sin(7 * u * Math.PI * 2 + p1)];
  });
}

/**
 * An amulet: an oval cabochon of `stone`, encircled in a `metal` setting on a back plate, hung from a bail on a
 * `metal` chain lying loose behind it, as if set down on a surface. Built facing +z (the stone's face): its icon
 * looks straight at the stone, and as loot it lies face up on the floor. `glint`: the light the stone's crown
 * catches, a brighter shade of its own hue (default a warm orange, the carnelian's).
 */
export function amuletDesign(typeId: string, { stone, metal, glint = [255, 150, 90] }: { stone: RGB; metal: RGB; glint?: RGB }): Design {
  const entry = jewelryEntry(typeId);
  return {
    ...entry,
    category: 'jewelry',
    fit: { kind: 'item', size: 0.3 },
    budget: 800,
    build(c) {
      const m: Mesh = c.mesh;
      const { rf } = c;
      // Metal catches the light on its faces toward the viewer, darker on its sides
      const metalShade = (_: Vec3, n: Vec3): RGB => mixC(metal, mulC(metal, 0.55), 0.5 - 0.5 * Math.max(0, n[2]));

      // The back plate, a little larger than the stone
      loft(m, [ovalPath(1.14, -0.02).slice(0, AROUND), ovalPath(1.14, 0.015).slice(0, AROUND)], metalShade, { j: 0.06 });
      // The stone: a smooth dome
      const rings = Array.from({ length: RINGS + 1 }, (_, j) => {
        const a = (j / RINGS) * (Math.PI / 2);
        return ovalPath(Math.cos(a) * 0.98 + (j === RINGS ? 0.04 : 0), 0.015 + DOME * Math.sin(a)).slice(0, AROUND);
      });
      // Its own color over its face (never washed out toward white), deeper toward its rim, and only its very crown
      // catching a small warm glint
      loft(m, rings, (_, n) => (n[2] > 0.93 ? mixC(stone, glint, 0.22) :mixC(mulC(stone, 0.6), stone, Math.max(0, n[2]))), { j: 0.05, e: 0.08 });
      // The setting: a rim of metal around the stone's edge, standing a little above the plate
      const rim = ovalPath(1.04, 0.03);
      for (let i = 0; i < AROUND; i++) frustum(m, rim[i], rim[i + 1], 0.03, 0.03, 4, metalShade, { j: 0.06, caps: false });
      // The bail at the stone's top: a small loop the chain runs through
      const bail: Vec3 = [0, SY * 1.14 + 0.05, 0];
      const loop = Array.from({ length: 9 }, (_, i): Vec3 => {
        const a = (i / 8) * Math.PI * 2;
        return [bail[0], bail[1] + Math.sin(a) * 0.045, Math.cos(a) * 0.045];
      });
      for (let i = 0; i < 8; i++) frustum(m, loop[i], loop[i + 1], 0.016, 0.016, 3, metalShade, { j: 0.06, caps: false });
      // The pendant sits a loop's radius higher than the chain's start, so the chain runs through the middle of the
      // bail and the loop wraps over it
      m.xf(0, (p) => [p[0], p[1] + 0.045, p[2]]);
      // The chain, lying loose behind it (from where the pendant was, so the lift doesn't move it)
      const chain = chainPath([bail[0], bail[1] + 0.045, 0], rf);
      for (let i = 0; i < chain.length - 1; i++) frustum(m, chain[i], chain[i + 1], 0.017, 0.017, 3, metalShade, { j: 0.1, caps: false });
      return entry.label;
    },
  };
}
