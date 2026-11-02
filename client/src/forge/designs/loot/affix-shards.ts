// Model for Affix Shards (data/gear/loot.ts › affix-shards): a group of affix shards an enemy dropped, a loose scatter
// of small Affix Shards over its tile, spread toward the edges (an item lying on the same tile leaves them showing
// around it), each in a category's color. The colors are fixed, not the dropped shards' own: one static model for
// every drop (and its icon in a container's slot). Each shard is the Affix Shard's own model, embedded and painted
// (paintTint), so its shape lives in one place.
// Lies on its tile; never moves.
import type { Design } from '../../core/types';
import { embed } from '../../core/embed';
import { paintTint } from '../../core/tint';
import { add, mulC, rotY, type RGB } from '../../core/vec';
import { lootEntry } from '../_loot';
import affixShard from '../loot/affix-shard';
import { SHARD_CATEGORIES } from '../../../data/gear/shards';

/** Each shard's size, as a share of the Affix Shard's true size (0.2 tall): small, a scatter of chips. */
const SIZE = 0.55;
/** The Affix Shard's true height (its fit): this scatter's top. */
const SHARD_HEIGHT = 0.2;
/**
 * How much brighter than its category's tint a shard is painted: the Affix Shard is dark and only tinted, and
 * small as they are here, on a dark floor they need more color to show.
 */
const BRIGHTEN = 1.6;

const design: Design = {
  ...lootEntry('affix-shards'),
  category: 'loot',
  // Built at its true size: the shards' tops are the model's top (so the fit doesn't rescale them)
  fit: { kind: 'standing', height: SHARD_HEIGHT * SIZE, maxRadius: 1 },
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]);

    // Spread around the tile, away from its middle: evenly round, each nudged, a few nearer in
    const n = ri(7, 9), turn = rf(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2 + rf(-0.3, 0.3), d = i % 3 === 2 ? rf(0.08, 0.16) : rf(0.2, 0.33);
      const at: [number, number, number] = [Math.cos(a) * d, 0, Math.sin(a) * d];
      const yaw = rf(0, Math.PI * 2);
      const color = mulC(c.pick(SHARD_CATEGORIES).tint, BRIGHTEN).map((v) => Math.min(255, v)) as RGB;
      const from = m.faces.length;
      embed(m, affixShard, 1, (p) => add(rotY(p, yaw), at), SIZE);
      paintTint(m, from, color);
    }

    return 'Affix Shards';
  },
};
export default design;
