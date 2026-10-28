# Design contract

## One design per data entry
Every design is the model for exactly **one** entry in the game data, and is named exactly like it:
- `source` names the entry: `{ table: 'enemies', key: 'skeleton' }`, `{ table: 'summons', key: 'void-wisp' }` (category `summon`: creatures the party summons, forge section "Summons"), `{ table: 'weapons', key: 'plain/1h Swords' }`, `{ table: 'armor', key: 'apprentice/helm' }` or `{ table: 'offhands', key: 'buckler' }` (category `offhand`: shields, quivers and foci).
- `label` is exactly the entry's display name ("Skeleton", "Plain Gladius").
- The file is that name slugged: `skeleton.ts`, `plain-gladius.ts`, `plain-bastard-sword.ts`; the id is `${category}.${slug}`.
- Approved, it lives in its category's folder under `designs/`: `designs/creatures/skeleton.ts`, `designs/weapons/plain-gladius.ts` (`CATEGORY_FOLDER` in `core/folders.ts`: creatures, summons, classes, weapons, armor, offhands, objects). Shared helpers (`_sword.ts`) stay in `designs/` itself. Drafts stay flat in `drafts/`; approving one files it into its folder and fixes its imports (`approvedSource`).

`npm run forge:lint` fails if any of this drifts, if two designs claim the same entry, or if a `model` link in the game data points at a design that doesn't exist or is for a different entry (rules in `client/src/forge/dataRefs.ts`).

**The one exception: starting gear.** The Worn series (`STARTER_WEAPON_SERIES`, `STARTER_ARMOR_SERIES`, `STARTER_SHIELDS`) never drops and has no designs of its own: each Worn item borrows the design of the item it is a worn version of ("Worn Gladius" is drawn with `weapon.plain-gladius`). The lint checks every borrowed link is a model some real entry uses. Shapes shared by a family live in helper files (`designs/_sword.ts`, `_axe.ts`, `_staff.ts`); an entry's design file just calls them, e.g. `export default swordDesign('plain', '1h Swords')`, and takes its name and id from the data.

## The design object
A design is one file in `client/src/forge/designs/<category folder>/` (or `client/src/forge/drafts/`) with a default export:

```ts
const design: Design = {
  id: 'creature.skeleton',       // `${category}.${fileStem}`, lint enforces
  source: { table: 'enemies', key: 'skeleton' },   // the one data entry this is the model for
  category: 'creature',          // creature | summon | character | weapon | armor | offhand | object | rift
  label: 'Skeleton',             // the entry's display name exactly
  fit: { kind: 'standing', height: 1.12, maxRadius: 0.54 },   // or { kind: 'item', size: 0.8 }
  budget: 900,                   // max triangles
  build(c) { /* draw into c.mesh */ return 'Frost-Eyed Skeleton'; },
};
export default design;
```

## Seeds and variety
A design draws everything random from the seed: `c.rf(a, b)` (float), `c.ri(a, b)` (int), `c.pick(options)`, `c.chance(p)`. There are no parameters: a look the user wants fixed is simply written into the design.
- **Items** (weapons, armor, offhands: `fit.kind: 'item'`) have **one look**: every item of a name is built with `ITEM_SEED` (`core/link.ts`), so the seed only shapes that one look. Don't add choices to an item; draw the design the user asked for.
- **Creatures and characters** vary per instance: each game instance seeds from its own id (`instanceSeed`), so a design can roll variety (the zombie's clothes, a skeleton's eye glow) within its locked identity (see the style guide).

## Building geometry
`core/primitives.ts`: `loft` (rings -> limbs, blades, hafts), `frustum`, `box` (with corner jitter), `blob` (jittered low-poly ellipsoid), `bipyr` (crystal). `c.mesh.tri/quad` for custom triangles. Winding is automatic: each triangle is oriented away from the center of its convex piece, so keep pieces roughly convex. Per-face color can be a function `(centroid, normal) => RGB` (stripes, moss on top faces). Face options: `e` emissive 0..1 (>= .5 renders unlit glow), `a` alpha, `j` brightness jitter (faceting).

**Halos:** `m.halo(p, r, color)` puts a soft glow around a light the model carries (an eye, an antler tip, a spore sac): a round, additive glow facing the camera, fading from its center out to radius `r`, hidden by whatever is in front of it. It moves with the current part. Usually over an emissive face. `xf` doesn't move it, so give it its final position. Halos are the model's own lights: never rarity or element glow.

