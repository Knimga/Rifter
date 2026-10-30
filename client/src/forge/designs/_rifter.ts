// Rifter family shape, shared by its designs (one per INTERACTIVE_OBJECTS entry: rifter.ts dormant, rifter-active.ts
// active): the Sanctum's arcane device for opening rifts. Carved stone, aged bronze and glowing runes: ritual and
// machine. Two states (RifterState): dormant, its runes, crystals, vials and sphere glowing faintly; active, a
// keystone in its socket and a rift open between its struts (built in from their own designs, rifts/keystone.ts
// and rifts/rift.ts: embed), every light glowing bright with halos on the strongest. Active is a tinted model
// (core/tint.ts): drawn in the opened dungeon's riftColor, the keystone and rift take it; its own lights stay blue.
// Active's `activate` animation (1.5 s) is the device waking: its lights fade up from their dormant glow (PartFade)
// while the rift grows out from its center (PartGrow); the keystone is there from the start. The game swaps the
// dormant model for the active one and plays it. Swapping keys while awake: `close` (1 s) collapses the rift, then
// `reopen` (1.5 s) opens the next (the keystone and rift tinted apart meanwhile: RIFTER_TINT_PARTS). Anchors on both: `socket` (the socket's floor; `socket_up` a
// point out along its facing, for its tilt) and `rift` (where the rift stands, on the struts' base).
// Three tiles in a line along x, standing on the floor:
//   - middle (x = 0): rift stabilizer struts on a round dark stone base ringed with runes like a clock face. Two
//     curved near-black arms, braced and riveted in bronze, bow out around where an opened rift stands (the
//     rift is its own model, placed on this tile) and curve in above its top, prongs reaching in;
//   - the party's right (+x, the model's left): the key receptacle, a square dark basalt plinth,
//     its cap's top sloping toward the party with a small round socket for the keystone;
//   - the party's left (-x): a broader, lower, dark octagonal drum ringed with runes, carrying the ritual
//     instruments (an armillary sphere, a crystal on a tall rod, a glowing sphere in a cup, a curved rack of
//     glowing vials, candle stubs).
// Each piece is its own dark stone (warm grey-brown, slate, violet-black), the tones close but distinct.
// A bronze conduit along the back, running into all three, ties them together (one object, not three).
// Built facing +z (the side the party uses it from), in tile units: 1 = one tile, so the fit leaves it as built.
// Files starting with "_" are NOT registered as designs.
import type { Design } from '../core/types';
import type { Mesh, ColorFn, FaceOpts } from '../core/mesh';
import { bipyr, blob, box, frustum, ringPts, tube } from '../core/primitives';
import { add, cross, mixC, mul, mulC, norm, rotX, rotZ, sub, type RGB, type Vec3 } from '../core/vec';
import { interactiveEntry } from './_interactive';
import { embed } from '../core/embed';
import { fitScale } from '../core/finalize';
import { ITEM_SEED } from '../core/link';
import type { FitSpec } from '../core/types';
import riftDesign from './rifts/rift';
import keystoneDesign from './rifts/keystone';

// Each piece its own dark stone, the tones close but not the same
const DRUM: RGB = [40, 37, 36];        // the instrument drum: warm dark grey-brown
const DRUM_TOP: RGB = [50, 47, 45];    // its tops, catching the light
const BASE: RGB = [31, 33, 40];        // the struts' round base: cool dark slate
const BASE_TOP: RGB = [40, 42, 49];
const BASALT: RGB = [30, 28, 34];      // the receptacle: violet-black basalt
const BASALT_TOP: RGB = [40, 37, 44];
const STRUT: RGB = [26, 26, 30];       // the struts, clamps and mounts: near-black iron
const BRONZE: RGB = [100, 76, 48];     // aged bronze: braces, rivets, collars, trims
const VERDIGRIS: RGB = [64, 94, 80];   // its green patina, in patches
const SOCKET: RGB = [14, 12, 18];      // the empty socket's floor
const WAX: RGB = [184, 172, 140];
/** The device's state: dormant (no keystone set) or active (a keystone set, its rift open). */
export type RifterState = 'dormant' | 'active';

