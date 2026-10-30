import type { Design } from '../../core/types';
import { blob, crackedBlob, frustum } from '../../core/primitives';
import { hslRGB, mixC, type RGB, type Vec3 } from '../../core/vec';
import { golemFoot, golemHead, golemLimb, golemStone } from '../_golem';

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

    const stone = golemStone(rock);
    /** Share of the faces that are glowing lava veins: the torso's masses, and the (less cracked) limbs. */
    const TORSO_LAVA = 0.33, LIMB_LAVA = 0.2;
    // Rocky limbs veined with lava
    const limb = golemLimb(m, stone, lava, LIMB_LAVA);

    m.anchor('feet', [0, 0, 0.02]); // between the feet: this point goes to the tile center

    // Short, thick legs, slightly apart
    for (const sx of [-1, 1]) {
      const hip: Vec3 = [sx * 0.2 * W, 0.74, -0.02], knee: Vec3 = [sx * 0.23 * W, 0.42, 0.05], ankle: Vec3 = [sx * 0.24 * W, 0.13, 0.02];
      m.part(sx > 0 ? 'leg_l' : 'leg_r', hip);
      limb(hip, knee, 0.15, 0.13, 1);
      crackedBlob(m, knee, [0.14, 0.13, 0.14], 0, 0.2, stone, lava, LIMB_LAVA, { j: 0.2 });
      limb(knee, ankle, 0.13, 0.12, 1);
      golemFoot(m, ankle, rock);
    }

    // Body: pelvis, belly, a broad chest pushed forward and a hunched back behind it, all a third lava
    m.part('torso', [0, 0.85, 0]);
    blob(m, [0, 0.84, -0.02], [0.27 * W, 0.16, 0.2], 0, 0.2, stone);
    crackedBlob(m, [0, 1.03, 0.03], [0.27 * W, 0.22, 0.21], 0, 0.18, stone, lava, TORSO_LAVA, { j: 0.2 });
    crackedBlob(m, [0, 1.27, 0.12], [0.36 * W, 0.28, 0.26], 1, 0.16, stone, lava, TORSO_LAVA, { j: 0.2 });
    crackedBlob(m, [0, 1.48, -0.04], [0.32 * W, 0.2, 0.25], 1, 0.16, stone, lava, TORSO_LAVA, { j: 0.2 }); // the bent back's hump

    // Head: small, low and forward, sunk between the shoulders; a heavy brow over small round glowing eyes
    m.part('head', [0, 1.46, 0.36]);
    golemHead(m, [0, 1.5, 0.46], stone, rock, eye);

    // Big boulder shoulders; long arms swung back from the shoulder and bent at the elbow, hanging nearly to
    // the ground beside the body (not held out in front), leaning outward, ending in huge fists
    for (const sx of [-1, 1]) {
      const sh: Vec3 = [sx * 0.43 * W, 1.45, 0.06];
      m.part(sx > 0 ? 'arm_l' : 'arm_r', sh);
      crackedBlob(m, sh, [0.21, 0.19, 0.21], 0, 0.2, stone, lava, TORSO_LAVA, { j: 0.2 });
      const elbow: Vec3 = [sx * 0.58 * W, 1.0, -0.1], wrist: Vec3 = [sx * 0.62 * W, 0.56, 0.06];
      limb(sh, elbow, 0.13, 0.11, 2);
      crackedBlob(m, elbow, [0.12, 0.12, 0.12], 0, 0.2, stone, lava, LIMB_LAVA, { j: 0.2 });
      limb(elbow, wrist, 0.11, 0.12, 2);
      const fist: Vec3 = [sx * 0.63 * W, 0.42, 0.08];
      crackedBlob(m, fist, [0.17, 0.16, 0.17], 0, 0.2, stone, lava, LIMB_LAVA, { j: 0.2 });
      m.anchor(sx > 0 ? 'hand_l' : 'hand_r', fist);
    }

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
