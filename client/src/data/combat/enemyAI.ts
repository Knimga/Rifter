import { bodySize, isArmed, type EnemyInstance } from '../units/enemies';
import type { Ability, Effect } from './abilities';
import { aimedArea, isArea, isSelfBurst, unitsInArea } from './areas';
import { bodyDistance, bodySight, covers, fits, footprint, footprintKeys, inRangeAndSight, posKey, reachableTiles, samePos, type Body, type Pos } from '../world/grid';
import { shuffle } from '../random';
import { moveBudget, moveCost } from './combat';
import { isRooted, stackCap, stackCount, stackKey, type ActiveBuff } from '../units/stats';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A unit the AI fights: a party member or summoned ally (for an enemy), an enemy (for a summoned ally). */
export interface Foe extends Body {
  key: string;  // unitKey: identifies it in the result, and its threat (CombatState.threat)
  hp: number;
}

/**
 * A unit on its side, for its heals and buffs: another creature of its side, and (for a summoned ally) the party
 * members. Itself not included.
 */
export interface Friend extends Foe {
  maxHp: number;
  /** Its active buffs: an ally buff isn't cast on a unit that already has it (by source). */
  buffs?: readonly ActiveBuff[];
  /** It attacks with a physical weapon (a held weapon, a useWeapon ability): a weaponOnly trigger is any use to it. */
  armed?: boolean;
}

/** What the AI knows of its own side. */
export interface AISide {
  friends: Friend[];
  /** Its living summoned creatures, counted by the ability that summoned them. */
  summonsOut: Record<string, number>;
}

export interface EnemyAction {
  moveTo: Pos | null;               // final position after movement (null = stayed put)
  targetKey: string | null;         // the unit it aims at (a foe, or the ally it heals); null = none
  abilityUsed: Ability | null;      // ability to use; null = no attack possible
  abilityTargetPos: Pos | null;     // tile the ability is aimed at (its own for self, the target's, or a summon's tile)
  apSpent: number;                  // AP the step costs: its move (combat.ts moveCost) plus its ability
  tilesLeft: number;                // tiles paid for and not walked after it
}

/** Below this share of its max HP a unit is worth healing (the AI heals before anything else). */
const HEAL_BELOW = 0.5;

/** Foes with at least this share of the top threat are its picks (one at random: pickFocus). */
const FOCUS_THREAT_SHARE = 0.8;

/**
 * The foe a creature goes after this turn: one at random of the top of the threat table (threat within 20% of the
 * highest). None when no one holds threat (a summoned ally's foes): it then goes by distance.
 */
export function pickFocus(foes: Foe[], threat: Record<string, number>): string | undefined {
  const living = foes.filter(f => f.hp > 0);
  const top = Math.max(0, ...living.map(f => threat[f.key] ?? 0));
  if (top <= 0) return undefined;
  return shuffle(living.filter(f => (threat[f.key] ?? 0) >= top * FOCUS_THREAT_SHARE))[0]?.key;
}

/** A heal: a self or ally ability that heals (or heals over time). */
const isHeal = (a: Ability) => (a.target === 'self' || a.target === 'ally') && a.effects.some(e => e.type === 'heal' || e.type === 'hot');

/**
 * Whether a unit already has all the stacks of ability `a`'s buff it can use (it isn't cast on it again): its
 * maxStacks if the buff sets one, else one (recasting an uncapped buff just to stack it is no use to the AI).
 */
const hasBuffFrom = (buffs: readonly ActiveBuff[] | undefined, a: Ability) => {
  const eff = a.effects.find((e): e is Extract<Effect, { type: 'buff' }> => e.type === 'buff');
  if (!eff) return false;
  const cap = stackCap(eff);
  return stackCount(buffs ?? [], stackKey(a.name, eff)) >= (Number.isFinite(cap) ? cap : 1);
};

/** Whether a buff ability sets a weaponOnly trigger (only worth casting on a unit that is armed). */
const buffsWeapon = (a: Ability) => a.effects.some(e => e.type === 'buff' && !!e.trigger?.weaponOnly);

/** Whether a buff ability's trigger rewards its caster ('source': e.g. Master's Bond), so it goes only on others. */
const rewardsCaster = (a: Ability) => a.effects.some(e => e.type === 'buff' && !!e.trigger?.effects.some(t => t.appliesTo === 'source'));