/** Everything that glows, and how: what differs between the states. */
interface Lights {
  /** Runes, rune nodes and inlays. */
  rune: RGB;
  face: FaceOpts;
  /** The crystal on the instrument rod. */
  crystal: RGB;
  /** The vials in their rack, and the sphere by the rod. */
  vial: RGB;
  orb: RGB;
  /** Halos on the strongest lights (the strut tips, the rune nodes, the crystals, the vials), not only the sphere. */
  halos: boolean;
  /** Active only: the lights it wakes from (the dormant ones), where its `activate` fade starts. */
  from?: Lights;
}

const LIGHTS: Record<RifterState, Lights> = {
  // A weak arcane blue-violet glow (unlit, so it reads, but dim); only the sphere has a halo
  dormant: {
    rune: [92, 104, 178], face: { e: 0.6, j: 0.04 },
    crystal: mixC([92, 104, 178], [150, 160, 230], 0.3),
    vial: [104, 168, 196], orb: [146, 154, 232], halos: false,
  },
  // Awake: every light-blue spot bright, the strongest haloed
  active: {
    rune: [128, 176, 244], face: { e: 0.95, j: 0.02 },
    crystal: [176, 206, 255],
    vial: [140, 220, 246], orb: [196, 206, 255], halos: true,
  },
};

// The active lights wake from the dormant ones
LIGHTS.active.from = LIGHTS.dormant;

/** A halo's color: the light's, pushed toward white so it blooms onto the dark around it. */
const haloOf = (col: RGB): RGB => mixC(col, [225, 235, 255], 0.4);

type LightKey = 'rune' | 'crystal' | 'vial' | 'orb';
/** A light's face options: its glow, and (active) the dormant color its fade starts from. */
const lightFace = (L: Lights, key: LightKey, o: FaceOpts = {}): FaceOpts => ({ ...L.face, ...o, ...(L.from && { from: L.from[key] }) });
/** A halo on one of the strongest lights (active only: none while dormant), fading in from nothing. */
function lightHalo(m: Mesh, L: Lights, p: Vec3, r: number, key: LightKey): void {
  if (L.halos) m.halo(p, r, haloOf(L[key]), undefined, L.from && [0, 0, 0]);
}

/** The struts' round base: its radius and the height of its top (the struts stand on it). */
const BASE_R = 0.48, BASE_H = 0.1;
/** The plinths' centers (x): drawn in close to the struts' base, each still within its own tile. */
const LEFT_X = -0.93, RIGHT_X = 0.86;
/** Where an opened rift stands: the middle tile's center. Its oval is about 0.68 wide and 1.5 tall. */
const RIFT_TOP = 1.5;

/** Stone, warmer and lighter on its tops. */
const stone = (side: RGB, top: RGB): ColorFn => (_c, n) => (n[1] > 0.6 ? top : side);
/** Bronze with verdigris in patches (a slow wave through space, so neighbouring faces agree). */
const bronze: ColorFn = (c) =>
  Math.sin(c[0] * 9 + 1.3) + Math.sin(c[1] * 11 + 0.4) + Math.sin(c[2] * 13 + 2.1) > 1.4 ? mixC(BRONZE, VERDIGRIS, 0.7) : BRONZE;

/**
 * A small rune mark on a surface: a quad at `p`, facing `n`, `w` wide along `t` and `h` tall across it. `t`
 * defaults to level (along a wall); a mark on a top face (n straight up) must pass its own.
 */
function rune(m: Mesh, L: Lights, p: Vec3, n: Vec3, w: number, h: number, t: Vec3 = norm(cross([0, 1, 0], n))): void {
  const u = norm(cross(n, t)), q = add(p, mul(n, 0.004));
  const c = (a: number, b: number): Vec3 => add(q, add(mul(t, a * w / 2), mul(u, b * h / 2)));
  m.quad(c(-1, -1), c(1, -1), c(1, 1), c(-1, 1), L.rune, add(q, mul(n, -1)), lightFace(L, 'rune'));
}

/**
 * The conduit along the back: a bronze pipe on the floor running into all three (its left end inside the drum,
 * its right into a junction block on the receptacle's back), with collars between them.
 */
