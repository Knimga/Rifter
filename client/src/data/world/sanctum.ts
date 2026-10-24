import { samePos, type Pos } from './grid';
import type { DungeonKey } from './dungeonPresets';

// ─── The Sanctum: fixed, hand-authored hub map (never procedurally generated) ──

/** A portal in the Sanctum: where it stands, its look (GAME_OBJECTS id), the dungeon it leads to, and the open side it faces. */
export interface SanctumPortal {
  pos: Pos;
  object: string;
  dungeon: DungeonKey;
  /** Grid direction the portal faces (toward the room), e.g. [0, 1] = south. */
  facing: readonly [number, number];
}

export const SANCTUM = {
  width: 11,
  height: 11,
  // One portal per dungeon, each near its own wall, facing into the room
  portals: [
    { pos: { x: 5, y: 2 }, object: 'necrotic-portal', dungeon: 'crypt', facing: [0, 1] },
    { pos: { x: 2, y: 5 }, object: 'fire-portal', dungeon: 'firelands', facing: [1, 0] },
    { pos: { x: 8, y: 5 }, object: 'fungal-portal', dungeon: 'fungal', facing: [-1, 0] },
  ] satisfies SanctumPortal[] as SanctumPortal[],
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

/** The portal standing on `p`, if any. */
export const sanctumPortalAt = (p: Pos): SanctumPortal | undefined => SANCTUM.portals.find((portal) => samePos(portal.pos, p));

/** Walls block the way, and so do the portals (each occupies its tile: nobody walks onto or through it). */
export const isSanctumWalkable = (p: Pos) => !isSanctumWall(p) && !sanctumPortalAt(p);
