// Abilities: what a party member or creature can do on its turn (Ability), and the effects it has (Effect).
// Shared by player classes (units/classes.ts), enemies and summons (units/enemies.ts, units/summons.ts).
import type { IconType } from 'react-icons';
import type { ComponentType } from 'react';
import type { AttackCategory, DamageElement } from '../gear';
import type { BuffableStat } from '../units/stats';
import type { HitOutcome } from './attackResolution';

/**
 * What an ability is aimed at: an enemy, an ally (party member or summoned ally), the caster itself, or an
 * empty floor tile in range and sight ('tile': e.g. a summon that appears there).
 */
export type TargetType = 'enemy' | 'ally' | 'self' | 'tile';
export type AreaType = 'single' | 'blast1' | 'blast2' | 'line';
/**
 * Who an effect lands on: the ability's target(s) (on an enemy ability, every enemy in its area), the caster,
 * or 'allies': every unit on the caster's side in the ability's area (party members and summons for the
 * party, fellow creatures for an enemy; the caster too if it stands in it). Ally effects have no hit roll of their
 * own, so an area can damage enemies and heal allies at once. On an enemy-target ability, though, its 'caster'
 * effects happen only if it hits at least one target (executeAction): a drain that misses heals no one.
 * In a trigger's effects (Trigger), read from its bearer's side: 'target' is the other unit of the event (the
 * attacker, the one attacked, the healer or the one healed), 'caster' the bearer, and 'source' whoever put the
 * trigger's buff on the bearer (only there; skipped if that unit is gone). 'allies' has no area there.
 */
export type EffectTarget = 'target' | 'caster' | 'allies' | 'source';

type StatChanges = Partial<Record<BuffableStat, number>>;

export type Effect =
  // damagesMP: the damage goes to the target's MP instead of HP (scaled and reduced exactly like HP
  // damage; generates half the threat)
  | { type: 'damage';  appliesTo: EffectTarget; damageElement: DamageElement; minDamage: number; maxDamage: number; damagesMP?: boolean }
  // A DoT or HoT: each one landed is a stack, at most `maxStacks` of it on a unit at once (default: no limit), from any
  // caster; one more replaces the oldest (addTicking in units/stats.ts)
  | { type: 'dot';     appliesTo: EffectTarget; damageElement: DamageElement; damagePerTurn: number; turns: number; damagesMP?: boolean; maxStacks?: number }
  // restoresMP: it restores MP instead of HP (worked out exactly like an HP heal)
  | { type: 'heal';    appliesTo: EffectTarget; damageElement: DamageElement; minHeal: number; maxHeal: number; restoresMP?: boolean }
  | { type: 'hot';     appliesTo: EffectTarget; damageElement: DamageElement; healPerTurn: number; turns: number; maxStacks?: number }
  // A buff or debuff changes stats, and/or sets a trigger on the unit for its turns (Trigger). Each cast is a
  // stack: a unit can have at most `maxStacks` of it at once (default: no limit; one if it has a trigger), from
  // any caster; one more replaces the oldest (addBuffs in units/stats.ts).
  | { type: 'buff';    appliesTo: EffectTarget; damageElement?: DamageElement; stats?: StatChanges; statsPercent?: StatChanges; trigger?: Trigger; turns: number; maxStacks?: number }
  | { type: 'debuff';  appliesTo: EffectTarget; damageElement?: DamageElement; stats?: StatChanges; statsPercent?: StatChanges; trigger?: Trigger; turns: number; maxStacks?: number }
  // The caster's threat: `amount` flat, `percent` of their current threat; negative reduces it (to 0 at
  // least). Gains are scaled by the caster's threatMultiplier, reductions aren't (see applyThreatChange).
  | { type: 'threat'; appliesTo: EffectTarget; damageElement?: DamageElement; amount?: number; percent?: number }
  // Calls up a creature (by id: units/summons.ts SUMMON_CLASSES, or an enemy class), fighting on the caster's
  // side for `turns` of its own turns (combat only; it vanishes when combat ends; no XP or loot). On a 'tile' ability it
  // appears on the aimed tile; otherwise beside the caster. At most `max` of them out at once (default 1):
  // casting it with that many out replaces the oldest.
  // `turns: 'forever'` (party members only: enemies never use it, warnCreatureForeverSummons): it stays until it is
  // slain or the party leaves the dungeon. It outlasts fights, regenerates like everyone out of combat, marches with
  // the party behind its members (movement.ts marchParty), goes through doors with it, and rolls initiative when a
  // fight starts. It can also be cast out of combat (in a dungeon).
  | { type: 'summon'; appliesTo: 'caster'; damageElement?: DamageElement; creature: string; turns: number | 'forever'; max?: number }
  // Roots the unit in place for `turns` of its turns: it can't move (it can still attack and use abilities).
  // Lands like a debuff (on an enemy-targeting ability, only on a hit), and shows as one.
  | { type: 'root'; appliesTo: EffectTarget; damageElement?: DamageElement; turns: number }
  // An aura on its bearer for `turns` of the bearer's turns: while it lasts, its effects land on the units inside its
  // area around the bearer, and stay on them only while they are (Aura, data/combat/auras.ts). Lands like a buff: no
  // hit roll, so on a 'caster', 'allies' or an ally or self ability's 'target'. Recast, it refreshes (never stacks).
  | { type: 'aura'; appliesTo: EffectTarget; damageElement?: DamageElement; turns: number; aura: Aura }
  // Strips timed effects from the unit, the youngest first (`count` of them, default 1, or 'all'). Which kind depends on
  // whose side the unit is on, from the one using it: on a friendly unit it removes debuffs, roots and DoTs, on a hostile
  // one buffs, auras and HoTs. A buff or debuff application, a HoT and a DoT each count as one. It never takes gear
  // bonuses, an aura's effects on a unit inside it, or what the same action puts on. Lands like a debuff (on an
  // enemy-targeting ability, only on a hit); elsewhere with no roll (stats.ts pickDispelled).
  | { type: 'dispel'; appliesTo: EffectTarget; damageElement?: DamageElement; count?: number | 'all' };