function conduit(m: Mesh): void {
  m.part('base');
  const y = 0.035, z = -0.3;
  tube(m, [[LEFT_X, y, z], [RIGHT_X - 0.02, y, z]], 0.035, 0.035, 6, bronze, { j: 0.1 });
  // A collar in the gap between the struts' base and the receptacle
  const cx = (BASE_R + RIGHT_X - 0.23) / 2;
  frustum(m, [cx - 0.03, y, z], [cx + 0.03, y, z], 0.048, 0.048, 6, bronze, { j: 0.1 });
  // The junction: a squat basalt block against the receptacle's back, banded in bronze, the pipe ending in it
  box(m, [RIGHT_X, 0.06, -0.27], [0.14, 0.12, 0.14], stone(BASALT, BASALT_TOP), 0.04, { j: 0.12 });
  box(m, [RIGHT_X, 0.1, -0.27], [0.15, 0.02, 0.15], bronze, 0, { j: 0.08 });
}

/**
 * The middle tile: the round dark stone base, its rim trimmed in bronze and a ring of runes around its top like
 * the numbers on a clock, and on it the two stabilizer struts.
 */
function struts(m: Mesh, L: Lights): void {
  m.part('struts', [0, BASE_H, 0]);
  m.anchor('rift', [0, BASE_H, 0]); // where an opened rift stands (its own model), on the base, turned with the device
  frustum(m, [0, 0, 0], [0, BASE_H, 0], BASE_R + 0.02, BASE_R, 16, stone(BASE, BASE_TOP), { j: 0.12 });
  frustum(m, [0, BASE_H - 0.022, 0], [0, BASE_H + 0.004, 0], BASE_R + 0.008, BASE_R + 0.008, 16, bronze, { j: 0.08, caps: false });
  // Twelve runes around the top, each set along its radius like a clock's numbers
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI, d: Vec3 = [Math.cos(a), 0, Math.sin(a)];
    rune(m, L, [d[0] * (BASE_R - 0.08), BASE_H, d[2] * (BASE_R - 0.08)], [0, 1, 0], 0.07, 0.034, d);
  }
  for (const s of [-1, 1]) {
    // Footing: a dark stone block on the base the strut rises from, a bronze band around it
    const fx = s * 0.4;
    box(m, [fx, BASE_H + 0.06, 0], [0.15, 0.12, 0.22], stone(BASE, BASE_TOP), 0.04, { j: 0.12 });
    box(m, [fx, BASE_H + 0.1, 0], [0.16, 0.025, 0.23], bronze, 0, { j: 0.08 });
    // The strut: near-black, bowing out around the rift and curving in above its top (a cradle), in the x-y
    // plane (sideways to every camera angle, so it never collapses to a stub)
    const path: Vec3[] = [
      [fx, BASE_H + 0.12, 0], [s * 0.5, 0.62, 0], [s * 0.51, 1.08, 0],
      [s * 0.44, 1.42, 0], [s * 0.33, 1.66, 0], [s * 0.2, RIFT_TOP + 0.28, 0],
    ];
    tube(m, path, 0.068, 0.036, 4, STRUT, { j: 0.1 });
    // Bronze braces: collars where it leaves the footing and at its middle, and near the top
    frustum(m, add(path[0], [0, 0.02, 0]), add(path[0], [s * 0.01, 0.09, 0]), 0.08, 0.078, 4, bronze, { j: 0.1 });
    frustum(m, [s * 0.505, 0.82, 0], [s * 0.508, 0.9, 0], 0.073, 0.072, 4, bronze, { j: 0.1 });
    frustum(m, [s * 0.4, 1.53, 0], [s * 0.36, 1.59, 0], 0.056, 0.054, 4, bronze, { j: 0.1 });
    // Rivets down the strut's front and back faces, between the braces
    for (const t of [0.16, 0.28, 0.5, 0.62, 0.74]) {
      const seg = t * (path.length - 1), k = Math.min(path.length - 2, Math.floor(seg)), f = seg - k;
      const p = add(path[k], mul(sub(path[k + 1], path[k]), f));
      const r = 0.068 + (0.036 - 0.068) * t;
      for (const z of [1, -1]) box(m, add(p, [0, 0, z * r * 0.72]), [0.026, 0.026, 0.02], bronze, 0.1, { j: 0.08 });
    }
    // Prongs reaching in toward the rift (holding it when one is open), in bronze, a faint rune node at each tip
    for (const py of [0.55, 1.18]) {
      const base: Vec3 = [s * 0.49, py, 0], tip: Vec3 = [s * 0.4, py + 0.03, 0];
      frustum(m, base, tip, 0.03, 0.014, 4, bronze, { j: 0.1 });
      bipyr(m, tip, 0.022, 0.05, 4, L.rune, lightFace(L, 'rune'));
      lightHalo(m, L, tip, 0.11, 'rune');
    }
    // A bronze cap on the strut's tip, holding a rune node
    frustum(m, path[path.length - 1], add(path[path.length - 1], [-s * 0.02, 0.03, 0]), 0.04, 0.03, 4, bronze, { j: 0.1 });
    const node = add(path[path.length - 1], [-s * 0.03, 0.07, 0]);
    bipyr(m, node, 0.03, 0.07, 4, L.rune, lightFace(L, 'rune'));
    lightHalo(m, L, node, 0.17, 'rune');
  }
}

