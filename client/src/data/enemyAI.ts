import type { EnemyInstance } from './enemies';
import { chebyshev, hasLineOfSight } from './dungeonHelpers';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Pos { x: number; y: number }

export interface EnemyAction {
  moveTo: Pos | null;       // final position after movement (null = stayed put)
  attackPlayer: boolean;    // whether to attack the player after moving
}

// ─── BFS Pathfinding ────────────────────────────────────────────────────────

/**
 * BFS from `start` toward `goal`. Returns the list of positions (excluding
 * `start`) forming the shortest path to the goal or to the nearest reachable
 * tile, or an empty array if no path exists.
 *
 * `blocked` contains tiles the enemy cannot walk through (other enemies,
 * the player tile). The goal tile itself is NOT blocked for search purposes
 * so BFS can find adjacent tiles, but the path stops before stepping onto it.
 */
function findPath(
  start: Pos,
  goal: Pos,
  floors: Set<string>,
  blocked: Set<string>,
): Pos[] {
  const startKey = `${start.x},${start.y}`;
  const goalKey = `${goal.x},${goal.y}`;

  // BFS
  const cameFrom = new Map<string, string>();
  const queue: Pos[] = [start];
  cameFrom.set(startKey, '');

  let reached: string | null = null;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curKey = `${cur.x},${cur.y}`;

    // Found a tile adjacent to or at the goal — stop
    if (curKey === goalKey) {
      reached = curKey;
      break;
    }

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const nKey = `${nx},${ny}`;

        if (cameFrom.has(nKey)) continue;           // already visited
        if (!floors.has(nKey)) continue;             // wall
        if (blocked.has(nKey) && nKey !== goalKey) continue; // occupied (but allow goal for adjacency)

        cameFrom.set(nKey, curKey);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  if (reached === null) return []; // no path

  // Reconstruct
  const path: Pos[] = [];
  let cur = reached;
  while (cur !== startKey && cur !== '') {
    const [px, py] = cur.split(',').map(Number);
    path.push({ x: px, y: py });
    cur = cameFrom.get(cur)!;
  }
  path.reverse();

  // Remove the goal tile itself from the path (enemy shouldn't step onto player)
  if (path.length > 0) {
    const last = path[path.length - 1];
    if (last.x === goal.x && last.y === goal.y) {
      path.pop();
    }
  }

  return path;
}

// ─── AI ──────────────────────────────────────────────────────────────────────

/**
 * BFS chase AI: pathfind toward the player, move up to `movement` steps
 * along the shortest path, then attack if within range + LOS.
 */
export function computeEnemyTurn(
  enemy: EnemyInstance,
  playerPos: Pos,
  allEnemies: EnemyInstance[],
  floors: Set<string>,
): EnemyAction {
  const range = enemy.type.weapon.range;
  let pos = { ...enemy.pos };

  // Already in range + LOS? Attack without moving.
  if (chebyshev(pos, playerPos) <= range && hasLineOfSight(pos, playerPos, floors)) {
    return { moveTo: null, attackPlayer: true };
  }

  // Tiles occupied by other living enemies
  const blocked = new Set(
    allEnemies
      .filter(e => e.id !== enemy.id && e.currentHp > 0)
      .map(e => `${e.pos.x},${e.pos.y}`)
  );
  blocked.add(`${playerPos.x},${playerPos.y}`); // can't walk onto player

  const path = findPath(pos, playerPos, floors, blocked);

  // Follow path up to movement budget, stopping early if we enter attack range
  const movement = enemy.type.stats.movement;
  const steps = Math.min(path.length, movement);
  let lastValidPos = { ...enemy.pos };
  for (let i = 0; i < steps; i++) {
    const next = path[i];
    // Re-check the tile is still walkable (other enemies may share a target tile in theory)
    if (blocked.has(`${next.x},${next.y}`)) break;

    // Hard clamp: never exceed movement budget in Chebyshev distance from start
    if (chebyshev(enemy.pos, next) > movement) break;

    pos = next;
    lastValidPos = pos;

    // Stop early if now in attack range + LOS
    if (chebyshev(pos, playerPos) <= range && hasLineOfSight(pos, playerPos, floors)) break;
  }

  pos = lastValidPos;
  const moved = pos.x !== enemy.pos.x || pos.y !== enemy.pos.y;
  const canAttack = chebyshev(pos, playerPos) <= range && hasLineOfSight(pos, playerPos, floors);

  if (moved) {
    console.log(`[AI] ${enemy.type.name} (mv ${movement}): (${enemy.pos.x},${enemy.pos.y}) → (${pos.x},${pos.y}), dist ${chebyshev(enemy.pos, pos)}`);
  }

  return {
    moveTo: moved ? pos : null,
    attackPlayer: canAttack,
  };
}
