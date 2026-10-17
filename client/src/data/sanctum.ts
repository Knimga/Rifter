import { samePos, type Pos } from './dungeonHelpers';

// ─── The Sanctum: fixed, hand-authored hub map (never procedurally generated) ──

export const SANCTUM = {
  width: 11,
  height: 11,
  portalPos: { x: 5, y: 2 },
  playerStart: { x: 5, y: 5 },
  followerStarts: [{ x: 6, y: 5 }, { x: 7, y: 5 }],
} as const;

/** The outer ring of the sanctum is wall. */
export const isSanctumWall = (p: Pos) =>
  p.x <= 0 || p.y <= 0 || p.x >= SANCTUM.width - 1 || p.y >= SANCTUM.height - 1;

export const isSanctumWalkable = (p: Pos) => !isSanctumWall(p);

export const isSanctumPortal = (p: Pos) => samePos(p, SANCTUM.portalPos);
