import type { EnemyInstance } from './enemies';
import type { Ability } from './classes';
import { affectedKeys, chebyshev, hasLineOfSight, posKey, samePos, type Pos } from './dungeonHelpers';
import { pick, shuffle } from './random';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EnemyAction {
  moveTo: Pos | null;               // final position after movement (null = stayed put)
  targetPartyIdx: number | null;    // primary target party member (null = no attack)
  abilityUsed: Ability | null;      // ability to use; null = no attack possible
  abilityTargetPos: Pos | null;     // tile the ability is aimed at (enemy pos for self, target pos otherwise)
}

// ─── BFS Pathfinding ────────────────────────────────────────────────────────

/**
 * BFS from `start` toward `goal`. Returns the positions (excluding `start` and the goal tile
 * itself) forming the shortest path, or an empty array if no path exists.
 *
 * `blocked` contains tiles the enemy cannot walk through (other enemies, party members).
 * The goal tile is allowed during search so BFS can path up to it.
 */
function findPath(start: Pos, goal: Pos, floors: Set<string>, blocked: Set<string>): Pos[] {
  const startKey = posKey(start);
  const goalKey = posKey(goal);

  const cameFrom = new Map<string, Pos | null>([[startKey, null]]);
  const queue: Pos[] = [start];
  let reached = false;

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (posKey(cur) === goalKey) { reached = true; break; }

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const next = { x: cur.x + dx, y: cur.y + dy };
        const nKey = posKey(next);
        if (cameFrom.has(nKey) || !floors.has(nKey)) continue;
        if (blocked.has(nKey) && nKey !== goalKey) continue;
        cameFrom.set(nKey, cur);
        queue.push(next);
      }
    }
  }
  if (!reached) return [];

  // Reconstruct, dropping the goal tile (enemy shouldn't step onto its target)
  const path: Pos[] = [];
  for (let p = cameFrom.get(goalKey) ?? null; p && posKey(p) !== startKey; p = cameFrom.get(posKey(p)) ?? null) {
    path.push(p);
  }
  return path.reverse();
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
  // (shuffle first so the stable sort breaks remaining ties randomly)
  const aliveMembers = shuffle(partyMembers.map((m, idx) => ({ ...m, idx })).filter(m => m.hp > 0))
    .sort((a, b) =>
      ((partyThreat[b.idx] ?? 0) - (partyThreat[a.idx] ?? 0)) ||
      (chebyshev(enemy.pos, a.pos) - chebyshev(enemy.pos, b.pos)));

  if (aliveMembers.length === 0) return noAction;
  const target = aliveMembers[0];
  const targetPos = target.pos;

  // ── Build pool of affordable, eligible abilities ──────────────────────────
  const candidates = enemy.classData.abilities.filter(a => {
    if (enemy.currentMp < a.mpCost) return false;
    if (a.target === 'self') {
      // Only self-heal below 50% HP; don't re-apply a buff that's already active
      if (a.effects.some(e => e.type === 'heal' || e.type === 'hot')) return enemy.currentHp / enemy.stats.hp < 0.5;
      if (a.effects.some(e => e.type === 'buff')) return !enemy.buffs.some(b => b.source === a.name);
      return true;
    }
    if (a.target === 'enemy' && a.area && a.area !== 'single') {
      // AoE: only use if 2+ alive party members can be hit from current position
      const hit = affectedKeys(enemy.pos, targetPos, a.area, floors);
      return aliveMembers.filter(m => hit.has(posKey(m.pos))).length >= 2;
    }
    return a.target === 'enemy';
  });

  if (candidates.length === 0) return noAction;
  const chosen = pick(candidates);

  // ── Self-target: no movement needed ──────────────────────────────────────
  if (chosen.target === 'self') {
    return { moveTo: null, targetPartyIdx: null, abilityUsed: chosen, abilityTargetPos: { ...enemy.pos } };
  }

  // ── Enemy-target: pathfind until within the chosen ability's range + LOS ──
  const canReach = (from: Pos) => chebyshev(from, targetPos) <= chosen.range && hasLineOfSight(from, targetPos, floors);

  let pos = enemy.pos;
  if (!canReach(pos)) {
    // Tiles occupied by other living enemies and all party members
    const blocked = new Set(allEnemies.filter(e => e.id !== enemy.id && e.currentHp > 0).map(e => posKey(e.pos)));
    for (const m of partyMembers) blocked.add(posKey(m.pos));

    for (const step of findPath(pos, targetPos, floors, blocked).slice(0, enemy.stats.movement)) {
      pos = step;
      if (canReach(pos)) break; // stop early once in range
    }
  }

  const attack = canReach(pos);
  return {
    moveTo: samePos(pos, enemy.pos) ? null : pos,
    targetPartyIdx: attack ? target.idx : null,
    abilityUsed: attack ? chosen : null,
    abilityTargetPos: attack ? targetPos : null,
  };
}
