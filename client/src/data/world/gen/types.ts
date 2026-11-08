// The dungeon generator's data: what a generated dungeon is (its zones, doors, containers, rifts) and the configs it
// is generated from (data/world/dungeons.ts).
import type { EnemyClassData } from '../../units/enemies';
import type { Item } from '../../gear';
import type { ShardCounts } from '../../gear/shards';
import type { RGB } from '../../../forge/core/vec';
import type { TerrainStyle } from '../../../forge/terrain/types';
import type { Pos } from '../grid';
import type { DecorObjectData } from '../decorObjects';
import type { DungeonKey } from '../dungeons';
import type { Conversation } from '../dialogue';

// ─── Core Types ──────────────────────────────────────────────────────────────

export interface Room {
  id: number;
  x: number;   // top-left floor tile x
  y: number;   // top-left floor tile y
  w: number;   // floor width (inclusive tile count)
  h: number;   // floor height (inclusive tile count)
}

export interface Door {
  id: string;            // e.g. "door-0"
  pos: Pos;              // wall tile position in this zone
  /**
   * Where it leads: a door of another zone of the dungeon (that zone, and its paired door's id), or the Sanctum (a
   * passage's way out, arriving by the Sanctum's door: SANCTUM.doorArrival).
   */
  to: { zoneId: number; doorId: string } | 'sanctum';
}

export interface ZoneData {
  id: number;
  width: number;
  height: number;
  floors: Set<string>;   // "x,y" keys for all walkable tiles
  rooms: Room[];
  doors: Door[];
  /** Wall tiles standing in the middle of rooms (IslandConfig): never door spots. */
  islands: Set<string>;
  /** Obstacles standing in its rooms (ObstacleConfig): their tiles aren't floor (nobody walks there), never door spots. */
  obstacles: ZoneObstacle[];
  /**
   * The tiles sight passes over (line of sight, fog of war, aggro, targeting): its floor, and the tiles of obstacles
   * that don't block sight (a sarcophagus can be seen over). Its floor itself while it has none.
   */
  sight: ReadonlySet<string>;
  droppedItems: Record<string, Item[]>; // "x,y" → items dropped at that tile
  /** "x,y" → the rift key lying on that tile (a dungeon key: whose key it is), dropped by a boss. One per tile. */
  droppedKeys: Record<string, string>;
  /** "x,y" → the gold lying on that tile (data/gear/loot.ts), dropped by enemies: one pile a tile, adding up. */
  droppedGold: Record<string, number>;
  /** "x,y" → the affix shards lying on that tile (data/gear/shards.ts), dropped by enemies: one group a tile, adding up. */
  droppedShards: Record<string, ShardCounts>;
}

/**
 * An obstacle in a zone (a decorative object with placement 'obstacle': data/world/decorObjects.ts): its object, the
 * tiles it fills (`pos` their top-left, `size` [across x, across y]) and the grid direction it faces.
 */
export interface ZoneObstacle {
  id: string;
  object: string;
  pos: Pos;
  size: readonly [number, number];
  facing: readonly [number, number];
  tiles: Pos[];
}

/**
 * A container on the map (a chest, a dead adventurer: data/gear/containers.ts): its id (keys its contents), zone,
 * tile, look (INTERACTIVE_OBJECTS id) and the floor side it faces.
 */
export interface DungeonChest {
  id: string;
  zoneId: number;
  pos: Pos;
  object: string;
  /** Grid direction it faces (away from the wall at its back), e.g. [0, 1] = south. */
  facing: readonly [number, number];
}

/** A rift back to the Sanctum: one where the party arrives (the first zone), one past the boss (its antechamber). */
export interface DungeonRift {
  zoneId: number;
  pos: Pos;
}