/** Omit that keeps a union's members apart (the plain Omit merges them into one). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * One effect of an aura: a buff, debuff, HoT or DoT, and who it applies to (`appliesTo`, from the bearer's side: its
 * 'allies' or its 'enemies'). It has no turns of its own (it lasts while the unit is in the aura) and does not stack with
 * itself: a unit inside several copies of an aura has it once. A HoT or DoT ticks at the start of the unit's turns as
 * usual, only while it is inside; a buff or debuff counts at once.
 */
export type AuraEffect = DistributiveOmit<Extract<Effect, { type: 'buff' | 'debuff' | 'hot' | 'dot' }>, 'appliesTo' | 'turns' | 'maxStacks'>
  & { appliesTo: 'allies' | 'enemies' };

/**
 * An aura: the units within `area` of its bearer's body (a blast: 1 or 2 tiles round it, a large bearer's whole square)
 * get its effects, as long as they stay there. `includesBearer`: its 'allies' effects also land on the bearer.
 */
export interface Aura {
  area: Extract<AreaType, 'blast1' | 'blast2'>;
  includesBearer?: boolean;
  effects: AuraEffect[];
}

/**
 * A lasting effect a creature or a party member has for good (`passiveEffects` on CreatureClassData and ClassData): a
 * buff or debuff (stats, and/or a trigger), a root, an aura, a HoT or a DoT, written like an ability's effect of that
 * kind but with no `appliesTo` (it is on its bearer), `turns` (it never runs out) or `maxStacks` (it is one). It is on
 * the unit from the start (stats.ts passiveEffectEntries), shows no marker and cannot be dispelled; a trigger's bearer
 * put it on itself, so its effects on 'source' land on the bearer and its own bonuses count (as on a self-cast trigger
 * buff). Amounts are as written: a HoT or DoT is not scaled by the bearer's stats, and a DoT builds no threat. `name` is
 * what its effects show as on those inside an aura, and floats when its trigger fires.
 */
