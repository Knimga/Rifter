// A generated dungeon's enemies: groups in its rooms, kept apart and away from the party's way in, the boss and its
// guard in the boss room; and the layout retried until its zones get enough of them.
import { bodySize, generateEnemyInstance, type EnemyClassData, type EnemyInstance } from '../../units/enemies';
import { fits, footprint, posKey, reachableTiles, type Body, type Pos } from '../grid';
import { randInt, shuffle } from '../../random';
import { AGGRO_RANGE } from '../../constants';
import { BASE_MOVEMENT } from '../../units/stats';
import { leadsBack, zoneWalkable } from './queries';
import { nearestRoom, walkDistances, type Rect } from './shared';
import { getEntryDirection } from './layout';
import type { DungeonConfig, DungeonData, Room, ZoneData } from './types';

// ─── Enemy Spawning ──────────────────────────────────────────────────────────

/**
 * How far (walking steps) enemies stay from where the party enters a zone: out of aggro sight
 * (AGGRO_RANGE), with a few steps to spare, so walking through a door never lands the party in a pack.
 */
const ENTRY_CLEAR_STEPS = AGGRO_RANGE + 3;

/** Share of a regular zone's rooms (not counting the one the party enters by) that get an enemy group. */
const ROOM_FILL_SHARE = 0.75;

/** Fewest enemy groups a regular zone gets (more rooms than ROOM_FILL_SHARE fill, if that leaves it short). */
const MIN_ZONE_GROUPS = 3;

/** Times a regular zone's groups are placed afresh while it has fewer than its plan's fewest (SpawnPlan.minGroups). */
const ZONE_PLACE_TRIES = 12;

/**
 * Fewest walking steps between members of two groups. Beyond twice AGGRO_RANGE, so no tile pulls both at once, with
 * room for the fight: a fight with one group, kept where it started, never pulls another the party hasn't seen.
 * Pulling a second group stays possible, by walking toward it.
 */
const GROUP_GAP = 2 * AGGRO_RANGE + 4;

/** How far apart a group's members stand: each one this many empty tiles, [fewest, most], from the nearest placed before it. */
const MEMBER_GAP: [number, number] = [0, 2];

/** Centers tried, per room, for a group that doesn't fit around the first. */
const GROUP_CENTER_TRIES = 8;

/** Fewest other places a large creature must fit within a move of where it is placed (spawnDungeonEnemies canRoamFrom). */
const LARGE_MIN_STOPS = 8;

/**
 * Which enemies a dungeon's zones get (spawnDungeonEnemies): each regular zone's groups, the boss zone's group, and how
 * many of a regular zone's rooms get one (`fillShare` of them, and at least `minGroups`).
 */
interface SpawnPlan {
  groups: (zoneId: number) => EnemyClassData[][];
  bossGroup: EnemyClassData[];
  fillShare: number;
  minGroups: number;
}

/** A rift dungeon's spawn plan: its zones' groups and its boss's, in ROOM_FILL_SHARE of the rooms, at least MIN_ZONE_GROUPS. */
export const dungeonSpawns = (config: DungeonConfig): SpawnPlan => ({
  groups: (zoneId) => config.zones[zoneId]?.enemyGroups ?? [],
  bossGroup: config.bossZone.bossGroup,
  fillShare: ROOM_FILL_SHARE,
  minGroups: MIN_ZONE_GROUPS,
});