## Parts, pivots, anchors (for later animation and attachment)
`m.part('arm_l', pivot)` tags all following faces. Naming: `torso`, `head`, `arm_l/arm_r`, `leg_l/leg_r` etc. `m.anchor('hand_l', point)` for attach points. **Standing designs mark `m.anchor('feet', point)` at the middle of the stance**: `finalize` puts that point at the tile center (the bounding-box center is only the fallback, and a weapon held out to one side would pull it off the body). `finalize` adds `overhead` (standing) or `center` (item); weapons add `grip` and `tip`. Anchors and pivots are transformed with the mesh.

## Class characters (category `character`, forge section "Classes")
One design per class (`source: { table: 'classes', key }`), built on `designs/_character.ts` (`buildBody` + the class's own clothing), at `CHARACTER_HEIGHT` (the skeleton's height). Bodies hold no gear themselves: they mark `hand_r` (right fist, main hand) and `forearm_l` (left forearm, shield strap), and `src/forge/equip.ts` places the equipped weapon and offhand there (`holdGear`) from their own linked designs. Held sizes are fractions of `CHARACTER_HEIGHT` (`HELD_LENGTH`, `HELD_SHIELD_HEIGHT`). Quivers are worn on the back instead: every body marks `quiver_bottom` and `quiver_top` (`QUIVER_ON_BACK`), a quiver design is built in body units at that spot and marks the same two anchors, and equip lines them up (at its built size). An offhand held dangling (a focus) marks `dangle_grip` (where it is held) and `dangle_tip`: it hangs straight down from the left fist (`fist_l`, every body marks it), `HELD_DANGLE_LENGTH` long.

**Holds:** the arm pose follows the equipped weapon type, not the class (`Hold` / `HOLD_FOR` in `_character.ts`): one-hand (Knight/Rogue), staff (Arcanist), shoulder carry (Barbarian), bow (Archer), crossbow. A class design reads the hold with `classHold(c, key)` (the build input `c.hold`, else its starting weapon's hold) and passes it to `buildBody`; the game and `buildPreview` (equip.ts) build with the equipped weapon's hold. Holds are shared code, not designs: the forge shows each class as one row per hold its proficiencies allow (a cell per weapon type), and a hold is approved in chat. `forge:sheet --weapon "<type>"` renders a class holding any weapon type.

## Moving parts
Models are static, except parts a design lists in `motion` (`PartSpin`): each spins about an axis through its part's pivot, forever, while it is on screen (view state, like facing; the game and the forge both animate it). `frame` lets an oval part be built round and squashed, so its pattern turns while the outline stays put (the Rift's swirl). Use it sparingly: something on the map that is magic or alive, never loot.

## Animations
A design can list one-time `animations` (`PartAnimation`): each has a `name` ('open'), a length in `ms`, and `turns`: parts that turn `angleDeg` about an axis through their pivot (`m.part(name, pivot)`), eased, then hold the end pose. Everything that should move together goes in the animated part (a chest's lid carries its straps and hasp; the padlock stays on the body). The game plays an animation when an object's state calls for it (`MapUnit.played` / `MapObject.played`, e.g. `['open']` for a looted chest): one newly listed plays, one already listed when the object appears shows its end pose. In `/dev/forge`, a radio row (Model, then each animation) plays one on a loop in every cell; `forge:sheet --anim <name>` draws its end pose. The math is shared (`core/animate.ts`; three.js poses it in `animateParts`). Like `motion`, animations are never for loot.

An animation's steps, each naming a part (all over its `ms`):
- `turns`: the part turns `angleDeg` about an axis through its pivot (eased in and out). A chest's lid.
- `grows`: the part scales up from nothing to its full size about its pivot (`ease`: 'out', the default, fast then settling; 'in'; or 'inOut'), or with `shrink` down to nothing ('in' by default: collapsing). The active Rifter's rift opening out from its center (`activate`, `reopen`) and collapsing (`close`).
- `fades`: the part's glow fades: each face with a start color (`FaceOpts.from`) goes from it to its own color, each halo with one (`m.halo(p, r, color, tint, from)`) from it to its own. Faces and halos without one don't change. The active Rifter's lights waking from their dormant glow.

An animation that hasn't been played changes nothing (the model as built): only played ones pose the model, each at its progress. So one waiting its turn (the Rifter's `reopen`, which starts from no rift) never holds its start pose over the others. An object's model can change while it keeps its id (the dormant Rifter swapped for the active one): an animation newly called for in the same update plays from its start, so the swap shows the new model waking.

