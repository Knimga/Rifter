# Rifter

Turn-based dungeon crawler. App is `client/` (Vite + React 19 + Tailwind + TypeScript); `server/` is an unused stub. Run commands from `client/` unless noted (`npm run dev` at the repo root starts both).

## Procedural models (forge, `client/src/forge`)
Overview, layout and workflow: `docs/forge/README.md`. Read `docs/forge/03-design-contract.md` and `docs/forge/04-style-guide.md` before writing a design.

- Every model is procedural and seed-based: `(design, version, seed, params)`. No hand-authored meshes.
- **One design per game data entry, named exactly like it:** `source` points at the entry (e.g. `{ table: 'weapons', key: 'plain/1h Swords' }`), `label` is its exact display name ("Plain Gladius"), the file is the slug (`plain-gladius.ts`). Never make one design cover several entries; share shape code through family helpers (`designs/_sword.ts` etc.). `forge:lint` enforces all of this.
- **Requested changes and new designs go to `client/src/forge/drafts/<stem>.ts`. Never edit `client/src/forge/designs/` directly** for a requested change; the user approves in `/dev/forge`.
- Call `c.choice/range/int/chance` at the top of `build()`, unconditionally, in a fixed order.
- Before saying a design is done: run `npm run forge:lint -- --drafts`, then `npm run forge:sheet -- --only-drafts --seeds 12 --yaws 0,180 --out forge-sheet.png` and LOOK at the PNG (use Read on it). Fix what you see.
- Under the top-down camera, lean long parts (weapons, limbs) outward, never toward or away from the camera (see the style guide's "Camera" section).
- If an approved design's output changes for existing seeds, bump `version`.
- **Linking:** a game object uses a model via a `model: { design, version, params }` field on its own data entry (e.g. enemy classes in `client/src/data/enemies.ts`). `params` = the Fixed params; everything else varies per instance (each instance seeds from its own id via `instanceSeed`). A `seed` field is only present when the user wants every instance identical. When the user says "link X: <pasted model link>", add that field to X's entry. A plain "link X" / "link the approved designs" needs no paste: each design's `source` names its entry, so add `model: { design, version, params: {} }` there (params = only what the user says to fix; everything else varies). Only link approved designs. There is no separate mapping file.
- Game logic must not import three.js or read geometry. Facing is view state; models turn only while moving.
- No rarity/element glow in designs: item rarity glow is renderer-side. Loot never animates.
- Units: 1 = one tile. Models face +z. Left is +x.
