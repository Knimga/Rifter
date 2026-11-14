import { bodySize, isArmed, isImmobile, type EnemyInstance } from '../units/enemies';
import { mpCostAt, summonsForever, type Ability, type Effect } from './abilities';
import { aimedArea, isArea, isSelfBurst, unitsInArea } from './areas';
import { bodyDistance, bodySight, covers, fits, footprint, footprintKeys, inRangeAndSight, posKey, reachableTiles, samePos, type Body, type Pos } from '../world/grid';
import { shuffle } from '../random';
import type { ZoneData } from '../world/gen';
import { moveBudget, moveCost } from './combat';
import { planAbilityMove, rootBlocks, type MovePlan, type MoveWorld } from './abilityMoves';
import { isRooted, stackCap, stackCount, stackKey, type ActiveBuff } from '../units/stats';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A unit the AI fights: a party member or summoned ally (for an enemy), an enemy (for a summoned ally). */
export interface Foe extends Body {
  key: string;  // unitKey: identifies it in the result, and its threat (CombatState.threat)
  hp: number;
  /**
   * Its active buffs and debuffs: a buff isn't cast on a friend that already has it, and a capped buff or debuff isn't
   * put on a foe that already has all its stacks (by source).
   */
  buffs?: readonly ActiveBuff[];
}

/**
 * A unit on its side, for its heals and buffs: another creature of its side, and (for a summoned ally) the party
 * members. Itself not included.
 */
export interface Friend extends Foe {
  maxHp: number;
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
  /**
   * Set when `abilityUsed` is a movement ability (Ability.move): where it takes its caster, from where it stands (`moveTo`
   * is then null: the move is the ability's, resolved with executeMoveAction). `abilityTargetPos` is its aim.
   */
  move?: MovePlan;
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

/** Whether an ability puts a lasting effect on its target: a buff, or an aura (a self or ally one the AI casts as a buff). */
const isBuffing = (a: Ability) => a.effects.some(e => e.type === 'buff' || e.type === 'aura');

/**
 * Whether a unit already has all of ability `a`'s lasting effects it can use (it isn't cast on it again): of its buff,
 * its maxStacks if the buff sets one, else one stack (recasting an uncapped buff just to stack it is no use to the AI);
 * of its aura, the aura itself, until it runs out.
 */
const hasBuffFrom = (buffs: readonly ActiveBuff[] | undefined, a: Ability) => {
  const eff = a.effects.find((e): e is Extract<Effect, { type: 'buff' }> => e.type === 'buff');
  const hasAura = a.effects.some(e => e.type === 'aura');
  if (!eff && !hasAura) return false;
  const cap = eff ? stackCap(eff) : 1;
  const buffFull = !eff || stackCount(buffs ?? [], stackKey(a.name, eff)) >= (Number.isFinite(cap) ? cap : 1);
  const auraHeld = !hasAura || !!buffs?.some(b => b.aura && b.source === a.name);
  return buffFull && auraHeld;
};

/**
 * Whether a foe already has all the stacks it can of a buff or debuff that ability `a` puts on its target (one with a
 * cap: maxStacks, or a trigger): `a` isn't used on it again, since that would only replace a stack. An uncapped one
 * never is.
 */
const atStackCap = (buffs: readonly ActiveBuff[] | undefined, a: Ability) => a.effects.some(e =>
  (e.type === 'buff' || e.type === 'debuff') && e.appliesTo === 'target' && Number.isFinite(stackCap(e)) &&
  stackCount(buffs ?? [], stackKey(a.name, e)) >= stackCap(e));

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
 *     An attack that puts a capped buff or debuff on its target (maxStacks) is never aimed at a foe that already
 *     has all its stacks, and an area one doesn't count such foes among its hits.
 *     Movement abilities (Ability.move) with an enemy target are attacks like the rest, used from where it stands
 *     (never after a walk), aimed where planAbilityMove allows: a single-target one (a charge) at a foe, only if it
 *     actually moves it (when it has a plain attack too), and it replaces a plain attack on the same foe only when it
 *     costs less AP; an area one (a line, a blast) is aimed like any area attack, at the tile (any in range) whose
 *     area takes in the most foes, so a line is aimed to run through as many as it can.
 *  2. If its preferred ability this turn is a buff (a self one not yet active, or an ally one with a unit of its
 *     side in reach that hasn't got it: the one nearest its foes; an area one only where it takes in another
 *     unit of its side, as many as it can), it uses that instead, so buffs and attacks
 *     share its turns by chance. If it can attack no one, it uses a usable self ability or ally buff if it has
 *     one.
 *  3. Otherwise it closes in on the highest-priority foe it can get nearer to: by walking, or by a 'tile' movement
 *     ability (a leap, a blink, a flight) when that gets it nearer for less AP per tile than walking would (walking
 *     tiles already paid for is free, so it wins). A rooted creature uses neither.
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
  /** The zone: its floor (where it can stand) and the tiles sight passes over (what it can see and hit across). */
  { floors, sight }: Pick<ZoneData, 'floors' | 'sight'>,
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
  // Movement abilities (Ability.move: a teleport, a charge, a dash) share the party's rules (abilityMoves.ts); a rooted
  // creature can't use one (rootBlocks), nor an immobile one (a totem). An enemy-target one is an attack (charges, line
  // or blast rushes); a 'tile' one only closes the distance (`movers`). Any other (an 'ally' or 'self' one) is never
  // used (warnCreatureMoves).
  const owned = enemy.classData.abilities.filter(a => !a.summonsOnly && !(a.move && isImmobile(enemy)) && !rootBlocks(a, enemy.buffs));
  const movers = owned.filter(a => a.move && a.target === 'tile');
  const abilities = owned.filter(a => !a.move || a.target === 'enemy');
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
  const reachIn = (apUsed: number) => reachableTiles(enemy.pos, moveBudget(paidTiles, apUsed, movement, isRooted(enemy.buffs) || isImmobile(enemy)), isFloor, p => foeTiles.has(posKey(p)), size);
  const standsAt = (r: { pos: Pos }) => fits(r.pos, size, p => isFloor(p) && !units.has(posKey(p)));
  const reachMap = reachIn(Math.min(ap, 1));
  const reach = [...reachMap.values()].filter(standsAt);
  // A large creature stops only where it fits, so a narrow way longer than one move's worth would hold it up: to
  // close in it may spend all its AP on one move (3). Shortest walks, so the steps agree with the 1-AP ones.
  const longMap = size > 1 && ap > 1 ? reachIn(ap) : reachMap;
  const moveOf = (pos: Pos) => moveCost(longMap.get(posKey(pos))?.steps ?? 0, paidTiles, movement);
  const moveTo = (pos: Pos) => (samePos(pos, enemy.pos) ? null : pos);

