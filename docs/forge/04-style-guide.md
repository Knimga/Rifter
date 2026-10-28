# Style guide

How models should look. How to build them: [05-cookbook.md](05-cookbook.md). Art direction the user settles (a
palette, a do or don't) is added here as it is decided.

## Art direction: saturated glows on dark
Every model serves its dungeon's atmosphere. The dungeons are dark, moody places, and the light in them comes from
the things living there: eyes, cores, embers, spores, runes. Bodies stay dark and muted; their light is saturated
and bright. That contrast is the look, and it is what reads at game scale.

- **Value first.** Bodies sit in the dark-to-mid range (HSL lightness about 12–40%) and are muted (saturation
  about 10–40%). Glows are the brightest, most saturated thing on the model. A creature should read as "a dark
  shape with light in it", never as an evenly lit, evenly colored toy.
- **Glow is a light source.** Put it where light would come from: eyes, a heart or core, wounds and cracks, fungus
  caps, spore sacs, runes, weapon edges of magical things. Emissive faces for the source, a halo (`m.halo`) on the
  strongest ones, a floor glow under a creature that is mostly light (spirits, wisps, rifts). A creature's glow
  color is part of its identity.
- **Saturate small, mute large.** Large surfaces are never fully saturated; small things can be. No pure
  primaries ([255, 0, 0] and the like): push hues toward something specific (ember orange, venom lime, spectral
  cyan, necrotic green-white, bruise violet).
- **Hue-shift, don't just darken.** Shade with hue as well as value: tops a little warmer or lighter (catching
  light), undersides and recesses cooler or toward the dungeon's ambient hue. A ColorFn by the face normal does it
  (`n[1] > 0.5 ? top : side`).
- **Weathered, not clean.** Per-face jitter, patches (moss, lichen, lava veins), small color differences between
  parts. Nothing uniformly smooth or freshly painted.
- **Grim, not cartoony.** Avoid: big round eyes, smiles, oversized heads, bubbly symmetric blobs, candy colors,
  "cute" proportions. Prefer: angular and asymmetric forms, broken silhouettes, tatters, spikes, gnarled growths,
  long limbs, hunched or gaunt bodies, faces that are hollows, glows or nothing at all.
- **Readable, not noisy.** One strong silhouette idea, a few secondary details, the detail clustered where the eye
  goes (the head, the glow). If two features fight for attention, cut one.
- **Contrast with the floor.** Models stand on their dungeon's dark floor: check that the body's outline still
  separates from it (a lighter top, a rim of glow, a floor glow).

### Dungeon palettes
Creatures belong to their dungeon: bodies in its ambient colors, light from its glow family. A glow from another
dungeon's family is rare and deliberate.

Items are not tied to a dungeon: their materials read by value and hue (iron grey-blue, leather brown, gold), and
their rarity glow is the renderer's, never the design's.

## Rules

- **Faceted and flat-shaded.** Few triangles, hard edges, per-face brightness jitter (default 0.16). No smoothing, no textures.
- **Silhouette first.** At game scale (about one tile, 50 px) a creature must read by silhouette alone. Exaggerate the identifying feature (skeleton ribcage and skull, zombie's reaching arms, necromancer's hood and scythe).
- **Identity locked, variety free.** Per type, lock what defines it (skeleton stays ivory, zombie skin stays in a narrow grey-green band, necromancer robe stays dark violet) and let seeds vary proportions, accents and secondary colors. Do it by drawing the variable from a restricted range, not by post-hoc correction.
- **Color.** See Art direction above. Glows that belong to the model (eyes, cores, gems, crystals) use emissive faces (`e` >= .5), so they pop under any light; the brightest of them (eyes, glowing tips) can add a halo (`m.halo`) for a soft glow around them. Use a few, small: a glow that reads as light, not fog.
- **No rarity or element glow in designs.** Item rarity glow (Superior and up) is applied by the renderer, so an item's mesh never depends on its rarity.
- **Sizes.** Creatures about one tile (bosses larger via `fit`). Items are `fit.size` about 0.8: they sit on a tile and fill an icon.
- **Facing.** Front (eyes, face) toward +z. Make the front obviously the front. Models turn when they move (toward the move, before gliding there) or use an ability (toward the tile it was aimed at).
- **Budgets.** Regular creatures aim for about 900 triangles; an elaborate one (lots of fungus, strands, a showpiece) can go to about 2,000–2,800 when the look needs it. Items <= 600. Set `budget` a little above what the design uses (lint fails over it), and spend triangles where they read: silhouette and glow, not hidden undersides.
- **Loot is motionless** on the ground and in the inventory. Build items facing +z (their outline in the x-y plane): they're shown flat on the tile in game and straight-on in icons, so the x-y outline is what players see.
- **Weapons** lean with the tip up and to the LEFT (`WEAPON_ROLL`), matching the character sheet's left-hand weapon slot. Never pitch a weapon toward or away from the camera. Weapon designs draw `series` and `weaponType` from the game's weapon data (`weaponPalette`): the series sets the material, and the display name comes from `WEAPON_SERIES`.
- **Shields** are strapped to the forearm, never pinned to the fist: the shield's face lies parallel to the forearm,
  its back against the forearm's outside, the fist behind it (never through it). To show its face to the camera,
  tip it about the forearm, not off it.
- **Hunched backs** are a natural curve of the spine in the upper back, shaped into the torso itself: shift the
  torso's upper rings forward and bulge their back edge outward (the hunch grows out of the body). Never a separate
  round blob on the back: it reads as a boulder carried there.
- **Don't** add detail smaller than about 3% of the model; it is invisible at game scale and costs triangles.

## Camera (read this before posing anything)
The game uses an isometric orthographic view looking down steeply (`GAME_CAMERA` in `src/viewEngine/camera.ts`: steep elevation, turned 45° so north is up-left). A point's height lifts it on screen by only `y * cos(elevation)` (half a tile per unit at 60°, 0.71 at 45°).

- **Height is compressed, width is not.** Things that stick out sideways (shoulders, weapons held out, spider legs) read at full size; tall thin things read at about half.
- **Never lean long parts toward or away from the camera.** A blade raised and tilted forward points at the viewer, and its height and forward lean cancel on screen, leaving a stub. Because models turn, "forward" is toward the camera for some facing, so lean weapons and limbs **outward (sideways)** instead. The camera looks along the grid's diagonal, so every grid move is seen at a 45° angle: check every design at yaw 0, 90, 180 and 270 (and the diagonals) in `forge:sheet` or the builder's walk test.
- Horizontal parts pointing forward (a zombie's reaching arms) are fine: they read as pointing down the screen.
