import type { EnemyInstance } from './enemies';
import type { Ability } from './classes';
import { chebyshev, hasLineOfSight, getAffectedTiles } from './dungeonHelpers';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Pos { x: number; y: number }

export interface EnemyAction {
  moveTo: Pos | null;               // final position after movement (null = stayed put)
  targetPartyIdx: number | null;    // primary target party member (null = no attack)
  abilityUsed: Ability | null;      // ability to use; null = no attack possible
  abilityTargetPos: Pos | null;     // tile the ability is aimed at (enemy pos for self, target pos otherwise)
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
 * Picks a random affordable ability, pathfinds to within that ability's range,
 * and attacks if in range + LOS. AoE abilities are excluded unless 2+ party
 * members can be hit. Self-target abilities are only used when conditions are met
 * (self-heal below 50% HP, self-buff only if not already active).
 */
export function computeEnemyTurn(
  enemy: EnemyInstance,
  partyMembers: Array<{ pos: Pos; hp: number }>,
  allEnemies: EnemyInstance[],
  floors: Set<string>,
  partyThreat: number[] = [],
): EnemyAction {
  const noAction: EnemyAction = { moveTo: null, targetPartyIdx: null, abilityUsed: null, abilityTargetPos: null };

  // Pick primary target: highest threat → closest if tied → random if still tied
  const aliveMembers = partyMembers
    .map((m, idx) => ({ ...m, idx }))
    .filter(m => m.hp > 0);

  if (aliveMembers.length === 0) return noAction;

  aliveMembers.sort((a, b) => {
    const tDiff = (partyThreat[b.idx] ?? 0) - (partyThreat[a.idx] ?? 0);
    if (tDiff !== 0) return tDiff;
    const distDiff = chebyshev(enemy.pos, a.pos) - chebyshev(enemy.pos, b.pos);
    if (distDiff !== 0) return distDiff;
    return Math.random() - 0.5;
  });
  const target = aliveMembers[0];
  const targetPos = target.pos;

  // ── Build pool of affordable, eligible abilities ──────────────────────────
  const candidates: Ability[] = [];

  for (const a of enemy.classData.abilities) {
    if (enemy.currentMp < a.mpCost) continue;

    if (a.target === 'self') {
      if (a.effects.some(e => e.type === 'heal' || e.type === 'hot')) {
        // Only self-heal when below 50% HP
        if (enemy.currentHp / enemy.stats.hp < 0.5) candidates.push(a);
      } else if (a.effects.some(e => e.type === 'buff')) {
        // Don't re-apply a buff that's already active from this ability
        if (!enemy.buffs.some(b => b.source === a.name)) candidates.push(a);
      } else {
        candidates.push(a);
      }
    } else if (a.target === 'enemy') {
      if (a.area && a.area !== 'single') {
        // AoE: only use if 2+ alive party members can be hit from current position
        const affectedTiles = getAffectedTiles(enemy.pos, targetPos, a.area, floors);
        const affectedSet = new Set(affectedTiles.map(t => `${t.x},${t.y}`));
        const hittable = aliveMembers.filter(m => affectedSet.has(`${m.pos.x},${m.pos.y}`)).length;
        if (hittable >= 2) candidates.push(a);
      } else {
        candidates.push(a);
      }
    }
  }

  if (candidates.length === 0) return noAction;

  // ── Pick randomly ─────────────────────────────────────────────────────────
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  // ── Self-target: no movement needed ──────────────────────────────────────
  if (chosen.target === 'self') {
    return { moveTo: null, targetPartyIdx: null, abilityUsed: chosen, abilityTargetPos: { ...enemy.pos } };
  }

  // ── Enemy-target: pathfind to within chosen ability's range ──────────────
  const attackRange = chosen.range ?? 1;
  let pos = { ...enemy.pos };

  // Already in range + LOS? Attack without moving
  if (chebyshev(pos, targetPos) <= attackRange && hasLineOfSight(pos, targetPos, floors)) {
    return { moveTo: null, targetPartyIdx: target.idx, abilityUsed: chosen, abilityTargetPos: targetPos };
  }

  // Tiles occupied by other living enemies and all party members
  const blocked = new Set(
    allEnemies
      .filter(e => e.id !== enemy.id && e.currentHp > 0)
      .map(e => `${e.pos.x},${e.pos.y}`)
  );
  for (const m of partyMembers) {
    blocked.add(`${m.pos.x},${m.pos.y}`);
  }

  const path = findPath(pos, targetPos, floors, blocked);
  const movement = enemy.stats.movement;
  const steps = Math.min(path.length, movement);
  let lastValidPos = { ...enemy.pos };

  for (let i = 0; i < steps; i++) {
    const next = path[i];
    if (blocked.has(`${next.x},${next.y}`)) break;
    if (chebyshev(enemy.pos, next) > movement) break;

    pos = next;
    lastValidPos = pos;

    // Stop early once we're in attack range with line of sight
    if (chebyshev(pos, targetPos) <= attackRange && hasLineOfSight(pos, targetPos, floors)) break;
  }

  pos = lastValidPos;
  const moved = pos.x !== enemy.pos.x || pos.y !== enemy.pos.y;
  const canAttack = chebyshev(pos, targetPos) <= attackRange && hasLineOfSight(pos, targetPos, floors);

  return {
    moveTo: moved ? pos : null,
    targetPartyIdx: canAttack ? target.idx : null,
    abilityUsed: canAttack ? chosen : null,
    abilityTargetPos: canAttack ? targetPos : null,
  };
}