function spawnDungeonEnemies(dungeon: DungeonData, plan: SpawnPlan): EnemyInstance[] {
  const instances: EnemyInstance[] = [];
  let globalIdx = 0;
  let nextGroupId = 0;

  const occupied = new Set([
    `${dungeon.startZoneId}:${posKey(dungeon.playerStart)}`,
    ...dungeon.rifts.map(r => `${r.zoneId}:${posKey(r.pos)}`),
    ...dungeon.chests.map(c => `${c.zoneId}:${posKey(c.pos)}`),
  ]);
  for (const zone of dungeon.zones) {
    for (const door of zone.doors) occupied.add(`${zone.id}:${posKey(door.pos)}`);
  }

  // Where the party enters each zone: the start tile in the first, else its door back (to the zone before).
  // No enemy stands within ENTRY_CLEAR_STEPS of it, and the room it opens into (the one nearest it by walking)
  // gets no group.
  const nearEntry = new Set<string>();
  const entryRooms = new Set<Room>();
  for (const zone of dungeon.zones) {
    const entries = zone.id === dungeon.startZoneId ? [dungeon.playerStart]
      : zone.doors.filter(d => leadsBack(d, zone)).map(d => d.pos);
    for (const entry of entries) {
      const steps = walkDistances(zone, entry);
      for (const [key, n] of steps) if (n <= ENTRY_CLEAR_STEPS) nearEntry.add(`${zone.id}:${key}`);
      const nearest = nearestRoom(zone, steps);
      if (nearest) entryRooms.add(nearest);
    }
  }

  // Tiles within GROUP_GAP walking steps of a group already placed: no other group's member stands on them
  const nearGroup = new Set<string>();

  /**
   * Free floor tiles inside `area`: no one on them, not near another group (GROUP_GAP), and away from the zone's
   * entry unless `nearEntryOk`.
   */
  const freeTiles = (zone: ZoneData, area: Rect, nearEntryOk: boolean): Pos[] => {
    const free: Pos[] = [];
    for (let x = area.x; x < area.x + area.w; x++) {
      for (let y = area.y; y < area.y + area.h; y++) {
        const key = `${zone.id}:${posKey({ x, y })}`;
        if (!zone.floors.has(posKey({ x, y })) || occupied.has(key) || nearGroup.has(key) || (!nearEntryOk && nearEntry.has(key))) continue;
        free.push({ x, y });
      }
    }
    return free;
  };

  /** Where placement stands (who is placed, and the tiles they take or keep clear), to go back to it: restore. */
  const snapshot = () => ({ occupied: new Set(occupied), nearGroup: new Set(nearGroup), instances: instances.slice(), nextGroupId, globalIdx });
  const restore = (s: ReturnType<typeof snapshot>) => {
    occupied.clear(); s.occupied.forEach(k => occupied.add(k));
    nearGroup.clear(); s.nearGroup.forEach(k => nearGroup.add(k));
    instances.splice(0, instances.length, ...s.instances);
    nextGroupId = s.nextGroupId;
    globalIdx = s.globalIdx;
  };

  /** Place one enemy group, member i on spots[i] (a large one's top-left tile); the tiles near it are kept clear of other groups. */
  const placeAt = (zone: ZoneData, group: EnemyClassData[], spots: Pos[]) => {
    const groupId = nextGroupId++;
    const onFloor = (p: Pos) => zone.floors.has(posKey(p));
    group.forEach((type, i) => {
      const pos = spots[i];
      for (const p of footprint({ pos, size: bodySize(type) })) {
        occupied.add(`${zone.id}:${posKey(p)}`);
        for (const key of reachableTiles(p, GROUP_GAP, onFloor).keys()) nearGroup.add(`${zone.id}:${key}`);
      }
      const level = dungeon.level + zone.id;
      instances.push(generateEnemyInstance(type, level, `${type.id}-${globalIdx++}`, pos, zone.id, groupId));
    });
  };

  /**
   * Whether a large body (`size`) with its top-left at `pos` isn't boxed in: it has LARGE_MIN_STOPS other places
   * it fits within a move (BASE_MOVEMENT tiles, squeezing between them), on the empty zone. Rules out rooms full
   * of 1-tile islands and pinched coves, where it could hardly move.
   */
  const canRoamFrom = (zone: ZoneData, pos: Pos, size: number): boolean => {
    const walkable = zoneWalkable(dungeon, zone);
    let stops = 0;
    for (const r of reachableTiles(pos, BASE_MOVEMENT, walkable, undefined, size).values()) {
      if (r.steps > 0 && fits(r.pos, size, walkable) && ++stops >= LARGE_MIN_STOPS) return true;
    }
    return false;
  };

  /**
   * Where a member of `type` can stand, of the `open` tiles (keys): a tile, or for a large one the top-left of a
   * square that is all open and from which it isn't boxed in (canRoamFrom).
   */
  const canStand = (zone: ZoneData, type: EnemyClassData, open: ReadonlyMap<string, Pos>) => (p: Pos) =>
    fits(p, bodySize(type), q => open.has(posKey(q))) && (bodySize(type) === 1 || canRoamFrom(zone, p, bodySize(type)));

  /**
   * Members of a group on the `open` tiles, its large ones first (they need a whole free square), each on the
   * first tile `order` gives it (knowing the bodies placed so far) that it can stand on (canStand). Null if one has
   * nowhere to go.
   */
  const spotsFor = (zone: ZoneData, group: EnemyClassData[], open: Map<string, Pos>, order: (i: number, placed: Body[]) => Pos[]): Pos[] | null => {
    const spots: Pos[] = [];
    const placed: Body[] = [];
    const byLargeFirst = group.map((_, i) => i).sort((a, b) => bodySize(group[b]) - bodySize(group[a]));
    for (const i of byLargeFirst) {
      const spot = order(i, placed).find(canStand(zone, group[i], open));
      if (!spot) return null;
      for (const p of footprint({ pos: spot, size: bodySize(group[i]) })) open.delete(posKey(p));
      spots[i] = spot;
      placed.push({ pos: spot, size: bodySize(group[i]) });
    }
    return spots;
  };

  /**
   * Place one enemy group inside `area`, standing together: the first member on a random free tile (freeTiles: away
   * from the zone's entry and from other groups), each next one a random MEMBER_GAP of empty tiles from the nearest
   * member already placed (as near that as fits, staying close to the first). Other first tiles are tried if it doesn't
   * fit there; false (nothing placed) if it fits around none.
   */
  const placeGroup = (zone: ZoneData, area: Rect, group: EnemyClassData[]): boolean => {
    const free = shuffle(freeTiles(zone, area, false));
    const cheb = (p: Pos, q: Pos) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
    for (const center of free.slice(0, GROUP_CENTER_TRIES)) {
      const order = (_i: number, placed: Body[]): Pos[] => {
        if (!placed.length) return [center, ...free.filter(p => p !== center).sort((a, b) => cheb(a, center) - cheb(b, center))];
        // Steps to the nearest placed member's nearest tile: 1 is right beside it (no gap)
        const want = randInt(...MEMBER_GAP) + 1;
        const toPlaced = (p: Pos) => Math.min(...placed.flatMap(b => footprint(b).map(q => cheb(p, q))));
        return free.map(p => ({ p, d: Math.abs(toPlaced(p) - want) + cheb(p, center) * 0.05 + Math.random() * 0.01 }))
          .sort((a, b) => a.d - b.d).map(t => t.p);
      };
      const spots = spotsFor(zone, group, new Map(free.map(p => [posKey(p), p])), order);
      if (!spots) continue;
      placeAt(zone, group, spots);
      return true;
    }
    return false;
  };

  /**
   * Place a boss group: the boss (its first member) on a random free tile inside `area`, the rest flanking it in
   * `room`: beside it on the line across the party's way in (`across`), one each side, then a step further out
   * (past the whole of a large boss). A flank tile that isn't free (a wall, a cavern's edge) gives way to the free
   * tile nearest it. False (nothing placed) if the group doesn't fit.
   */
  const placeBossGroup = (zone: ZoneData, area: Rect, room: Rect, group: EnemyClassData[], across: 'x' | 'y', nearEntryOk = false): boolean => {
    const open = new Map(freeTiles(zone, room, nearEntryOk).map(p => [posKey(p), p]));
    const boss = shuffle(freeTiles(zone, area, nearEntryOk)).find(canStand(zone, group[0], open));
    if (!boss) return false;
    for (const p of footprint({ pos: boss, size: bodySize(group[0]) })) open.delete(posKey(p));
    const bossSize = bodySize(group[0]);
    // Nearest the flank tile first; on a tie, nearest the boss
    const d2 = (p: Pos, q: Pos) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    const flank = (i: number): Pos[] => {
      const out = (i % 2 ? 1 : -1) * Math.ceil(i / 2);
      const step = out > 0 ? out + bossSize - 1 : out;
      const want = across === 'x' ? { x: boss.x + step, y: boss.y } : { x: boss.x, y: boss.y + step };
      return [...open.values()].sort((p, q) => d2(p, want) - d2(q, want) || d2(p, boss) - d2(q, boss));
    };
    const rest = spotsFor(zone, group.slice(1), open, i => flank(i + 1));
    if (!rest) return false;
    placeAt(zone, group, [boss, ...rest]);
    return true;
  };

  for (const zone of dungeon.zones) {
    if (zone.id === dungeon.endZoneId) {
      // Boss group in the center half of the boss room, its guard flanking the boss across the party's way in.
      // The boss is always placed: if the center is too near the door (a round room's door can sit on its
      // diagonal), anywhere in the room away from the door, and failing that the center after all
      const group = plan.bossGroup;
      if (group.length === 0) continue;
      const bossRoom = zone.rooms[0];
      const center: Rect = {
        x: bossRoom.x + Math.floor(bossRoom.w / 4),
        y: bossRoom.y + Math.floor(bossRoom.h / 4),
        w: Math.ceil(bossRoom.w / 2),
        h: Math.ceil(bossRoom.h / 2),
      };
      const entryDoor = zone.doors.find(d => leadsBack(d, zone));
      const entryDir = entryDoor ? getEntryDirection(entryDoor.pos, bossRoom) : 'south';
      const across = entryDir === 'north' || entryDir === 'south' ? 'x' : 'y';
      if (!placeBossGroup(zone, center, bossRoom, group, across) && !placeBossGroup(zone, bossRoom, bossRoom, group, across)) {
        placeBossGroup(zone, center, bossRoom, group, across, true);
      }
      continue;
    }

    // Regular zone: `fillShare` of its rooms (not the one the party enters by), and at least `minGroups`,
    // random ones, get one group each, cycling through the zone's groups (reshuffled each time round). A room takes
    // the next group in the cycle that fits it (away from the entry and other groups); a room none fits is skipped
    // for another. Never two in one room. Where the groups land decides how many fit (a group in the middle of a room
    // can keep its neighbours' groups out: GROUP_GAP), so a zone left with fewer than `minGroups` is placed
    // again, up to ZONE_PLACE_TRIES times, keeping the try that placed the most.
    const groups = plan.groups(zone.id);
    if (groups.length === 0) continue;
    const candidates = zone.rooms.filter(r => !entryRooms.has(r));
    const target = Math.max(plan.minGroups, Math.round(candidates.length * plan.fillShare));
    const fill = (): number => {
      let cycle: EnemyClassData[][] = [];
      let filled = 0;
      for (const room of shuffle(candidates)) {
        if (filled === target) break;
        if (cycle.length === 0) cycle = shuffle(groups);
        const i = cycle.findIndex(g => placeGroup(zone, room, g));
        if (i < 0) continue;
        cycle.splice(i, 1);
        filled++;
      }
      return filled;
    };
    const before = snapshot();
    let best = { filled: -1, state: before };
    for (let t = 0; t < ZONE_PLACE_TRIES && best.filled < plan.minGroups; t++) {
      restore(before);
      const filled = fill();
      if (filled > best.filled) best = { filled, state: snapshot() };
    }
    restore(best.state);
  }

  return instances;
}

