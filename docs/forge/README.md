# Forge: procedural low-poly models

Every model in the game is generated from code and a seed: `(design, seed)` always produces the identical mesh. There are no hand-authored meshes or model files. Items have one look (every item of a name is identical); creatures and characters vary per instance.

Read next: [03-design-contract.md](03-design-contract.md) (how to write a design), [04-style-guide.md](04-style-guide.md) (what good looks like: art direction, dungeon palettes, the camera rules) and [05-cookbook.md](05-cookbook.md) (the toolkit, construction patterns, pitfalls, and how to check your work).

## Layout (`client/`)
```
src/forge/
  core/           pure TS, no three.js; runs in the browser and in Node
                  rng, vec, mesh, primitives, ctx, finalize, build, link, hold, facing, animate, embed, tint,
                  stage-config, folders, slug, types
  designs/        APPROVED designs, one file per design, in a folder per category
                  (creature.skeleton -> creatures/skeleton.ts; core/folders.ts); shared helpers (_x.ts) at its top
    _weapon.ts    shared helpers (files starting "_" are not designs)
  drafts/         new designs and requested changes go HERE, never into designs/
  dev/            builder page (ForgePage, forgeView) + draft registry; dev-only, lazy-loaded
  registry.vite.ts   import.meta.glob of designs/*/
  dataRefs.ts     designs <-> game data entries (used by lint and the builder page)
  equip.ts        characters holding their gear
forge-plugin/     Vite dev-server plugin: /__forge/approve, /__forge/discard, /__forge/snapshot
scripts/          forge-lint, forge-sheet (Node, run with tsx)
src/viewEngine/three/   drawing forge models with three.js, in the game and the forge alike: toThree (<= 3 meshes
                        per model), stage (lights, game camera), mapRenderer, icons (item icons, portraits), showcase
```
The forge folder holds the forge UI and the link between its models and game data; drawing models (outside the forge's own page logic) is `viewEngine`'s.

## Data flow
`Design.build(ctx)` draws triangles into `ctx.mesh` -> `finalize()` scales to game units and writes standard anchors -> `bake()` produces `MeshData` (flat typed arrays) -> `toThree()` makes up to 3 meshes (lit, emissive unlit, translucent), plus one of camera-facing additive quads for its halos (`m.halo`). The same `MeshData` feeds the software contact-sheet renderer.

## Units, orientation, camera
- 1 unit = 1 tile. Grid cell (gx, gy) centers at world (gx + .5, 0, gy + .5). Grid +y is world +z (down the screen, toward the camera).
- **Placement on the map** (the game renderer, the builder's game view and `forge:sheet` all follow it):
  - Creatures: the design's `feet` anchor (the middle of its stance) goes exactly to the tile center; the body rises above it. Designs should always mark `m.anchor('feet', ...)`; without it, the bounding-box center is used and anything held out (a scythe, reaching arms) pulls the feet off-center.
  - Large creatures (`large: true` on their entry) stand on 2×2 tiles, the feet where the four meet. The builder (game view floor and tile reference) and `forge:sheet` show them on that square (`designTiles` in `dataRefs.ts`, from the entry).
  - Items (loot) lie **flat on the tile, face up** (`ITEM_GROUND_PITCH` / `layItem` in `stage-config.ts`), resting on the floor. A design can lie less tipped with `fit.groundPitchDeg`, or on its side with `fit.groundRollDeg` (turned about its front axis first; the Iron Helm rests on its side, as if dropped). Loot is turned against the view's yaw (`lootYaw`), so on the floor it keeps its icon's screen orientation (tip up and to the left), only foreshortened by the view's elevation.
  - Inventory icons use a straight-on camera (`ICON_CAMERA`: no elevation, no yaw) for the same reason.
- Models face +z at yaw 0. A model's left side is +x (`_l` = +x, `_r` = -x).
- Facing and motion are view state (`viewEngine/three/mapRenderer.ts`); the game's positions change instantly. On a move, the model turns toward it (`yaw = atan2(dx, dy)`, smoothed with `smoothYaw`), then glides there in a straight line (about 0.2 s a tile, at most 1 s with the turn); DOM overlays (HP bars, the active glow) follow the drawn position. On an ability, the caster turns toward the aimed tile (`MapUnit.aim`) and the ability lands `AIM_TURN_LEAD_MS` later.
- **Game camera: isometric orthographic view, one setting**, outside the forge because it is the whole display's: `GAME_CAMERA` in `src/viewEngine/camera.ts` (`elevationDeg`, `yawDeg`). North is up-left: the grid's top-left corner is the diamond's left point. Everything follows it: change a number, save, and the game and forge update.
  - `viewProject` (`viewEngine/camera.ts`) is the projection (world -> screen tiles); the three.js camera (`fitViewCamera` / `frameBoard` in `viewEngine/three/stage.ts`) produces exactly the same mapping.
  - Each map is a `Board` (`components/mapParts.tsx`; `boardLayout` and `TILE_SIZE` in `viewEngine/board.ts`): the DOM tile grid stays flat and is laid on the floor by one CSS transform (`floorMatrix`), so clicks, hovers, borders, AoE highlights and the move line work unchanged. Models draw on a transparent canvas covering the board's box; upright DOM (floating text, bars over heads, door/rift markers, loot counts) is placed with `board.toScreen(x, y, height)`.
  - The key light is turned with the view (`keyLightDir`), so it always comes from the screen's upper left. Icons use their own unturned camera.
  - The forge's game view and `forge:sheet` (`--elev` to try another elevation) use the same view.
- One key light, world-fixed from the upper left, plus a hemisphere light. Values live in `stage-config.ts`.

## Rules
1. Same `(design, seed)` always produces the identical mesh.
2. Game logic never imports three.js and never reads model geometry. Facing is view state only.
3. Nothing from `drafts/` or `dev/` ships in the production bundle (`main.tsx` gates the builder page behind `import.meta.env.DEV`).
4. Item rarity glow (Superior and up) is applied by the renderer, never baked into a mesh. Loot never animates.

## Linking designs to game data
Every enemy class, item base (weapon, armor slot, shield, ring, amulet), class, interactive object, decorative object, loot and NPC has a required `model` field on its own data entry: the id of its design. The Rift and the Keystone are one tinted model each (`data/world/rifts.ts`): every rift and key is drawn with them, painted in its dungeon's `riftColor` (or, for a rift back to the Sanctum, `SANCTUM_RIFT_COLOR`; see the contract's Rifts & Keys).

```ts
model: 'creature.zombie',
```
- Items build with one seed (`ITEM_SEED` in `core/link.ts`): every Plain Gladius looks the same, and its icon is rendered once per design.
- Creatures and characters seed from each instance's stable id (`instanceSeed`), so each enemy (or party member) has its own look and keeps it.
- A new data entry needs its design: add the entry with `model` naming the new design (a draft until approved; the game draws nothing for a link whose design isn't approved yet). `forge:lint` checks every link points at a design (approved or draft) for that same entry.

## Workflow
1. A design or a change is requested ("make the skeleton bulkier", "add a bat"). **A creature (enemy, boss, summon) is designed only once its data entry exists**: the user writes the entry first, and its `large` says whether it stands on 2×2 tiles (which changes the design's size and detail: the style guide's "Large creatures"). With no entry yet, or no word on its size, ask before starting. Claude Code writes `client/src/forge/drafts/<stem>.ts` (an edit of an approved design is a new copy there; the approved file is untouched), then runs:
   - `npm run forge:lint -- --drafts` (determinism, triangle budget, fit, anchors, data links; 200 seeds)
   - `npm run forge:sheet -- --only-drafts --seeds 12 --yaws 0,180 --out forge-sheet.png`, and looks at the PNG
   (run both from `client/`).
2. You open **`/dev/forge`** on the dev server (`npm run dev`, then `http://localhost:5173/dev/forge`).
   - Left: designs by category with approved / draft / new badges, and whether the data entry links the design.
   - Center: items show their one look; creatures show a page of seeds (each a possible instance); classes show one row per hold. Tinted models (Rifts & Keys, the active Rifter) get a dungeon menu and a color picker for the color they are shown in. Game camera (or icon / top / side), a turntable and an 8-direction walk test, wireframe, and a tile reference (1×1, or 2×2 for a large creature). Click a cell to focus it.
   - Right: **Approve / Discard** when a draft exists (Current vs Draft side by side), and the focused model's name, seed and triangle count.
   - **Snapshot** writes the current view to `client/forge-snapshots/` so Claude Code can look at it.
   - The URL keeps the state (`?design=creature.skeleton&seed=7&count=12&cam=game`), so a view can be shared in one line.
3. Approve replaces the approved design with the draft, filed into its category's folder (git keeps history); Discard deletes it. Claude Code never moves drafts into `designs/` itself.
