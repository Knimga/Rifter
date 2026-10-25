import type { Design } from '../../core/types';
import { blob, frustum } from '../../core/primitives';
import { hslRGB, mixC, type RGB, type Vec3 } from '../../core/vec';

// A blob of living lava: a molten orange-red body crusted with dark cooled rock on top, a white-hot core
// and embers glowing through it, one burning eye on the front and a crest of obsidian shards. Locked: the
// orange-red color, the single eye and the crest. Seeds vary its proportions, the crust plates, the embers,
// the shards and the eye's tint. From the slime monster sketch (blob body flattened where it sits, core,
// motes, eye, crest).
const design: Design = {
  id: 'creature.lava-slime',
  source: { table: 'enemies', key: 'lava-slime' }, // data/units/enemies.ts › lava-slime
  category: 'creature',
  label: 'Lava Slime',
  fit: { kind: 'standing', height: 0.81, maxRadius: 0.44 }, // wider than tall: the radius is the limiting fit
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    const molten = hslRGB(14, 84, 50); // orange-red, always
    const core = hslRGB(38, 100, 72);
    const ember = mixC(core, [255, 250, 220], 0.4);
    const crust: RGB = mixC([46, 30, 28], [70, 44, 36], rf(0, 1));
    const crustPlates = ri(2, 5); // cooled crust floating on top
    const eyeColor = c.pick<RGB>([[255, 238, 150], [255, 250, 220], [255, 200, 90]]);
    const rx = rf(0.95, 1.2), ry = rf(0.78, 1.0), rz = rx * rf(0.85, 1.05);
    const floorY = -ry * 0.55;
    const C: Vec3 = [0, -floorY, 0]; // body center, lifted so its flattened bottom rests on the floor

    m.anchor('feet', [0, 0, 0]);
    m.part('body', C);

    // White-hot core and embers drifting inside the body (glow through it)
    blob(m, C, [rx * 0.4, ry * 0.38, rz * 0.4], 0, 0.3, core, { e: 0.9, j: 0.3 });
    for (let i = 0, n = ri(2, 4); i < n; i++) {
      const a = rf(0, Math.PI * 2), d = rf(0.25, 0.5);
      blob(m, [Math.cos(a) * rx * d, C[1] + rf(-0.2, 0.3) * ry, Math.sin(a) * rz * d], [0.1, 0.1, 0.1], 0, 0.3, ember, { e: 0.95 });
    }

    // Molten body, see-through so the core glows from inside, flattened where it sits
    blob(m, C, [rx, ry, rz], 1, 0.13, molten, { a: 0.62, e: 0.3, j: 0.14, floorY: 0 });

    // Plates of cooled dark crust floating on the upper surface (solid, unlike the lava)
    for (let i = 0; i < crustPlates; i++) {
      const a = rf(0, Math.PI * 2), r = rf(0.1, 0.62), h = Math.sqrt(Math.max(0.05, 1 - r * r));
      const px = Math.cos(a) * rx * r, pz = Math.sin(a) * rz * r;
      blob(m, [px, C[1] + ry * h * 0.98, pz], [rf(0.16, 0.26), 0.05, rf(0.14, 0.22)], 0, 0.25, crust);
    }

    // One big burning eye on the front of the body (large enough to read the front at game scale)
    const ey = ry * 0.14, ez = rz * Math.sqrt(Math.max(0.05, 1 - (ey / ry) ** 2)) * 0.96;
    blob(m, [0, C[1] + ey, ez], [0.2, 0.2, 0.14], 0, 0.1, eyeColor, { e: 0.95 });
    blob(m, [0, C[1] + ey, ez + 0.1], [0.09, 0.11, 0.05], 0, 0.1, [36, 12, 8]);

    // Crest of obsidian shards breaking through the crust, glowing hot at their bases
    const shard: RGB = [30, 24, 28];
    for (let i = 0, n = ri(3, 6); i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rf(0, 1), r = rf(0.15, 0.55);
      const bx = Math.cos(a) * rx * r, bz = Math.sin(a) * rz * r;
      const base: Vec3 = [bx, C[1] + ry * 0.7, bz];
      frustum(m, base, [bx * 1.1, C[1] + ry * rf(1.1, 1.5), bz * 1.1], 0.09, 0.008, 5, shard);
      blob(m, base, [0.07, 0.03, 0.07], 0, 0.1, ember, { e: 0.9 });
    }

    return 'Lava Slime';
  },
};

export default design;
