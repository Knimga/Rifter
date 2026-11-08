// Building a dungeon from its config: a rift dungeon (zones chained to a boss) or a passage (one winding tunnel),
// its layout put together from the generator's steps, then its enemies (spawning).
import { findOpenTilesNear, keyPos, neighbors, posKey, type Pos } from '../grid';
import { chance, pick, randInt } from '../../random';
import { hasDecorDesign } from '../decorObjects';
import type { EnemyInstance } from '../../units/enemies';
import { farFloor, inRect, nearestRoom, newZone, randomFloor, roomCenter, roomSpot, walkDistances } from './shared';
import { addBossAntechamber, carveCavern, carveTunnel, generateBossZoneMain, generateZone, getEntryDirection } from './layout';
import { placeObstacles, sightOf } from './features';
import { doorDistance, farDoorSpot, findDoorCandidates, linkDoors } from './doors';
import { placeContainers } from './containers';
import { bestLayout, dungeonSpawns } from './spawning';
import { leadsBack } from './queries';
import type { DungeonConfig, DungeonData, GenOptions, PassageConfig, Room, ZoneData } from './types';

// ─── Main Generator ─────────────────────────────────────────────────────────

/** A fresh dungeon from its config, its enemies' and loot's level set by the party's (`partyLevel`). */
function generateDungeon(config: DungeonConfig, partyLevel: number, gen: GenOptions): DungeonData {
  const numRegularZones = config.zones.length;
  const bossZoneId = numRegularZones;

  const zones: ZoneData[] = config.zones.map((zoneConfig, i) => generateZone(i, config.width, config.height, zoneConfig, gen));

  // Generate boss zone (main room only — antechamber added after door placement)
  const { zone: bossZone, bossRoom } = generateBossZoneMain(bossZoneId, config.bossZone, gen);
  zones.push(bossZone);

  // The party arrives in the first zone at one end of it, around a rift back to the Sanctum: the rift stands at
  // the center of the room around the zone's far end from a random point (roughly one end of its longest walk)
  const startEnd = farFloor(zones[0], randomFloor(zones[0]));
  const startRoom = zones[0].rooms.find(r => inRect(startEnd, r)) ?? zones[0].rooms[0];
  const startRift = roomSpot(zones[0], startRoom, true);
  const playerStart = findOpenTilesNear(startRift, p => zones[0].floors.has(posKey(p)), 1, 3)[0] ?? startRift;

  // Linear chain 0 → 1 → … → boss, no branches: the first zone has one door (forward), every later zone a
  // door back and a door forward. A zone's forward door is as far as possible (by walking) from where the
  // party enters it (the rift in, or its door back), so moving on means crossing the zone.
  const nextDoorId = { value: 0 };
  let entry = playerStart;
  for (let i = 0; i < zones.length - 1; i++) {
    const zone = zones[i], next = zones[i + 1];
    const back = zone.doors.map(d => d.pos);
    const forward = farDoorSpot(zone, entry, back);
    // The next zone's door back: at one end of it, so its own forward door can go to the other end.
    // (The boss zone is one room: anywhere along its wall.)
    const nextBack = next.id === bossZoneId ? pick(findDoorCandidates(next)) : farDoorSpot(next, randomFloor(next));
    if (!forward || !nextBack) break;
    linkDoors(zone, forward, next, nextBack, nextDoorId);
    entry = nextBack;
  }

  // Determine entry direction from the boss zone's entry door, then add antechamber
  const entryDoor = bossZone.doors[0];
  const entryDir = entryDoor ? getEntryDirection(entryDoor.pos, bossRoom) : 'south';
  const riftPos = addBossAntechamber(bossZone, bossRoom, entryDir, config.bossZone.corridorWidth, config.bossZone.layout);
  // (no rift at the start when the boss zone is the only one: its antechamber's serves)
  const rifts = [...(bossZoneId > 0 ? [{ zoneId: 0, pos: startRift }] : []), { zoneId: bossZoneId, pos: riftPos }];

  // Each zone's containers: the boss zone's in the boss room, far from its door; a regular zone's in its rooms
  // but the one it is entered by, far from its entry (placeContainers)
  const chests = zones.flatMap((zone) => {
    const boss = zone.id === bossZoneId;
    const objects = boss ? config.bossZone.containers : config.zones[zone.id]?.containers;
    const entry = zone.id === 0 ? playerStart : zone.doors.find(d => leadsBack(d, zone))?.pos;
    if (!objects?.length || !entry) return [];
    const entryRoom = nearestRoom(zone, walkDistances(zone, entry));
    const others = zone.rooms.filter(r => r !== entryRoom);
    const rooms = boss ? [bossRoom] : others.length ? others : zone.rooms;
    return placeContainers(zone, objects, rooms, entry, rifts.filter(r => r.zoneId === zone.id).map(r => r.pos), zone.id === 0 ? [playerStart] : []);
  });

  // Every zone's floor is final: what sight passes over (its see-through obstacles' tiles added)
  for (const zone of zones) zone.sight = sightOf(zone);

  return { zones, startZoneId: 0, endZoneId: bossZoneId, playerStart, rifts, chests, level: partyLevel, loot: true };
}

/**
 * The passage's bends: how far east each lies from the last, [nearest, farthest] (tiles), and how far up or down it
 * swings, [least, most]. It mostly swings back the other way each time, so the tunnel snakes. Bends keep this far
 * from the zone's edge.
 */
const BEND_STEP: [number, number] = [7, 11], BEND_SWING: [number, number] = [4, 10], BEND_MARGIN = 3;

