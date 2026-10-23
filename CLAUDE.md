# Rifter

Turn-based dungeon crawler. App is `client/` (Vite + React 19 + Tailwind + TypeScript); `server/` is an unused stub. Run commands from `client/` unless noted (`npm run dev` at the repo root starts both).

## Code sweeps
When asked to "do a sweep of the code", "audit the code" or anything like it, do a full review of the whole project (not just recent changes) for redundancies and duplicated logic, bugs, relics (dead code, stale comments, leftover names or files), anti-patterns, and bloat. Fix what is clearly wrong, and report what is a judgment call.
- Run `npm run lint` (ESLint: chiefly React's hook rules) and `npx tsc -b`, and fix what they report.
- Also run `npx eslint . --no-inline-config` once to see what the `eslint-disable` comments hide, and check each is still deliberate (a stable ref, a value tracked through a computed key) rather than a stale value.
- Finish with `npm run build` and `npm run forge:lint -- --drafts`.

## Procedural models (forge, `client/src/forge`)
Overview, layout and workflow: `docs/forge/README.md`. Read `docs/forge/03-design-contract.md` and `docs/forge/04-style-guide.md` before writing a design.

- Every model is procedural and seed-based: `(design, seed)`. No hand-authored meshes, no params, no versions. Items have one look (every item of a name is identical, `ITEM_SEED`); creatures and characters vary per instance (seeded from the instance id).
- **One design per game data entry, named exactly like it:** `source` points at the entry (e.g. `{ table: 'weapons', key: 'plain/1h Swords' }`), `label` is its exact display name ("Plain Gladius"), the file is the slug (`plain-gladius.ts`). Never make one design cover several entries; share shape code through family helpers (`designs/_sword.ts` etc.). `forge:lint` enforces all of this.
- **Requested changes and new designs go to `client/src/forge/drafts/<stem>.ts`. Never edit `client/src/forge/designs/` directly** for a requested change; the user approves in `/dev/forge`.
- Draw randomness with `c.rf/ri/pick/chance`. A look the user wants fixed is written into the design, not exposed as a choice.
- Before saying a design is done: run `npm run forge:lint -- --drafts`, then `npm run forge:sheet -- --only-drafts --seeds 12 --yaws 0,180 --out forge-sheet.png` and LOOK at the PNG (use Read on it). Fix what you see.
- Under the top-down camera, lean long parts (weapons, limbs) outward, never toward or away from the camera (see the style guide's "Camera" section).
- **Linking:** every enemy class, summoned creature (`SUMMON_CLASSES`), item base (weapon, armor slot, shield) and class has a required `model: '<design id>'` field on its own data entry (e.g. `model: 'creature.zombie'`). A new entry gets its `model` together with its new design (a draft until approved; the game draws nothing until then). There is no separate mapping file. The one exception: starting gear (the Worn `STARTER_*` series, never dropped) has no designs and borrows the models of the items it is worn versions of.
- Game logic must not import three.js or read geometry. Facing and motion are view state (`viewEngine/three/mapRenderer.ts`): on a move a model turns toward it, then glides there (at most 1 s); on an ability it turns toward the aimed tile before the ability lands.
- No rarity/element glow in designs: item rarity glow is renderer-side. Loot never animates.
- Units: 1 = one tile. Models face +z. Left is +x.
- **View:** isometric, one setting (`GAME_CAMERA` in `client/src/viewEngine/camera.ts`: elevation + yaw; `TILE_SIZE` and `boardLayout` in `viewEngine/board.ts`). `viewEngine/` is the whole display's view; game logic never depends on it, and it never imports game data. Its core (`camera.ts`, `board.ts`) is pure TS and imports nothing from the forge; `viewEngine/three/` draws forge models with three.js, for the game and the forge alike (`toThree`, `stage`, `mapRenderer`, `icons`, `showcase`), and may import the forge's model core. The forge folder holds the forge UI and the link between its models and game data; rendering lives in `viewEngine/`. Every display piece derives from it (game camera, the DOM board's floor transform, overlay placement, forge game view, forge:sheet); never hard-code an angle or a screen offset. Maps are `Board`s (`components/mapParts.tsx`): flat DOM floor under one CSS transform, upright DOM placed with `board.toScreen`.
