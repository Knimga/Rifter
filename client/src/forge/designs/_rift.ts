// Rift family shape, shared by every rift design (one per GAME_OBJECTS entry, e.g. necrotic-rift.ts):
// an upright oval of swirling black void and glowing energy, hovering just off the floor over a faint pool
// of its light. Only the glow colors differ between rifts (RiftGlow); the void stays black.
// Animated: the swirl turns, and its rim and the motes hugging it turn slowly the other way (PartSpin; both keep
// the oval outline). The rim glows all around, with a halo; so do the motes. Built facing +z, standing on the floor. The oval is built round (unit radius) in the
// x-y plane and squashed to OVAL; the spins happen in that round frame.
// Files starting with "_" are NOT registered as designs.
import type { Design } from '../core/types';
import type { Mesh } from '../core/mesh';
import { bipyr } from '../core/primitives';
import { mixC, type RGB, type Vec3 } from '../core/vec';
import { objectEntry } from './_object';
import { floorGlow } from './_glow';

/** A rift's colors: its brightest glow, the deeper glow the arms fade through, and its pool on the floor. */
export interface RiftGlow {
  bright: RGB;
  deep: RGB;
  ground: RGB;
}

const VOID: RGB = [8, 6, 12];
const VOID_PURPLE: RGB = [24, 12, 32];

/** Squash from the round frame to the oval: half as wide as tall. */
const OVAL: Vec3 = [0.5, 1, 1];
/** Gap between the floor and the bottom of the oval, local units (the oval is 2 tall). */
const HOVER = 0.16;
const CENTER: Vec3 = [0, HOVER + 1 + 0.08, 0]; // + the rim's thickness below the oval

/** A point of the round frame (x, y, z) placed in the model: squashed to the oval, around CENTER. */
const place = (x: number, y: number, z = 0): Vec3 => [CENTER[0] + x * OVAL[0], CENTER[1] + y * OVAL[1], CENTER[2] + z];

/**
 * The swirl filling the oval, on both faces: three spiral arms of necrotic glow that brighten toward the
 * edge, over void black. Blurred: each corner gets its own color from the pattern and the GPU blends
 * them across the face (FaceOpts.vc), so the arms fade softly into the void instead of ending at face
 * edges. All of it glows (unlit), so the blend isn't broken up by lighting.
 */