export interface PassiveEffect {
  name: string;
  /** Its element, for an effect with none of its own (a buff's damageElement): the color it is shown in. */
  damageElement?: DamageElement;
  effect: DistributiveOmit<Extract<Effect, { type: 'buff' | 'debuff' | 'root' | 'aura' | 'hot' | 'dot' }>, 'appliesTo' | 'turns' | 'maxStacks'>;
}

/** An attack's outcome a trigger reacts to: one of rollHit's, or 'stopped' (any of miss, dodge, parry, block). */
export type TriggerOutcome = HitOutcome | 'stopped';

/**
 * A trigger's result: any ability effect (appliesTo read from the bearer's side: EffectTarget), or a
 * 'weaponAttack': the bearer attacks the other unit once with its basic attack (a party member's held weapon, a
 * creature's first enemy-target ability with no MP cost), if it is in range and sight. It costs nothing and rolls
 * to hit like any attack.
 */
export type TriggerEffect = Effect | { type: 'weaponAttack'; appliesTo: 'target' };

/**
 * Something a buff or debuff makes its bearer do while it lasts, when an event happens (`when`, from the
 * bearer's side):
 * - 'attacking' / 'attacked': one hit roll of an enemy-target ability, by the bearer / against it (an area attack
 *   rolls once per unit). `on` (default 'hit'), `categories` and `weaponOnly` (a physical weapon's attack: the
 *   weapon attack or a useWeapon ability, a creature's only if it is a useWeapon one; a creature without one
 *   never sets it off) narrow which.
 * - 'healing' / 'healed': a heal effect landing, from the bearer / on it (a self-heal is both). HoT ticks aren't.
 * It fires at `chance`% (default 100), if the bearer is still alive. Its effects land without a hit roll or crit;
 * damage and DoTs are flat, reduced by the recipient's armor/MR and resistance, heals flat (plus the recipient's
 * healingReceived). On a buff the bearer cast on itself, the bearer's own bonuses count too: its damage bonus and
 * penetration for the element (as an attack of the triggering attack's category, else magic; half the bonus on a
 * DoT), its healing on heals (half on a HoT). A trigger's results set off no triggers, except that a triggered weapon attack's hit roll is
 * an attack event like any other (it never sets off another weapon attack).
 */
export interface Trigger {
  when: 'attacking' | 'attacked' | 'healing' | 'healed';
  on?: TriggerOutcome | TriggerOutcome[];
  categories?: AttackCategory[];
  weaponOnly?: boolean;
  chance?: number;
  effects: TriggerEffect[];
}

/** Whether a trigger is set off by attacks (else by heals). */
export const isAttackTrigger = (t: Trigger) => t.when === 'attacking' || t.when === 'attacked';

/**
 * What makes an ability a movement ability (Ability.move): its caster moves to the aimed square first, then the
 * ability resolves as usual from where it landed (abilityMoves.ts). The AP it costs (`apCost`) is all it spends:
 * no movement, and the distance is the ability's `range`, not the caster's movement. Combat only; never while rooted.
 * - Aimed at an empty tile, it lands there (a 'tile' ability, or an area one: a line area is the path itself, a
 *   blast centers on the landing tile). Aimed at a unit, it lands on the last tile of the path before that unit's
 *   body (a charge), or stays put if it is already beside it. The aim must be in range, sight and (for the party)
 *   currently visible.
 * - The path is the straight line to the aim (areas.ts line). A hostile unit on it blocks it unless
 *   `throughEnemies`; allies never block it. Without `throughObstacles`, every tile of it must be walkable (no
 *   obstacles or map objects, no squeezing between two corners). A blocked path makes the aim invalid.
 * - `style` is how it is drawn: 'dash' glides fast along the path (default), 'blink' fades out and in at the landing.
 */
export interface AbilityMove {
  throughEnemies?: boolean;
  throughObstacles?: boolean;
  style?: 'dash' | 'blink';
}

