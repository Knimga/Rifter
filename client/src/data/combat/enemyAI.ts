import type { EnemyInstance } from '../units/enemies';
import type { Ability } from './abilities';
import { affectedKeys, isArea, isSelfBurst } from './areas';
import { chebyshev, hasLineOfSight, posKey, reachableTiles, samePos, type Pos } from '../world/grid';
import { shuffle } from '../random';
import { moveBudget, moveCost } from './combat';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A unit the AI fights: a party member or summoned ally (for an enemy), an enemy (for a summoned ally). */
export interface Foe {
  key: string;  // unitKey: identifies it in the result, and its threat (CombatState.threat)
  pos: Pos;
  hp: number;
}

export interface EnemyAction {
  moveTo: Pos | null;               // final position after movement (null = stayed put)
  targetKey: string | null;         // primary target foe's key (null = no attack)
  abilityUsed: Ability | null;      // ability to use; null = no attack possible
  abilityTargetPos: Pos | null;     // tile the ability is aimed at (enemy pos for self, target pos otherwise)
  apSpent: number;                  // AP the step costs: its move (combat.ts moveCost) plus its ability
  tilesLeft: number;                // tiles paid for and not walked after it
}

// ─── AI ──────────────────────────────────────────────────────────────────────

/**
 * One step of a creature's turn (a move and/or an ability): the best thing it can actually do with the AP it
 * has left, falling back when it can't do what it would prefer. Its turn repeats steps until it runs out of
 * AP or has nothing useful to do (useEnemyTurn), so with 3 AP it may move and attack twice, or move twice.
 * The same AI runs enemies (their foes: the party and its summoned allies) and summoned allies (their foes:
 * the enemies); below, "foes" are whichever it fights.
 *
 *  1. Attack, from a tile it can reach this step (by the shared movement rules: reachableTiles, never
 *     through anyone; at most one more move's worth of tiles, 1 AP), moving as little as needed:
 *     a. An area attack that hits 2+ foes comes first: the one hitting the most. A burst from self
 *        (range 0: isSelfBurst) hits around the tile it stands on, so it moves to where the burst catches
 *        the most; other area attacks are aimed at a foe in range and sight.
 *     b. Otherwise a single-target attack: foes in priority order (highest threat, then closest, then
 *        random), and for each, its usable attacks in a random preferred order. So a high-threat foe walled
 *        off behind others gives way to the next target it can reach.
 *     Area attacks are never used on a single foe.
 *  2. If its preferred ability this turn is a self ability (heal below 50% HP, a buff not yet active),
 *     it uses that instead; if it can attack no one, it uses a usable self ability if it has one.
 *  3. Otherwise it closes in on the highest-priority foe it can get nearer to.
 * All within its AP, by the party's rules (combat.ts): 1 AP buys a move's worth of tiles (unused ones carry
 * over to its next step), an ability costs its apCost.
 */