function swirl(m: Mesh, rf: (a: number, b: number) => number, { bright: NECROTIC, deep: NECROTIC_DEEP }: RiftGlow): void {
  const RINGS = 5, N = 28, twist = rf(6, 8), phase = rf(0, Math.PI * 2);
  const at = (k: number, i: number): [number, number] => {
    const r = k / RINGS, a = (i / N) * 2 * Math.PI + k * 0.11; // a slight skew between rings
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  /** The swirl's color at a point of the round frame. */
  const colorAt = ([x, y]: [number, number]): RGB => {
    const r = Math.hypot(x, y), a = Math.atan2(y, x);
    const arm = 0.5 + 0.5 * Math.sin(3 * a - twist * r + phase); // three spiral arms
    const t = smooth(0.25, 0.8, arm * (0.35 + 0.75 * r)); // 0 = void, 1 = brightest glow
    return t < 0.5 ? mixC(mixC(VOID, VOID_PURPLE, arm * 0.6), NECROTIC_DEEP, t * 2) : mixC(NECROTIC_DEEP, NECROTIC, (t - 0.5) * 2);
  };
  const tri = (p: [number, number][]) => {
    const vc = p.map(colorAt) as [RGB, RGB, RGB];
    const cx = (p[0][0] + p[1][0] + p[2][0]) / 3, cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
    // Both faces of the flat disc: a center point behind the face orients it outward
    for (const s of [1, -1]) m.tri(place(...p[0]), place(...p[1]), place(...p[2]), vc[0], place(cx, cy, -s * 0.5), { e: 1, j: 0, vc });
  };
  for (let i = 0; i < N; i++) tri([[0, 0], at(1, i), at(1, i + 1)]);
  for (let k = 1; k < RINGS; k++)
    for (let i = 0; i < N; i++) {
      tri([at(k, i), at(k, i + 1), at(k + 1, i + 1)]);
      tri([at(k, i), at(k + 1, i + 1), at(k + 1, i)]);
    }
}

/**
 * The rim: a tube around the oval's edge, glowing all around in the rift's color under a ring of halos, with
 * motes of energy clinging to it: small glowing shards scattered over its outer half (out, in front and behind,
 * never over the swirl), each with a halo.
 */
function rim(m: Mesh, rf: (a: number, b: number) => number, { bright: NECROTIC }: RiftGlow): void {
  const M = 32, tube = 0.08;
  const ring = (i: number): Vec3[] => {
    const a = (i / M) * 2 * Math.PI, cx = Math.cos(a), cy = Math.sin(a);
    // A diamond cross-section: out, toward the front, in, toward the back
    return [
      place(cx * (1 + tube), cy * (1 + tube)), place(cx, cy, tube), place(cx * (1 - tube), cy * (1 - tube)), place(cx, cy, -tube),
    ];
  };
  for (let i = 0; i < M; i++) {
    const a = ((i + 0.5) / M) * 2 * Math.PI;
    const r0 = ring(i), r1 = ring(i + 1);
    const ctr = place(Math.cos(a), Math.sin(a));
    for (let k = 0; k < 4; k++) m.quad(r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k], NECROTIC, ctr, { e: 1, j: 0.08 });
  }
  // Its halo: overlapping glows all around the ring
  const HALOS = 12;
  for (let i = 0; i < HALOS; i++) {
    const a = (i / HALOS) * 2 * Math.PI;
    m.halo(place(Math.cos(a), Math.sin(a)), 0.2, NECROTIC);
  }
  // Motes: small shards clinging to the tube, each somewhere around its outer half (an angle around the tube
  // from out, through in front or behind; never inward, over the swirl), so they sit at different depths
  const MOTES = 18;
  for (let i = 0; i < MOTES; i++) {
    const a = (i / MOTES) * 2 * Math.PI + rf(-0.12, 0.12);
    const around = rf(-1.75, 1.75), d = tube + rf(0.015, 0.05); // radians from straight out; distance from the tube's core
    const out = 1 + Math.cos(around) * d, z = Math.sin(around) * d;
    const p = place(Math.cos(a) * out, Math.sin(a) * out, z);
    bipyr(m, p, 0.018, 0.035, 4, NECROTIC, { e: 1, j: 0.05 });
    m.halo(p, 0.07, NECROTIC);
  }
}

/** The design for the rift entry `objectId` (GAME_OBJECTS), glowing in `glow`. */
export function riftDesign(objectId: string, glow: RiftGlow): Design {
  const { id, label, source } = objectEntry(objectId);
  return {
    id, label, source,
    category: 'object',
    fit: { kind: 'standing', height: 1.5, maxRadius: 0.55 },
    budget: 1100, // the blurred swirl needs a finer mesh to blend smoothly
    motion: [
      { part: 'swirl', axis: 'z', turnsPerSec: 0.22, frame: OVAL },
      { part: 'rim', axis: 'z', turnsPerSec: -0.1, frame: OVAL },
    ],
    build(c) {
      const m = c.mesh;
      m.anchor('feet', [0, 0, 0]); // under the rift's center: this point goes to the tile center

      // A faint pool of the rift's light on the floor, as wide as the oval is tall
      m.part('glow');
      floorGlow(m, glow.ground, 0.8, 0.42);
      m.part('swirl', CENTER);
      swirl(m, c.rf, glow);
      m.part('rim', CENTER);
      rim(m, c.rf, glow);

      return label;
    },
  };
}
