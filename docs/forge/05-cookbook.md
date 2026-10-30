# Cookbook

How to build models: the toolkit, the construction patterns models share, the pitfalls that cost a redraw, and how
to check your work. What they should look like: [04-style-guide.md](04-style-guide.md). The rules a design must
follow: [03-design-contract.md](03-design-contract.md).

Keep this current: a new or changed helper goes into the toolkit, and a mistake that cost a redraw goes into
Pitfalls, in the same change (code sweeps check it).

## The toolkit
Reach for these before writing vertex math by hand. All coordinates are pre-fit model units (y up, front +z, left
+x); `finalize` scales the finished mesh to the tile afterwards.

**Vectors and colors** (`core/vec.ts`)
| | |
|---|---|
| `add`, `sub`, `mul`, `dot`, `cross`, `len`, `norm`, `lerp3` | vector arithmetic |
| `rotX`, `rotY`, `rotZ` | rotate a point about an axis through the origin |
| `alignY(d)` | the rotation turning +y onto direction `d`: build a piece upright, then stand it along any direction |
| `hslRGB(h, s, l)` | colors by hue, saturation, lightness: draw variety from narrow ranges (`hslRGB(ri(16, 24), rf(22, 30), rf(17, 22))`) |
| `mulC`, `mixC` | darken/brighten a color, blend two |

**Shapes** (`core/primitives.ts`)
| | |
|---|---|
| `blob(m, c, r, level, jit, col)` | lumpy ellipsoid: heads, bodies, rocks, knuckles. Level 0 = 20 tris, 1 = 80 |
| `crackedBlob(..., lava, share, o, vein)` | a blob with connected patches in another color: lava veins (default, glowing), moss or lichen (pass `vein: { j }` for lit) |
| `frustum(m, p0, p1, r0, r1, sides, col)` | a tapered prism between two points: limb segments, horns, spikes, stalks |
| `tube(m, pts, r0, r1, sides, col, o)` | frustums along a path of points, tapering r0 to r1 over it (or each segment on its own, `perSegment`): struts, rails, rings, ribs, a jointed shaft |
| `jointedLimb(m, joints, r, col, o)` | a limb through its joints: a frustum per segment, its radius at each joint (`r: number[]`) or each segment's own (`(seg) => [r0, r1]`), a color per segment if a list; `knobs: { scale, jit }` lumps the bends. Legs, arms, feelers |
| `loft(m, rings, col)` | connect a stack of rings: torsos, robes, hoods, blades. `bandCenters: true` for a column that flares or leans (see Pitfalls) |
| `ringPts`, `wobbleRing` | rings to loft: a clean circle around any axis, or an organic, wavy outline in the x-z plane |
| `box(m, c, s, col, jit)` | jittered boxes: feet, brows, slabs, vertebrae |
| `bipyr(m, c, r, h, sides, col)` | double-pointed crystal: gems, motes, spores, sparks |
| `tendril(m, start, dir, len, segs, w0, col, { bend })` | a tapering strand: vines, tatters, tentacles, flame tongues, roots |
| `fibSphere(n, turn)` | `n` directions spread evenly over a sphere: spikes, needles, motes, warts all around a body |
| `scatterDir(d, tilt, rf, jit?)` | one `fibSphere` direction tipped by the set's `tilt` and jittered: a spiky ball's spikes, scattered instead of machined |
| `onEllipsoid(c, r, dir, out)` | the point on a blob's surface in a direction: where to attach things so they sit on it |
| `alongPath(points, t)` | a point part-way along a polyline: place things along a limb or strand |

**The mesh** (`c.mesh`, `core/mesh.ts`)
| | |
|---|---|
| `tri`, `quad` | custom faces (winding is automatic: away from the center you pass) |
| `part(name, pivot)` | tag the following faces (torso, head, arm_l...); `motion` and `animations` move parts |
| `anchor(name, p)` | attach points (`feet` always; `hand_l/hand_r` for creatures that hold things) |
| `halo(p, r, color, tone?)` | a soft additive glow around a light (see Glow and translucency); `tone`: it takes a tinted model's tint |
| `xf(from, fn)` | transform the faces added since index `from`: build a piece at the origin, then move it |
| `xfAll(fn, scale)` | transform everything (faces, anchors, pivots, halos) |
| `embed(m, design, seed, place, scale)` | build another design's model into this one (`core/embed.ts`): the active Rifter holds the keystone and rift. Pass `scale = 1 / fitScale(m, fit)` so it keeps its true size |
| `FaceOpts.from`, `halo(..., from)` | a fading part's start color (an animation's `fades` step) |

