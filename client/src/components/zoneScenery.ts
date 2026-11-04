// A dungeon zone's scenery as the map draws it: the ground its terrain covers, its doors and rift, its obstacles (placed
// by the game: ZoneData.obstacles) and its clutter (placed here, by the view: forge/terrain/clutter.ts). Shared by the
// game's map (DungeonMap), the forge's Maps view (which also draws objects whose design is still a draft) and forge:sheet.
import type { ModelLink } from '../forge/core/types';
import type { RGB } from '../forge/core/vec';
import { facingOpenSide, yawFromGridMove } from '../forge/core/facing';
import { interactiveObjectModel } from '../data/world/interactiveObjects';
import { ARRIVAL_PORTAL_COLOR, RIFT_MODELS, SANCTUM_RIFT_COLOR } from '../data/world/rifts';
import { placeClutter, type ClutterKind } from '../forge/terrain/clutter';
import { decorObject, type DecorObjectData } from '../data/world/decorObjects';
import type { ClutterConfig, DungeonConfig, ZoneData } from '../data/world/dungeonGen';
import { posKey, type Pos } from '../data/world/grid';

/**
 * A piece of scenery as a map object (ModelLayer's MapObject, which it fits; its own type, so the Node scripts that
 * draw scenery (forge:sheet) don't reach into React components).
 */
export interface SceneryObject {
  id: string;
  link: ModelLink;
  pos: Pos;
  facing: number;
  size?: readonly [number, number];
  look?: string;
  tint?: RGB;
  played?: string[];
  playIn?: boolean;
}

/** Whether a zone's tile is floor (a door or the rift faces the floor it opens onto). */
const floorOf = (zone: ZoneData) => (p: Pos) => zone.floors.has(posKey(p));

/** A door (`doorObject`: its interactive object, e.g. 'heavy-door') in its wall tile at `pos`, facing the floor it opens onto. */
export const doorAt = (id: string, doorObject: string, pos: Pos, isFloor: (p: Pos) => boolean): SceneryObject =>
  ({ id, link: interactiveObjectModel(doorObject), pos, facing: facingOpenSide(pos, isFloor) });

/** A zone's doors: its dungeon's door model (`doorObject`), each in its wall tile (doorAt). */
export const doorObjects = (zone: ZoneData, doorObject: string): SceneryObject[] =>
  zone.doors.map((d) => doorAt(d.id, doorObject, d.pos, floorOf(zone)));

/** A zone's rift back to the Sanctum, at `pos`: the Rift in SANCTUM_RIFT_COLOR, facing the floor it opens onto. */
export const riftObject = (zone: ZoneData, pos: Pos, id: string): SceneryObject =>
  ({ id, link: RIFT_MODELS.rift.model, pos, facing: facingOpenSide(pos, floorOf(zone)), tint: SANCTUM_RIFT_COLOR });

/**
 * A portal the party arrives through at the game's opening (GameScreen's arrival): a rift in ARRIVAL_PORTAL_COLOR on a
 * member's tile, turned to the camera, opening as it appears and (`closing`) collapsing again.
 */
export const arrivalPortal = (id: string, pos: Pos, closing: boolean): SceneryObject =>
  ({ id, link: RIFT_MODELS.rift.model, pos, facing: yawFromGridMove(-1, 1), tint: ARRIVAL_PORTAL_COLOR, played: closing ? ['open', 'close'] : ['open'], playIn: true });

/** The tiles a zone's terrain draws as open ground: its floor, and its obstacles' tiles (they stand on floor). */
export const zoneGround = (zone: ZoneData): ReadonlySet<string> =>
  zone.obstacles.length ? new Set([...zone.floors, ...zone.obstacles.flatMap((o) => o.tiles.map(posKey))]) : zone.floors;

/** The model a decorative object is drawn with ('' none): its own (the game), or a draft's (the forge's Maps view). */
export type DecorLink = (o: DecorObjectData) => ModelLink;
export const gameDecorLink: DecorLink = (o) => o.model;

/**
 * A zone's obstacles and clutter as map objects. `standing`: the tiles of the map objects standing in it (its rift,
 * its containers): no clutter goes on them, nor on or against its doors. Objects with no model (`link`) aren't drawn.
 */
export function sceneryObjects(zone: ZoneData, clutter: DungeonConfig['clutter'], standing: readonly Pos[], link: DecorLink = gameDecorLink): SceneryObject[] {
  const blocked = new Set([...zone.doors.map((d) => posKey(d.pos)), ...standing.map(posKey)]);
  const obstacles: SceneryObject[] = zone.obstacles.map((o) => ({
    id: o.id, link: link(decorObject(o.object)), pos: o.pos, size: o.size, facing: yawFromGridMove(...o.facing),
  }));
  const kind = (c: ClutterConfig | undefined): ClutterKind | undefined =>
    c && { links: c.objects.map((id) => link(decorObject(id))).filter(Boolean), density: c.density };
  const strewn: SceneryObject[] = placeClutter({
    cols: zone.width, rows: zone.height, floors: zone.floors, ground: zoneGround(zone), blocked,
    onWalls: kind(clutter?.wall), onFloor: kind(clutter?.ground), seed: zone.id,
  });
  return [...obstacles, ...strewn].filter((o) => o.link);
}
