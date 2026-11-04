// A zone's terrain (types.ts): its floor and walls, built from its tile grid with the forge's Mesh, so they share
// the models' faceted, flat-shaded look. Pure and deterministic: the same input always builds the same terrain.
//
// Walls stand on every non-floor tile with a floor tile among its 8 neighbours (deeper rock is never seen). Under
// the game's camera (looking north-east) a wall with a floor tile north, east or north-east of it stands between
// the camera and that floor, so it is cut down to a stub (STUB_HEIGHT): the near (south and west) walls of a room,
// walls between two rooms, islands. The others rise to their full height (WALL_HEIGHTS). A door tile is an opening in its wall: the door
// model stands in it (it brings its own frame), with a lintel above it in a full wall. Only faces that border a
// lower neighbour are built, and every surface's shape comes from world-position noise, so neighbouring tiles join
// without seams.
import { Mesh, bake, type FaceOpts } from '../core/mesh';
import { box } from '../core/primitives';
import { mulberry32 } from '../core/rng';
import { mixC, mulC, type RGB, type Vec3 } from '../core/vec';
import type { Model } from '../core/types';
import type { Terrain, TerrainInput } from './types';

/**
 * A full wall's height (tiles) for each TerrainStyle walls.height: low, above the doors' frames (1.4) and the units;
 * high, half again as tall. (A rough wall's varies a little around it. The board leaves room above the map for the
 * tallest: BOARD_HEADROOM, viewEngine/board.ts.)
 */
export const WALL_HEIGHTS = { low: 1.5, high: 2.25 } as const;
/** A cut wall's height (tiles): low enough to see over, high enough to read as a wall. */
export const STUB_HEIGHT = 0.2;
/**
 * Where a doorway's lintel starts: just above the door's own frame. Every door's frame is flat-topped at 1.4 tiles and
 * about 0.92 wide (an arched door arches inside it: warded-stone-door), so the jambs and lintel close around any door.
 */
const LINTEL_Y = 1.38;
/**
 * How dark a wall's top is, as a share of its color: near-black, keeping the wall's hue, so the tops read as solid rock
 * running into the dark (bright tops drew a grid of outlines around every room). Veins never run over it.
 */
const WALL_TOP_SHADE = 0.16;
/** A doorway's jambs: thin pillars at its sides, closing the gap between the door's frame and the walls. */
const JAMB = 0.07;

/** Masonry: course height, block length and the mortar joint between blocks (tiles). */
const COURSE = 0.25, BLOCK = 0.5, SEAM = 0.022;
/**
 * Cyclopean: the stone lattice's cell along the wall and up it (tiles), how far its corners wander (share of a
 * cell), and how often a cell joins its neighbour to the right or above into one bigger stone.
 */
const CYC_U = 0.46, CYC_Y = 0.32, CYC_JITTER = 0.32, CYC_JOIN_U = 0.45, CYC_JOIN_Y = 0.4;
/** Rough surfaces: cells per tile edge on walls and on floors (fine enough for veins to run), and the height between rows of a wall face. */
const ROUGH_SEGS = 3, FLOOR_SEGS = 4, ROUGH_ROW = 0.3;
/** A fine rough floor's cells per tile edge (pattern 'rough-fine'): the same floor in smaller facets. */
const FINE_FLOOR_SEGS = 8;
/** Flagstones: stone thickness (tiles) and the joint between two stones. */
const STONE = 0.014, JOINT = 0.03;
/**
 * Glowing veins' halos: the share of floor tiles and wall faces with a glowing vein showing that get one (on one of
 * their vein facets, so they lie scattered along the veins), its radius (tiles), how far it floats off the surface,
 * and how much hotter (toward white-gold) it is than the veins, so it blooms over their own glow.
 */
const VEIN_HALO_CHANCE = 0.3, VEIN_HALO_R = 0.32, VEIN_HALO_LIFT = 0.04, VEIN_HALO_HEAT = 0.25;

// ─── Noise ────────────────────────────────────────────────────────────────────