export interface DungeonData {
  zones: ZoneData[];
  startZoneId: number;
  /** The boss zone (a passage has none). */
  endZoneId: number | null;
  /** The leader's tile on arrival, beside the first zone's rift (the followers take the tiles around it). */
  playerStart: Pos;
  /** The ways back to the Sanctum, at most one per zone (zoneRift). */
  rifts: DungeonRift[];
  /** Containers (chests and the like), where each zone's config places them (placeContainers). */
  chests: DungeonChest[];
  /** The party's level when it entered: the first zone's enemies are this level, each zone after one higher; loot is this level. */
  level: number;
  /** Whether its enemies drop anything when they die (items, gold, shards): a passage's may not (PassageConfig.loot). */
  loot: boolean;
}

// ─── Config Types ─────────────────────────────────────────────────────────────

/**
 * Islands: small clusters of wall tiles standing in the middle of rooms (pillars, boulders, giant fungus). Each is
 * a connected blob of `size` tiles; islands never touch each other or the room's walls (always at least one floor
 * tile between them, diagonals included), so they never block the way. Many single-tile islands, or a few big ones.
 */
export interface IslandConfig {
  /** Share of the zone's rooms that get islands (0..1); the rest have none. */
  roomChance: number;
  /** Tiles per island: [min, max]. */
  size: [number, number];
  /** Share of a room's floor to turn into islands (0..1), as far as they fit with their gaps. */
  density: number;
}

/**
 * Obstacles: decorative objects standing free in rooms (`objects`: DECOR_OBJECTS ids with placement 'obstacle'; one
 * without a design yet is never placed), blocking the way (and sight, if theirs does). Like islands they keep a gap
 * of at least one floor tile from the walls and each other and never cut a way off, and only in rooms, never in a
 * corridor or in a room that has islands.
 */
export interface ObstacleConfig {
  objects: string[];
  /** Share of the zone's rooms that get obstacles (0..1). */
  roomChance: number;
  /** Share of such a room's floor they fill (0..1), as far as they fit with their gaps; at least one. */
  density: number;
}

export interface ZoneConfig {
  minRoomSize: number;
  maxRoomSize: number;
  splitDepth: number;
  /** Width of the corridors ('rooms'), of the openings between rooms ('caverns'), or of the tunnels ('tunnels'). */
  corridorWidth: number;
  /**
   * How the rooms are shaped and joined. 'rooms' (default): rectangles joined by straight corridors. 'caverns':
   * round, organic rooms, each nearly filling its space, joined to their neighbours by short openings. 'tunnels':
   * round rooms of any size in the range (small ones leave rock around them) joined by long winding tunnels.
   */
  layout?: 'rooms' | 'caverns' | 'tunnels';
  /** Wall islands inside rooms (none if absent). */
  islands?: IslandConfig;
  /** Obstacles inside rooms (none if absent), never in a room with islands. */
  obstacles?: ObstacleConfig;
  /**
   * The zone's enemy groups: ROOM_FILL_SHARE of the zone's rooms (all but the one the party enters by), and at
   * least MIN_ZONE_GROUPS, get one group each, cycling through this list (reshuffled each time round) until those
   * rooms are filled. Never two groups in one room, and never two within GROUP_GAP steps of each other.
   */
  enemyGroups: EnemyClassData[][];
  /**
   * Containers in the zone (INTERACTIVE_OBJECTS ids, e.g. 'worn-treasure-chest', 'dead-adventurer'), one each; list
   * one twice for two. Each stands against a wall in a room the party doesn't enter the zone by, as far from its
   * entry as fits (placeContainers). None if absent.
   */
  containers?: string[];
}

export interface BossZoneConfig {
  roomSize: number;       // boss room is a square of this side length (a cavern: round, within that square)
  corridorWidth: number;  // corridor (or, for caverns, opening) connecting boss room to antechamber
  /** The boss room and its antechamber: rectangles joined by a corridor ('rooms', default), or caverns ('caverns'). */
  layout?: 'rooms' | 'caverns';
  /** The boss first, then its guard: the boss in the boss room's center, the rest flanking it (spawnDungeonEnemies). */
  bossGroup: EnemyClassData[];
  /** Containers in the boss room (as ZoneConfig.containers), against its walls, far from its door. */
  containers?: string[];
  /** Obstacles in the boss room (as ZoneConfig.obstacles). */
  obstacles?: ObstacleConfig;
}

