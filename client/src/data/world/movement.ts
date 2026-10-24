// Party movement: where the active member may move, and how followers trail the leader out of combat (by the
// shared step rules, world/grid.ts).
import { findOpenTilesNear, isAdjacent, pathTo, reachableTiles, samePos, type Pos } from './grid';

/**
 * Where a party member may move this turn: tile key -> steps it costs. Unwalkable tiles (walls, and
 * tiles a game object stands on, like the portal: see isWalkable) and enemies block the way; the mover
 * may pass other party members but can't stop on anyone.
 */
export function partyMoveTargets(
  from: Pos,
  movement: number,
  isWalkable: (p: Pos) => boolean,
  isEnemy: (p: Pos) => boolean,
  isOccupied: (p: Pos) => boolean,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, r] of reachableTiles(from, movement, isWalkable, isEnemy)) {
    if (r.steps > 0 && !isOccupied(r.pos)) out.set(key, r.steps);
  }
  return out;
}

/** Up to `count` open tiles near `center` (closest first); pads with `center` if too few. */
export function findFollowerSpawns(center: Pos, isOpen: (p: Pos) => boolean, count: number): Pos[] {
  const found = findOpenTilesNear(center, isOpen, count, 5);
  while (found.length < count) found.push({ ...center });
  return found;
}

/**
 * The walk a party member takes from `from` to `to` (both included) by the move rules (partyMoveTargets:
 * enemies block the way, party members don't). Just [`to`] if there is no such walk.
 */
export function partyWalk(from: Pos, to: Pos, movement: number, isWalkable: (p: Pos) => boolean, isEnemy: (p: Pos) => boolean): Pos[] {
  const path = pathTo(reachableTiles(from, movement, isWalkable, isEnemy), to);
  return path.length ? path : [to];
}

/**
 * Where the followers stand after the leader walks `path` (its old tile first, its new one last), out of
 * combat. The party moves like a snake: each follower takes the tile one step behind the member ahead of it,
 * along the leader's path, then (on a short walk) the tiles the members ahead stood on. So the three always
 * end in an unbroken line of adjacent tiles, however far the leader walked, whatever anyone's movement. A
 * follower whose trail tile isn't next to the member ahead (the party was split up, e.g. after a fight) goes
 * to the nearest open tile beside that member instead. Never two on one tile.
 */
export function trailFollowers(path: Pos[], followers: Pos[], isOpen: (p: Pos) => boolean): Pos[] {
  // Newest first: the leader's new tile, back along its walk, then the line as it stood
  const trail = [...path].reverse().concat(followers);
  const placed: Pos[] = [trail[0]];
  const isFree = (p: Pos) => isOpen(p) && !placed.some((q) => samePos(p, q));
  let i = 1;
  return followers.map((old) => {
    const ahead = placed[placed.length - 1];
    while (i < trail.length && placed.some((q) => samePos(q, trail[i]))) i++;
    let spot: Pos | undefined = trail[i++];
    if (!spot || !isAdjacent(spot, ahead)) {
      spot = findOpenTilesNear(ahead, isFree, 1, 1)[0] ?? findOpenTilesNear(ahead, isFree, 1, 5)[0] ?? old;
    }
    placed.push(spot);
    return spot;
  });
}

/**
 * Party positions with no two members on one tile: in `order` (who keeps their tile first), a member whose
 * tile is already taken moves to the nearest open tile no one holds. E.g. a member who fell and was stood on
 * while down, getting back up.
 */
export function spreadOut(positions: Pos[], order: number[], isOpen: (p: Pos) => boolean): Pos[] {
  const out = [...positions];
  const placed: Pos[] = [];
  const isFree = (p: Pos) => isOpen(p) && !placed.some((q) => samePos(p, q));
  for (const i of order) {
    const p = placed.some((q) => samePos(q, positions[i])) ? findOpenTilesNear(positions[i], isFree, 1, 5)[0] ?? positions[i] : positions[i];
    placed.push(p);
    out[i] = p;
  }
  return out;
}
