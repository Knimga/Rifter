// npm run forge:lint [-- --drafts] [--seeds 200] [--design creature.golem]
import { buildModel } from '../src/forge/core/build';
import type { Model } from '../src/forge/core/types';
import { loadDesigns } from './load-designs';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);

const N = Number(opt('seeds', '200'));
const only = opt('design', '');
const same = (a: Model, b: Model) => a.mesh.triCount === b.mesh.triCount && a.mesh.positions.every((v, i) => v === b.mesh.positions[i]);

const designs = (await loadDesigns({ drafts: flag('drafts') })).filter((d) => !only || d.design.id.includes(only));
let failures = 0;

for (const { stem, source, design } of designs) {
  const errs = new Map<string, string>(); // first example per error kind
  const fail = (kind: string, seed: number, detail = '') => {
    if (!errs.has(kind)) errs.set(kind, `seed ${seed} ${detail}`.trim());
  };
  if (design.id !== `${design.category}.${stem}`) fail('id-mismatch', 0, `id "${design.id}" != "${design.category}.${stem}"`);
  let minTris = Infinity, maxTris = 0;

  for (let seed = 1; seed <= N; seed++) {
    let m: Model;
    try {
      m = buildModel(design, seed);
    } catch (e) {
      fail('throws', seed, String(e));
      continue;
    }
    const { triCount, positions, bounds, anchors } = m.mesh;
    minTris = Math.min(minTris, triCount);
    maxTris = Math.max(maxTris, triCount);
    if (!positions.every(Number.isFinite)) fail('non-finite', seed);
    if (triCount < 20) fail('too-few-tris', seed, `${triCount}`);
    if (triCount > design.budget) fail('over-budget', seed, `${triCount} > ${design.budget}`);

    const eps = 1e-3;
    if (design.fit.kind === 'standing') {
      const r = Math.max(...[0, 1].map((i) => Math.max(Math.abs(bounds.min[i * 2]), Math.abs(bounds.max[i * 2]))));
      if (bounds.max[1] > design.fit.height + eps) fail('too-tall', seed, `${bounds.max[1].toFixed(3)}`);
      if (Math.abs(bounds.min[1]) > eps) fail('feet-not-on-ground', seed, `${bounds.min[1].toFixed(3)}`);
      if (r > design.fit.maxRadius * 1.5 + eps) fail('too-wide', seed, `${r.toFixed(3)}`);
      if (!anchors.feet || !anchors.overhead) fail('missing-anchors', seed, 'feet/overhead');
    } else {
      const dim = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
      if (Math.abs(dim - design.fit.size) > 1e-3) fail('wrong-size', seed, `${dim.toFixed(3)}`);
      if (!anchors.center) fail('missing-anchors', seed, 'center');
    }
    for (const [k, p] of Object.entries(anchors)) if (!p.every(Number.isFinite)) fail('bad-anchor', seed, k);

    if (seed <= 40) {
      if (!same(m, buildModel(design, seed))) fail('non-deterministic', seed);
      // Rule check: pinning every param to its own resolved value must reproduce the exact same mesh.
      if (!same(m, buildModel(design, seed, m.params))) fail('param-draw-order', seed, 'pinning resolved params changed the mesh (a param helper is conditional or draws RNG inconsistently)');
    }
  }
  const ok = errs.size === 0;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${design.id.padEnd(18)} ${source === 'draft' ? '[draft] ' : ''}tris ${minTris}-${maxTris} / budget ${design.budget}`);
  for (const [k, v] of errs) console.log(`        ${k}: ${v}`);
}
console.log(failures ? `\n${failures} design(s) failed` : `\nall ${designs.length} design(s) passed (${N} seeds each)`);
process.exit(failures ? 1 : 0);
