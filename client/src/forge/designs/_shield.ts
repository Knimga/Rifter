// Shield shapes (SHIELDS in data/gear/offhands.ts): buckler, roundel and kite shield. Files starting with "_"
// are NOT registered as designs. Shields are built facing +z (the face is what the icon shows and what lies
// face-up as loot), centered on the origin, with the shield's top toward +y.
import type { DataRef, Design } from '../core/types';
import type { ColorFn, Mesh } from '../core/mesh';
import { slug } from '../core/slug';
import { blob, box, frustum, loft, ringPts } from '../core/primitives';
import { type RGB, type Vec3 } from '../core/vec';
import { SHIELDS } from '../../data/gear/offhands';

/** Shared shield colors: plain iron fittings (the same iron as Iron armor and Plain weapons), wood and leather. */
const IRON: RGB = [124, 130, 140];
const IRON_EDGE: RGB = [158, 164, 174];
const RIVET: RGB = [172, 176, 184];
const WOOD: RGB = [122, 88, 56];
const WOOD_DARK: RGB = [104, 74, 46];
const LEATHER: RGB = [128, 86, 54];

/**
 * Identity of a shield design, from its exact data entry (SHIELDS[id]): label = the shield's name
 * ('Buckler'), id = 'offhand.' + slug(name), source = the entry.
 */
export function shieldEntry(shieldId: string): { id: string; label: string; source: DataRef } {
  const s = SHIELDS.find((x) => x.id === shieldId);
  if (!s) throw new Error(`no shield '${shieldId}' (data/gear/offhands.ts)`);
  return { id: `offhand.${slug(s.name)}`, label: s.name, source: { table: 'offhands', key: shieldId } };
}

/** A round slab of radius r and thickness t facing +z, its face domed forward by `dome`. */
function disc(m: Mesh, r: number, t: number, dome: number, col: RGB | ColorFn, n = 16): void {
  loft(m, [ringPts([0, 0, -t / 2], [0, 0, 1], r, n), ringPts([0, 0, t / 2], [0, 0, 1], r, n), ringPts([0, 0, t / 2 + dome], [0, 0, 1], r * 0.55, n)], col);
}

/**
 * A round face of `count` vertical wooden planks (alternating shades), each its own slab cut to the
 * circle of radius r, so the joins between planks show.
 */
function planks(m: Mesh, r: number, t: number, count: number): void {
  const w = (2 * r) / count;
  for (let k = 0; k < count; k++) {
    const x0 = -r + k * w + 0.004, x1 = -r + (k + 1) * w - 0.004;
    const half = (x: number) => Math.sqrt(Math.max(0, r * r - x * x));
    const steps = 4;
    const right: [number, number][] = [], left: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      left.push([x, -half(x)]); // bottom edge, left to right
      right.push([x, half(x)]); // top edge, left to right
    }
    const outline = [...left, ...right.reverse()]; // counter-clockwise
    slab(m, outline, t, 0, [(x0 + x1) / 2, 0, 0], k % 2 ? WOOD_DARK : WOOD);
  }
}

/** A flat iron band around the front edge of a round face of radius r (covers plank ends), wrapping the side. */
function rimBand(m: Mesh, r: number, t: number, width: number): void {
  const z = t / 2 + 0.012;
  loft(m, [ringPts([0, 0, z], [0, 0, 1], r - width, 16), ringPts([0, 0, z], [0, 0, 1], r * 1.03, 16), ringPts([0, 0, -t / 2], [0, 0, 1], r * 1.03, 16)], IRON_EDGE, { caps: false });
}

/** A domed iron boss at the center of the face, ringed by a raised iron collar and rivets. */
function boss(m: Mesh, z: number, r: number, rivets: number): void {
  blob(m, [0, 0, z], [r, r, r * 0.7], 1, 0, IRON);
  frustum(m, [0, 0, z - 0.01], [0, 0, z + 0.025], r * 1.28, r * 1.22, 12, IRON_EDGE);
  for (let i = 0; i < rivets; i++) {
    const a = (i / rivets) * Math.PI * 2 + Math.PI / rivets;
    rivet(m, [Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5, z + 0.005]);
  }
}

function rivet(m: Mesh, c: Vec3): void {
  blob(m, c, [0.024, 0.024, 0.018], 0, 0, RIVET);
}

/** A round shield: an iron rim showing just beyond a domed face, and a center boss. */
function roundShield(m: Mesh, r: number, face: RGB | ColorFn, bossR: number, rimRivets: number): void {
  const t = 0.07, dome = 0.05;
  m.part('rim');
  disc(m, r * 1.06, t * 0.8, 0, IRON_EDGE);
  m.part('face');
  disc(m, r, t, dome, face);
  for (let i = 0; i < rimRivets; i++) {
    const a = (i / rimRivets) * Math.PI * 2;
    rivet(m, [Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, t / 2 + dome * 0.15]);
  }
  m.part('boss');
  boss(m, t / 2 + dome, bossR, 4);
}

