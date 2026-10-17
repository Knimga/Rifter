# Forge: procedural low-poly models

Every model in the game is generated from code and a seed: `(designId, version, seed, params)` always produces the identical mesh. There are no hand-authored meshes or model files.

Read next: [03-design-contract.md](03-design-contract.md) (how to write a design) and [04-style-guide.md](04-style-guide.md) (what good looks like, and the camera rules).

## Layout (`client/`)
```
src/forge/
  core/           pure TS, no three.js; runs in the browser and in Node
                  rng, vec, mesh, primitives, ctx, finalize, build, facing, stage-config, types
  designs/        APPROVED designs, one file per design (creature.skeleton -> skeleton.ts)
    _weapon.ts    shared helpers (files starting "_" are not designs)
  drafts/         new designs and requested changes go HERE, never into designs/
  three/          three.js adapters: toThree (<= 3 meshes per model), stage (lights, game camera), icons
  dev/            builder page (ForgePage, forgeView) + draft registry; dev-only, lazy-loaded
  registry.vite.ts   import.meta.glob of designs/
  index.ts        renderer-agnostic public API
forge-plugin/     Vite dev-server plugin: /__forge/approve, /__forge/discard, /__forge/snapshot
scripts/          forge-lint, forge-sheet (Node, run with tsx)
```

## Data flow
`Design.build(ctx)` draws triangles into `ctx.mesh` -> `finalize()` scales to game units and writes standard anchors -> `bake()` produces `MeshData` (flat typed arrays) -> `toThree()` makes up to 3 meshes (lit, emissive unlit, translucent). The same `MeshData` feeds the software contact-sheet renderer.

## Units, orientation, camera
- 1 unit = 1 tile. Grid cell (gx, gy) centers at world (gx + .5, 0, gy + .5). Grid +y is world +z (down the screen, toward the camera).
- **Placement on the map** (the game renderer, the builder's game view and `forge:sheet` all follow it):
  - Creatures: the design's `feet` anchor (the middle of its stance) goes exactly to the tile center; the body rises above it. Designs should always mark `m.anchor('feet', ...)`; without it, the bounding-box center is used and anything held out (a scythe, reaching arms) pulls the feet off-center.
  - Items (loot) lie **flat on the tile, face up** (`ITEM_GROUND_PITCH` / `layItem` in `stage-config.ts`), resting on the floor. A design can lie less tipped with `fit.groundPitchDeg` (the Iron Helm uses -55 so its open underside is not on show). The oblique projection draws the ground without distortion, so a flat item shows its true outline, never tilted toward or away from the camera.
  - Inventory icons use a straight-on camera (`ICON_CAMERA`: no elevation, no yaw) for the same reason.
- Models face +z at yaw 0. A model's left side is +x (`_l` = +x, `_r` = -x).
- Facing is view state: `yaw = atan2(dx, dy)` from the last grid move, smoothed with `smoothYaw`. Models turn only while moving.
- **Game camera: oblique projection** (`core/stage-config.ts`, `three/stage.ts`). The map stays the DOM tile grid; models draw on a transparent three.js canvas over it. An orthographic camera at 60° elevation with its vertical extent compressed by sin(60°) makes the ground map 1:1 onto 50 px tiles; height lifts a point by `y * cot(60°)` tiles. `obliqueProject` / `obliqueLift` give the same mapping without three.js (for DOM overlays and the contact sheet).
- One key light, world-fixed from the upper left, plus a hemisphere light. Values live in `stage-config.ts`.

## Rules
1. Same `(design, version, seed, params)` always produces the identical mesh.
2. Game logic never imports three.js and never reads model geometry. Facing is view state only.
3. Nothing from `drafts/` or `dev/` ships in the production bundle (`main.tsx` gates the builder page behind `import.meta.env.DEV`).
4. Changing the look of an approved design for existing seeds requires bumping its `version`.
5. Item rarity glow (Superior and up) is applied by the renderer, never baked into a mesh. Loot never animates.

## Linking designs to game objects
A game object renders as a forge model through a `model` field on its own data entry (enemy classes in `client/src/data/enemies.ts`; item bases in M3):

```ts
model: { design: 'creature.zombie', version: 2, params: { clothes: 'rags' } },
```
- `params` holds only the **Fixed** params: every instance gets them. Params left on **Varies** differ per instance.
- There is normally **no `seed`**: each instance seeds from its own stable id (`instanceSeed(link, instanceId)` in `core/link.ts`), so its varied params are rolled once and stay with it for its lifetime. Adding a `seed` (the builder's "Copy this exact model instead") makes every instance identical.
- `version` is the design version the link was made against; the builder page flags links whose design has since been bumped.
- The builder page reads these entries: ★ cells show sample instances built exactly as the game builds them.

## Workflow
1. A design or a change is requested ("make the skeleton bulkier", "add a bat"). Claude Code writes `client/src/forge/drafts/<stem>.ts` (an edit of an approved design is a new copy there; the approved file is untouched), then runs:
   - `npm run forge:lint -- --drafts` (determinism, triangle budget, fit, anchors, param draw order; 200 seeds)
   - `npm run forge:sheet -- --only-drafts --seeds 12 --yaws 0,180 --out forge-sheet.png`, and looks at the PNG
   (run both from `client/`).
2. You open **`/dev/forge`** on the dev server (`npm run dev`, then `http://localhost:5173/dev/forge`).
   - Left: designs by category with approved / draft / new badges, plus game enemies and item bases that have no design yet.
   - Center: a grid of seeds in the game camera (or icon / top / side), a turntable and an 8-direction walk test, wireframe, and a 1×1 tile reference. Click a cell to focus one seed.
   - Right: **Approve / Discard** when a draft exists (Current vs Draft side by side); **Link to game** (lists what's Fixed vs Varies, with **Copy for game**); parameters generated from the design, each **Fixed** or **Varies**; and, when a cell is clicked, that model's resolved params.
   - Cells marked ★ are sample instances of game objects already linked to the design, built exactly as the game builds them.
   - **Snapshot** writes the current view to `client/forge-snapshots/` so Claude Code can look at it.
   - The URL keeps the state (`?design=creature.skeleton&seed=7&count=12&cam=game&p.eyes=frost`), so a view can be shared in one line.
3. Approve moves the draft into `designs/` (archiving the previous file to `src/forge/.history/`); Discard deletes it. Claude Code never moves drafts into `designs/` itself.
4. To use it in the game: set the params that should be the same on every instance to **Fixed**, leave the rest on **Varies**, click **Copy for game**, and tell Claude Code which game object to link ("link zombie: <paste>"). No model needs to be selected. Claude Code adds the `model` field to that data entry. Only approved designs get linked.
5. If an approved design is later changed in a way that alters existing looks, its `version` is bumped and the builder page flags the links made against the old version, so they can be re-checked and re-linked.
