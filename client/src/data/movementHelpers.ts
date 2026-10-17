import { chebyshev, findOpenTilesNear, posKey, samePos, type Pos } from './dungeonHelpers';

/** Up to `count` walkable tiles near `center` (closest first); pads with `center` if too few. */
export function findFollowerSpawns(center: Pos, floors: Set<string>, count: number): Pos[] {
  const found = findOpenTilesNear(center, p => floors.has(posKey(p)), count, 5);
  while (found.length < count) found.push({ ...center });
  return found;
}

// Compute new follower positions after the leader moves to `newLeaderPos`.
// `f1Move` and `f2Move` are the movement stats for each follower.
export function computeFollowerPositions(
  newLeaderPos: Pos,
  oldLeaderPos: Pos,
  oldF1Pos: Pos,
  oldF2Pos: Pos,
  f1Move: number,
  f2Move: number,
  isWalkable: (pos: Pos) => boolean,
): { f1: Pos; f2: Pos } {
  const leaderDx = Math.sign(newLeaderPos.x - oldLeaderPos.x);
  const leaderDy = Math.sign(newLeaderPos.y - oldLeaderPos.y);

  const isOpen = (p: Pos, blocked: ReadonlySet<string>) => isWalkable(p) && !blocked.has(posKey(p));

  const stepN = (from: Pos, to: Pos, n: number, blocked: ReadonlySet<string>): Pos => {
    let cur = from;
    for (let i = 0; i < n; i++) {
      const dx = Math.sign(to.x - cur.x);
      const dy = Math.sign(to.y - cur.y);
      if (dx === 0 && dy === 0) break;
      const diag  = { x: cur.x + dx, y: cur.y + dy };
      const horiz = { x: cur.x + dx, y: cur.y };
      const vert  = { x: cur.x, y: cur.y + dy };
      const next =
        isOpen(diag, blocked)               ? diag  :
        (dx !== 0 && isOpen(horiz, blocked)) ? horiz :
        (dy !== 0 && isOpen(vert, blocked))  ? vert  :
        null;
      if (!next) break;
      cur = next;
    }
    return cur;
  };

  const findNearestOpen = (from: Pos, blocked: ReadonlySet<string>): Pos =>
    findOpenTilesNear(from, p => isOpen(p, blocked), 1, 5)[0] ?? from;

  const targetF1 = { x: newLeaderPos.x - leaderDx, y: newLeaderPos.y - leaderDy };
  const targetF2 = { x: newLeaderPos.x - 2 * leaderDx, y: newLeaderPos.y - 2 * leaderDy };

  const occupied = new Set<string>([posKey(newLeaderPos)]);

  // Bump any follower that is already standing on the leader's new tile.
  let f1 = samePos(oldF1Pos, newLeaderPos) ? findNearestOpen(oldF1Pos, occupied) : oldF1Pos;
  let f2 = samePos(oldF2Pos, newLeaderPos) ? findNearestOpen(oldF2Pos, occupied) : oldF2Pos;

  // Step each follower toward its trailing slot, but never end farther from the leader than before
  const preStepF1 = f1;
  f1 = stepN(f1, targetF1, f1Move, occupied);
  if (chebyshev(f1, newLeaderPos) > chebyshev(preStepF1, newLeaderPos)) f1 = preStepF1;
  occupied.add(posKey(f1));

  const preStepF2 = f2;
  f2 = stepN(f2, targetF2, f2Move, occupied);
  if (chebyshev(f2, newLeaderPos) > chebyshev(preStepF2, newLeaderPos)) f2 = preStepF2;

  return { f1, f2 };
}