/** A hash of an integer lattice point, 0..1. */
function lattice(seed: number, x: number, y: number, z: number): number {
  let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise at a world point, 0..1: two octaves, `scale` lattice cells per tile. */
function noiseAt(seed: number, p: Vec3, scale: number): number {
  const one = (s: number, k: number) => {
    const x = p[0] * k, y = p[1] * k, z = p[2] * k;
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
    const l = (dx: number, dy: number, dz: number) => lattice(s, ix + dx, iy + dy, iz + dz);
    const m = (a: number, b: number, t: number) => a + (b - a) * t;
    return m(
      m(m(l(0, 0, 0), l(1, 0, 0), fx), m(l(0, 1, 0), l(1, 1, 0), fx), fy),
      m(m(l(0, 0, 1), l(1, 0, 1), fx), m(l(0, 1, 1), l(1, 1, 1), fx), fy),
      fz,
    );
  };
  return 0.65 * one(seed, scale) + 0.35 * one(seed ^ 0x5bd1e995, scale * 2.3);
}

/**
 * Where veins (TerrainStyle.veins) run: `share` (0..1) of the surface, as connected patches (a noise field above a
 * level) or thin winding cracks (a band around the field's middle). The level is measured, since value noise isn't
 * spread evenly, so the share holds.
 */
function veinField(seed: number, share: number, cracks: boolean): (p: Vec3) => boolean {
  if (share <= 0) return () => false;
  const scale = cracks ? 0.3 : 0.45;
  const value = (p: Vec3) => (cracks ? -Math.abs(noiseAt(seed, p, scale) - 0.5) : noiseAt(seed, p, scale));
  const R = mulberry32(seed);
  const samples = Array.from({ length: 2048 }, () => value([R() * 64, R() * 4, R() * 64])).sort((a, b) => a - b);
  const level = samples[Math.min(samples.length - 1, Math.floor((1 - share) * samples.length))];
  return (p) => value(p) > level;
}

/**
 * Whether the wall on tile (x, y) is cut down to a stub: a floor tile lies north, east or north-east of it, so under the
 * game's camera (looking north-east) the wall would hide that floor. The terrain's rule, shared by clutter.ts (wall
 * clutter only goes on the full walls).
 */
export const isCutWall = (isFloor: (x: number, y: number) => boolean, x: number, y: number): boolean =>
  isFloor(x, y - 1) || isFloor(x + 1, y) || isFloor(x + 1, y - 1);

// ─── Outlines on a wall face ──────────────────────────────────────────────────

/** A point on a wall face (along the wall line, and up), or on the floor (x, z). */
type Pt = [number, number];

/** A plane of cyclopean stones (cycStones in buildTerrain): its id, its cells' size, and whether its bottom row sits on v = 0. */
interface CycPlane { id: number; cu: number; cv: number; grounded: boolean }
/** A cyclopean floor's stones: the floor plane (an id no wall line has), square cells. */
const FLOOR_PLANE: CycPlane = { id: -5, cu: CYC_U, cv: CYC_U, grounded: false };

/** The average of a polygon's corners. */
const polyCenter = (poly: Pt[]): Pt => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];

/** A polygon cut to the rectangle x0..x1, y0..y1 (Sutherland-Hodgman); fewer than 3 corners when nothing is left. */
function clipRect(poly: Pt[], x0: number, x1: number, y0: number, y1: number): Pt[] {
  const inside: ((p: Pt) => number)[] = [(p) => p[0] - x0, (p) => x1 - p[0], (p) => p[1] - y0, (p) => y1 - p[1]];
  let out = poly;
  for (const f of inside) {
    const pts = out;
    out = [];
    for (let k = 0; k < pts.length; k++) {
      const cur = pts[k], prev = pts[(k + pts.length - 1) % pts.length];
      const fc = f(cur), fp = f(prev);
      const cross = (): Pt => { const t = fp / (fp - fc); return [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]; };
      if (fc >= 0) {
        if (fp < 0) out.push(cross());
        out.push(cur);
      } else if (fp >= 0) out.push(cross());
    }
    if (out.length < 3) return out;
  }
  return out;
}

// ─── Build ────────────────────────────────────────────────────────────────────

const centroid = (a: Vec3, b: Vec3, c: Vec3): Vec3 => [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];

/** A wall face: on a tile edge from `a` (at the floor) along `t` (one tile), facing `n`. */
interface Side { a: Vec3; t: Vec3; n: Vec3; /** The edge's line, the same for both tiles that share it (masonry courses continue along it). */ line: number }

