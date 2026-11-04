// Model for Enchanter's Table (data/world/decorObjects.ts › enchanters-table): a long table of dark carved stone, its
// back against a wall. A thick slab on a body carved in three gothic arched panels between pilasters, on a plinth;
// gritty, near-black stone with cool blue light in it. Left and right are as seen standing in front of it:
// - the middle: the enchanting surface, a ritual circle of glowing leylines (rings, a broken ring, spokes, an
//   eight-pointed star of two squares, markers), and a small crystal hovering over its center;
// - the left: a sprawl of books, scrolls and scattered glowing affix shards (the Affix Shard's own model, each in a
//   category's color), and an open tome near the middle, turned toward someone standing at the circle;
// - the right: arcane tools (a brass armillary on its stand, a mortar and pestle, a candle), glowing jars and a stack
//   of books.
// Built in tile units over its three tiles (span 3), along x: its `feet` anchor at the middle tile's center (x = 0), the
// others at x = −1 (the left, from its front) and x = 1. Its front faces +z; its back is at −z, against the wall.
// One fixed look (the shards' places and colors are written in).
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { bipyr, box } from '../../core/primitives';
import { embed } from '../../core/embed';
import { paintTint } from '../../core/tint';
import { add, mulC, rotY, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';
import { LEATHER, book, bookStack, candle, openTome, scroll } from '../_books';
import { JAR_GLOW, armillary, jar, leyline, mortar, openScroll } from '../_arcana';
import affixShard from '../loot/affix-shard';
import { SHARD_CATEGORIES } from '../../../data/gear/shards';

const STONE: RGB = [25, 24, 30];
const STONE_TOP: RGB = [38, 37, 46]; // the slab's top and ledges, catching the light
const STONE_DEEP: RGB = [12, 12, 16]; // the carving's recesses
const LEY: RGB = [70, 186, 255]; // the leylines' light: a cool, semi-neon blue
const LEY_HALO: RGB = [40, 120, 220];
const CRYSTAL: RGB = [200, 238, 255];

/** The table's extent: its ends (x), back (−z, at the wall) and front (+z), and its top. */
const X1 = 1.42, Z0 = -0.44, Z1 = 0.3, TOP = 0.5;
/** The slab's thickness. */
const SLAB = 0.075;
/** The ritual circle's center, on the middle of the top. */
const CIRCLE: Vec3 = [0, TOP, (Z0 + Z1) / 2];
/** How far it reaches from its feet (a back corner): its fit, so it keeps the size it is built at. */
const REACH = Math.hypot(X1 + 0.02, Z0 - 0.02);
/** Where someone using the table stands: in front of the circle (the open tome turns toward them). */
const READER: Vec3 = [0, TOP, Z1 + 0.5];

/** A glowing leyline on the top from `p` to `q`, `w` wide (_arcana's leyline). */
const strip = (m: Mesh, p: Vec3, q: Vec3, w: number, col: RGB) => leyline(m, p, q, w, col, { e: 0.9, j: 0.05 });

/** An arc of leyline around `c` (radius r, from angle a0 to a1), in `segs` strips. */
function arc(m: Mesh, c: Vec3, r: number, a0: number, a1: number, segs: number, w: number, col: RGB): void {
  const at = (a: number): Vec3 => [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r];
  for (let i = 0; i < segs; i++) strip(m, at(a0 + ((a1 - a0) * i) / segs), at(a0 + ((a1 - a0) * (i + 1)) / segs), w, col);
}

const design: Design = {
  ...decorEntry('enchanters-table'),
  category: 'decor',
  fit: { kind: 'standing', height: 5, maxRadius: REACH },
  budget: 2600,
  build(c) {
    const m = c.mesh;
    m.anchor('feet', [0, 0, 0]);
    m.part('table', [0, 0, 0]);
    /**
     * Stone: lighter on top, deeper underneath; gritty, with patches of grime and wear (a slow wave through space, so
     * neighbouring faces agree and the patches form).
     */
    const stone = (p: Vec3, n: Vec3): RGB => {
      const base = n[1] > 0.5 ? STONE_TOP : n[1] < -0.5 ? STONE_DEEP : STONE;
      const w = Math.sin(p[0] * 9 + 1.3) + Math.sin(p[1] * 13 + 0.4) + Math.sin(p[2] * 11 + 2.1);
      return w > 1.4 ? mulC(base, 0.72) : w < -1.9 ? mulC(base, 1.15) : base;
    };

    // The plinth, the body and the slab overhanging it; a darker band under the slab's front edge
    box(m, [0, 0.03, (Z0 + Z1) / 2 - 0.01], [X1 * 2 - 0.02, 0.06, Z1 - Z0 - 0.02], stone, 0.08);
    box(m, [0, (0.06 + TOP - SLAB) / 2, (Z0 + Z1) / 2 - 0.04], [X1 * 2 - 0.1, TOP - SLAB - 0.06, Z1 - Z0 - 0.08], stone, 0.06);
    box(m, [0, TOP - SLAB / 2, (Z0 + Z1) / 2], [X1 * 2, SLAB, Z1 - Z0], stone, 0.05);
    box(m, [0, TOP - SLAB - 0.012, Z1 - 0.06], [X1 * 2 - 0.12, 0.024, 0.03], STONE_DEEP, 0.08);

    // The carving: pilasters standing out between three arched panels (one per tile), each arch a dark recess with a
    // pointed top; a blue rune glows in the middle one
    const front = Z1 - 0.06;
    for (const x of [-X1 + 0.07, -0.5, 0.5, X1 - 0.07]) box(m, [x, 0.25, front + 0.012], [0.07, 0.36, 0.03], stone, 0.08);
    for (const x of [-0.95, 0, 0.95]) {
      const y0 = 0.1, y1 = 0.31, hw = 0.2;
      box(m, [x, (y0 + y1) / 2, front + 0.004], [hw * 2, y1 - y0, 0.012], STONE_DEEP, 0.05);
      const z = front + 0.011;
      m.tri([x - hw, y1, z], [x + hw, y1, z], [x, y1 + 0.075, z], STONE_DEEP, [x, y1, z - 0.05]);
    }
    const rz = front + 0.013;
    box(m, [0, 0.2, rz], [0.016, 0.13, 0.006], LEY, 0, { e: 0.8 });
    for (const [dx, dy] of [[0, 0.075], [0, -0.075]]) bipyr(m, [dx, 0.2 + dy, rz], 0.016, 0.02, 4, LEY, { e: 0.8 });

    // The middle: the ritual circle, in glowing leylines on the top
    m.part('circle', CIRCLE);
    const y = TOP + 0.003;
    const ctr: Vec3 = [CIRCLE[0], y, CIRCLE[2]];
    arc(m, ctr, 0.34, 0, Math.PI * 2, 32, 0.02, LEY);
    for (let k = 0; k < 12; k++) arc(m, ctr, 0.29, (k / 12) * Math.PI * 2, ((k + 0.55) / 12) * Math.PI * 2, 2, 0.014, LEY); // the broken ring
    arc(m, ctr, 0.18, 0, Math.PI * 2, 24, 0.016, LEY);
    arc(m, ctr, 0.065, 0, Math.PI * 2, 12, 0.014, LEY);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, cos = Math.cos(a), sin = Math.sin(a);
      strip(m, [ctr[0] + cos * 0.18, y, ctr[2] + sin * 0.18], [ctr[0] + cos * 0.34, y, ctr[2] + sin * 0.34], 0.012, LEY);
    }
    // The star: two squares, one turned 45 degrees, inside the inner ring
    for (const turn of [0, Math.PI / 4]) {
      const corner = (k: number): Vec3 => {
        const a = turn + Math.PI / 4 + (k * Math.PI) / 2;
        return [ctr[0] + Math.cos(a) * 0.17, y + 0.001, ctr[2] + Math.sin(a) * 0.17];
      };
      for (let k = 0; k < 4; k++) strip(m, corner(k), corner(k + 1), 0.012, LEY);
    }
    // Diamond markers on the outer ring, and a small one at the heart
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      bipyr(m, [ctr[0] + Math.cos(a) * 0.34, y + 0.004, ctr[2] + Math.sin(a) * 0.34], 0.026, 0.008, 4, LEY, { e: 0.9 });
    }
    bipyr(m, add(ctr, [0, 0.004, 0]), 0.03, 0.008, 4, LEY, { e: 0.9 });
    m.halo(add(ctr, [0, 0.02, 0]), 0.42, LEY_HALO);
    // A small crystal hovering over the circle's heart
    const crystal: Vec3 = add(ctr, [0, 0.2, 0]);
    bipyr(m, crystal, 0.035, 0.06, 4, CRYSTAL, { e: 1 });
    m.halo(crystal, 0.13, CRYSTAL);

    // The left: books, scrolls, scattered shards, and an open tome near the middle turned toward the reader
    m.part('left', [-0.95, TOP, 0]);
    bookStack(m, [-1.22, TOP, -0.26], [
      { size: [0.26, 0.05, 0.19], yaw: 0.1, cover: LEATHER[0] },
      { size: [0.24, 0.045, 0.18], yaw: -0.15, cover: LEATHER[2] },
      { size: [0.22, 0.04, 0.16], yaw: 0.3, cover: LEATHER[1] },
    ]);
    book(m, [-0.98, TOP, -0.3], [0.22, 0.04, 0.17], -0.5, LEATHER[3]);
    book(m, [-1.25, TOP, 0.06], [0.2, 0.035, 0.16], 0.7, LEATHER[1]);
    scroll(m, [-0.9, TOP, 0.16], 0.26, 0.026, 0.25);
    scroll(m, [-1.1, TOP, -0.08], 0.22, 0.022, -0.9);
    // A scroll half unrolled across the top, its roll at one end
    openScroll(m, [-0.72, TOP, -0.22], -0.35);
    // Shards scattered among them: the Affix Shard's model, small, each in a category's color and softly glowing
    const shards: [Vec3, number, number][] = [ // where, its turn, its category (SHARD_CATEGORIES index)
      [[-0.84, TOP, -0.04], 0.4, 5], [[-1.02, TOP, 0.06], 1.9, 3], [[-0.7, TOP, 0.2], 3.1, 1],
      [[-1.32, TOP, -0.1], 0.9, 2], [[-0.96, TOP + 0.13, -0.3], 2.4, 7],
    ];
    for (const [at, yaw, cat] of shards) {
      const tint = SHARD_CATEGORIES[cat].tint.map((v) => Math.min(255, v * 1.8)) as RGB;
      const from = m.faces.length;
      embed(m, affixShard, 1, (p) => add(rotY(p, yaw), at), 0.42);
      paintTint(m, from, tint);
      m.halo(add(at, [0, 0.04, 0]), 0.07, tint);
    }
    // The open tome, a glowing glyph on its right-hand page, turned toward the reader standing at the circle
    {
      const at: Vec3 = [-0.6, TOP, 0.0];
      openTome(m, at, Math.atan2(READER[0] - at[0], READER[2] - at[2]), LEATHER[0], { color: LEY, halo: LEY_HALO });
    }

    // The right: a brass armillary on its stand, a mortar and pestle, a candle, glowing jars and a stack of books
    m.part('right', [0.95, TOP, 0]);
    armillary(m, [0.98, TOP, 0.04], JAR_GLOW[0]);
    // Mortar and pestle
    mortar(m, [1.24, TOP, 0.13], STONE_TOP);
    // A candle with its flame
    candle(m, [0.56, TOP, 0.16]);
    // Glowing jars, clustered toward the back
    jar(m, [0.62, TOP, -0.28], 0.15, 0.045, JAR_GLOW[0]);
    jar(m, [0.76, TOP, -0.33], 0.11, 0.04, JAR_GLOW[1]);
    jar(m, [0.72, TOP, -0.15], 0.09, 0.034, JAR_GLOW[2]);
    bookStack(m, [1.2, TOP, -0.25], [
      { size: [0.26, 0.055, 0.2], yaw: -0.1, cover: LEATHER[2] },
      { size: [0.25, 0.05, 0.19], yaw: 0.12, cover: LEATHER[3] },
      { size: [0.23, 0.045, 0.18], yaw: -0.2, cover: LEATHER[0] },
      { size: [0.2, 0.04, 0.15], yaw: 0.25, cover: LEATHER[1] },
    ]);

    return "Enchanter's Table";
  },
};
export default design;
