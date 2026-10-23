# Design contract

## One design per data entry
Every design is the model for exactly **one** entry in the game data, and is named exactly like it:
- `source` names the entry: `{ table: 'enemies', key: 'skeleton' }`, `{ table: 'summons', key: 'void-wisp' }` (category `summon`: creatures the party summons, forge section "Summons"), `{ table: 'weapons', key: 'plain/1h Swords' }`, `{ table: 'armor', key: 'apprentice/helm' }` or `{ table: 'offhands', key: 'buckler' }` (category `offhand`: shields now, focuses and trinkets later).
- `label` is exactly the entry's display name ("Skeleton", "Plain Gladius").
- The file is that name slugged: `skeleton.ts`, `plain-gladius.ts`, `plain-bastard-sword.ts`; the id is `${category}.${slug}`.

`npm run forge:lint` fails if any of this drifts, if two designs claim the same entry, or if a `model` link in the game data points at a design that doesn't exist or is for a different entry (rules in `client/src/forge/dataRefs.ts`).

**The one exception: starting gear.** The Worn series (`STARTER_WEAPON_SERIES`, `STARTER_ARMOR_SERIES`, `STARTER_SHIELDS`) never drops and has no designs of its own: each Worn item borrows the design of the item it is a worn version of ("Worn Gladius" is drawn with `weapon.plain-gladius`). The lint checks every borrowed link is a model some real entry uses. Shapes shared by a family live in helper files (`designs/_sword.ts`, `_axe.ts`, `_staff.ts`); an entry's design file just calls them, e.g. `export default swordDesign('plain', '1h Swords')`, and takes its name and id from the data.

## The design object
A design is one file in `client/src/forge/designs/` (or `client/src/forge/drafts/`) with a default export:

```ts
const design: Design = {
  id: 'creature.skeleton',       // `${category}.${fileStem}`, lint enforces
  source: { table: 'enemies', key: 'skeleton' },   // the one data entry this is the model for
  category: 'creature',          // creature | summon | character | weapon | armor | offhand | object
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

## Parts, pivots, anchors (for later animation and attachment)
`m.part('arm_l', pivot)` tags all following faces. Naming: `torso`, `head`, `arm_l/arm_r`, `leg_l/leg_r` etc. `m.anchor('hand_l', point)` for attach points. **Standing designs mark `m.anchor('feet', point)` at the middle of the stance**: `finalize` puts that point at the tile center (the bounding-box center is only the fallback, and a weapon held out to one side would pull it off the body). `finalize` adds `overhead` (standing) or `center` (item); weapons add `grip` and `tip`. Anchors and pivots are transformed with the mesh.

## Class characters (category `character`, forge section "Classes")
One design per class (`source: { table: 'classes', key }`), built on `designs/_character.ts` (`buildBody` + the class's own clothing), at `CHARACTER_HEIGHT` (the skeleton's height). Bodies hold no gear themselves: they mark `hand_r` (right fist, main hand) and `forearm_l` (left forearm, shield strap), and `src/forge/equip.ts` places the equipped weapon and offhand there (`holdGear`) from their own linked designs. Held sizes are fractions of `CHARACTER_HEIGHT` (`HELD_LENGTH`, `HELD_SHIELD_HEIGHT`).

**Holds:** the arm pose follows the equipped weapon type, not the class (`Hold` / `HOLD_FOR` in `_character.ts`): one-hand (Knight/Rogue), staff (Arcanist), shoulder carry (Brute), bow (Archer), crossbow. A class design reads the hold with `classHold(c, key)` (the build input `c.hold`, else its starting weapon's hold) and passes it to `buildBody`; the game and `buildPreview` (equip.ts) build with the equipped weapon's hold. Holds are shared code, not designs: the forge shows each class as one row per hold its proficiencies allow (a cell per weapon type), and a hold is approved in chat. `forge:sheet --weapon "<type>"` renders a class holding any weapon type.

## Moving parts
Models are static, except parts a design lists in `motion` (`PartSpin`): each spins about an axis through its part's pivot, forever, while it is on screen (view state, like facing; the game and the forge both animate it). `frame` lets an oval part be built round and squashed, so its pattern turns while the outline stays put (the Portal's swirl). Use it sparingly: something on the map that is magic or alive, never loot.

## Animations
A design can list one-time `animations` (`PartAnimation`): each has a `name` ('open'), a length in `ms`, and `turns`: parts that turn `angleDeg` about an axis through their pivot (`m.part(name, pivot)`), eased, then hold the end pose. Everything that should move together goes in the animated part (a chest's lid carries its straps and hasp; the padlock stays on the body). The game plays an animation when an object's state calls for it (`MapUnit.played` / `MapObject.played`, e.g. `['open']` for a looted chest): one newly listed plays, one already listed when the object appears shows its end pose. In `/dev/forge`, a radio row (Model, then each animation) plays one on a loop in every cell; `forge:sheet --anim <name>` draws its end pose. The math is shared (`core/animate.ts`; three.js poses it in `animateParts`). Like `motion`, animations are never for loot.

## Game objects (category `object`, forge section "Game Objects")
Interactable things on the map that aren't units or loot: doors, portals, later chests and craftbenches. Their data entries are `GAME_OBJECTS` in `data/world/gameObjects.ts` (`source: { table: 'gameObjects', key }`; identity from `objectEntry` in `designs/_object.ts`). They stand on a tile (`fit.kind: 'standing'`), built facing +z; on the map they face their open side (`facingOpenSide`: a door in a wall faces the floor it opens onto). Maps choose which objects they place by id (`DungeonConfig.doorObject` / `portalObject`, `SANCTUM.portalObject`); where a portal leads belongs to the map, not the object. Variants share a family helper, one entry and design each (portals: `designs/_portal.ts`, e.g. Necrotic Portal; another color is a new entry plus a one-line design).

## Names
`build` returns a display name (the forge shows it on hover): normally the label, or a variant name for a creature ("Frost-Eyed Skeleton").

## Changes
There are no design versions and no archive: a change replaces the design (approved in `/dev/forge`; git keeps history). Changing generator code changes what existing seeds look like, which is fine.