/** The four sides of tile (x, y): north, south, east, west, each with its neighbour's offset. */
const sidesOf = (x: number, y: number): { d: [number, number]; side: Side }[] => [
  { d: [0, -1], side: { a: [x, 0, y], t: [1, 0, 0], n: [0, 0, -1], line: y * 2 } },
  { d: [0, 1], side: { a: [x, 0, y + 1], t: [1, 0, 0], n: [0, 0, 1], line: (y + 1) * 2 } },
  { d: [1, 0], side: { a: [x + 1, 0, y], t: [0, 0, 1], n: [1, 0, 0], line: (x + 1) * 2 + 1 } },
  { d: [-1, 0], side: { a: [x, 0, y], t: [0, 0, 1], n: [-1, 0, 0], line: x * 2 + 1 } },
];

/** Build a zone's floor and walls (see the file comment). */
export function buildTerrain({ cols, rows, floors, doors, style, seed }: TerrainInput): Terrain {
  const R = mulberry32(seed);
  const seedOf = () => Math.floor(R() * 4294967296);
  const S = { blocks: seedOf(), bulge: seedOf(), shade: seedOf(), floor: seedOf() };
  const veinAt = style.veins ? veinField(seedOf(), style.veins.share, style.veins.pattern === 'cracks') : () => false;
  const veinOpts: FaceOpts = style.veins?.glow ? { e: 0.85, j: 0.1 } : { j: 0.18 };
  const veinColor: RGB = style.veins?.color ?? [0, 0, 0];

  /**
   * Halos over glowing veins (VEIN_HALO_*): each surface (a floor tile, a wall face) notes where its vein facets are
   * (`litAt`, the spot off the surface), then `haloOne` gives it a halo at one of them on a roll of its own (keyed by
   * a, b, c, so the same surface always rolls the same).
   */
  const haloSeed = S.shade ^ 0x2c1b3c6d;
  const haloColor = mixC(veinColor, [255, 236, 190], VEIN_HALO_HEAT);
  let lit: Vec3[] = [];
  const litAt = (p: Vec3) => { if (style.veins?.glow) lit.push(p); };
  const haloOne = (m: Mesh, a: number, b: number, c: number) => {
    if (lit.length && lattice(haloSeed, a, b, c) < (style.veins?.halos ?? VEIN_HALO_CHANCE))
      m.halo(lit[Math.floor(lattice(haloSeed, a, b, c + 1) * lit.length)], VEIN_HALO_R, haloColor);
    lit = [];
  };

  const key = (x: number, y: number) => `${x},${y}`;
  const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;
  const isFloor = (x: number, y: number) => floors.has(key(x, y));
  const doorSet = new Set(doors.map((d) => key(d.x, d.y)));
  const isDoor = (x: number, y: number) => doorSet.has(key(x, y));
  const nearFloor = (x: number, y: number) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (isFloor(x + dx, y + dy)) return true;
    return false;
  };
  const isCut = (x: number, y: number) => isCutWall(isFloor, x, y);
  const rough = style.walls.finish === 'rough';
  const fullHeight = WALL_HEIGHTS[style.walls.height];
  /**
   * The wall's height on a tile: 0 for floor, doors (openings), deep rock and anything off the grid. A rough wall's
   * varies from tile to tile (its full height staying above the doors), so its top is jagged.
   */
  const wallHeight = (x: number, y: number) => {
    if (!inGrid(x, y) || isFloor(x, y) || isDoor(x, y) || !nearFloor(x, y)) return 0;
    const v = rough ? (lattice(S.bulge, x, y, 3) - 0.5) * style.walls.bumpiness : 0;
    return isCut(x, y) ? STUB_HEIGHT + v * 0.12 : fullHeight + v * 0.3;
  };

  // ── Cyclopean stones (walls and floors) ──
  /**
   * A cyclopean plane's stones are a jittered lattice of cells (`cu` x `cv`) in its own coordinates (u, v), laid in
   * the world and never in tiles, so a stone carries on past a tile's edge; some cells join a neighbour into one
   * bigger stone. `id` tells planes apart (a wall line; the floor), each with its own stones.
   */
  const cycCorner = (pl: CycPlane, i: number, j: number): Pt => [
    (i + (lattice(S.blocks, i, j, pl.id * 4 + 1) - 0.5) * 2 * CYC_JITTER) * pl.cu,
    pl.grounded && j <= 0 ? 0 : (j + (lattice(S.blocks, i, j, pl.id * 4 + 2) - 0.5) * 2 * CYC_JITTER) * pl.cv,
  ];
  // A cell joins the one to its right (or above) on a roll, unless the cell before it rolled to join it: stones are at most two cells
  const rollsRight = (pl: CycPlane, i: number, j: number) => lattice(S.shade, i, j, pl.id * 4 + 1) < CYC_JOIN_U;
  const rollsUp = (pl: CycPlane, i: number, j: number) => lattice(S.shade, i, j, pl.id * 4 + 2) < CYC_JOIN_Y;
  const joinsRight = (pl: CycPlane, i: number, j: number) => rollsRight(pl, i, j) && !rollsRight(pl, i - 1, j);
  const inPair = (pl: CycPlane, i: number, j: number) => joinsRight(pl, i, j) || joinsRight(pl, i - 1, j);
  const joinsUp = (pl: CycPlane, i: number, j: number) =>
    rollsUp(pl, i, j) && !rollsUp(pl, i, j - 1) && !inPair(pl, i, j) && !inPair(pl, i, j + 1);
  /** The outline of the stone whose first cell is (i, j), or null if that cell is part of another's. */
  const cycStone = (pl: CycPlane, i: number, j: number): Pt[] | null => {
    if (joinsRight(pl, i - 1, j) || joinsUp(pl, i, j - 1)) return null;
    const P = (di: number, dj: number) => cycCorner(pl, i + di, j + dj);
    if (joinsRight(pl, i, j)) return [P(0, 0), P(1, 0), P(2, 0), P(2, 1), P(1, 1), P(0, 1)];
    if (joinsUp(pl, i, j)) return [P(0, 0), P(1, 0), P(1, 1), P(1, 2), P(0, 2), P(0, 1)];
    return [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
  };
  /**
   * Each stone of a plane over the rectangle u0..u1, v0..v1: the `part` of it inside (inset by half a joint), its
   * whole stone's `center`, how far a point of it `rise`s as it swells toward its middle (0 at its edge, 1 at its
   * middle: worked out from the whole stone, so both parts of a stone cut at a tile's edge match) and rolls of its
   * own (`roll(k)`, 0..1).
   */
  const cycStones = (pl: CycPlane, u0: number, u1: number, v0: number, v1: number,
    emit: (s: { part: Pt[]; center: Pt; rise: (p: Pt) => number; roll: (k: number) => number }) => void) => {
    for (let i = Math.floor(u0 / pl.cu) - 3; i * pl.cu < u1 + pl.cu; i++)
      for (let j = Math.floor(v0 / pl.cv) - 3; j * pl.cv < v1 + pl.cv; j++) {
        if (pl.grounded && j < 0) continue;
        const stone = cycStone(pl, i, j);
        if (!stone) continue;
        const c = polyCenter(stone);
        const inset = stone.map((p): Pt => {
          const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
          const k = d > 0 ? Math.max(0.6, 1 - SEAM / 2 / d) : 1;
          return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k];
        });
        const part = clipRect(inset, u0, u1, v0, v1);
        if (part.length < 3) continue;
        const reach = Math.max(...inset.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])));
        emit({
          part, center: c,
          rise: (p) => Math.max(0, 1 - (Math.hypot(p[0] - c[0], p[1] - c[1]) / reach) ** 2),
          roll: (k) => lattice(S.blocks, i, j, pl.id * 4 + k),
        });
      }
  };

  // ── Floor ──
  const floor = new Mesh(mulberry32(seedOf()));
  const fs = style.floor;
  /** A rough floor's cells per tile edge. */
  const segs = fs.pattern === 'rough-fine' ? FINE_FLOOR_SEGS : FLOOR_SEGS;

  /** One flagstone (tile coordinates, inset by half a joint), raised STONE above the bed, lying a little unevenly. */
  const stone = (x0: number, z0: number, x1: number, z1: number) => {
    const m = floor, g = JOINT / 2;
    x0 += g; z0 += g; x1 -= g; z1 -= g;
    const lift = () => STONE * (1 + (m.R() - 0.5) * 0.8 * fs.bumpiness);
    const top: Vec3[] = [[x0, lift(), z0], [x1, lift(), z0], [x1, lift(), z1], [x0, lift(), z1]];
    const col = mixC(mulC(fs.color, 0.86 + m.R() * 0.22), fs.seam, m.R() * 0.2);
    const ctr: Vec3 = [(x0 + x1) / 2, STONE / 2, (z0 + z1) / 2];
    m.quad(top[0], top[1], top[2], top[3], col, [ctr[0], -1, ctr[2]], { j: 0.06 });
    for (let i = 0; i < 4; i++) {
      const p = top[i], q = top[(i + 1) % 4];
      m.quad([p[0], 0, p[2]], [q[0], 0, q[2]], q, p, mulC(col, 0.7), ctr, { j: 0.06 });
    }
  };

  /** A flagstone tile: a joint-colored bed (lava, in a veined patch) under 1 to 4 stones. */
  const flagstoneTile = (x: number, y: number) => {
    const vein = veinAt([x + 0.5, 0, y + 0.5]);
    if (vein) litAt([x + 0.5, VEIN_HALO_LIFT, y + 0.5]);
    floor.quad([x, 0, y], [x + 1, 0, y], [x + 1, 0, y + 1], [x, 0, y + 1], vein ? veinColor : fs.seam, [x + 0.5, -1, y + 0.5], vein ? veinOpts : { j: 0.04 });
    const r = floor.R(), h = floor.R() < 0.5;
    const cut = 0.35 + floor.R() * 0.3;
    if (r < 0.3) stone(x, y, x + 1, y + 1);
    else if (r < 0.55) {
      // Two halves, split either way
      if (h) { stone(x, y, x + 1, y + cut); stone(x, y + cut, x + 1, y + 1); }
      else { stone(x, y, x + cut, y + 1); stone(x + cut, y, x + 1, y + 1); }
    } else if (r < 0.8) {
      // A half and two quarters
      stone(x, y, x + cut, y + 1);
      stone(x + cut, y, x + 1, y + 0.5);
      stone(x + cut, y + 0.5, x + 1, y + 1);
    } else {
      const c2 = 0.4 + floor.R() * 0.2;
      stone(x, y, x + cut, y + c2); stone(x + cut, y, x + 1, y + c2);
      stone(x, y + c2, x + cut, y + 1); stone(x + cut, y + c2, x + 1, y + 1);
    }
  };

  /**
   * A rough floor's corner at lattice point (gx, gz) (`segs` per tile): raised by noise (never below the floor,
   * at most 0.03), and, inside a tile, nudged sideways so the facets don't line up in a grid (its edges stay straight,
   * meeting the walls).
   */
  const roughCorner = (gx: number, gz: number): Vec3 => {
    const p: Vec3 = [gx / segs, 0, gz / segs];
    if (gx % segs && gz % segs) {
      p[0] += (lattice(S.floor, gx, gz, 1) - 0.5) * (0.4 / segs);
      p[2] += (lattice(S.floor, gx, gz, 2) - 0.5) * (0.4 / segs);
    }
    p[1] = noiseAt(S.floor, p, 2.2) * 0.03 * fs.bumpiness;
    return p;
  };

  /** A rough floor tile: `segs` x `segs` cells of uneven facets, in patches of its color and seam color (or veins). */
  const roughTile = (x: number, y: number) => {
    for (let i = 0; i < segs; i++)
      for (let j = 0; j < segs; j++) {
        const gx = x * segs + i, gz = y * segs + j;
        const a = roughCorner(gx, gz), b = roughCorner(gx + 1, gz), c = roughCorner(gx + 1, gz + 1), d = roughCorner(gx, gz + 1);
        // Diagonals alternate, so the facets don't all lean one way
        const tris: [Vec3, Vec3, Vec3][] = (i ^ j) ? [[a, b, d], [b, c, d]] : [[a, b, c], [a, c, d]];
        for (const [p, q, r] of tris) {
          const m = centroid(p, q, r);
          if (veinAt(m)) {
            floor.tri(p, q, r, veinColor, [m[0], -1, m[2]], veinOpts);
            litAt([m[0], m[1] + VEIN_HALO_LIFT, m[2]]);
          }
          else floor.tri(p, q, r, mixC(fs.color, fs.seam, smooth(noiseAt(S.shade, m, 0.8))), [m[0], -1, m[2]], { j: 0.1 });
        }
      }
  };

  /**
   * A cyclopean floor tile: a joint-colored bed (veins, in a veined patch) under the floor's stones (cycStones, as a
   * cyclopean wall's, laid flat), each raised STONE and swelling a little toward its middle.
   */
  const cyclopeanTile = (x: number, y: number) => {
    const vein = veinAt([x + 0.5, 0, y + 0.5]);
    if (vein) litAt([x + 0.5, VEIN_HALO_LIFT, y + 0.5]);
    floor.quad([x, 0, y], [x + 1, 0, y], [x + 1, 0, y + 1], [x, 0, y + 1], vein ? veinColor : fs.seam, [x + 0.5, -1, y + 0.5], vein ? veinOpts : { j: 0.04 });
    cycStones(FLOOR_PLANE, x, x + 1, y, y + 1, ({ part, rise, roll }) => {
      const swell = (0.006 + 0.012 * fs.bumpiness) * (0.6 + 0.8 * roll(3));
      const at = (p: Pt): Vec3 => [p[0], STONE + swell * rise(p), p[1]];
      const col = mixC(mulC(fs.color, 0.84 + roll(0) * 0.22), fs.seam, roll(1) * 0.15);
      const mid = polyCenter(part);
      for (let k = 0; k < part.length; k++) floor.tri(at(mid), at(part[k]), at(part[(k + 1) % part.length]), col, [mid[0], -1, mid[1]], { j: 0.06 });
    });
  };

  const floorTile = { flagstones: flagstoneTile, cyclopean: cyclopeanTile, rough: roughTile, 'rough-fine': roughTile }[fs.pattern];
  for (let x = 0; x < cols; x++)
    for (let y = 0; y < rows; y++)
      if (isFloor(x, y) || isDoor(x, y)) {
        floorTile(x, y);
        haloOne(floor, x, y, 0);
      }

  // ── Walls ──
  const walls = new Mesh(mulberry32(seedOf()));
  const ws = style.walls;
  const mortar = mulC(ws.color, 0.45);
  const top = mulC(ws.color, WALL_TOP_SHADE);

  /** A rough wall's point: pushed about by noise (none at the floor, so it meets the floor cleanly). */
  const bulge = (p: Vec3): Vec3 => {
    const amp = 0.34 * ws.bumpiness * Math.min(1, p[1] / 0.3);
    if (!amp) return p;
    return [
      p[0] + (noiseAt(S.bulge, p, 1.7) - 0.5) * amp,
      p[1] + (noiseAt(S.bulge ^ 0x9e3779b9, p, 1.7) - 0.5) * amp * 0.6,
      p[2] + (noiseAt(S.bulge ^ 0x7f4a7c15, p, 1.7) - 0.5) * amp,
    ];
  };
  /**
   * A rough wall facet's color: the wall's (or its top's) in noise patches, or (on its faces, facing `n`; none on its
   * top) a vein.
   */
  const roughFacet = (p: Vec3, q: Vec3, r: Vec3, base: RGB, ctr: Vec3, n: Vec3 | null) => {
    const m = centroid(p, q, r);
    if (n && veinAt(m)) {
      walls.tri(p, q, r, veinColor, ctr, veinOpts);
      litAt([m[0] + n[0] * VEIN_HALO_LIFT, m[1], m[2] + n[2] * VEIN_HALO_LIFT]);
    }
    else walls.tri(p, q, r, mulC(base, 0.8 + 0.35 * noiseAt(S.shade, m, 0.9)), ctr, { j: 0.12 });
  };

  /** A point on a wall face: `s` (0..1) along it, `h` up, `out` off it. */
  const onSide = (f: Side, s: number, h: number, out = 0): Vec3 =>
    [f.a[0] + f.t[0] * s + f.n[0] * out, h, f.a[2] + f.t[2] * s + f.n[2] * out];

  /** A cyclopean wall face (its wall line's stones: cycStones), the stones swelling out of it. */
  const cyclopean = (f: Side, u0: number, y0: number, y1: number, ctr: Vec3) => {
    cycStones({ id: f.line, cu: CYC_U, cv: CYC_Y, grounded: true }, u0, u0 + 1, y0, y1, ({ part, center, rise, roll }) => {
      const swell = (0.012 + 0.022 * ws.bumpiness) * (0.6 + 0.8 * roll(3));
      const at = (p: Pt): Vec3 => onSide(f, p[0] - u0, p[1], 0.006 + swell * rise(p));
      const vein = veinAt(at(center));
      if (vein) litAt(onSide(f, center[0] - u0, center[1], VEIN_HALO_LIFT));
      const col = vein ? veinColor : mulC(ws.color, 0.8 + roll(0) * (0.2 + 0.2 * ws.bumpiness));
      const mid = polyCenter(part);
      for (let k = 0; k < part.length; k++) walls.tri(at(mid), at(part[k]), at(part[(k + 1) % part.length]), col, ctr, vein ? veinOpts : { j: 0.06 });
    });
  };

  /**
   * A wall face from height y0 to y1. Only a face toward floor or a doorway is the wall's own; every other one is drawn
   * `asTop`, plain rock in the top's color, never veined, running into the dark with the tops: a step between two
   * neighbouring wall tops (a rough wall's heights vary a little), a full wall's face over a stub (a room's corner
   * touching its floor only diagonally), a face toward deep rock (the wall mass's outside, never walked to). A face
   * with glowing veins showing may get a halo over one (haloOne).
   */
  const side = (f: Side, y0: number, y1: number, asTop = false) => {
    const ctr: Vec3 = onSide(f, 0.5, (y0 + y1) / 2, -0.5);
    const u0 = f.a[0] * f.t[0] + f.a[2] * f.t[2]; // where the face starts along the wall line
    sideFaces(f, y0, y1, asTop, ctr, u0);
    haloOne(walls, f.line, Math.round(u0), 1 + Math.round(y0 * 10));
  };
  /** A wall face's facets (side), by the wall's finish. */
  const sideFaces = (f: Side, y0: number, y1: number, asTop: boolean, ctr: Vec3, u0: number) => {
    if (rough) {
      const ys = [y0];
      for (let y = Math.floor(y0 / ROUGH_ROW + 1) * ROUGH_ROW; y < y1 - 0.05; y += ROUGH_ROW) ys.push(y);
      ys.push(y1);
      for (let k = 0; k < ys.length - 1; k++)
        for (let i = 0; i < ROUGH_SEGS; i++) {
          const s0 = i / ROUGH_SEGS, s1 = (i + 1) / ROUGH_SEGS;
          const a = bulge(onSide(f, s0, ys[k])), b = bulge(onSide(f, s1, ys[k])), c = bulge(onSide(f, s1, ys[k + 1])), d = bulge(onSide(f, s0, ys[k + 1]));
          roughFacet(a, b, c, asTop ? top : ws.color, ctr, asTop ? null : f.n);
          roughFacet(a, c, d, asTop ? top : ws.color, ctr, asTop ? null : f.n);
        }
      return;
    }
    if (asTop) {
      walls.quad(onSide(f, 0, y0), onSide(f, 1, y0), onSide(f, 1, y1), onSide(f, 0, y1), mulC(top, 0.92 + walls.R() * 0.12), ctr, { j: 0.04 });
      return;
    }
    // Masonry and cyclopean: mortar behind, then the stones
    walls.quad(onSide(f, 0, y0), onSide(f, 1, y0), onSide(f, 1, y1), onSide(f, 0, y1), mortar, ctr, { j: 0.04 });
    if (ws.finish === 'cyclopean') {
      cyclopean(f, u0, y0, y1, ctr);
      return;
    }
    // Masonry: the blocks course by course, laid along the wall line (so they continue past the tile), every other
    // course offset by half a block
    for (let k = Math.floor(y0 / COURSE); k * COURSE < y1 - 1e-6; k++) {
      const c0 = Math.max(y0, k * COURSE), c1 = Math.min(y1, (k + 1) * COURSE);
      if (c1 - c0 < 0.02) continue;
      const off = ((k & 1) * 0.5 + lattice(S.blocks, k, f.line, 0) * 0.3) * BLOCK;
      for (let i = Math.floor((u0 - off) / BLOCK); off + i * BLOCK < u0 + 1; i++) {
        const b0 = off + i * BLOCK, b1 = b0 + BLOCK;
        // A real block edge gets half a joint; a cut at the face's end or height doesn't (the next face carries on)
        const s0 = Math.max(b0, u0) - u0 + (b0 >= u0 ? SEAM / 2 : 0), s1 = Math.min(b1, u0 + 1) - u0 - (b1 <= u0 + 1 ? SEAM / 2 : 0);
        const h0 = c0 + (c0 === k * COURSE && c0 > 0 ? SEAM / 2 : 0), h1 = c1 - (c1 === (k + 1) * COURSE && c1 < y1 ? SEAM / 2 : 0);
        if (s1 - s0 < 0.02) continue;
        const v = lattice(S.blocks, i, k, f.line + 1);
        const vein = veinAt(onSide(f, (s0 + s1) / 2, (h0 + h1) / 2));
        const col = vein ? veinColor : mulC(ws.color, 0.84 + v * (0.16 + 0.2 * ws.bumpiness));
        const out = 0.006 + lattice(S.blocks, i, k, f.line + 2) * 0.014 * ws.bumpiness;
        if (vein) litAt(onSide(f, (s0 + s1) / 2, (h0 + h1) / 2, out + VEIN_HALO_LIFT));
        walls.quad(onSide(f, s0, h0, out), onSide(f, s1, h0, out), onSide(f, s1, h1, out), onSide(f, s0, h1, out), col, ctr, { j: 0.06 });
      }
    }
  };

  /** A wall's top at height h. */
  const cap = (x: number, y: number, h: number) => {
    const ctr: Vec3 = [x + 0.5, h - 0.5, y + 0.5];
    if (!rough) {
      walls.quad([x, h, y], [x + 1, h, y], [x + 1, h, y + 1], [x, h, y + 1], mulC(top, 0.92 + walls.R() * 0.12), ctr, { j: 0.04 });
      return;
    }
    const at = (i: number, j: number) => bulge([x + i / ROUGH_SEGS, h, y + j / ROUGH_SEGS]);
    for (let i = 0; i < ROUGH_SEGS; i++)
      for (let j = 0; j < ROUGH_SEGS; j++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        roughFacet(a, b, c, top, ctr, null);
        roughFacet(a, c, d, top, ctr, null);
      }
  };

  for (let x = 0; x < cols; x++)
    for (let y = 0; y < rows; y++) {
      const h = wallHeight(x, y);
      if (!h) continue;
      cap(x, y, h);
      for (const { d, side: f } of sidesOf(x, y)) {
        const nx = x + d[0], ny = y + d[1], nh = wallHeight(nx, ny);
        if (nh < h) side(f, nh, h, !isFloor(nx, ny) && !isDoor(nx, ny));
      }
    }

  // Doorways: jambs at the sides of the opening (along its wall), and a lintel above the door in a full wall
  for (const { x, y } of doors) {
    const h = isCut(x, y) ? STUB_HEIGHT : fullHeight;
    const alongX = isFloor(x, y - 1) || isFloor(x, y + 1); // the wall runs east-west
    const col = rough ? mulC(ws.color, 0.9) : ws.color;
    for (const e of [JAMB / 2, 1 - JAMB / 2]) {
      box(walls, alongX ? [x + e, h / 2, y + 0.5] : [x + 0.5, h / 2, y + e], alongX ? [JAMB, h, 1] : [1, h, JAMB], col, 0, { j: 0.06 });
    }
    if (h > LINTEL_Y) {
      box(walls, [x + 0.5, (LINTEL_Y + h) / 2, y + 0.5], [1, h - LINTEL_Y, 1], col, 0, { j: 0.06 });
      walls.quad([x, h + 0.002, y], [x + 1, h + 0.002, y], [x + 1, h + 0.002, y + 1], [x, h + 0.002, y + 1], top, [x + 0.5, 0, y + 0.5], { j: 0.04 });
    }
  }

  const model = (name: string, m: Mesh): Model => ({ designId: 'terrain', seed, name, mesh: bake(m) });
  return { floor: model('Floor', floor), walls: model('Walls', walls) };
}