/** Points of a square at height y around (x, z), a flat side to the front: corners front-right, back-right, back-left, front-left. */
const square = (x: number, y: number, z: number, h: number): Vec3[] =>
  [[x + h, y, z + h], [x + h, y, z - h], [x - h, y, z - h], [x - h, y, z + h]];

/** How deep the keystone socket sinks into the cap's top. */
const SOCKET_D = 0.04;

/** The cap's top tilts toward the party by this much, so the socket faces whoever stands at it. */
const CAP_TILT = Math.PI / 6;

/**
 * The party's right (+x): the key receptacle, a square dark basalt plinth, a flat side to the front. Its cap's top slopes
 * toward the party (CAP_TILT) with a small round socket sunk in it for the keystone, a faint rune ring around.
 */
function receptacle(m: Mesh, L: Lights): void {
  const X = RIGHT_X, Z = 0.02;
  m.part('receptacle', [X, 0, Z]);
  const side = stone(BASALT, BASALT_TOP);
  // Base block and the shaft, tapering a little, then the cap overhanging it
  box(m, [X, 0.04, Z], [0.46, 0.08, 0.46], side, 0.03, { j: 0.12 });
  const y0 = 0.46; // the cap's underside: the shaft's top
  const shaft = (y: number, h: number) => square(X, y, Z, h);
  const rings = [shaft(0.08, 0.19), shaft(y0, 0.16)];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    m.quad(rings[0][i], rings[0][j], rings[1][j], rings[1][i], side, [X, 0.3, Z], { j: 0.12 });
  }
  // Bronze bands at the foot and the neck of the shaft
  for (const [y, h] of [[0.1, 0.19], [y0 - 0.025, 0.162]] as const) {
    const lo = square(X, y - 0.015, Z, h + 0.01), hi = square(X, y + 0.015, Z, h + 0.01);
    for (let i = 0; i < 4; i++) m.quad(lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i], bronze, [X, y, Z], { j: 0.08 });
  }
  // The cap's top: a square (a flat side to the front) in a plane sloping down toward the party. A point
  // on it: `u` across (x), `v` down the slope (toward the front), `h` out of the surface.
  // Its center is set so the front edge stands just above the underside (a thin lip), the back rising from there
  const R = 0.21, C: Vec3 = [X, y0 + 0.035 + 0.21 * Math.sin(CAP_TILT), Z]; // R: the square's half-width
  const slope: Vec3 = [0, -Math.sin(CAP_TILT), Math.cos(CAP_TILT)], up: Vec3 = [0, Math.cos(CAP_TILT), Math.sin(CAP_TILT)];
  const at = (u: number, v: number, h = 0): Vec3 => add(C, add(add([u, 0, 0], mul(slope, v)), mul(up, h)));
  /** The square's edge in direction a (0 = +x, then toward the front): h / max(|cos|, |sin|). */
  const edge = (a: number, h: number) => h / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
  const N = 16, ang = (i: number) => (i / N) * 2 * Math.PI;
  const outer = Array.from({ length: N }, (_, i) => at(Math.cos(ang(i)) * edge(ang(i), R), Math.sin(ang(i)) * edge(ang(i), R)));
  const corners = [outer[2], outer[14], outer[10], outer[6]]; // front-right, back-right, back-left, front-left (as square)
  // The underside, flat, its corners under the top's
  const under = corners.map((p) => [p[0], y0, p[2]] as Vec3);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    m.quad(under[i], under[j], corners[j], corners[i], side, [X, (y0 + C[1]) / 2, Z], { j: 0.12 }); // sides
  }
  m.quad(under[0], under[1], under[2], under[3], side, [X, y0 + 1, Z]);
  // The top, around the socket: rim at SOCKET_R, sinking SOCKET_D to a slightly smaller floor
  const SOCKET_R = 0.07;
  const rim = Array.from({ length: N }, (_, i) => at(Math.cos(ang(i)) * SOCKET_R, Math.sin(ang(i)) * SOCKET_R));
  const floor = Array.from({ length: N }, (_, i) => at(Math.cos(ang(i)) * SOCKET_R * 0.8, Math.sin(ang(i)) * SOCKET_R * 0.8, -SOCKET_D));
  const below = at(0, 0, -1), above = at(0, 0, 1);
  // Where a keystone rests (its own model): the socket's floor, and a point out along the way it faces
  m.anchor('socket', at(0, 0, -SOCKET_D));
  m.anchor('socket_up', at(0, 0, 0.1 - SOCKET_D));
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    m.quad(outer[i], outer[j], rim[j], rim[i], BASALT_TOP, below, { j: 0.1 });               // top surface
    m.quad(rim[i], rim[j], floor[j], floor[i], mulC(BASALT, 0.7), above, { j: 0.06 });       // socket wall
    m.tri(at(0, 0, -SOCKET_D), floor[i], floor[j], SOCKET, below, { j: 0.04 });               // socket floor
  }
  // A rune ring around the socket
  const ring = (r: number, i: number) => at(Math.cos(ang(i)) * r, Math.sin(ang(i)) * r, 0.003);
  for (let i = 0; i < N; i++) m.quad(ring(0.095, i), ring(0.095, i + 1), ring(0.112, i + 1), ring(0.112, i), L.rune, below, lightFace(L, 'rune'));
  // A bronze trim around the top's edge, following the slope
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const out = (p: Vec3): Vec3 => add(p, add(mul(norm([p[0] - X, 0, p[2] - Z]), 0.012), [0, 0.004, 0]));
    const hi = [out(corners[i]), out(corners[j])], lo = hi.map((p) => add(p, [0, -0.03, 0]));
    m.quad(lo[0], lo[1], hi[1], hi[0], bronze, [X, (y0 + C[1]) / 2, Z], { j: 0.08 });
  }
  // A rune on each of the cap's four sides
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const mid = mul(add(add(under[i], under[j]), add(corners[i], corners[j])), 0.25);
    rune(m, L, mid, norm([mid[0] - X, 0, mid[2] - Z]), 0.07, 0.03);
  }
}