/**
 * A passage's layout (PassageConfig): the start room at the west end, the tunnel winding east from it through its
 * bends (carveTunnel, each stretch its own width), the fight rooms carved around bends spread evenly along the way,
 * the found key (if any) between the start and the first fight room, and the door out at the tunnel's far end: the
 * door spot farthest from the start by walking.
 */
function generatePassage(config: PassageConfig, partyLevel: number, gen: GenOptions): DungeonData {
  const { width: W, height: H } = config;
  const floors = new Set<string>();
  const S = config.startRoomSize;
  const startRoom: Room = { id: 0, x: 2, y: randInt(BEND_MARGIN, H - BEND_MARGIN - S), w: S, h: S };
  const bends: Pos[] = [roomCenter(startRoom)];
  let up = chance(0.5);
  for (let last = bends[0]; last.x < W - 1 - BEND_MARGIN;) {
    if (chance(0.75)) up = !up;
    const swing = randInt(...BEND_SWING) * (up ? -1 : 1);
    const inside = (y: number) => y >= BEND_MARGIN && y <= H - 1 - BEND_MARGIN;
    const y = inside(last.y + swing) ? last.y + swing : last.y - swing;
    last = { x: Math.min(W - 1 - BEND_MARGIN, last.x + randInt(...BEND_STEP)), y: Math.max(BEND_MARGIN, Math.min(H - 1 - BEND_MARGIN, y)) };
    bends.push(last);
  }

  // The fight rooms: around bends spread evenly between the start and the far end (never the first or last bend)
  const n = randInt(...config.fightRooms.count);
  const fightRooms = Array.from({ length: n }, (_, i): Room => {
    const at = bends[Math.max(1, Math.min(bends.length - 2, Math.round(((i + 1) * (bends.length - 1)) / (n + 1))))];
    const w = randInt(...config.fightRooms.size), h = Math.max(config.fightRooms.size[0], w - randInt(0, 2));
    const x = Math.max(1, Math.min(W - 1 - w, at.x - Math.floor(w / 2))), y = Math.max(1, Math.min(H - 1 - h, at.y - Math.floor(h / 2)));
    return { id: i + 1, x, y, w, h };
  });
  [startRoom, ...fightRooms].forEach(r => carveCavern(floors, r));
  for (let i = 1; i < bends.length; i++) carveTunnel(floors, bends[i - 1], bends[i], randInt(...config.tunnelWidth), W, H);

  const zone = newZone(0, W, H, floors, [startRoom, ...fightRooms]);
  if (config.obstacles) placeObstacles(zone, config.obstacles, fightRooms, new Set(), gen);
  const playerStart = roomSpot(zone, startRoom, true);
  const steps = walkDistances(zone, playerStart);

  // The found key: on a shortest walk from the start to the first fight room, as far from one as from the other,
  // outside every room, on the tile most surrounded by floor (the path's middle, not against its wall)
  if (config.foundKey && fightRooms.length) {
    const room = roomSpot(zone, fightRooms[0]), toRoom = walkDistances(zone, room), total = steps.get(posKey(room)) ?? Infinity;
    const onPath = [...zone.floors].map(keyPos).filter(p => !zone.rooms.some(r => inRect(p, r))
      && (steps.get(posKey(p)) ?? Infinity) + (toRoom.get(posKey(p)) ?? Infinity) === total);
    const score = (p: Pos) => Math.abs(steps.get(posKey(p))! - toRoom.get(posKey(p))!) * 10 - neighbors(p).filter(q => floors.has(posKey(q))).length;
    const spot = onPath.reduce<Pos | null>((best, p) => (!best || score(p) < score(best) ? p : best), null);
    if (spot) zone.droppedKeys[posKey(spot)] = config.foundKey.key;
  }

  // The way out: the door spot anywhere along the tunnel's walls that is farthest from the start by walking
  const spots = findDoorCandidates({ ...zone, rooms: [{ id: -1, x: 0, y: 0, w: W, h: H }] });
  const exit = spots.reduce<Pos | null>((best, c) => (!best || doorDistance(c, steps) > doorDistance(best, steps) ? c : best), null);
  if (exit) zone.doors.push({ id: 'door-0', pos: exit, to: 'sanctum' });
  zone.sight = sightOf(zone);

  return { zones: [zone], startZoneId: 0, endZoneId: null, playerStart, rifts: [], chests: [], level: partyLevel, loot: config.loot ?? true };
}

/** A new rift dungeon and its enemies: its layout (generateDungeon) and its groups (bestLayout). */
export function buildDungeon(config: DungeonConfig, partyLevel: number, gen: GenOptions = { placeable: hasDecorDesign }): { dungeon: DungeonData; enemies: EnemyInstance[] } {
  return bestLayout(() => ({ dungeon: generateDungeon(config, partyLevel, gen), plan: dungeonSpawns(config) }));
}

/**
 * A new passage and its enemies: its layout (generatePassage) and one group in each of its fight rooms (all its rooms
 * but the start room, the one the party enters by), retried until each has one (bestLayout).
 */
export function buildPassage(config: PassageConfig, partyLevel: number, gen: GenOptions = { placeable: hasDecorDesign }): { dungeon: DungeonData; enemies: EnemyInstance[] } {
  return bestLayout(() => {
    const dungeon = generatePassage(config, partyLevel, gen);
    const fights = dungeon.zones[0].rooms.length - 1;
    return { dungeon, plan: { groups: () => config.enemyGroups, bossGroup: [], fillShare: 1, minGroups: fights } };
  });
}
