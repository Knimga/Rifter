// Model for Gorn (data/world/npcs.ts › gorn), an earth elemental. The golems' frame (golemBody: the Flame Golem's
// hulking stance, long arms hanging nearly to the ground, a small head low between boulder shoulders), but none of a
// dungeon's dressing (no lava, moss, spikes or fungus): plain brown rock, uncracked. Yellow eyes with a halo glow, and
// a few subtle green glows at random places over his body, the earth's life in him.
// One person, so one look: everything here is fixed but where the green glows sit (his seed's).
import type { Design } from '../../core/types';
import type { RGB, Vec3 } from '../../core/vec';
import { golemBody } from '../_golem';

const ROCK: RGB = [60, 38, 22]; // plain rock, a dark rich brown
const EYE: RGB = [255, 214, 70]; // yellow
const GLOW: RGB = [70, 190, 90]; // a subtle green

const design: Design = {
  id: 'npc.gorn',
  source: { table: 'npcs', key: 'gorn' }, // data/world/npcs.ts › gorn
  category: 'npc',
  label: 'Gorn',
  fit: { kind: 'standing', height: 1.45, maxRadius: 0.62 }, // the Flame Golem's: tall, the long arms set the width
  budget: 800,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    // Plain rock: nothing in its cracks
    golemBody(m, { rock: ROCK, cracks: ROCK, torsoShare: 0, limbShare: 0, eye: EYE, W: 1 });

    // A few subtle green glows at random places over his body: random faces facing outward (not his eyes, not under
    // his feet), spread apart, each halo just off its face and moving with its part
    const faces = m.faces.filter((f) => f.e < 0.5 && f.v.every((p) => p[1] > 0.2));
    const glows: Vec3[] = [];
    for (let tries = 0, want = ri(5, 8); tries < 80 && glows.length < want; tries++) {
      const f = faces[Math.floor(c.R() * faces.length)];
      const ctr: Vec3 = [0, 1, 2].map((k) => (f.v[0][k] + f.v[1][k] + f.v[2][k]) / 3) as Vec3;
      if (glows.some((g) => Math.hypot(g[0] - ctr[0], g[1] - ctr[1], g[2] - ctr[2]) < 0.3)) continue;
      glows.push(ctr);
      m.part(m.partNames[f.part]);
      m.halo(ctr, rf(0.08, 0.12), GLOW);
    }
    return 'Gorn';
  },
};

export default design;