/** The party's left (-x): the octagonal instrument drum, runes around it, the instruments on top. */
function instruments(m: Mesh, rf: (a: number, b: number) => number, L: Lights): void {
  const X = LEFT_X, Z = -0.02, TOP = 0.42;
  m.part('instruments', [X, 0, Z]);
  // The drum, broad and low, a bronze rim at its top
  frustum(m, [X, 0, Z], [X, TOP, Z], 0.42, 0.37, 8, stone(DRUM, DRUM_TOP), { j: 0.12 });
  frustum(m, [X, TOP - 0.03, Z], [X, TOP + 0.012, Z], 0.385, 0.385, 8, bronze, { j: 0.08, caps: false });
  frustum(m, [X, TOP - 0.03, Z], [X, TOP + 0.004, Z], 0.37, 0.37, 8, stone(DRUM, DRUM_TOP), { j: 0.1 }); // its stone top, inside the rim
  // Runes on each face of the drum
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * 2 * Math.PI;
    const n: Vec3 = [Math.cos(a), 0.12, Math.sin(a)];
    rune(m, L, [X + Math.cos(a) * 0.39, 0.29, Z + Math.sin(a) * 0.39], norm(n), rf(0.06, 0.09), 0.05);
  }
  const top = TOP + 0.012;
  // The armillary sphere: three bronze rings about a dim rune core, on a short stand
  const C: Vec3 = [X + 0.04, top + 0.3, Z + 0.02];
  frustum(m, [C[0], top, C[2]], [C[0], top + 0.12, C[2]], 0.06, 0.025, 6, bronze, { j: 0.1 });
  frustum(m, [C[0], top + 0.1, C[2]], [C[0], C[1] - 0.17, C[2]], 0.018, 0.018, 4, bronze, { j: 0.1 });
  const R = 0.17;
  const rings: ((p: Vec3) => Vec3)[] = [
    (p) => p,                                 // upright, facing the front
    (p) => rotX(p, Math.PI / 2),              // level
    (p) => rotZ(rotX(p, Math.PI / 2), 0.6),   // tilted: the ecliptic
  ];
  for (const turn of rings) {
    const pts = ringPts([0, 0, 0], [0, 0, 1], R, 14).map((p) => add(C, turn(p)));
    tube(m, [...pts, pts[0]], 0.016, 0.016, 3, bronze, { j: 0.1, caps: false });
  }
  bipyr(m, C, 0.045, 0.1, 5, L.rune, lightFace(L, 'rune'));
  lightHalo(m, L, C, 0.16, 'rune');
  // A tall bronze rod at the back, forked at the top, holding a dim crystal
  const rodX = X - 0.22, rodZ = Z - 0.2, rodTop = 1.02;
  frustum(m, [rodX, top, rodZ], [rodX, top + 0.05, rodZ], 0.06, 0.05, 6, bronze, { j: 0.1 });
  frustum(m, [rodX, top + 0.05, rodZ], [rodX, rodTop, rodZ], 0.02, 0.016, 4, bronze, { j: 0.1 });
  for (const s of [-1, 1]) frustum(m, [rodX, rodTop - 0.02, rodZ], [rodX + s * 0.06, rodTop + 0.1, rodZ], 0.014, 0.01, 3, bronze, { j: 0.1 });
  bipyr(m, [rodX, rodTop + 0.1, rodZ], 0.045, 0.16, 5, L.crystal, lightFace(L, 'crystal'));
  lightHalo(m, L, [rodX, rodTop + 0.1, rodZ], 0.2, 'crystal');
  // On the inner side (toward the struts), a curved rack of small glowing vials, each held upright in a black clamp on a black rail
  const VIALS = 5, rackR = 0.3, rail = top + 0.085;
  const rackAt = (a: number, y: number): Vec3 => [X + Math.cos(a) * rackR, y, Z + Math.sin(a) * rackR];
  const a0 = (-50 / 180) * Math.PI, a1 = (30 / 180) * Math.PI; // around +x, a little toward the back
  tube(m, Array.from({ length: 7 }, (_, i) => rackAt(a0 - 0.12 + (a1 - a0 + 0.24) * (i / 6), rail)), 0.015, 0.015, 4, STRUT, { j: 0.1, caps: false });
  for (const a of [a0 - 0.12, a1 + 0.12]) frustum(m, rackAt(a, top), rackAt(a, rail + 0.01), 0.016, 0.014, 4, STRUT, { j: 0.08 });
  for (let k = 0; k < VIALS; k++) {
    const a = a0 + (a1 - a0) * (k / (VIALS - 1)), h = rf(0.1, 0.13);
    frustum(m, rackAt(a, top), rackAt(a, top + h), 0.022, 0.02, 6, L.vial, lightFace(L, 'vial', { j: 0.05 }));
    if (k % 2 === 0) lightHalo(m, L, rackAt(a, top + h / 2), 0.11, 'vial');
    frustum(m, rackAt(a, rail - 0.016), rackAt(a, rail + 0.016), 0.03, 0.03, 6, STRUT, { j: 0.08 }); // its clamp
  }
  // Beside the rod, a glowing sphere resting in a black cup on a short black stand
  const orb: Vec3 = [X - 0.27, top + 0.12, Z - 0.05];
  frustum(m, [orb[0], top, orb[2]], [orb[0], top + 0.025, orb[2]], 0.05, 0.042, 6, STRUT, { j: 0.08 });
  frustum(m, [orb[0], top + 0.025, orb[2]], [orb[0], orb[1] - 0.05, orb[2]], 0.014, 0.014, 4, STRUT, { j: 0.08 });
  frustum(m, [orb[0], orb[1] - 0.06, orb[2]], [orb[0], orb[1] - 0.02, orb[2]], 0.026, 0.044, 6, STRUT, { j: 0.08, caps: false });
  blob(m, orb, [0.048, 0.048, 0.048], 1, 0.02, L.orb, lightFace(L, 'orb', { e: Math.max(0.65, L.face.e ?? 0), j: 0.04 }));
  // Its halo glows in both states (twice as wide awake); waking, it brightens from the dormant one's glow
  m.halo(orb, L.halos ? 0.22 : 0.11, mixC(L.orb, [220, 225, 255], 0.4), undefined, L.from && mulC(mixC(L.from.orb, [220, 225, 255], 0.4), 0.5));
  // Three unlit candle stubs at the front, of different heights
  for (const [dx, dz, h] of [[-0.24, 0.2, 0.1], [-0.15, 0.27, 0.07], [-0.3, 0.1, 0.13]] as const) {
    const p: Vec3 = [X + dx, top, Z + dz];
    frustum(m, p, add(p, [0, h, 0]), 0.03, 0.026, 6, WAX, { j: 0.08 });
    box(m, add(p, [0, h + 0.012, 0]), [0.008, 0.024, 0.008], [30, 26, 24]);
  }
}

