// Party movement: where the active member may move, and how followers trail the leader out of combat (by the
// shared step rules, world/grid.ts).
import { findOpenTilesNear, fits, footprintKeys, isAdjacent, keyPos, pathTo, posKey, reachableTiles, samePos, type Body, type Pos } from './grid';

/**
 * Where a party member may move this turn: tile key -> steps it costs. Unwalkable tiles (walls, and
 * tiles a map object stands on, like the rift: see isWalkable) and enemies block the way; the mover
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

/**
 * The tile to walk to so as to stand beside `object` (a chest, a door, an NPC...): of the reachable `targets`
 * (partyMoveTargets) touching it, the one costing the fewest steps. Ties go to an orthogonal neighbour, then to
 * the tile nearer `mover`. Null if none is reachable.
 */
export function approachTile(targets: ReadonlyMap<string, number>, object: Pos, mover: Pos): Pos | null {
  let best: { pos: Pos; score: [number, number, number] } | null = null;
  for (const [key, steps] of targets) {
    const pos = keyPos(key);
    if (!isAdjacent(pos, object)) continue;
    const orthogonal = pos.x === object.x || pos.y === object.y ? 0 : 1;
    const score: [number, number, number] = [steps, orthogonal, Math.hypot(pos.x - mover.x, pos.y - mover.y)];
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2])))) best = { pos, score };
  }
  return best?.pos ?? null;
}

/**
 * Where to walk when `to` itself can't be reached: of the reachable `targets`, the tile nearest it in a straight
 * line (ties: fewer steps). Null unless that tile is strictly nearer to `to` than `from` is, so a click on a wall
 * the mover already hugs does nothing.
 */
export function closestReachable(targets: ReadonlyMap<string, number>, to: Pos, from: Pos): Pos | null {
  const dist = (p: Pos) => Math.hypot(p.x - to.x, p.y - to.y);
  let best: { pos: Pos; d: number; steps: number } | null = null;
  for (const [key, steps] of targets) {
    const pos = keyPos(key);
    const d = dist(pos);
    if (!best || d < best.d || (d === best.d && steps < best.steps)) best = { pos, d, steps };
  }
  return best && best.d < dist(from) ? best.pos : null;
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
 * Spots for creature bodies of `sizes` (1, or 2 for a large one: its top-left tile) near `center`, each the nearest
 * open one where its whole body fits, none overlapping another or the `taken` tiles (keys). A body with no room
 * within 5 tiles gets `fallback[i]` (e.g. where it stood).
 */
export function placeBodiesNear(center: Pos, sizes: number[], isOpen: (p: Pos) => boolean, taken: Iterable<string>, fallback: Pos[]): Pos[] {
  const held = new Set(taken);
  const free = (p: Pos) => isOpen(p) && !held.has(posKey(p));
  return sizes.map((size, i) => {
    const spot = findOpenTilesNear(center, (p) => fits(p, size, free), 1, 5)[0] ?? fallback[i];
    for (const k of footprintKeys({ pos: spot, size })) held.add(k);
    return spot;
  });
}

/**
 * Where everyone marching with the leader stands after it walks `path` (trailFollowers), out of combat: the
 * `followers` (the other members), then the party's forever summons (`summons`, data/units/summons.ts) behind them.
 * A one-tile summon is one more link of the snake, so the group can be four or more; a large one can't be (the line
 * goes tile by tile), and takes the nearest spot its whole body fits beside the end of the line. Nobody shares a tile.
 */
export function marchParty(path: Pos[], followers: Pos[], summons: Body[], isOpen: (p: Pos) => boolean): { followers: Pos[]; summons: Pos[] } {
  const isSmall = (s: Body) => (s.size ?? 1) === 1;
  const small = summons.filter(isSmall), large = summons.filter((s) => !isSmall(s));
  const line = trailFollowers(path, [...followers, ...small.map((s) => s.pos)], isOpen);
  const leader = path[path.length - 1];
  const tail = line[line.length - 1] ?? leader;
  const placedLarge = placeBodiesNear(tail, large.map((s) => s.size ?? 1), isOpen, [leader, ...line].map(posKey), large.map((s) => s.pos));
  let nSmall = followers.length, nLarge = 0;
  return { followers: line.slice(0, followers.length), summons: summons.map((s) => (isSmall(s) ? line[nSmall++] : placedLarge[nLarge++])) };
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
