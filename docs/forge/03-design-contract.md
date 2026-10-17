# Design contract

A design is one file in `client/src/forge/designs/` (or `client/src/forge/drafts/`) with a default export:

```ts
const design: Design = {
  id: 'creature.golem',          // `${category}.${fileStem}`, lint enforces
  category: 'creature',          // creature | character | weapon | armor | prop
  label: 'Golem', version: 1,
  fit: { kind: 'standing', height: 1.6, maxRadius: 0.75 },   // or { kind: 'item', size: 0.8 }
  budget: 900,                   // max triangles
  build(c) { /* draw into c.mesh */ return 'Mossy Granite Golem'; },
};
export default design;
```

## Parameters (the seed-with-intent system)
Call `c.choice(key, options, weights?)`, `c.range`, `c.int`, `c.chance` **at the top of build(), unconditionally, in a fixed order**. Each call always consumes exactly one random number, then applies an override if the caller pinned that key, and records the final value in `model.params` and the key in an auto-discovered schema.

This is how "give me a yellow-dominant one" works: pin `{ hue: 55 }` and the rest of the shape stays the same as the seed's, because the random stream is unchanged. The builder page builds its controls from the schema.

Rules: (1) never call a parameter helper inside `if`/loops; (2) use `c.ri / c.rf / c.pick` for incidental detail, those are never pinned; (3) a parameter must describe a visual choice a person might want to pin (color family, style, size class, affix, material). `forge:lint` verifies rule 1 by rebuilding each seed with its own resolved params and requiring an identical mesh.

## Building geometry
`core/primitives.ts`: `loft` (rings -> limbs, blades, hafts), `frustum`, `box` (with corner jitter), `blob` (jittered low-poly ellipsoid), `bipyr` (crystal). `c.mesh.tri/quad` for custom triangles. Winding is automatic: each triangle is oriented away from the center of its convex piece, so keep pieces roughly convex. Per-face color can be a function `(centroid, normal) => RGB` (stripes, moss on top faces). Face options: `e` emissive 0..1 (>= .5 renders unlit glow), `a` alpha, `j` brightness jitter (faceting).

## Parts, pivots, anchors (for later animation and attachment)
`m.part('arm_l', pivot)` tags all following faces. Naming: `torso`, `head`, `arm_l/arm_r`, `leg_l/leg_r` etc. `m.anchor('hand_l', point)` for attach points. **Standing designs mark `m.anchor('feet', point)` at the middle of the stance**: `finalize` puts that point at the tile center (the bounding-box center is only the fallback, and a weapon held out to one side would pull it off the body). `finalize` adds `overhead` (standing) or `center` (item); weapons add `grip` and `tip`. Anchors and pivots are transformed with the mesh.

## Names
`build` returns a display name; derive it from the resolved params so a pinned param renames the model consistently.

## Versioning
Changing generator code changes what existing seeds look like. If an approved design's output changes for existing seeds, bump `version` (and note it in the commit). Prefer adding a new parameter drawn LAST to extend a design without disturbing old seeds.
