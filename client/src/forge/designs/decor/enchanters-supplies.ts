// Model for Enchanter's Supplies (data/world/decorObjects.ts › enchanters-supplies): the enchanter's stores on one tile.
// At the back, a treasure chest of dark wood (the treasure chests' own shape, _chest.ts, in the Sanctum's dark wood,
// a little smaller). In front of it, to its left, a very small open barrel (the decor barrel) heaped with affix shards:
// a dark mound inside its mouth with a few Affix Shards (the shard's own model, each in a category's color, softly
// glowing) piled on it, enough that it reads as full. To its right, three small brown sacks tied at the neck: two
// standing, one tipped over.
// Built facing +z (the chest's lock), on one tile. One fixed look.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { blob, loft, ringPts, tube } from '../../core/primitives';
import { embed } from '../../core/embed';
import { paintTint } from '../../core/tint';
import { add, rotX, rotY, type RGB, type Vec3 } from '../../core/vec';
import { DARK_WOOD, DARK_WOOD_SHADE, DECOR_IRON, barrel, decorEntry } from '../_decor';
import { treasureChestDesign } from '../_chest';
import affixShard from '../loot/affix-shard';
import { SHARD_CATEGORIES } from '../../../data/gear/shards';

/** The chest: the treasure chests' shape in the Sanctum's dark wood, at this share of their size. */
const CHEST = treasureChestDesign('worn-treasure-chest', { wood: DARK_WOOD, woodDark: DARK_WOOD_SHADE, lock: DECOR_IRON });
const CHEST_SCALE = 0.84;
/** The chest's height as embedded (the treasure chests' fit height, scaled): the model's top. */
const TOP = 0.5 * CHEST_SCALE;
const SACK: RGB = [104, 74, 46];
const SACK_DARK: RGB = [88, 62, 39];
const CORD: RGB = [58, 41, 27];
/** The barrel's dark heap of shards under the top ones. */
const HEAP: RGB = [26, 22, 28];

/** The barrel: where it stands, its height and belly radius. */
const BARREL_AT: Vec3 = [0.22, 0, 0.085]; // close in front of the chest, at its left corner
const BH = 0.19, BR = 0.07;

/**
 * A small sack tied at the neck, built standing at the origin `h` tall, `r` round at its belly: full and round low down,
 * pinched at the neck by a cord, its mouth frilled out above it.
 */
function tiedSack(m: Mesh, h: number, r: number, col: RGB): void {
  const ring = (y: number, k: number) => ringPts([0, y * h, 0], [0, 1, 0], k * r, 7);
  loft(m, [ring(0, 0.7), ring(0.12, 0.96), ring(0.38, 1), ring(0.62, 0.82), ring(0.76, 0.32), ring(0.86, 0.36), ring(1, 0.62)], col, { j: 0.16, bandCenters: true });
  const neck = ringPts([0, 0.76 * h, 0], [0, 1, 0], 0.36 * r, 7);
  tube(m, [...neck, neck[0]], 0.012, 0.012, 3, CORD, { caps: false }); // the cord, round the neck
}

const design: Design = {
  ...decorEntry('enchanters-supplies'),
  category: 'decor',
  // Built at its true size: the chest's lid is the top
  fit: { kind: 'standing', height: TOP, maxRadius: 1 },
  budget: 1600,
  build(c) {
    const m = c.mesh;
    m.anchor('feet', [0, 0, 0]);

    // The chest, at the back of the tile, its lock to the front
    embed(m, CHEST, 1, (p) => add(p, [0, 0, -0.17]), CHEST_SCALE);

    // The barrel, in front of the chest to its left, open and heaped with shards
    m.part('barrel', BARREL_AT);
    barrel(m, BARREL_AT, BH, BR, DARK_WOOD);
    blob(m, add(BARREL_AT, [0, BH - 0.005, 0]), [BR * 0.78, 0.035, BR * 0.78], 0, 0.15, HEAP, { floorY: BH - 0.03 });
    const shards: [Vec3, number, number][] = [ // where (on the heap), its turn, its category (SHARD_CATEGORIES index)
      [[0, 0.03, 0], 0.4, 5], [[0.035, 0.012, 0.02], 2.1, 1], [[-0.03, 0.015, 0.025], 1.2, 3],
      [[0.02, 0.014, -0.035], 3.0, 0], [[-0.035, 0.01, -0.02], 4.4, 7],
    ];
    for (const [off, yaw, cat] of shards) {
      const at = add(BARREL_AT, add([0, BH, 0], off));
      const tint = SHARD_CATEGORIES[cat].tint.map((v) => Math.min(255, v * 1.8)) as RGB;
      const from = m.faces.length;
      embed(m, affixShard, 1, (p) => add(rotY(p, yaw), at), 0.34);
      paintTint(m, from, tint);
    }
    // One soft glow over the barrel's mouth, from all of them
    m.halo(add(BARREL_AT, [0, BH + 0.04, 0]), 0.12, [170, 160, 220]);

    // The sacks, in front of the chest to its right: two standing, one tipped over against them
    m.part('sacks', [-0.24, 0, 0.2]);
    const sack = (h: number, r: number, col: RGB, place: (p: Vec3) => Vec3) => {
      const from = m.faces.length;
      tiedSack(m, h, r, col);
      m.xf(from, place);
    };
    sack(0.18, 0.075, SACK, (p) => add(rotY(p, 0.4), [-0.27, 0, 0.14]));
    sack(0.15, 0.065, SACK_DARK, (p) => add(rotY(p, 1.7), [-0.13, 0, 0.24]));
    sack(0.14, 0.062, SACK, (p) => add(rotY(rotX(p, 1.35), -0.5), [-0.3, 0.06, 0.3]));

    return "Enchanter's Supplies";
  },
};
export default design;