export interface Ability {
  name: string;
  icon?: ComponentType<{ className?: string }> | IconType;
  mpCost: number;
  apCost: number;                  // action points it takes on the turn (moving and abilities share them)
  range: number;
  target: TargetType;
  displayElement?: DamageElement;
  area?: AreaType;                  // defaults to 'single'
  attackCategory?: AttackCategory;  // how the hit roll is resolved
  useWeapon?: boolean;              // use equipped weapon for damage
  /** Set by toAction: its first damage effect is the held weapon's (the weapon attack, or a useWeapon ability). */
  weaponHit?: boolean;
  /** Its caster dies once it lands (e.g. an exploding spore), whatever its HP (UnitChange.slain). */
  selfDestruct?: boolean;
  /** Makes it a movement ability: its caster moves first, then it resolves from the landing tile (AbilityMove). */
  move?: AbilityMove;
  effects: Effect[];
}

/**
 * How much an ability's MP cost grows per caster level above 1: a quarter of its base cost a level. MP pools grow with
 * level (Mind × level), so a fixed cost would soon hardly touch them; this keeps spells a real drain, while a bigger
 * pool (Mind, +MP gear) still buys more casts.
 */
export const MP_COST_PER_LEVEL = 0.25;

/** What an ability costs in MP for a caster of `level` (party member or creature alike): its mpCost, grown with level. */
export const mpCostAt = (ability: Pick<Ability, 'mpCost'>, level: number): number =>
  Math.round(ability.mpCost * (1 + MP_COST_PER_LEVEL * Math.max(0, level - 1)));

/** Effect types an enemy-target ability applies to its targets (executeAction); any other there does nothing. */
const ENEMY_TARGET_EFFECTS: ReadonlySet<Effect['type']> = new Set(['damage', 'dot', 'debuff', 'root', 'dispel']);

/** What a trigger would silently ignore, wherever it is (a buff's, a debuff's, a passive effect's). */
function warnTrigger(t: Trigger, warn: (msg: string) => void): void {
  if (t.effects.length === 0) warn('its trigger has no effects');
  if (t.effects.some(te => te.appliesTo === 'allies')) warn("its trigger has an effect on 'allies', which does nothing there");
  if (!isAttackTrigger(t) && (t.on || t.categories || t.weaponOnly)) warn(`its '${t.when}' trigger ignores on, categories and weaponOnly`);
}

/** What an aura would silently ignore, wherever it is (an ability's, a passive one). */
function warnAura(a: Aura, warn: (msg: string) => void): void {
  if (a.effects.length === 0) warn('its aura has no effects');
  if (a.includesBearer && !a.effects.some(e => e.appliesTo === 'allies')) warn("its aura includes its bearer, but has no effect on 'allies'");
  for (const e of a.effects) {
    if ((e.type === 'buff' || e.type === 'debuff') && e.trigger) warnTrigger(e.trigger, warn);
  }
}

/** Warn (once, at load) about what a creature's or class's passive effects would silently ignore. */
export function warnIgnoredPassives(owner: string, passives: readonly PassiveEffect[] = []): void {
  for (const p of passives) {
    const warn = (msg: string) => console.warn(`${owner} › ${p.name} (passive): ${msg}`);
    const e = p.effect;
    if (e.type === 'buff' || e.type === 'debuff') {
      if (e.trigger) warnTrigger(e.trigger, warn);
      else if (!Object.keys(e.stats ?? {}).length && !Object.keys(e.statsPercent ?? {}).length) warn(`its ${e.type} changes no stat and has no trigger`);
    }
    if (e.type === 'aura') warnAura(e.aura, warn);
  }
}

/**
 * Warn (once, at load) about movement abilities (Ability.move) in a creature's or summon's table: the enemy AI doesn't
 * choose them yet (enemyAI.ts), so they would never be used. Resolution is shared with the party's (abilityMoves.ts),
 * so only the AI's choosing is missing.
 */
export function warnCreatureMoves(owner: string, abilities: readonly Ability[]): void {
  for (const a of abilities) if (a.move) console.warn(`${owner} › ${a.name}: creatures don't use movement abilities yet (enemyAI.ts skips them)`);
}