export function computeEnemyTurn(
  enemy: EnemyInstance,
  foes: Foe[],
  /** Every other unit's tile (either side): it can't walk onto or through them. */
  occupied: Pos[],
  floors: Set<string>,
  /** Foes' threat, by key (CombatState.threat); none = 0. Enemies hold none, so a summon picks the closest. */
  threat: Record<string, number> = {},
  /** Floor tiles a game object stands on (the portal): it can't walk onto or through them (sight isn't blocked). */
  objectTiles: ReadonlySet<string> = new Set(),
  /** What it has left this turn: AP, and tiles already paid for (combat.ts moveCost). Default: a fresh turn. */
  budget: { ap: number; paidTiles: number } = { ap: enemy.stats.apMax, paidTiles: 0 },
): EnemyAction {
  const { ap, paidTiles } = budget;
  const noAction: EnemyAction = { moveTo: null, targetKey: null, abilityUsed: null, abilityTargetPos: null, apSpent: 0, tilesLeft: paidTiles };

  // Targets by priority: highest threat → closest if tied → random if still tied
  // (shuffle first so the stable sort breaks remaining ties randomly)
  const targets = shuffle(foes.filter(m => m.hp > 0))
    .sort((a, b) =>
      ((threat[b.key] ?? 0) - (threat[a.key] ?? 0)) ||
      (chebyshev(enemy.pos, a.pos) - chebyshev(enemy.pos, b.pos)));
  if (targets.length === 0) return noAction;

  // Where it can stand after this step (nearest first, its own tile included): over floor, never through
  // anyone or a game object, within the tiles it has paid for plus one more move (1 AP), if it has the AP
  const movement = enemy.stats.movement;
  const isFloor = (p: Pos) => floors.has(posKey(p)) && !objectTiles.has(posKey(p));
  const units = new Set(occupied.map(posKey));
  const reachMap = reachableTiles(enemy.pos, moveBudget(paidTiles, Math.min(ap, 1), enemy.stats), isFloor, p => units.has(posKey(p)));
  const reach = [...reachMap.values()];
  const moveOf = (pos: Pos) => moveCost(reachMap.get(posKey(pos))?.steps ?? 0, paidTiles, movement);

  // A step: where it moves (null = stays), then the ability it uses there, if any; what that costs
  const act = (moveTo: Pos | null, ability: Ability | null, targetKey: string | null, abilityTargetPos: Pos | null): EnemyAction => {
    const move = moveTo ? moveOf(moveTo) : { apSpent: 0, tilesLeft: paidTiles };
    return { moveTo, targetKey, abilityUsed: ability, abilityTargetPos, apSpent: move.apSpent + (ability?.apCost ?? 0), tilesLeft: move.tilesLeft };
  };
  // Can it move to `pos` and use `a` there, on what it has left?
  const affordableFrom = (a: Ability, pos: Pos) => a.apCost + moveOf(pos).apSpent <= ap;

  // 3. Close in on the highest-priority target it can get nearer to (distance over floor, ignoring units,
  //    so enemies queue up behind each other in a corridor rather than wander off)
  //    Not when one of its attacks already reaches a target from where it stands (it only lacks the AP this
  //    turn): a ranged enemy keeps its distance instead of walking up to the party with AP left over.
  const closeIn = (): EnemyAction => {
    const inRangeNow = enemy.classData.abilities.some(a => a.target === 'enemy' && a.mpCost <= enemy.currentMp &&
      targets.some(t => chebyshev(enemy.pos, t.pos) <= a.range && hasLineOfSight(enemy.pos, t.pos, floors)));
    if (inRangeNow) return noAction;
    for (const target of targets) {
      const toTarget = reachableTiles(target.pos, Infinity, isFloor);
      const stepsFrom = (p: Pos) => toTarget.get(posKey(p))?.steps ?? Infinity;
      let best: Pos | null = null, bestSteps = stepsFrom(enemy.pos);
      for (const { pos } of reach) {
        const s = stepsFrom(pos);
        if (s < bestSteps) { best = pos; bestSteps = s; }
      }
      if (best) return act(best, null, null, null);
    }
    return noAction;
  };

  // Abilities it can use now, in this turn's (random) order of preference
  const usable = shuffle(enemy.classData.abilities.filter(a => {
    if (enemy.currentMp < a.mpCost || a.apCost > ap) return false;
    if (a.target === 'self') {
      // Only self-heal below 50% HP; don't re-apply a buff that's already active
      if (a.effects.some(e => e.type === 'heal' || e.type === 'hot')) return enemy.currentHp / enemy.stats.hp < 0.5;
      if (a.effects.some(e => e.type === 'buff')) return !enemy.buffs.some(b => b.source === a.name);
      return true;
    }
    return a.target === 'enemy';
  }));
  const selfAction = (a: Ability): EnemyAction => act(null, a, null, { ...enemy.pos });
  // Nothing it can afford to use: it can still close in
  if (usable.length === 0) return closeIn();
  if (usable[0].target === 'self') return selfAction(usable[0]);

  const attacks = usable.filter(a => a.target === 'enemy');
  const moveTo = (pos: Pos) => (samePos(pos, enemy.pos) ? null : pos);

  // 1a. An area attack that hits 2+ foes beats any single-target attack. Of those, the one that
  //     hits the most, then from the nearest tile. A burst from self (isSelfBurst) is aimed at the tile it
  //     stands on; other area attacks at a foe in range and sight.
  let bestAoe: { pos: Pos; a: Ability; aim: Pos; hits: typeof targets } | null = null;
  for (const a of attacks.filter(isArea)) {
    for (const { pos } of reach) {
      if (!affordableFrom(a, pos)) continue;
      const aims = isSelfBurst(a) ? [pos]
        : targets.filter(t => chebyshev(pos, t.pos) <= a.range && hasLineOfSight(pos, t.pos, floors)).map(t => t.pos);
      for (const aim of aims) {
        const area = affectedKeys(pos, aim, a.area, floors);
        const hits = targets.filter(m => area.has(posKey(m.pos)));
        if (hits.length >= 2 && hits.length > (bestAoe?.hits.length ?? 0)) bestAoe = { pos, a, aim, hits };
      }
    }
  }
  // The highest-priority foe it hits is the one shown as targeted
  if (bestAoe) return act(moveTo(bestAoe.pos), bestAoe.a, bestAoe.hits[0].key, bestAoe.aim);

  // 1b. Otherwise the first target + single-target attack it can land this turn, from the nearest tile that works
  for (const target of targets) {
    for (const a of attacks.filter(a => !isArea(a))) {
      for (const { pos } of reach) {
        if (!affordableFrom(a, pos)) continue;
        if (chebyshev(pos, target.pos) > a.range || !hasLineOfSight(pos, target.pos, floors)) continue;
        return act(moveTo(pos), a, target.key, target.pos);
      }
    }
  }

  // 2. No attack lands this turn: a self ability, if it has one it can use
  const self = usable.find(a => a.target === 'self');
  if (self) return selfAction(self);

  // 3. Otherwise close in
  return closeIn();
}
