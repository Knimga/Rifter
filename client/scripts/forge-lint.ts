// npm run forge:lint [-- --drafts] [--seeds 200] [--design creature.golem]
import { buildModel } from '../src/forge/core/build';
import type { Model } from '../src/forge/core/types';
import { loadDesigns } from './load-designs';
import { checkDataRefs } from '../src/forge/dataRefs';
import { CATEGORY_FOLDER } from '../src/forge/core/folders';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);

const N = Number(opt('seeds', '200'));
const only = opt('design', '');
const same = (a: Model, b: Model) => a.mesh.triCount === b.mesh.triCount && a.mesh.positions.every((v, i) => v === b.mesh.positions[i]);

const designs = (await loadDesigns({ drafts: flag('drafts') })).filter((d) => !only || d.design.id.includes(only));
let failures = 0;

for (const { stem, folder, source, design } of designs) {
  const errs = new Map<string, string>(); // first example per error kind
  const fail = (kind: string, seed: number, detail = '') => {
    if (!errs.has(kind)) errs.set(kind, `seed ${seed} ${detail}`.trim());
  };
  if (design.id !== `${design.category}.${stem}`) fail('id-mismatch', 0, `id "${design.id}" != "${design.category}.${stem}"`);
  // An approved design lives in its category's folder (core/folders.ts)
  if (source === 'approved' && folder !== CATEGORY_FOLDER[design.category]) fail('wrong-folder', 0, `in designs/${folder}/, belongs in designs/${CATEGORY_FOLDER[design.category]}/`);
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
      // On the floor (a floating one, fit.floor 'origin': never below it)
      if (design.fit.floor === 'origin' ? bounds.min[1] < -eps : Math.abs(bounds.min[1]) > eps) fail('feet-not-on-ground', seed, `${bounds.min[1].toFixed(3)}`);
      if (r > design.fit.maxRadius * 1.5 + eps) fail('too-wide', seed, `${r.toFixed(3)}`);
      if (!anchors.feet || !anchors.overhead) fail('missing-anchors', seed, 'feet/overhead');
    } else {
      const dim = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
      if (Math.abs(dim - design.fit.size) > 1e-3) fail('wrong-size', seed, `${dim.toFixed(3)}`);
      if (!anchors.center) fail('missing-anchors', seed, 'center');
    }
    for (const [k, p] of Object.entries(anchors)) if (!p.every(Number.isFinite)) fail('bad-anchor', seed, k);

    if (seed <= 40 && !same(m, buildModel(design, seed))) fail('non-deterministic', seed);
  }
  const ok = errs.size === 0;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${design.id.padEnd(18)} ${source === 'draft' ? '[draft] ' : ''}tris ${minTris}-${maxTris} / budget ${design.budget}`);
  for (const [k, v] of errs) console.log(`        ${k}: ${v}`);
}
// Every design must be the model for exactly one game data entry, named exactly like it, and every
// model link in the game data must point back at the design for that entry (see src/forge/dataRefs.ts).
// Checked against ALL designs (approved + drafts) so a draft can't collide with an approved design.
const dataProblems = checkDataRefs((await loadDesigns({ drafts: true })).map(({ design, stem }) => ({ design, stem })));
console.log(dataProblems.length ? `\nFAIL  data links:\n${dataProblems.map((p) => `        ${p}`).join('\n')}` : '\nPASS  data links (every design names its exact data entry)');

console.log(failures || dataProblems.length ? `\n${failures} design(s) failed${dataProblems.length ? `, ${dataProblems.length} data-link problem(s)` : ''}` : `\nall ${designs.length} design(s) passed (${N} seeds each)`);
process.exit(failures || dataProblems.length ? 1 : 0);
