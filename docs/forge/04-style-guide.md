# Style guide

- **Faceted and flat-shaded.** Few triangles, hard edges, per-face brightness jitter (default 0.16). No smoothing, no textures.
- **Silhouette first.** At game scale (about one tile, 50 px) a creature must read by silhouette alone. Exaggerate the identifying feature (skeleton ribcage and skull, zombie's reaching arms, necromancer's hood and scythe).
- **Identity locked, variety free.** Per type, lock what defines it (skeleton stays ivory, zombie skin stays in a narrow grey-green band, necromancer robe stays dark violet) and let seeds vary proportions, accents and secondary colors. Do it by drawing the variable from a restricted range, not by post-hoc correction.
- **Color.** Mid-saturation bodies, one saturated accent. Glows that belong to the model (eyes, cores, gems, crystals) use emissive faces (`e` >= .5), so they pop under any light.
- **No rarity or element glow in designs.** Item rarity glow (Superior and up) is applied by the renderer, so an item's mesh never depends on its rarity.
- **Sizes.** Creatures about one tile (bosses larger via `fit`). Items are `fit.size` about 0.8: they sit on a tile and fill an icon.
- **Facing.** Front (eyes, face) toward +z. Make the front obviously the front. Models only turn while moving (they face the direction they last moved).
- **Budgets.** Creatures <= 900 tris, items <= 600.
- **Loot is motionless** on the ground and in the inventory. Design items so they read from the fixed icon and game angles.
- **Don't** add detail smaller than about 3% of the model; it is invisible at game scale and costs triangles.

## Camera (read this before posing anything)
The game uses an oblique top-down projection (see `stage-config.ts`): the ground maps 1:1 onto the tile grid and a point's height lifts it on screen by only `y * cot(60°)`, about 0.58 per unit.

- **Height is compressed, width is not.** Things that stick out sideways (shoulders, weapons held out, spider legs) read at full size; tall thin things read at about half.
- **Never lean long parts toward or away from the camera.** A blade raised and tilted forward points at the viewer, and its height and forward lean cancel on screen, leaving a stub. Because models turn, "forward" is toward the camera for some facing, so lean weapons and limbs **outward (sideways)** instead. Check every design at yaw 0 and 180 (and 135) in `forge:sheet` or the builder's walk test.
- Horizontal parts pointing forward (a zombie's reaching arms) are fine: they read as pointing down the screen.
