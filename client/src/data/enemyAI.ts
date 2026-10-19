import type { EnemyInstance } from './enemies';
import type { Ability } from './classes';
import { affectedKeys, chebyshev, hasLineOfSight, posKey, reachableTiles, samePos, type Pos } from './dungeonHelpers';
import { shuffle } from './random';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EnemyAction {
  moveTo: Pos | null;               // final position after movement (null = stayed put)
  targetPartyIdx: number | null;    // primary target party member (null = no attack)
  abilityUsed: Ability | null;      // ability to use; null = no attack possible
  abilityTargetPos: Pos | null;     // tile the ability is aimed at (enemy pos for self, target pos otherwise)
}

// ─── AI ──────────────────────────────────────────────────────────────────────

/**
 * An enemy's turn: the best thing it can actually do, falling back step by step when it can't do what it
 * would prefer.
 *
 *  1. Attack: party members in priority order (highest threat, then closest, then random), and for each,
 *     its usable attacks in a random preferred order. It takes the first target + attack it can land
 *     this turn from a tile it can reach (by the shared movement rules: reachableTiles, never through
 *     anyone), moving as little as needed. So a high-threat member walled off behind others gives way to
 *     the next target it can reach.
 *  2. If its preferred ability this turn is a self ability (heal below 50% HP, a buff not yet active),
 *     it uses that instead; if it can attack no one, it uses a usable self ability if it has one.
 *  3. Otherwise it closes in on the highest-priority member it can get nearer to.
 * AoE attacks are only used where they'd hit 2+ party members.
 */
export function computeEnemyTurn(
  enemy: EnemyInstance,
  partyMembers: Array<{ pos: Pos; hp: number }>,
  allEnemies: EnemyInstance[],
  floors: Set<string>,
  partyThreat: number[] = [],
  /** Floor tiles a game object stands on (the portal): it can't walk onto or through them (sight isn't blocked). */
  objectTiles: ReadonlySet<string> = new Set(),
): EnemyAction {
  const noAction: EnemyAction = { moveTo: null, targetPartyIdx: null, abilityUsed: null, abilityTargetPos: null };

  // Targets by priority: highest threat → closest if tied → random if still tied
  // (shuffle first so the stable sort breaks remaining ties randomly)
  const targets = shuffle(partyMembers.map((m, idx) => ({ ...m, idx })).filter(m => m.hp > 0))
    .sort((a, b) =>
      ((partyThreat[b.idx] ?? 0) - (partyThreat[a.idx] ?? 0)) ||
      (chebyshev(enemy.pos, a.pos) - chebyshev(enemy.pos, b.pos)));
  if (targets.length === 0) return noAction;

  // Abilities it can use now, in this turn's (random) order of preference
  const usable = shuffle(enemy.classData.abilities.filter(a => {
    if (enemy.currentMp < a.mpCost) return false;
    if (a.target === 'self') {
      // Only self-heal below 50% HP; don't re-apply a buff that's already active
      if (a.effects.some(e => e.type === 'heal' || e.type === 'hot')) return enemy.currentHp / enemy.stats.hp < 0.5;
      if (a.effects.some(e => e.type === 'buff')) return !enemy.buffs.some(b => b.source === a.name);
      return true;
    }
    return a.target === 'enemy';
  }));
  const selfAction = (a: Ability): EnemyAction => ({ moveTo: null, targetPartyIdx: null, abilityUsed: a, abilityTargetPos: { ...enemy.pos } });
  if (usable.length === 0) return noAction;
  if (usable[0].target === 'self') return selfAction(usable[0]);

  // Where it can stand this turn (nearest first, its own tile included): over floor, never through anyone
  // or a game object
  const isFloor = (p: Pos) => floors.has(posKey(p)) && !objectTiles.has(posKey(p));
  const units = new Set([
    ...allEnemies.filter(e => e.id !== enemy.id && e.currentHp > 0).map(e => posKey(e.pos)),
    ...partyMembers.map(m => posKey(m.pos)),
  ]);
  const reach = [...reachableTiles(enemy.pos, enemy.stats.movement, isFloor, p => units.has(posKey(p))).values()];

  // 1. The first target + attack it can land this turn, from the nearest tile that works
  const attacks = usable.filter(a => a.target === 'enemy');
  for (const target of targets) {
    for (const a of attacks) {
      const aoe = !!a.area && a.area !== 'single';
      for (const { pos } of reach) {
        if (chebyshev(pos, target.pos) > a.range || !hasLineOfSight(pos, target.pos, floors)) continue;
        if (aoe) {
          const hit = affectedKeys(pos, target.pos, a.area, floors);
          if (targets.filter(m => hit.has(posKey(m.pos))).length < 2) continue;
        }
        return { moveTo: samePos(pos, enemy.pos) ? null : pos, targetPartyIdx: target.idx, abilityUsed: a, abilityTargetPos: target.pos };
      }
    }
  }

  // 2. No attack lands this turn: a self ability, if it has one it can use
  const self = usable.find(a => a.target === 'self');
  if (self) return selfAction(self);

  // 3. Close in on the highest-priority target it can get nearer to (distance over floor, ignoring units,
  //    so enemies queue up behind each other in a corridor rather than wander off)
  for (const target of targets) {
    const toTarget = reachableTiles(target.pos, Infinity, isFloor);
    const stepsFrom = (p: Pos) => toTarget.get(posKey(p))?.steps ?? Infinity;
    let best: Pos | null = null, bestSteps = stepsFrom(enemy.pos);
    for (const { pos } of reach) {
      const s = stepsFrom(pos);
      if (s < bestSteps) { best = pos; bestSteps = s; }
    }
    if (best) return { ...noAction, moveTo: best };
  }
  return noAction;
}
