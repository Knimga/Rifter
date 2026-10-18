# Rifter

Turn-based dungeon crawler. App is `client/` (Vite + React 19 + Tailwind + TypeScript); `server/` is an unused stub. Run commands from `client/` unless noted (`npm run dev` at the repo root starts both).

## Procedural models (forge, `client/src/forge`)
Overview, layout and workflow: `docs/forge/README.md`. Read `docs/forge/03-design-contract.md` and `docs/forge/04-style-guide.md` before writing a design.

- Every model is procedural and seed-based: `(design, seed)`. No hand-authored meshes, no params, no versions. Items have one look (every item of a name is identical, `ITEM_SEED`); creatures and characters vary per instance (seeded from the instance id).
- **One design per game data entry, named exactly like it:** `source` points at the entry (e.g. `{ table: 'weapons', key: 'plain/1h Swords' }`), `label` is its exact display name ("Plain Gladius"), the file is the slug (`plain-gladius.ts`). Never make one design cover several entries; share shape code through family helpers (`designs/_sword.ts` etc.). `forge:lint` enforces all of this.
- **Requested changes and new designs go to `client/src/forge/drafts/<stem>.ts`. Never edit `client/src/forge/designs/` directly** for a requested change; the user approves in `/dev/forge`.
- Draw randomness with `c.rf/ri/pick/chance`. A look the user wants fixed is written into the design, not exposed as a choice.
- Before saying a design is done: run `npm run forge:lint -- --drafts`, then `npm run forge:sheet -- --only-drafts --seeds 12 --yaws 0,180 --out forge-sheet.png` and LOOK at the PNG (use Read on it). Fix what you see.
- Under the top-down camera, lean long parts (weapons, limbs) outward, never toward or away from the camera (see the style guide's "Camera" section).
- **Linking:** every enemy class, item base (weapon, armor slot, shield) and class has a required `model: '<design id>'` field on its own data entry (e.g. `model: 'creature.zombie'`). A new entry gets its `model` together with its new design (a draft until approved; the game draws nothing until then). There is no separate mapping file.
- Game logic must not import three.js or read geometry. Facing is view state; models turn only when they move (toward the move) or use an ability (toward the tile it was aimed at).
- No rarity/element glow in designs: item rarity glow is renderer-side. Loot never animates.
- Units: 1 = one tile. Models face +z. Left is +x.