## Game objects (category `object`, forge section "Game Objects")
Interactable things on the map that aren't units or loot: doors, chests, the Rifter, later craftbenches. Their data entries are `GAME_OBJECTS` in `data/world/gameObjects.ts` (`source: { table: 'gameObjects', key }`; identity from `objectEntry` in `designs/_object.ts`). They stand on a tile (`fit.kind: 'standing'`), built facing +z; on the map they face their open side (`facingOpenSide`: a door in a wall faces the floor it opens onto). Maps choose which objects they place by id (`DungeonConfig.doorObject` / `chestObject`). Variants share a family helper, one entry and design each. Rifts are not game objects: see Rifts & Keys.

**States and composed objects.** An object that changes look with its state has an entry and design per state, sharing a family helper that takes the state as a code argument (not a design param): the Rifter is `rifter` (dormant) and `rifter-active` (`designs/_rifter.ts`). A state that holds other models builds them in from their own designs with `embed` (`core/embed.ts`), so each shape lives in one place: the active Rifter embeds the Keystone in its socket and the Rift between its struts (both tinted, so it is a tinted model too, drawn in the opened dungeon's color), takes over the rift's `motion`, and wakes with its `activate` animation (1.5 s: its lights fade up from the dormant ones while the rift grows). `embed` builds and finalizes the inner design on its own (its true size; pass `1 / fitScale(outerMesh, fit)` so the outer fit doesn't rescale it) and keeps its part names (they must not clash with the outer design's). Both Rifter states mark anchors where the keystone and rift go (`socket`, `socket_up`, `rift`). A multi-tile object is built in tile units along x, its `feet` anchor at the middle tile's center (the Rifter: 3 tiles, `maxRadius` about 1.5).

## Rifts & Keys (category `rift`, forge section "Rifts & Keys")
Two **tinted models**: the Rift and the Keystone (`data/world/rifts.ts`, `source: { table: 'rifts', key }`). Every rift has the same shape and so does every keystone; a rift is painted in the color of where it leads. Each dungeon has one color (`DungeonConfig.riftColor`) that paints the Sanctum's rift into it and its keystone; every rift back to the Sanctum (where the party arrives in a dungeon, and past its boss) is `SANCTUM_RIFT_COLOR` (`[40, 65, 175]`, a deep royal blue). A new dungeon needs only its color: no designs or files.
- A tinted design marks what takes the tint with a `Tone` (`[bright, deep]`: how much of the tint and of its deep shade, `tintDeep` in `core/tint.ts`): faces with `FaceOpts.tint` (one Tone, or one per corner to blend like `vc`), halos with `m.halo(p, r, color, tone)`, a floor pool with `floorGlow(..., segments, tone)`. The Tone is added to the face's own color (usually black; the rift's void keeps its own). `TINT` = [1, 0], `TINT_DEEP` = [0, 1].
- The model never depends on the color: it builds, caches and lints like any other. The color is applied when it is drawn, `tintModel(model, color, parts?)` (`parts`: only those parts, so one model can hold two tinted things in two colors: the active Rifter's keystone and its rift, `MapObject.partTints`) (the game: `MapObject.tint` in `ModelLayer`; the forge page and `forge:sheet --tint <dungeon|#rrggbb>`). Drawn without it, its tinted parts stay black.
- In `/dev/forge` the section has a dungeon menu (every dungeon's `riftColor`, live from `dungeons.ts`) and a custom color picker that prints the `riftColor` line to paste into a new dungeon.

## Names
`build` returns a display name (the forge shows it on hover): normally the label, or a variant name for a creature ("Frost-Eyed Skeleton").

## Changes
There are no design versions and no archive: a change replaces the design (approved in `/dev/forge`; git keeps history). How an item lies as loot (`fit.groundPitchDeg` / `groundRollDeg`, and its `fit.size`, which only shows on the floor: icons frame themselves) is presentation, not its look: change it directly in the approved design or helper, no draft. A change to a whole family (its shared helper, `designs/_x.ts`) has no draft: it applies to every design of the family at once, so show the before and after on `forge:sheet` and say it is live (git reverts it). Changing generator code changes what existing seeds look like, which is fine.