/** The Rifter's fit: built in tile units, three tiles long (x), its struts the top. */
const FIT: FitSpec = { kind: 'standing', height: RIFT_TOP + 0.31, maxRadius: 1.56 };

/**
 * Active: the keystone resting in the socket, tilted with the cap, and the rift on the struts' base, each at its
 * true size (scaled against the Rifter's own fit: it is built in tile units, but its fit scales it a little).
 */
function opened(m: Mesh, seed: number): void {
  const s = fitScale(m, FIT);
  // The keystone, inserted end first: its length (x) stood up along the way the socket faces (up, then tilted
  // toward the party with the cap), its center at the socket's rim, so half of it is down in the socket (the
  // socket is shallow: the rest is hidden inside the cap) and half emerges from it
  const socket = m.anchors.socket, up = norm(sub(m.anchors.socket_up, socket));
  const rim = add(socket, mul(up, SOCKET_D));
  embed(m, keystoneDesign, ITEM_SEED, (p) => add(rim, rotX(rotZ(p, Math.PI / 2), CAP_TILT)), 1 / s);
  // The rift, standing on the base, facing the way the device does
  const rift = m.anchors.rift;
  embed(m, riftDesign, seed, (p) => add(rift, p), 1 / s);
}

/** The parts whose lights wake (`activate`), and the rift's parts, which grow out from its center. */
const LIT_PARTS = ['struts', 'receptacle', 'instruments'];
const RIFT_PARTS = ['swirl', 'rim', 'glow'];

