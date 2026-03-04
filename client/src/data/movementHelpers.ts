type Pos = { x: number; y: number };

// Find up to `count` walkable floor tiles near `center` (ring search, closest first).
// Excludes the center tile itself.
export function findFollowerSpawns(
  center: Pos,
  floors: Set<string>,
  count: number,
): Pos[] {
  const found: Pos[] = [];
  for (let r = 1; r <= 5 && found.length < count; r++) {
    for (let dx = -r; dx <= r && found.length < count; dx++) {
      for (let dy = -r; dy <= r && found.length < count; dy++) {
        if (Math.abs(dx) < r && Math.abs(dy) < r) continue; // only outer ring
        const pos = { x: center.x + dx, y: center.y + dy };
        if (
          floors.has(`${pos.x},${pos.y}`) &&
          !found.some(p => p.x === pos.x && p.y === pos.y)
        ) {
          found.push(pos);
        }
      }
    }
  }
  while (found.length < count) found.push({ ...center });
  return found;
}

// Compute new follower positions after the leader moves to `newLeaderPos`.
// `floors` is the walkable tile set; pass null for the sanctum (uses bounds check).
// `f1Move` and `f2Move` are the movement stats for each follower.
export function computeFollowerPositions(
  newLeaderPos: Pos,
  oldLeaderPos: Pos,
  oldF1Pos: Pos,
  oldF2Pos: Pos,
  f1Move: number,
  f2Move: number,
  floors: Set<string> | null,
): { f1: Pos; f2: Pos } {
  const leaderDx = Math.sign(newLeaderPos.x - oldLeaderPos.x);
  const leaderDy = Math.sign(newLeaderPos.y - oldLeaderPos.y);

  const isWalkable = (pos: Pos) => {
    if (floors) return floors.has(`${pos.x},${pos.y}`);
    return pos.x > 0 && pos.x < 10 && pos.y > 0 && pos.y < 10;
  };

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
        (isWalkable(diag)  && !blocked.has(`${diag.x},${diag.y}`))               ? diag  :
        (dx !== 0 && isWalkable(horiz) && !blocked.has(`${horiz.x},${horiz.y}`)) ? horiz :
        (dy !== 0 && isWalkable(vert)  && !blocked.has(`${vert.x},${vert.y}`))   ? vert  :
        null;
      if (!next) break;
      cur = next;
    }
    return cur;
  };

  const findNearestOpen = (from: Pos, blocked: ReadonlySet<string>): Pos => {
    for (let r = 1; r <= 5; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const candidate = { x: from.x + dx, y: from.y + dy };
          if (isWalkable(candidate) && !blocked.has(`${candidate.x},${candidate.y}`)) return candidate;
        }
      }
    }
    return from;
  };

  const targetF1 = { x: newLeaderPos.x - leaderDx, y: newLeaderPos.y - leaderDy };
  const targetF2 = { x: newLeaderPos.x - 2 * leaderDx, y: newLeaderPos.y - 2 * leaderDy };

  const occupied = new Set<string>([`${newLeaderPos.x},${newLeaderPos.y}`]);

  // Bump any follower that is already standing on the leader's new tile.
  let f1 = oldF1Pos;
  let f2 = oldF2Pos;
  if (`${oldF1Pos.x},${oldF1Pos.y}` === `${newLeaderPos.x},${newLeaderPos.y}`) {
    f1 = findNearestOpen(oldF1Pos, occupied);
  }
  if (`${oldF2Pos.x},${oldF2Pos.y}` === `${newLeaderPos.x},${newLeaderPos.y}`) {
    f2 = findNearestOpen(oldF2Pos, occupied);
  }

  const dist = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  const preStepF1 = f1;
  f1 = stepN(f1, targetF1, f1Move, occupied);
  if (dist(f1, newLeaderPos) > dist(preStepF1, newLeaderPos)) f1 = preStepF1;
  occupied.add(`${f1.x},${f1.y}`);

  const preStepF2 = f2;
  f2 = stepN(f2, targetF2, f2Move, occupied);
  if (dist(f2, newLeaderPos) > dist(preStepF2, newLeaderPos)) f2 = preStepF2;

  return { f1, f2 };
}