/** An ability's summon effect, if it summons. */
const summonOf = (a: Ability) => a.effects.find((e): e is Extract<Effect, { type: 'summon' }> => e.type === 'summon');

// ─── AI ──────────────────────────────────────────────────────────────────────

/**
 * One step of a creature's turn (a move and/or an ability): the best thing it can actually do with the AP it
 * has left, falling back when it can't do what it would prefer. Its turn repeats steps until it runs out of
 * AP or has nothing useful to do (useEnemyTurn), so with 3 AP it may move and attack twice, or move twice.
 * The same AI runs enemies (their foes: the party and its summoned allies) and summoned allies (their foes:
 * the enemies); below, "foes" are whichever it fights, and its "side" the units fighting with it.
 *
 *  0. Before anything else:
 *     a. Heal: with a heal it can use, a unit of its side below half HP (itself, for a self heal; itself or
 *        an ally in reach, for an ally heal) is healed, the most hurt first.
 *     b. Summon: with fewer out than a summon of its allows (its max), it casts it (a summoner fills its cap,
 *        one a step, before it fights; a summon it can't afford or place now waits).
 *  1. Attack, from a tile it can reach this step (by the shared movement rules: reachableTiles, through its
 *     own side but never its foes, never stopping on anyone; at most one more move's worth of tiles, 1 AP),
 *     moving as little as needed:
 *     a. An area attack that hits 2+ foes comes first (1+ when area attacks are all it has, e.g. an exploding
 *        spore): the one hitting the most. A burst from self (range 0: isSelfBurst) hits around the tile it
 *        stands on, so it moves to where the burst catches the most; other area attacks are aimed at a foe in
 *        range and sight.
 *     b. Otherwise a single-target attack: foes in priority order (its focus for the turn, pickFocus, then
 *        highest threat, then closest, then random), and for each, its usable attacks in a random preferred
 *        order. So a high-threat foe walled off behind others gives way to the next target it can reach.
 *     Otherwise area attacks are never used on a single foe: it saves them (and their MP) for a better chance.
 *  2. If its preferred ability this turn is a buff (a self one not yet active, or an ally one with a unit of its
 *     side in reach that hasn't got it: the one nearest its foes; an area one only where it takes in another
 *     unit of its side, as many as it can), it uses that instead, so buffs and attacks
 *     share its turns by chance. If it can attack no one, it uses a usable self ability or ally buff if it has
 *     one.
 *  3. Otherwise it closes in on the highest-priority foe it can get nearer to.
 * All within its AP, by the party's rules (combat.ts): 1 AP buys a move's worth of tiles (unused ones carry
 * over to its next step), an ability costs its apCost.
 */