/**
 * The active Rifter's two tinted things, by part (tintModel's `parts`): the keystone and the rift. Usually both
 * in one key's color; while the rift swaps to another key's, the keystone takes the new color at once and the
 * closing rift keeps the old one.
 */
export const RIFTER_TINT_PARTS = { keystone: ['pill'], rift: RIFT_PARTS } as const;

/** How long the rift takes to close when swapping keys (`close`): the game opens the next one after it. */
export const RIFT_CLOSE_MS = 1000;

/** A Rifter design for INTERACTIVE_OBJECTS entry `objectId`, in `state` (one design per entry: rifter.ts, rifter-active.ts). */
export function rifterDesign(objectId: string, state: RifterState): Design {
  const { id, label, source } = interactiveEntry(objectId);
  const L = LIGHTS[state];
  const active = state === 'active';
  return {
    id, label, source,
    category: 'interactive',
    fit: FIT,
    budget: active ? 3500 : 2300, // active: the keystone and the rift too
    ...(active && {
      // The rift's spinning swirl and rim, and the device waking
      motion: riftDesign.motion,
      animations: [
        {
          name: 'activate', ms: 1500,
          fades: LIT_PARTS.map((part) => ({ part })),
          grows: RIFT_PARTS.map((part) => ({ part })),
        },
        // Swapping keys while awake: the rift collapses (`close`), then the next one opens (`reopen`); the lights stay
        // up. The game lists them in turn: activate + close, then activate + reopen
        { name: 'close', ms: RIFT_CLOSE_MS, grows: RIFT_PARTS.map((part) => ({ part, shrink: true })) },
        { name: 'reopen', ms: 1500, grows: RIFT_PARTS.map((part) => ({ part })) },
      ],
    }),
    build(c) {
      const m = c.mesh;
      m.anchor('feet', [0, 0, 0]); // the middle tile's center
      conduit(m);
      struts(m, L);
      receptacle(m, L);
      instruments(m, c.rf, L);
      if (active) opened(m, c.seed);
      return label;
    },
  };
}