  // A step: where it moves (null = stays), then the ability it uses there, if any; what that costs
  const act = (moveTo: Pos | null, ability: Ability | null, targetKey: string | null, abilityTargetPos: Pos | null, plan?: MovePlan): EnemyAction => {
    const move = moveTo ? moveOf(moveTo) : { apSpent: 0, tilesLeft: paidTiles };
    return { moveTo, targetKey, abilityUsed: ability, abilityTargetPos, apSpent: move.apSpent + (ability?.apCost ?? 0), tilesLeft: move.tilesLeft, ...(plan && { move: plan }) };
  };
  // Movement abilities, from where it stands: the units that block or bar a path (its foes, and its own side)
  const moveWorld: MoveWorld = { sight, isWalkable: isFloor, hostiles: occupied.filter(u => !u.passable), allies: occupied.filter(u => u.passable) };
  const planFor = (a: Ability, aim: Pos) => planAbilityMove(me(enemy.pos), aim, a, moveWorld);
  // The tiles in sight within a movement ability's range of it: where it may be aimed
  const aimsOf = (a: Ability): Pos[] => {
    const out: Pos[] = [];
    const body = me(enemy.pos);
    for (let dx = -a.range; dx < size + a.range; dx++) {
      for (let dy = -a.range; dy < size + a.range; dy++) {
        const p = { x: enemy.pos.x + dx, y: enemy.pos.y + dy };
        if (!covers(body, p) && sight.has(posKey(p))) out.push(p);
      }
    }
    return out;
  };
  // Can it move to `pos` and use `a` there, on what it has left?
  const affordableFrom = (a: Ability, pos: Pos) => a.apCost + moveOf(pos).apSpent <= ap;
  const canUse = (a: Ability) => enemy.currentMp >= mpCostAt(a, enemy.level) && a.apCost <= ap;
  const selfAction = (a: Ability): EnemyAction => act(null, a, enemy.id, { ...enemy.pos });
  // Is `to` (a unit or a tile) within `range` of it standing at `from`, and in sight?
  const inReach = (from: Pos, to: Pos | Body, range: number) => inRangeAndSight(me(from), to, range, sight);
  // Itself, as a unit of its side
  const self: Friend = {
    key: enemy.id, pos: enemy.pos, size, hp: enemy.currentHp, maxHp: enemy.stats.hp, buffs: enemy.buffs,
    armed: isArmed(enemy.classData),
  };
  // The tiles an area ability it uses standing at `pos`, aimed at `aim`, takes in (aimedArea, with everyone else in place)
  const areaFrom = (a: Ability, pos: Pos, aim: Pos) => aimedArea(me(pos), aim, a.area, sight, [...targets, ...side.friends]);