/** One kind of clutter in a dungeon (DungeonConfig.clutter): which objects, and the share (0..1) of its spots that get one. */
export interface ClutterConfig {
  /** DECOR_OBJECTS ids with the matching placement ('wall' or 'ground'); one without a design yet is never drawn. */
  objects: string[];
  density: number;
}

/** What a dungeon's (or a passage's) map is drawn with (DungeonMap): its name, floor, walls, clutter and doors. */
export interface DungeonLook {
  name: string;
  /** How its floor and walls look (forge/terrain: the 3D floor and walls drawn over its tiles). */
  terrain: TerrainStyle;
  /**
   * Its clutter (decorative objects strewn by the view, forge/terrain/clutter.ts: never in the game's state): against
   * its full walls, and on its floor. None if absent.
   */
  clutter?: { wall?: ClutterConfig; ground?: ClutterConfig };
  doorObject: string;     // INTERACTIVE_OBJECTS id of its doors
}

/** A rift dungeon: entered by a rift from the Sanctum (its key in the Rifter), zone after zone to a boss. */
export interface DungeonConfig extends DungeonLook {
  width: number;          // applies to all regular zones
  height: number;         // applies to all regular zones
  zones: ZoneConfig[];    // regular zones, chained linearly: 0 → 1 → … → boss
  bossZone: BossZoneConfig;
  /**
   * The dungeon's color: the Sanctum's rift into it and its keystone are painted in it (data/world/rifts.ts; its
   * rifts back to the Sanctum are SANCTUM_RIFT_COLOR). Bright and saturated: the rift's deeper swirl and floor pool derive from it.
   */
  riftColor: RGB;
  /** Its rift key's name ("Necrotic Key"): the key that opens a rift to it (data/world/rifts.ts), painted in riftColor. */
  keyName: string;
}

// ─── Passages ────────────────────────────────────────────────────────────────

/**
 * A passage: a dungeon of one zone, a single long tunnel winding from one end of it to the other, with no rifts, keys
 * or boss. The party starts in a round room at its west end (how it gets there is the story's); along the way the
 * tunnel opens into larger rooms, each holding one enemy group; at its far end a door leads to the Sanctum (by the
 * Sanctum's door).
 */
export interface PassageConfig extends DungeonLook {
  width: number;
  height: number;
  /** How wide the tunnel runs, [narrowest, widest] (tiles): each stretch between two of its bends takes one. */
  tunnelWidth: [number, number];
  /** The round room the party starts in: its size (tiles across). */
  startRoomSize: number;
  /** The larger, round rooms along the way: how many, [fewest, most], and each one's size, [smallest, largest] (tiles across). */
  fightRooms: { count: [number, number]; size: [number, number] };
  /** The groups its fight rooms hold, one each, cycling through this list (as ZoneConfig.enemyGroups). */
  enemyGroups: EnemyClassData[][];
  /** Obstacles in its fight rooms (as ZoneConfig.obstacles). */
  obstacles?: ObstacleConfig;
  /** Whether its enemies drop anything (items, gold, shards); default true. */
  loot?: boolean;
  /**
   * A rift key lying in the tunnel on the way to the first fight room, in the middle of the path. When the party reaches
   * it, `conversation` is spoken (by `name`: the party doesn't know what it is yet), and once it is said the key is
   * taken: gone from the floor, but not on the keyring (unknown, it isn't a key to the party yet). Someone who knows it
   * gives it later (a dialogue's giveKey: Ardas's). `leaving`: what it says, the same way, if the party tries the door out
   * while it still lies there: the door doesn't open, and the party goes back for it.
   */
  foundKey?: { key: DungeonKey; name: string; conversation: Conversation; leaving: Conversation };
}

/**
 * Options for generating a dungeon: which decorative objects may be placed (default: those with a design,
 * hasDecorDesign); the forge's Maps view also places ones whose design is still a draft.
 */
export interface GenOptions {
  placeable: (o: DecorObjectData) => boolean;
}
