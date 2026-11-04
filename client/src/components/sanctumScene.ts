// What the Sanctum shows (as zoneScenery.ts does for a dungeon's zone): its 3D floor and walls, its fog, and its map
// objects (the Rifter, its doors, the decorative objects, the NPCs). SanctumMap draws them in the game; the forge's Maps view
// draws the same.
import { SANCTUM, SANCTUM_FLOORS, SANCTUM_SHOWN, SANCTUM_TERRAIN } from '../data/world/sanctum';
import { npc } from '../data/world/npcs';
import { decorObjectModel } from '../data/world/decorObjects';
import { interactiveObjectModel } from '../data/world/interactiveObjects';
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';
import { posKey } from '../data/world/grid';
import { yawFromGridMove } from '../forge/core/facing';
import { buildTerrain } from '../forge/terrain/build';
import { RIFTER_TINT_PARTS } from '../forge/designs/_rifter';
import type { MapObject, UnitAim } from './ModelLayer';
import type { FogInput } from '../viewEngine/three/fog';
import { doorAt } from './zoneScenery';

/**
 * The Sanctum's fog: everything in it always in sight (its floor and the walls around it), so it only darkens the
 * wall mass beyond, as the dungeons' fog does at their edges. Not fog of war: nothing is hidden or explored, and it
 * never changes (`still`: its clouds don't drift as the party moves, so it costs nothing per frame). A constant:
 * the renderer takes it once.
 */
export const SANCTUM_FOG: FogInput = { cols: SANCTUM.width, rows: SANCTUM.height, visible: SANCTUM_SHOWN, explored: SANCTUM_SHOWN, still: true };

/** The Sanctum's 3D floor and walls (forge/terrain), its walls opened at its doors: it never changes, so it is built once. */
export const SANCTUM_3D = buildTerrain({ cols: SANCTUM.width, rows: SANCTUM.height, floors: SANCTUM_FLOORS, doors: SANCTUM.doors, style: SANCTUM_TERRAIN, seed: 0 });

/** The Sanctum's doors (SANCTUM.doors), each a heavy door facing the floor it opens onto. Nothing uses them yet. */
export const SANCTUM_DOORS: MapObject[] = SANCTUM.doors.map((pos, i) => doorAt(`door-${i}`, 'warded-stone-door', pos, (p) => SANCTUM_FLOORS.has(posKey(p))));

/**
 * What the Rifter is doing: the key set in it (shown in its socket), the key whose rift it shows (null: dormant, no
 * rift), and where its rift is: opening (`activate`, waking it, or `reopen`, after a swap) or, swapping keys,
 * closing (`close`: the old key's rift collapsing while the new key is already in the socket).
 */
export interface RifterState {
  key: DungeonKey | null;
  rift: DungeonKey | null;
  phase: 'activate' | 'close' | 'reopen';
}

/** A dormant Rifter: no key set, no rift. */
export const DORMANT_RIFTER: RifterState = { key: null, rift: null, phase: 'activate' };

/** The animations each phase lists: activation stays listed (its lights stay awake) while the rift closes and reopens. */
const PHASE_PLAYED: Record<RifterState['phase'], string[]> = {
  activate: ['activate'], close: ['activate', 'close'], reopen: ['activate', 'reopen'],
};

/**
 * The Sanctum's interactive objects: the Rifter, drawn on its middle tile (its model spans all three). Dormant, or, a rift
 * open, the active model: its keystone in the set key's color, its rift in the rift's key's color (the two differ
 * while a swap's old rift closes), playing its phase's animations (activation plays as it swaps in).
 */
export const rifterObjects = ({ key, rift, phase }: RifterState): MapObject[] => [{
  id: 'rifter', pos: SANCTUM.rifter.pos, facing: yawFromGridMove(...SANCTUM.rifter.facing),
  ...(rift && key
    ? {
        link: interactiveObjectModel('rifter-active'), played: PHASE_PLAYED[phase],
        partTints: [
          { color: DUNGEONS[key].riftColor, parts: RIFTER_TINT_PARTS.keystone },
          { color: DUNGEONS[rift].riftColor, parts: RIFTER_TINT_PARTS.rift },
        ],
      }
    : { link: interactiveObjectModel('rifter') }),
}];

/** The Sanctum's decorative objects: fixed, each on its middle tile facing its own way (its model spans its tiles). */
export const SANCTUM_DECOR: MapObject[] = SANCTUM.decor.map((d, i) => ({
  id: `decor-${i}-${d.id}`, link: decorObjectModel(d.id), pos: d.pos, facing: yawFromGridMove(...d.facing),
  ...(d.seed !== undefined && { seed: d.seed }),
}));

/**
 * The Sanctum's NPCs as fixed map objects, each facing its own way; one with an aim (npcAims) turns to it: to the
 * leader talking to it, then back to the tile in front of it.
 */
export const npcObjects = (npcAims: Record<string, UnitAim> = {}): MapObject[] => SANCTUM.npcs.map((n) => ({
  id: n.id, link: npc(n.id).model, pos: n.pos, facing: yawFromGridMove(...n.facing),
  ...(npc(n.id).holds ? { held: npc(n.id).holds } : {}),
  ...(npcAims[n.id] ? { aim: npcAims[n.id] } : {}),
}));
