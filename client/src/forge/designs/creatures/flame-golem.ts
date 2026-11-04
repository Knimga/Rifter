import type { Design } from '../../core/types';
import { frustum } from '../../core/primitives';
import { hslRGB, mixC, type RGB, type Vec3 } from '../../core/vec';
import { golemBody } from '../_golem';

// Identity: a hulking golem of cooled rock veined with lava. Tall but bent: a hunched back and low-slung
// head between big boulder shoulders, long arms swung back and bent at the elbow, hanging almost to the
// ground with huge fists, short thick legs. Dark basalt skin (hue locked to a reddish grey), glowing orange
// lava veins (a third of the torso, less on the bumpy limbs), rock spikes on the shoulders and back, small
// round bright orange eyes. The eyes and a few spots of the lava glow with a soft halo.
// Seeds vary the rock's tone, the lava's glow, the spikes, the build and which lava spots glow.
const design: Design = {
  id: 'creature.flame-golem',
  source: { table: 'enemies', key: 'flame-golem' }, // data/units/enemies.ts › flame-golem
  category: 'creature',
  label: 'Flame Golem',
  fit: { kind: 'standing', height: 1.45, maxRadius: 0.62 }, // tall; the long arms set the width
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    const rock = hslRGB(ri(8, 18), rf(10, 18), rf(17, 23));
    const lava = hslRGB(ri(18, 28), 100, rf(52, 58));
    const eye: RGB = [255, 150, 30]; // bright orange, always
    const spikeColor = mixC(rock, [14, 10, 10], 0.4);
    const W = rf(0.95, 1.08); // build: bulk
    const spikes = ri(5, 8);

    // Its frame (golemBody): a third of the torso lava, less on the bumpy limbs
    golemBody(m, { rock, cracks: lava, torsoShare: 0.33, limbShare: 0.2, eye, W });

    // Rock spikes jutting from the shoulders and the hump, leaning outward and up (never at the camera)
    m.part('torso', [0, 0.85, 0]);
    for (let i = 0; i < spikes; i++) {
      const onShoulder = i < 4;
      const sx = i % 2 === 0 ? 1 : -1;
      const base: Vec3 = onShoulder
        ? [sx * rf(0.36, 0.5) * W, rf(1.55, 1.62), rf(-0.02, 0.16)]
        : [sx * rf(0.04, 0.24) * W, rf(1.6, 1.66), rf(-0.2, 0.02)];
      const len = rf(0.14, 0.24);
      const tip: Vec3 = [base[0] + sx * len * (onShoulder ? 0.6 : 0.3), base[1] + len, base[2] - len * 0.25];
      frustum(m, base, tip, 0.06, 0.006, 4, spikeColor, { caps: false });
    }

    // A few lava spots glow with a halo: random lava faces, spread apart, each halo just off its face and moving
    // with its part
    // A hotter yellow-orange than the lava, so the glow shows against the lava as well as the rock
    const hotLava = mixC(lava, [255, 224, 130], 0.4);
    const lavaFaces = m.faces.filter((f) => f.e >= 0.5 && f.c === lava);
    const glowing: Vec3[] = [];
    for (let tries = 0, want = ri(5, 8); tries < 60 && glowing.length < want && lavaFaces.length; tries++) {
      const f = lavaFaces[Math.floor(c.R() * lavaFaces.length)];
      const ctr: Vec3 = [0, 1, 2].map((k) => (f.v[0][k] + f.v[1][k] + f.v[2][k]) / 3) as Vec3;
      if (glowing.some((g) => Math.hypot(g[0] - ctr[0], g[1] - ctr[1], g[2] - ctr[2]) < 0.25)) continue;
      glowing.push(ctr);
      m.part(m.partNames[f.part]);
      m.halo(ctr, rf(0.16, 0.24), hotLava);
    }

    return 'Flame Golem';
  },
};

export default design;
