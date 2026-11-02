// Model for Affix Shard (data/gear/loot.ts › affix-shard): the one model of every affix shard, painted when drawn in its
// category's color (SHARD_CATEGORIES tint in data/gear/shards.ts; a tinted model, core/tint.ts). A small shard like a
// caltrop but with thick prongs and gently curved ones: a hub with four tapering points, two rising and two dropping,
// so seen from above (the game's view, and its icons) the four points make an X, a four-pointed star. Each prong bends
// the same way round, like claws or the arms of a pinwheel. Dark and muted: a near-black body the color only tints,
// its upper faces lighter, faintly self-lit so it reads in the dark; no halo. Built to be drawn many times at once
// (the Shards tab shows up to 78): about 80 triangles.
// An item: one look, nothing drawn from the seed. Built at its true size.
import type { Design, Tone } from '../../core/types';
import { jointedLimb } from '../../core/primitives';
import { add, cross, mul, norm, rotX, type RGB, type Vec3 } from '../../core/vec';
import { lootEntry } from '../_loot';

/** How far a prong reaches from the hub, how wide it is at its base, and how far it bends (before the fit scales it). */
const LENGTH = 1, BASE = 0.3, BEND = 0.26;
/** The prong's profile: points along it (as shares of its length), and its radius at each (it tapers to a point). */
const ALONG = [0, 0.3, 0.62, 1], RADIUS = [BASE, 0.215, 0.115, 0];
/** What the color adds to a face (tint.ts Tone): the color itself, held back (the shard is dark), and a little of its deeper shade. */
const TONE: Tone = [0.5, 0.1];
/**
 * Tipped toward the viewer by this much (rotX: +y toward +z), so a view from the loot icons' 50 degrees above
 * (LOOT_ICON_CAMERA) looks straight along the shard's four-point axis: all four points show, as an X. From steeper
 * above, as on the map, they still show as four.
 */
const TILT = (40 * Math.PI) / 180;
/** The faces' own color, before the tint: near black, lighter the more a face looks up (it catches the light). */
const BODY = (_: Vec3, n: Vec3): RGB => (n[1] > 0.35 ? [44, 44, 50] : n[1] < -0.3 ? [8, 8, 10] : [24, 24, 28]);

/**
 * The four prongs' directions, a tetrahedron's with its two-fold axis straight up: two rise and two drop, each
 * pair opposite, so from above they point to the four corners of a square.
 */
const DIRS: Vec3[] = ([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] as Vec3[]).map(norm);

const design: Design = {
  ...lootEntry('affix-shard'),
  category: 'loot',
  // True size: about a pebble (0.2 tall), its points reaching 0.16 from its middle
  fit: { kind: 'standing', height: 0.2, maxRadius: 0.17 },
  budget: 120,
  build(c) {
    const m = c.mesh;
    m.anchor('feet', [0, 0, 0]);
    m.part('shard', [0, 0, 0]);
    const hub: Vec3 = [0, 0, 0];

    for (const d of DIRS) {
      // Each prong bends sideways, at right angles to its axis and to up, the bend growing toward its point (a
      // claw's curve): the same turn for every prong, seen from above
      const side = norm(cross([0, 1, 0], d));
      const pts = ALONG.map((t): Vec3 => rotX(add(add(hub, mul(d, LENGTH * t)), mul(side, BEND * t * t)), TILT));
      jointedLimb(m, pts, RADIUS, BODY, { sides: 4, j: 0.16, e: 0.18, tint: TONE });
    }

    return 'Affix Shard';
  },
};

export default design;
