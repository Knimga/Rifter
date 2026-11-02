// A dungeon zone's scenery as the map draws it: the ground its terrain covers, its obstacles (placed by the game:
// ZoneData.obstacles) and its clutter (placed here, by the view: forge/terrain/clutter.ts). Shared by the game's map
// (DungeonMap) and the forge's Dungeons view, which also draws objects whose design is still a draft.
import type { ModelLink } from '../forge/core/types';
import { yawFromGridMove } from '../forge/core/facing';
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
}

/** The tiles a zone's terrain draws as open ground: its floor, and its obstacles' tiles (they stand on floor). */
export const zoneGround = (zone: ZoneData): ReadonlySet<string> =>
  zone.obstacles.length ? new Set([...zone.floors, ...zone.obstacles.flatMap((o) => o.tiles.map(posKey))]) : zone.floors;

/** The model a decorative object is drawn with ('' none): its own (the game), or a draft's (the forge's Dungeons view). */
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