export function computeEnemyTurn(
  enemy: EnemyInstance,
  foes: Foe[],
  /**
   * Every other unit (either side), its body: it never stops on one, and walks through only its own side's
   * (`passable`).
   */
  occupied: (Body & { passable: boolean })[],
  floors: Set<string>,
  /** Foes' threat, by key (CombatState.threat); none = 0. Enemies hold none, so a summon picks the closest. */
  threat: Record<string, number> = {},
  /** Floor tiles a map object stands on (the rift): it can't walk onto or through them (sight isn't blocked). */
  objectTiles: ReadonlySet<string> = new Set(),
  /** What it has left this turn: AP, and tiles already paid for (combat.ts moveCost). Default: a fresh turn. */
  budget: { ap: number; paidTiles: number } = { ap: enemy.stats.apMax, paidTiles: 0 },
  /** Its side (heal targets) and its summons out. Default: alone, nothing summoned. */
  side: AISide = { friends: [], summonsOut: {} },
  /** The foe it picked for this turn (pickFocus, once per turn so its steps agree): first in priority. */
  focus?: string,
): EnemyAction {
  const { ap, paidTiles } = budget;
  const noAction: EnemyAction = { moveTo: null, targetKey: null, abilityUsed: null, abilityTargetPos: null, apSpent: 0, tilesLeft: paidTiles };

  // Targets by priority: its focus → highest threat → closest if tied → random if still tied
  // (shuffle first so the stable sort breaks remaining ties randomly)
  // Its body standing at `pos` (a large creature's square has `pos` as its top-left tile)
  const size = bodySize(enemy.classData);
  const me = (pos: Pos): Body => ({ pos, size });
  const targets = shuffle(foes.filter(m => m.hp > 0))
    .sort((a, b) =>
      (Number(b.key === focus) - Number(a.key === focus)) ||
      ((threat[b.key] ?? 0) - (threat[a.key] ?? 0)) ||
      (bodyDistance(me(enemy.pos), a) - bodyDistance(me(enemy.pos), b)));
  if (targets.length === 0) return noAction;

  // Where it can stand after this step (nearest first, its own tile included): over floor, through its own side
  // but never its foes or a map object, never on anyone, within the tiles it has paid for plus one more move
  // (1 AP), if it has the AP. A large creature squeezes through narrow ways, but stops only where it fits.
  const movement = enemy.stats.movement;
  const isFloor = (p: Pos) => floors.has(posKey(p)) && !objectTiles.has(posKey(p));
  const units = new Set(occupied.flatMap(footprintKeys));
  const foeTiles = new Set(occupied.filter(u => !u.passable).flatMap(footprintKeys));
  const reachIn = (apUsed: number) => reachableTiles(enemy.pos, moveBudget(paidTiles, apUsed, movement, isRooted(enemy.buffs)), isFloor, p => foeTiles.has(posKey(p)), size);
  const standsAt = (r: { pos: Pos }) => fits(r.pos, size, p => isFloor(p) && !units.has(posKey(p)));
  const reachMap = reachIn(Math.min(ap, 1));
  const reach = [...reachMap.values()].filter(standsAt);
  // A large creature stops only where it fits, so a narrow way longer than one move's worth would hold it up: to
  // close in it may spend all its AP on one move (3). Shortest walks, so the steps agree with the 1-AP ones.
  const longMap = size > 1 && ap > 1 ? reachIn(ap) : reachMap;
  const moveOf = (pos: Pos) => moveCost(longMap.get(posKey(pos))?.steps ?? 0, paidTiles, movement);
  const moveTo = (pos: Pos) => (samePos(pos, enemy.pos) ? null : pos);

  // A step: where it moves (null = stays), then the ability it uses there, if any; what that costs
  const act = (moveTo: Pos | null, ability: Ability | null, targetKey: string | null, abilityTargetPos: Pos | null): EnemyAction => {
    const move = moveTo ? moveOf(moveTo) : { apSpent: 0, tilesLeft: paidTiles };
    return { moveTo, targetKey, abilityUsed: ability, abilityTargetPos, apSpent: move.apSpent + (ability?.apCost ?? 0), tilesLeft: move.tilesLeft };
  };
  // Can it move to `pos` and use `a` there, on what it has left?
  const affordableFrom = (a: Ability, pos: Pos) => a.apCost + moveOf(pos).apSpent <= ap;
  const canUse = (a: Ability) => enemy.currentMp >= a.mpCost && a.apCost <= ap;
  const selfAction = (a: Ability): EnemyAction => act(null, a, enemy.id, { ...enemy.pos });
  // Is `to` (a unit or a tile) within `range` of it standing at `from`, and in sight?
  const inReach = (from: Pos, to: Pos | Body, range: number) => inRangeAndSight(me(from), to, range, floors);
  // Itself, as a unit of its side
  const self: Friend = {
    key: enemy.id, pos: enemy.pos, size, hp: enemy.currentHp, maxHp: enemy.stats.hp, buffs: enemy.buffs,
    armed: isArmed(enemy.classData),
  };
  // The tiles an area ability it uses standing at `pos`, aimed at `aim`, takes in (aimedArea, with everyone else in place)
  const areaFrom = (a: Ability, pos: Pos, aim: Pos) => aimedArea(me(pos), aim, a.area, floors, [...targets, ...side.friends]);

  // 3. Close in on the highest-priority target it can get nearer to (distance over floor, ignoring units,
  //    so enemies queue up behind each other in a corridor rather than wander off)
  //    Not when one of its attacks already reaches a target from where it stands (it only lacks the AP this
  //    turn): a ranged enemy keeps its distance instead of walking up to the party with AP left over.
  const closeIn = (): EnemyAction => {
    const inRangeNow = enemy.classData.abilities.some(a => a.target === 'enemy' && a.mpCost <= enemy.currentMp &&
      targets.some(t => inReach(enemy.pos, t, a.range)));
    if (inRangeNow) return noAction;
    // One move's worth first; a large creature with nowhere nearer it fits on that, as far as its AP takes it
    const reaches = longMap === reachMap ? [reach] : [reach, [...longMap.values()].filter(standsAt)];
    for (const stops of reaches) {
      for (const target of targets) {
        const toTarget = reachableTiles(target.pos, Infinity, isFloor);
        // A large body is as near as its nearest tile
        const stepsFrom = (p: Pos) => Math.min(...footprint(me(p)).map(t => toTarget.get(posKey(t))?.steps ?? Infinity));
        let best: Pos | null = null, bestSteps = stepsFrom(enemy.pos);
        for (const { pos } of stops) {
          const s = stepsFrom(pos);
          if (s < bestSteps) { best = pos; bestSteps = s; }
        }
        if (best) return act(best, null, null, null);
      }
    }
    return noAction;
  };

  // 0a. Heal the most hurt unit of its side below half HP that one of its heals reaches: itself (a self heal,
  //     or an ally heal where it stands), or another (an ally heal, from the nearest tile in range and sight)
  const heals = enemy.classData.abilities.filter(a => isHeal(a) && canUse(a));
  if (heals.length > 0) {
    const hurt = [self, ...side.friends]
      .filter(f => f.hp > 0 && f.hp / f.maxHp < HEAL_BELOW)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    for (const f of hurt) {
      for (const a of heals) {
        if (f.key === self.key) return selfAction(a);
        if (a.target !== 'ally') continue;
        for (const { pos } of reach) {
          if (!affordableFrom(a, pos) || !inReach(pos, f, a.range)) continue;
          return act(moveTo(pos), a, f.key, f.pos);
        }
      }
    }
  }

  // A summon, cast where it stands: a self one beside it, a 'tile' one on the free tile in range and sight
  // nearest its highest-priority foe (none free: it can't)
  const summonAction = (a: Ability): EnemyAction | null => {
    if (a.target !== 'tile') return selfAction(a);
    let best: Pos | null = null, bestDist = Infinity;
    const body = me(enemy.pos);
    for (let dx = -a.range; dx < size + a.range; dx++) {
      for (let dy = -a.range; dy < size + a.range; dy++) {
        const p = { x: enemy.pos.x + dx, y: enemy.pos.y + dy };
        if (covers(body, p) || !isFloor(p) || units.has(posKey(p)) || !bodySight(body, p, floors)) continue;
        const d = bodyDistance(p, targets[0]);
        if (d < bestDist) { best = p; bestDist = d; }
      }
    }
    return best && act(null, a, null, best);
  };
  const summons = shuffle(enemy.classData.abilities.filter(a => summonOf(a) && canUse(a)));
  const out = (a: Ability) => side.summonsOut[a.name] ?? 0;

  // 0b. Fewer out than a summon allows: summon (a summoner fills its cap before anything else)
  for (const a of summons) {
    if (out(a) >= (summonOf(a)?.max ?? 1)) continue;
    const s = summonAction(a);
    if (s) return s;
  }

  // An ally buff: on the unit of its side (itself too) without it that stands nearest its foes, from the nearest
  // tile in range and sight; null if no one in reach is left to buff. A weapon buff only goes on an armed unit, one
  // that rewards its caster (rewardsCaster) never on itself.
  // An area one (e.g. Battlechant) is cast from the tile and aim whose area takes in the most units still without
  // it (the nearest tile of those), and only when that includes another unit of its side: never for itself alone.
  const allyBuffs = new Map<Ability, EnemyAction | null>();
  const allyBuffAction = (a: Ability): EnemyAction | null => {
    if (allyBuffs.has(a)) return allyBuffs.get(a)!;
    const needs = (f: Friend) => f.hp > 0 && !hasBuffFrom(f.buffs, a) && (!buffsWeapon(a) || f.armed) && (f.key !== self.key || !rewardsCaster(a));
    let action: EnemyAction | null = null;
    if (isArea(a)) {
      let most = 0;
      for (const { pos } of reach) {
        if (!affordableFrom(a, pos)) continue;
        const sideHere = [{ ...self, pos }, ...side.friends];
        const aims = isSelfBurst(a) ? [pos]
          : sideHere.filter(f => f.hp > 0 && inReach(pos, f, a.range)).map(f => f.pos);
        for (const aim of aims) {
          const gain = unitsInArea(areaFrom(a, pos, aim), sideHere).filter(needs);
          if (gain.length > most && gain.some(f => f.key !== self.key)) {
            most = gain.length;
            action = act(moveTo(pos), a, gain[0].key, aim);
          }
        }
      }
    } else {
      const toFoes = (f: Friend) => Math.min(...targets.map(t => bodyDistance(f, t)));
      const candidates = [self, ...side.friends].filter(needs).sort((x, y) => toFoes(x) - toFoes(y));
      for (const f of candidates) {
        if (f.key === self.key) { action = selfAction(a); break; }
        const from = reach.find(({ pos }) => affordableFrom(a, pos) && inReach(pos, f, a.range));
        if (from) { action = act(moveTo(from.pos), a, f.key, f.pos); break; }
      }
    }
    allyBuffs.set(a, action);
    return action;
  };

  // Abilities it can use now, in this turn's (random) order of preference (heals and summons have their own rules)
  const usable = shuffle(enemy.classData.abilities.filter(a => {
    if (!canUse(a) || isHeal(a) || summonOf(a)) return false;
    if (a.target === 'self') {
      // Don't re-apply a buff it already has in full (hasBuffFrom)
      if (a.effects.some(e => e.type === 'buff')) return !hasBuffFrom(enemy.buffs, a);
      return true;
    }
    // An ally buff, if someone in reach still lacks it (or a stack of it)
    if (a.target === 'ally') return a.effects.some(e => e.type === 'buff') && allyBuffAction(a) !== null;
    return a.target === 'enemy';
  }));
  if (usable[0]?.target === 'self') return selfAction(usable[0]);
  if (usable[0]?.target === 'ally') return allyBuffAction(usable[0])!;

  const attacks = usable.filter(a => a.target === 'enemy');

  // 1a. An area attack that hits 2+ foes beats any single-target attack. Of those, the one that
  //     hits the most, then from the nearest tile. A burst from self (isSelfBurst) is aimed at the tile it
  //     stands on; other area attacks at a foe in range and sight.
  //     A unit whose abilities are all area attacks uses them on one foe too (it has nothing else).
  const minAoeHits = enemy.classData.abilities.filter(a => a.target === 'enemy').every(isArea) ? 1 : 2;
  let bestAoe: { pos: Pos; a: Ability; aim: Pos; hits: typeof targets } | null = null;
  for (const a of attacks.filter(isArea)) {
    for (const { pos } of reach) {
      if (!affordableFrom(a, pos)) continue;
      const aims = isSelfBurst(a) ? [pos]
        : targets.filter(t => inReach(pos, t, a.range)).map(t => t.pos);
      for (const aim of aims) {
        const hits = unitsInArea(areaFrom(a, pos, aim), targets);
        if (hits.length >= minAoeHits && hits.length > (bestAoe?.hits.length ?? 0)) bestAoe = { pos, a, aim, hits };
      }
    }
  }
  // The highest-priority foe it hits is the one shown as targeted
  if (bestAoe) return act(moveTo(bestAoe.pos), bestAoe.a, bestAoe.hits[0].key, bestAoe.aim);

  // 1b. Otherwise the first target + single-target attack it can land this turn, from the nearest tile that works
  for (const target of targets) {
    for (const a of attacks.filter(a => !isArea(a))) {
      for (const { pos } of reach) {
        if (!affordableFrom(a, pos) || !inReach(pos, target, a.range)) continue;
        return act(moveTo(pos), a, target.key, target.pos);
      }
    }
  }

  // 2. No attack lands this turn: a self ability or ally buff, if it has one it can use
  const support = usable.find(a => a.target === 'self' || a.target === 'ally');
  if (support) return support.target === 'self' ? selfAction(support) : allyBuffAction(support)!;

  // 3. Otherwise close in
  return closeIn();
}