/** Layouts tried for a dungeon whose zones don't all get their fewest groups (bestLayout). */
const LAYOUT_TRIES = 10;

/**
 * A layout (`make`: a fresh one each call, and its spawn plan) and its enemies (spawnDungeonEnemies). A layout where a
 * regular zone gets fewer than its plan's fewest groups (rooms too close for that many groups GROUP_GAP apart) is
 * built again, up to LAYOUT_TRIES times, keeping the one with the most groups in its emptiest zone.
 */
export function bestLayout(make: () => { dungeon: DungeonData; plan: SpawnPlan }): { dungeon: DungeonData; enemies: EnemyInstance[] } {
  let best: { dungeon: DungeonData; enemies: EnemyInstance[]; fewest: number; enough: boolean } | null = null;
  for (let t = 0; t < LAYOUT_TRIES && !best?.enough; t++) {
    const { dungeon, plan } = make();
    const enemies = spawnDungeonEnemies(dungeon, plan);
    const fewest = Math.min(...dungeon.zones.filter(z => z.id !== dungeon.endZoneId)
      .map(z => new Set(enemies.filter(e => e.zoneId === z.id).map(e => e.groupId)).size));
    if (!best || fewest > best.fewest) best = { dungeon, enemies, fewest, enough: fewest >= plan.minGroups };
  }
  return { dungeon: best!.dungeon, enemies: best!.enemies };
}