  // 3. Close in on the highest-priority target it can get nearer to (distance over floor, ignoring units,
  //    so enemies queue up behind each other in a corridor rather than wander off)
  //    Not when one of its attacks already reaches a target from where it stands (it only lacks the AP this
  //    turn): a ranged enemy keeps its distance instead of walking up to the party with AP left over. With no
  //    attack it can afford (out of MP), all its attacks count: it waits in range for its MP to come back.
  //    Already beside a target it can't get nearer to that one, so it stays rather than turn to the next one
  //    (which, on its next step, would leave it no longer beside the first: back and forth until its AP is out).
  const closeIn = (): EnemyAction => {
    const allAttacks = abilities.filter(a => a.target === 'enemy' && !a.move);
    const affordable = allAttacks.filter(a => mpCostAt(a, enemy.level) <= enemy.currentMp);
    const counted = affordable.length > 0 ? affordable : allAttacks;
    const attacksFrom = (pos: Pos, t: Foe) => counted.some(a => inReach(pos, t, a.range) && !atStackCap(t.buffs, a));
    if (targets.some(t => attacksFrom(enemy.pos, t))) return noAction;
    // One move's worth first; a large creature with nowhere nearer it fits on that, as far as its AP takes it
    const reaches = longMap === reachMap ? [reach] : [reach, [...longMap.values()].filter(standsAt)];
    for (const stops of reaches) {
      for (const target of targets) {
        if (bodyDistance(me(enemy.pos), target) <= 1) return noAction;
        const toTarget = reachableTiles(target.pos, Infinity, isFloor);
        // A large body is as near as its nearest tile
        const stepsFrom = (p: Pos) => Math.min(...footprint(me(p)).map(t => toTarget.get(posKey(t))?.steps ?? Infinity));
        const here = stepsFrom(enemy.pos);
        let best: Pos | null = null, bestSteps = here;
        for (const { pos } of stops) {
          const s = stepsFrom(pos);
          if (s < bestSteps) { best = pos; bestSteps = s; }
        }
        // A movement ability that gets it nearer for less AP per tile than the walk (a free walk, on tiles already
        // paid for, always wins), of the ability that gains the most per AP. Its landing: one from which an attack of
        // its reaches the target, the farthest of those (a ranged creature keeps its distance, as it does walking),
        // else the nearest; then the shortest move.
        // (no walk nearer, e.g. walled off or blocked by units: any jump that gains beats it)
        const walkAp = best ? moveOf(best).apSpent : 0;
        const walkRate = !best ? 0 : walkAp > 0 ? (here - bestSteps) / walkAp : Infinity;
        let jump: { a: Ability; aim: Pos; plan: MovePlan; rate: number } | null = null;
        for (const a of movers.filter(canUse)) {
          let landing: { aim: Pos; plan: MovePlan; steps: number; attacks: boolean } | null = null;
          for (const aim of aimsOf(a)) {
            const plan = planFor(a, aim);
            if (!plan || plan.path.length === 0) continue;
            const steps = stepsFrom(plan.landing);
            if (steps >= here) continue;
            const attacks = attacksFrom(plan.landing, target);
            const better = !landing ? true
              : attacks !== landing.attacks ? attacks
              : steps !== landing.steps ? (attacks ? steps > landing.steps : steps < landing.steps)
              : plan.path.length < landing.plan.path.length;
            if (better) landing = { aim, plan, steps, attacks };
          }
          if (!landing) continue;
          const rate = (here - landing.steps) / a.apCost;
          if (rate > walkRate && rate > (jump?.rate ?? 0)) jump = { a, aim: landing.aim, plan: landing.plan, rate };
        }
        if (jump) return act(null, jump.a, null, jump.aim, jump.plan);
        if (best) return act(best, null, null, null);
      }
    }
    return noAction;
  };