**Family helpers** (`designs/_*.ts`): shared shape code for a family of designs. `_character` (bodies, holds,
clothing and hair, e.g. `chesterfieldCoat` (an open coat, to mid-thigh or lower: `hem`, with accents in `trim`) and `capWithBangs` (fuller and longer with `volume` and `nape`); a body built with
`restArms` holds nothing, both arms hanging at its sides, for NPCs), `_sword`, `_axe` and the other weapons (`_bow`'s `bowShape`: the D-bow alone, for a creature to hold),
`_armor` and the materials (`_cloth`, `_leather`, `_hide`, `_plate`: each armor series' pieces), `_shield`, `_ring` (rings and amulets: `jewelryEntry`, jewelry's `BRONZE` and `SILVER`, and `bandDesign(id, metal)`: the plain band, flat inside and domed outside, its `top` anchor at the crown), `_amulet` (`amuletDesign(id, { stone, metal, glint? })`: an oval cabochon in a setting, its chain lying loose behind it; `glint` is the light its crown catches, a brighter shade of the stone's own hue (a dark stone given a warm glint turns muddy)), `_rifter` (its states), `_chest` (`treasureChestDesign(id, { wood, woodDark, lock })`: every treasure chest's shape and `open` animation, each chest its own colors), `_interactive`, `_decor` and `_loot` (an object or loot design's identity: `interactiveEntry`, `decorEntry`, `lootEntry`; `_decor` also has the
merchant things' `DARK_WOOD` / `DARK_WOOD_SHADE` and `DECOR_IRON`, and `barrel`: a hooped barrel, optionally lidded), `_glow` (`floorGlow`), `_fungal` (`cap`,
`mush`, `shelf`, `antler`), `_goblin` (every goblin's body: `goblinBody` with its helmets, or its pieces
`goblinLook`, `goblinLegs`, `goblinTorso`, `goblinHead` for a goblin dressed differently; `goblinArm`; a body's
`eye` for eyes other than the yellow ones, e.g. the Troll Tamer's glowing white, and `pauldronSize` for larger
pauldrons), `_golem` (the rock hulks, Flame Golem and Mirehulk: `golemStone` (rock lighter on its tops),
`golemLimb` (a limb of cracked rocks, its cracks each golem's own: lava, moss), `golemFoot`, `golemHead` (skull,
brow and glowing eyes)), `_robe` (a creature's robe: `loftRobe` lofts its outline, `RobeRing`s from the hem up;
`robeAt` is its outline at any height, for things that grow from or sit on it), `_hood`
(`archHood`: a creature's hood from a run of arches, round or pointed), `_staff`'s `gnarledStaff` (a creature's
knotted wooden staff). When two designs need the same shape, it goes in a
helper, never copied.

**Tinted models** (`core/tint.ts`; Rifts & Keys only): `FaceOpts.tint` (a `Tone`, `[bright, deep]`, or one per corner) paints a
face with the color the model is drawn in, added to its own color (black for pure glow); `TINT` / `TINT_DEEP` are the
tint and its deep shade. Shade a tinted glow by its Tone (brighter on top, deeper below), not by its color.

## Construction patterns
- **Limbs:** `jointedLimb` through named joints (shoulder, elbow, wrist), `knobs` (or your own `blob`s) at the joints for bulk.
  Name the joints as `Vec3` constants first and pose by moving them: the code reads like a pose.
- **Bodies and robes:** `loft` a stack of rings from bottom to top (`wobbleRing` for organic outlines, or rings
  you jitter yourself). Shift each ring's center for sway or a hunch (a function of height, `sway(y)`); for a
  hunched back also deepen the upper rings toward the back (a larger `rz` or a back-only bulge), so the curve is
  the torso's own outline, never a blob added on the back (style guide, Rules). Color by height with a ColorFn (`(cen) => mixC(bottom, top, (cen[1] - y0) / span)`).
- **Masses:** overlapping blobs, the big ones `crackedBlob` for patches. To make one feature grow out of another
  (a spine from a back), sink its pieces mostly inside the mass so only their tops show; tacked-on pieces read as
  stuck on.
- **Attach to the surface:** place anything that grows on a body (vines, shelves, spikes, eyes, mushrooms) with
  `onEllipsoid` from the blob it grows on, not at the blob's center or at a guessed coordinate.
- **All around a body:** `fibSphere` for the directions, each nudged by a little seeded noise, then
  `onEllipsoid` (or the center plus a length) to place each piece.
- **Strands:** `tendril` with a `bend` that adds sag, wind (a shared sideways push) and a ripple
  (`Math.sin(t * k + phase)`). Keep strands from pointing straight at or away from the camera: sweep them sideways.
- **Pieces built upright:** model a leaf, horn or cap upright along +y at the origin, then
  `m.xf(start, p => add(alignY(dir)(p), base))`.
- **Patches by position:** to color regions (lichen among moss, rust among iron), decide by a slow wave through
  space (`sin(x * 7 + a) + sin(y * 6 + b) + sin(z * 8 + c) > k`), so neighbouring faces agree and patches form.
- **Worn or weathered gear:** gear shown on an object is the item's own design (`embed`, at its held size:
  `HELD_LENGTH` / `HELD_SHIELD_HEIGHT` x `CHARACTER_HEIGHT`), never redrawn. To age it, recolor the faces the embed
  added (from `m.faces.length` before it): the Dead Adventurer's `rust` turns near-grey metal toward rust in patches
  and darkens leather and wood, leaving the shapes alone.
- **Variety:** draw everything from the seed (`c.rf/ri/pick/chance`) within ranges that keep the identity: hue
  inside a narrow band, sizes within about ±15%, a few discrete choices (`pick`) for the big variants. Things a
  user fixes become constants.

## Fit and size
- `finalize` scales the whole model so it fits `fit.height` (from the floor to its top) and `fit.maxRadius` (from
  the feet anchor, sideways), whichever is tighter. So:
  - Changing the top changes everything: make the needles shorter and the model scales back up, undoing it.
    To resize one part, also adjust `fit.height` (or the part that sets the top).
  - Raising a model (or adding something tall) makes all of it smaller.
- The floor is the model's lowest point by default. A floating creature sets `fit: { ..., floor: 'origin' }`:
  its own y = 0 is the floor, so it hovers at the height it was built at.
- Mark `m.anchor('feet', ...)` at the middle of the stance (between the feet, or under a floating body): that
  point goes to the tile center.
- Regular enemies are about 1.0–1.45 tall, bosses up to about 1.7 (see the existing designs' `fit`).

## Glow and translucency
- `e` (emissive) below 0.5 is a partial glow on a lit face; **0.5 and up is drawn unlit and opaque**: its alpha
  is ignored in game. A see-through glowing face (a sac, a spirit's body) must stay below 0.5 (0.35–0.45).
- Translucent faces (`a < 1`) draw after the solid ones; keep them to bodies meant to be see-through.
- A halo the same color as the glowing face under it disappears into it: make halos hotter (mix toward white or
  yellow) or larger, so they bloom onto the dark around.
- Halos are additive: overlapping ones add up fast. A few strong ones beat many weak ones.
- `forge:sheet` draws halos much fainter than the game does: a halo that barely shows on the sheet can be the
  right size in game. Size halos from their radius (about the distance the glow should reach), not from the
  sheet, and check them in `/dev/forge` or the game (a Void Wisp body glow sized to show on the sheet reached far
  past its spikes in game).
- `xf` moves faces only: halos (and anchors, pivots) placed before an `xf` stay behind. Give halos their final
  position, or move them yourself.

## Pitfalls
- **Buried details:** things placed at a blob's center, or inside a mass the eye can't see into, simply vanish.
  Use `onEllipsoid`.
- **Too small to see:** at game scale (a tile is about 50 px) anything thinner than about 0.015 model units, or
  smaller than about 3% of the model, disappears. Thin strands need width; tiny details need contrast or glow.
- **Toward or away from the camera:** long parts leaning that way collapse to stubs (see the style guide's
  Camera section). Lean them sideways.
- **Holes in a flared or leaning loft:** `loft` turns every face away from one center, the average of all its
  rings. On a column that flares (a robe's hem) or leans (a hunch), that center can fall outside a band, so some
  of its faces face inward and are culled: holes that come and go with the seed. Pass `bandCenters: true` (each band
  faces away from its own center; `loftRobe` does).
- **Shapes that read wrong:** a tall cone reads as a dunce cap, a small dark hole as a single eye socket, a round
  boulder on a back as a separate rock. Check how the silhouette reads, not just what was built.
- **Density:** clusters of small things (motes, warts) pack to the middle if their distance is drawn uniformly
  in 0..1; spread them over a shell (`fibSphere`) or draw the distance as `u ** 0.6`.
- **Budget creep:** small pieces add up (a 9-sided cap is about 100 triangles). Use fewer sides for small or
  distant parts (`sides` options), and cap-less strands.
- **Hidden caps:** every `frustum` (and each segment of a `tube`) caps both ends with a fan of `sides` triangles,
  as many as its sides. On pieces whose ends are joined or buried (a wheel's rim, spokes into a hub, an axle into
  its wheels) pass `caps: false`: it halved the Merchant's Cart's running gear.

## Checking your work
`npm run forge:lint -- --drafts` (rules, determinism, budget) and then look at `forge:sheet`:
- **Overview:** `npm run forge:sheet -- --only-drafts --seeds 12 --yaws 0,180 --out forge-sheet.png`.
- **Detail:** fewer seeds, bigger cells: `--seeds 1,2,3 --cols 3 --cell 400` (or 520 for one or two).
- **Rifts & Keys:** `--tint <dungeon>` (default: the first) or `--tint #rrggbb` paints them; check a few dungeons' colors.
- **True side profile** (backs, hunches, how far things stick out): `--yaws 90 --elev 5`.
- **Close three-quarter views:** `--yaws 30,330`.
- Look at several seeds: a seed-dependent problem (a part buried on some seeds, a color that loses the floor)
  shows only across a few.
- When refactoring a design without changing its look (moving code into a helper), check the draft builds
  identically to the approved design for many seeds (compare `buildModel(...).mesh.positions`).
