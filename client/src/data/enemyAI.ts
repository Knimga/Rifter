import type { EnemyInstance } from './enemies';
import type { Ability } from './classes';
import { chebyshev, hasLineOfSight } from './dungeonHelpers';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Pos { x: number; y: number }

export interface EnemyAction {
  moveTo: Pos | null;               // final position after movement (null = stayed put)
  targetPartyIdx: number | null;    // which party member to attack (null = no attack)
  abilityUsed: Ability | null;      // if non-null, use this ability instead of weapon attack
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
 * BFS chase AI: pathfind toward the nearest alive party member, move up to
 * `movement` steps along the shortest path, then attack if within range + LOS.
 */
export function computeEnemyTurn(
  enemy: EnemyInstance,
  partyMembers: Array<{ pos: Pos; hp: number }>,
  allEnemies: EnemyInstance[],
  floors: Set<string>,
  partyThreat: number[] = [],
): EnemyAction {
  // Pick target: highest threat → closest if tied → random if still tied
  const aliveMembers = partyMembers
    .map((m, idx) => ({ ...m, idx }))
    .filter(m => m.hp > 0);

  if (aliveMembers.length === 0) {
    return { moveTo: null, targetPartyIdx: null, abilityUsed: null };
  }

  aliveMembers.sort((a, b) => {
    const tDiff = (partyThreat[b.idx] ?? 0) - (partyThreat[a.idx] ?? 0);
    if (tDiff !== 0) return tDiff;
    const distDiff = chebyshev(enemy.pos, a.pos) - chebyshev(enemy.pos, b.pos);
    if (distDiff !== 0) return distDiff;
    return Math.random() - 0.5;
  });
  const target = aliveMembers[0];
  const targetPos = target.pos;

  const range = enemy.type.weapon.range;
  let pos = { ...enemy.pos };

  // ── Self-targeting ability check (e.g. self-heal when low HP) ────────────
  const selfAbilities = enemy.type.abilities.filter(
    a => a.target === 'self' && enemy.currentMp >= a.mpCost
  );
  if (selfAbilities.length > 0) {
    const hpPct = enemy.currentHp / enemy.stats.hp;
    const healAbility = selfAbilities.find(a => a.heal || a.hot);
    if (healAbility && hpPct < 0.5) {
      return { moveTo: null, targetPartyIdx: null, abilityUsed: healAbility };
    }
    // Other self buffs: use on first turn of combat (round 1 effectively = first action)
    const buffAbility = selfAbilities.find(a => a.buff);
    if (buffAbility && !enemy.buffs.some(b => b.id.startsWith(buffAbility.name))) {
      return { moveTo: null, targetPartyIdx: null, abilityUsed: buffAbility };
    }
  }

  // ── Already in weapon range + LOS? Check for ability first, then weapon ──
  if (chebyshev(pos, targetPos) <= range && hasLineOfSight(pos, targetPos, floors)) {
    const inRangeAbility = enemy.type.abilities.find(
      a => a.target === 'enemy' && enemy.currentMp >= a.mpCost &&
           chebyshev(pos, targetPos) <= a.range && hasLineOfSight(pos, targetPos, floors)
    );
    if (inRangeAbility) return { moveTo: null, targetPartyIdx: target.idx, abilityUsed: inRangeAbility };
    return { moveTo: null, targetPartyIdx: target.idx, abilityUsed: null };
  }

  // Tiles occupied by other living enemies (and all party member positions)
  const blocked = new Set(
    allEnemies
      .filter(e => e.id !== enemy.id && e.currentHp > 0)
      .map(e => `${e.pos.x},${e.pos.y}`)
  );
  for (const m of partyMembers) {
    blocked.add(`${m.pos.x},${m.pos.y}`);
  }

  const path = findPath(pos, targetPos, floors, blocked);

  // Follow path up to movement budget, stopping early if we enter attack range
  const movement = enemy.stats.movement;
  const steps = Math.min(path.length, movement);
  let lastValidPos = { ...enemy.pos };
  for (let i = 0; i < steps; i++) {
    const next = path[i];
    if (blocked.has(`${next.x},${next.y}`)) break;
    if (chebyshev(enemy.pos, next) > movement) break;

    pos = next;
    lastValidPos = pos;

    if (chebyshev(pos, targetPos) <= range && hasLineOfSight(pos, targetPos, floors)) break;
  }

  pos = lastValidPos;
  const moved = pos.x !== enemy.pos.x || pos.y !== enemy.pos.y;
  const canAttack = chebyshev(pos, targetPos) <= range && hasLineOfSight(pos, targetPos, floors);

  if (moved) {
    console.log(`[AI] ${enemy.type.name} (mv ${movement}): (${enemy.pos.x},${enemy.pos.y}) → (${pos.x},${pos.y}), dist ${chebyshev(enemy.pos, pos)}`);
  }

  // Check for an in-range enemy-targeting ability after moving
  const inRangeAbility = canAttack ? enemy.type.abilities.find(
    a => a.target === 'enemy' && enemy.currentMp >= a.mpCost &&
         chebyshev(pos, targetPos) <= a.range && hasLineOfSight(pos, targetPos, floors)
  ) : undefined;

  return {
    moveTo: moved ? pos : null,
    targetPartyIdx: canAttack ? target.idx : null,
    abilityUsed: inRangeAbility ?? null,
  };
}