  // 0a. Heal the most hurt unit of its side below half HP that one of its heals reaches: itself (a self heal,
  //     or an ally heal where it stands), or another (an ally heal, from the nearest tile in range and sight)
  const heals = abilities.filter(a => isHeal(a) && canUse(a));
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
        if (covers(body, p) || !isFloor(p) || units.has(posKey(p)) || !bodySight(body, p, sight)) continue;
        const d = bodyDistance(p, targets[0]);
        if (d < bestDist) { best = p; bestDist = d; }
      }
    }
    return best && act(null, a, null, best);
  };
  // (never a forever summon: the party's only, warnCreatureForeverSummons)
  const summons = shuffle(abilities.filter(a => summonOf(a) && !summonsForever(a) && canUse(a)));
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
  const usable = shuffle(abilities.filter(a => {
    if (!canUse(a) || isHeal(a) || summonOf(a)) return false;
    if (a.target === 'self') {
      // Don't re-apply a buff it already has in full (hasBuffFrom)
      if (isBuffing(a)) return !hasBuffFrom(enemy.buffs, a);
      return true;
    }
    // An ally buff, if someone in reach still lacks it (or a stack of it)
    if (a.target === 'ally') return isBuffing(a) && allyBuffAction(a) !== null;
    return a.target === 'enemy';
  }));
  if (usable[0]?.target === 'self') return selfAction(usable[0]);
  if (usable[0]?.target === 'ally') return allyBuffAction(usable[0])!;

  const attacks = usable.filter(a => a.target === 'enemy');

  // 1a. An area attack that hits 2+ foes beats any single-target attack. Of those, the one that
  //     hits the most, then from the nearest tile. A burst from self (isSelfBurst) is aimed at the tile it
  //     stands on; other area attacks at a foe in range and sight.
  //     A unit whose abilities are all area attacks uses them on one foe too (it has nothing else).
  const minAoeHits = abilities.filter(a => a.target === 'enemy').every(isArea) ? 1 : 2;
  //     A movement ability (a line or blast rush) is used from where it stands, aimed at any tile it may go to
  //     (planAbilityMove), the one whose area takes in the most foes (a line runs from its tile to the aim).
  let bestAoe: { pos: Pos; a: Ability; aim: Pos; hits: typeof targets; plan?: MovePlan } | null = null;
  for (const a of attacks.filter(isArea)) {
    for (const { pos } of a.move ? [{ pos: enemy.pos }] : reach) {
      if (!affordableFrom(a, pos)) continue;
      const aims: { aim: Pos; plan?: MovePlan }[] = a.move
        ? aimsOf(a).flatMap(aim => { const plan = planFor(a, aim); return plan ? [{ aim, plan }] : []; })
        : (isSelfBurst(a) ? [pos] : targets.filter(t => inReach(pos, t, a.range)).map(t => t.pos)).map(aim => ({ aim }));
      for (const { aim, plan } of aims) {
        // Foes that already have all the stacks of its buff or debuff don't count (atStackCap)
        const hits = unitsInArea(areaFrom(a, pos, aim), targets).filter(t => !atStackCap(t.buffs, a));
        if (hits.length >= minAoeHits && hits.length > (bestAoe?.hits.length ?? 0)) bestAoe = { pos, a, aim, hits, plan };
      }
    }
  }
  // The highest-priority foe it hits is the one shown as targeted
  if (bestAoe) return act(moveTo(bestAoe.pos), bestAoe.a, bestAoe.hits[0].key, bestAoe.aim, bestAoe.plan);

  // 1b. Otherwise the first target + single-target attack it can land this turn, from the nearest tile that works
  //     (never one whose buff or debuff the target already has all the stacks of: atStackCap). A charge (a
  //     single-target movement ability) takes the place of that attack only if it costs less AP, and is never used
  //     when it wouldn't move it, unless it has no plain attack.
  const hasPlainAttack = abilities.some(a => a.target === 'enemy' && !a.move);
  for (const target of targets) {
    const options: EnemyAction[] = [];
    const landable = attacks.filter(a => !isArea(a) && !atStackCap(target.buffs, a));
    plain: for (const a of landable.filter(a => !a.move)) {
      for (const { pos } of reach) {
        if (!affordableFrom(a, pos) || !inReach(pos, target, a.range)) continue;
        options.push(act(moveTo(pos), a, target.key, target.pos));
        break plain;
      }
    }
    for (const a of landable.filter(a => a.move)) {
      const plan = planFor(a, target.pos);
      if (plan && (plan.path.length > 0 || !hasPlainAttack)) options.push(act(null, a, target.key, target.pos, plan));
    }
    // No attack lands as it is: an area movement ability that takes in this foe closes in and hits it (the area itself
    // is saved for 2+ foes otherwise, above)
    if (options.length === 0) {
      for (const a of attacks.filter(a => isArea(a) && a.move && !atStackCap(target.buffs, a))) {
        const plan = planFor(a, target.pos);
        if (plan && plan.path.length > 0 && unitsInArea(areaFrom(a, enemy.pos, target.pos), [target]).length > 0) options.push(act(null, a, target.key, target.pos, plan));
      }
    }
    // The cheapest in AP; the plain attack (first) when equal
    if (options.length > 0) return options.reduce((best, o) => (o.apSpent < best.apSpent ? o : best));
  }

  // 2. No attack lands this turn: a self ability or ally buff, if it has one it can use
  const support = usable.find(a => a.target === 'self' || a.target === 'ally');
  if (support) return support.target === 'self' ? selfAction(support) : allyBuffAction(support)!;

  // 3. Otherwise close in
  return closeIn();
}