// ─── Buckler (Light) ──────────────────────────────────────────────────────────

export function bucklerDesign(version: number): Design {
  const { id, label, source } = shieldEntry('buckler');
  return {
    id, label, source, version,
    category: 'offhand',
    fit: { kind: 'item', size: 0.5 },
    budget: 500,
    build(c) {
      // Small and round: a leather-faced face with a big iron boss filling much of it
      roundShield(c.mesh, c.rf(0.5, 0.52), LEATHER, 0.17, 0);
      return label;
    },
  };
}

// ─── Roundel (Medium) ─────────────────────────────────────────────────────────

export function roundelDesign(version: number): Design {
  const { id, label, source } = shieldEntry('roundel');
  return {
    id, label, source, version,
    category: 'offhand',
    fit: { kind: 'item', size: 0.68 },
    budget: 800,
    build(c) {
      // A full-size round shield of vertical wooden planks, with a flat riveted iron band around the edge
      // and an iron boss
      const m = c.mesh;
      const r = c.rf(0.5, 0.52), t = 0.07;
      m.part('face');
      planks(m, r, t, 6);
      m.part('rim');
      rimBand(m, r, t, 0.06);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        rivet(m, [Math.cos(a) * (r - 0.03), Math.sin(a) * (r - 0.03), t / 2 + 0.018]);
      }
      m.part('boss');
      boss(m, t / 2, 0.12, 4);
      return label;
    },
  };
}

// ─── Kite Shield (Heavy) ──────────────────────────────────────────────────────

/** Kite outline (counter-clockwise seen from +z): a gently arched top, sides curving in to a point below. */
function kiteOutline(w: number, top: number, bottom: number): [number, number][] {
  const pts: [number, number][] = [];
  const side = 7, arch = 5;
  for (let i = 0; i <= side; i++) {
    const t = i / side; // right side, top to bottom point: full width through the upper part, then curving in
    pts.push([w * (1 - t ** 2.2) ** 0.8, top - t * (top - bottom)]);
  }
  for (let i = side - 1; i >= 1; i--) {
    const t = i / side; // left side, bottom back up to the top
    pts.push([-w * (1 - t ** 2.2) ** 0.8, top - t * (top - bottom)]);
  }
  for (let i = 0; i <= arch; i++) {
    const x = -w + (2 * w * i) / arch; // arched top, left to right
    pts.push([x, top + 0.08 * Math.cos((x / w) * (Math.PI / 2))]);
  }
  pts.pop(); // the last arch point is the first side point
  return pts;
}

/** Extrude an outline into a slab facing +z, its face domed forward at `center` by `dome`. */
function slab(m: Mesh, pts: [number, number][], t: number, dome: number, center: Vec3, col: RGB): void {
  const inside: Vec3 = [center[0], center[1], 0];
  const front = (p: [number, number]): Vec3 => [p[0], p[1], t / 2];
  const back = (p: [number, number]): Vec3 => [p[0], p[1], -t / 2];
  const apex: Vec3 = [center[0], center[1], t / 2 + dome];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    m.tri(apex, front(a), front(b), col, inside);
    m.tri([center[0], center[1], -t / 2], back(b), back(a), col, inside);
    m.quad(front(a), back(a), back(b), front(b), col, inside);
  }
}

export function kiteShieldDesign(version: number): Design {
  const { id, label, source } = shieldEntry('kite-shield');
  return {
    id, label, source, version,
    category: 'offhand',
    fit: { kind: 'item', size: 0.82 },
    budget: 600,
    build(c) {
      const m = c.mesh;
      // A tall iron-faced kite shield: arched top, tapering to a point; a brighter iron rim shows around the
      // edge, a raised ridge runs down the middle, and rivets follow the rim
      const w = c.rf(0.46, 0.5), top = 0.5, bottom = -0.85;
      const t = 0.07, dome = 0.06;
      const outline = kiteOutline(w, top, bottom);
      m.part('rim');
      slab(m, outline.map(([x, y]) => [x * 1.07, (y - 0.0) * 1.05 + 0.005] as [number, number]), t * 0.8, 0, [0, 0, 0], IRON_EDGE);
      m.part('face');
      slab(m, outline, t, dome, [0, 0.05, 0], IRON);
      box(m, [0, -0.15, t / 2 + dome * 0.7], [0.05, 1.05, 0.04], IRON_EDGE); // center ridge
      for (const [x, y] of outline.filter((_, i) => i % 2 === 0)) {
        rivet(m, [x * 0.9, y * 0.92 + 0.02, t / 2 + 0.008]);
      }
      return label;
    },
  };
}