/** Whether an ability calls up a forever summon (a 'summon' effect with `turns: 'forever'`). */
export const summonsForever = (a: Pick<Ability, 'effects'>) => a.effects.some(e => e.type === 'summon' && e.turns === 'forever');

/**
 * Warn (once, at load) about forever summons in a creature's or summon's table (on an ability, or in a buff's trigger):
 * they are the party's only. The AI never casts them (enemyAI.ts), and a creature's would be ignored (useActionOutcomes).
 */
export function warnCreatureForeverSummons(owner: string, abilities: readonly Ability[]): void {
  for (const a of abilities) {
    const inTriggers = a.effects.some(e => (e.type === 'buff' || e.type === 'debuff') && e.trigger?.effects.some(t => t.type === 'summon' && t.turns === 'forever'));
    if (summonsForever(a) || inTriggers) console.warn(`${owner} › ${a.name}: forever summons are the party's only (creatures never summon one)`);
  }
}

/**
 * Warn (once, at load) about cleanses in a creature's or summon's table: a self or ally ability that dispels. The enemy
 * AI doesn't choose them yet (enemyAI.ts casts only heals and buffs on its own side), so they would hardly be used.
 * A dispel on an attack works as it is.
 */
export function warnCreatureCleanses(owner: string, abilities: readonly Ability[]): void {
  for (const a of abilities) {
    if ((a.target === 'self' || a.target === 'ally') && a.effects.some(e => e.type === 'dispel')) {
      console.warn(`${owner} › ${a.name}: creatures don't choose cleansing abilities yet (enemyAI.ts)`);
    }
  }
}

/**
 * Warn (at load) about effects in `abilities` that would silently do nothing: on an enemy-target ability, a
 * 'target' effect of a kind that only helps (a heal or buff on the enemy); on a 'tile' ability, any 'target'
 * effect (the tile has no unit); 'source' outside a trigger; and in a trigger: no effects, 'allies' (no area
 * there), attack filters on a heal trigger, or maxStacks above 1 with a trigger. `owner` names the table in the warning.
 */
export function warnIgnoredEffects(owner: string, abilities: readonly Ability[]): void {
  for (const a of abilities) {
    const warn = (msg: string) => console.warn(`${owner} › ${a.name}: ${msg}`);
    if (a.move && a.target === 'self') warn("its move does nothing on a 'self' ability (there is no square to aim at)");
    for (const e of a.effects) {
      if (e.appliesTo === 'source') warn(`its '${e.type}' effect on 'source' does nothing outside a trigger`);
      if ((e.type === 'buff' || e.type === 'debuff') && e.trigger) {
        warnTrigger(e.trigger, warn);
        if ((e.maxStacks ?? 1) > 1) warn('its trigger never stacks, so its maxStacks is ignored');
      }
      if (e.type === 'aura') warnAura(e.aura, warn);
      if (e.type === 'dispel' && e.count !== 'all' && e.count !== undefined && !(e.count >= 1)) warn('its dispel removes nothing (count below 1)');
      if (e.appliesTo !== 'target') continue;
      const ignored = (a.target === 'enemy' && !ENEMY_TARGET_EFFECTS.has(e.type)) || a.target === 'tile';
      if (ignored) warn(`its '${e.type}' effect on 'target' does nothing on a '${a.target}' ability`);
    }
  }
}

/**
 * Warn (once, at load) about everything a creature table's entries would silently ignore or never use: their abilities'
 * ignored effects, movement abilities, forever summons and cleanses (the AI's limits), and their passive effects'
 * ignored parts. `table` names it in the warnings ('enemies', 'bosses', 'summons'). Shared by every creature table.
 */
export function warnCreatureTable(table: string, classes: readonly { id: string; abilities: readonly Ability[]; passiveEffects?: readonly PassiveEffect[] }[]): void {
  for (const c of classes) {
    const owner = `${table} › ${c.id}`;
    warnIgnoredEffects(owner, c.abilities);
    warnCreatureMoves(owner, c.abilities);
    warnCreatureForeverSummons(owner, c.abilities);
    warnCreatureCleanses(owner, c.abilities);
    warnIgnoredPassives(owner, c.passiveEffects);
  }
}
