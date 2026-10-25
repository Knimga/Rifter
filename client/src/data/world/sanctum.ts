import { samePos, type Pos } from './grid';
import type { DungeonKey } from './dungeons';

// ─── The Sanctum: fixed, hand-authored hub map (never procedurally generated) ──

/** A rift in the Sanctum: where it stands, its look (GAME_OBJECTS id), the dungeon it leads to, and the open side it faces. */
export interface SanctumRift {
  pos: Pos;
  object: string;
  dungeon: DungeonKey;
  /** Grid direction the rift faces (toward the room), e.g. [0, 1] = south. */
  facing: readonly [number, number];
}

export const SANCTUM = {
  width: 11,
  height: 11,
  // One rift per dungeon, each near its own wall, facing into the room
  rifts: [
    { pos: { x: 5, y: 2 }, object: 'necrotic-rift', dungeon: 'crypt', facing: [0, 1] },
    { pos: { x: 2, y: 5 }, object: 'fire-rift', dungeon: 'firelands', facing: [1, 0] },
    { pos: { x: 8, y: 5 }, object: 'fungal-rift', dungeon: 'fungal', facing: [-1, 0] },
  ] satisfies SanctumRift[] as SanctumRift[],
  playerStart: { x: 5, y: 5 },
  followerStarts: [{ x: 6, y: 5 }, { x: 7, y: 5 }],
} as const;

/** The outer ring of the sanctum is wall. */
export const isSanctumWall = (p: Pos) =>
  p.x <= 0 || p.y <= 0 || p.x >= SANCTUM.width - 1 || p.y >= SANCTUM.height - 1;

/** Keys of the sanctum's floor tiles (everything inside the wall ring): for sight and ability areas there. */
export const SANCTUM_FLOORS: ReadonlySet<string> = new Set(
  Array.from({ length: SANCTUM.width * SANCTUM.height }, (_, i) => ({ x: i % SANCTUM.width, y: Math.floor(i / SANCTUM.width) }))
    .filter((p) => !isSanctumWall(p))
    .map((p) => `${p.x},${p.y}`),
);

/** The rift standing on `p`, if any. */
export const sanctumRiftAt = (p: Pos): SanctumRift | undefined => SANCTUM.rifts.find((rift) => samePos(rift.pos, p));

/** Walls block the way, and so do the rifts (each occupies its tile: nobody walks onto or through it). */
export const isSanctumWalkable = (p: Pos) => !isSanctumWall(p) && !sanctumRiftAt(p);
