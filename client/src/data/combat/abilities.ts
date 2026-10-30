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
 * party, fellow creatures for an enemy; the caster too if it stands in it). Ally effects always land (no hit
 * roll), so an area can damage enemies and heal allies at once.
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
  | { type: 'dot';     appliesTo: EffectTarget; damageElement: DamageElement; damagePerRound: number; rounds: number; damagesMP?: boolean; maxStacks?: number }
  // restoresMP: it restores MP instead of HP (worked out exactly like an HP heal)
  | { type: 'heal';    appliesTo: EffectTarget; damageElement: DamageElement; minHeal: number; maxHeal: number; restoresMP?: boolean }
  | { type: 'hot';     appliesTo: EffectTarget; damageElement: DamageElement; healPerRound: number; rounds: number; maxStacks?: number }
  // A buff or debuff changes stats, and/or sets a trigger on the unit for its rounds (Trigger). Each cast is a
  // stack: a unit can have at most `maxStacks` of it at once (default: no limit; one if it has a trigger), from
  // any caster; one more replaces the oldest (addBuffs in units/stats.ts).
  | { type: 'buff';    appliesTo: EffectTarget; damageElement?: DamageElement; stats?: StatChanges; statsPercent?: StatChanges; trigger?: Trigger; rounds: number; maxStacks?: number }
  | { type: 'debuff';  appliesTo: EffectTarget; damageElement?: DamageElement; stats?: StatChanges; statsPercent?: StatChanges; trigger?: Trigger; rounds: number; maxStacks?: number }
  // The caster's threat: `amount` flat, `percent` of their current threat; negative reduces it (to 0 at
  // least). Gains are scaled by the caster's threatMultiplier, reductions aren't (see applyThreatChange).
  | { type: 'threat'; appliesTo: EffectTarget; damageElement?: DamageElement; amount?: number; percent?: number }
  // Calls up a creature (by id: units/summons.ts SUMMON_CLASSES, or an enemy class), fighting on the caster's
  // side for `rounds` rounds (combat only; it vanishes when combat ends; no XP or loot). On a 'tile' ability it
  // appears on the aimed tile; otherwise beside the caster. At most `max` of them out at once (default 1):
  // casting it with that many out replaces the oldest.
  | { type: 'summon'; appliesTo: 'caster'; damageElement?: DamageElement; creature: string; rounds: number; max?: number }
  // Roots the unit in place for `rounds` rounds: it can't move (it can still attack and use abilities).
  // Lands like a debuff (on an enemy-targeting ability, only on a hit), and shows as one.
  | { type: 'root'; appliesTo: EffectTarget; damageElement?: DamageElement; rounds: number };

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
 * A trigger a class or creature always has (ClassData / CreatureClassData `passiveTriggers`): always on, never
 * runs out, never shown as a status marker. Its bearer put it on itself, so its effects on 'source' land on the
 * bearer, and its own bonuses count (as on a self-cast trigger buff). `name` floats when it fires.
 */
export interface PassiveTrigger {
  name: string;
  /** Its element (a buff's damageElement): the color it is shown in. */
  damageElement?: DamageElement;
  trigger: Trigger;
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
  effects: Effect[];
}

/** Effect types an enemy-target ability applies to its targets (executeAction); any other there does nothing. */
const ENEMY_TARGET_EFFECTS: ReadonlySet<Effect['type']> = new Set(['damage', 'dot', 'debuff', 'root']);

/**
 * Warn (at load) about effects in `abilities` that would silently do nothing: on an enemy-target ability, a
 * 'target' effect of a kind that only helps (a heal or buff on the enemy); on a 'tile' ability, any 'target'
 * effect (the tile has no unit); 'source' outside a trigger; and in a trigger: no effects, 'allies' (no area
 * there), attack filters on a heal trigger, or maxStacks above 1 with a trigger. `owner` names the table in the warning.
 */
/** What a trigger would silently ignore, wherever it is (a buff's, a debuff's, a passive one). */
function warnTrigger(t: Trigger, warn: (msg: string) => void): void {
  if (t.effects.length === 0) warn('its trigger has no effects');
  if (t.effects.some(te => te.appliesTo === 'allies')) warn("its trigger has an effect on 'allies', which does nothing there");
  if (!isAttackTrigger(t) && (t.on || t.categories || t.weaponOnly)) warn(`its '${t.when}' trigger ignores on, categories and weaponOnly`);
}

/** Warn (once, at load) about what a class's or creature's passive triggers would silently ignore. */
export function warnIgnoredTriggers(owner: string, passives: readonly PassiveTrigger[] = []): void {
  for (const p of passives) warnTrigger(p.trigger, (msg) => console.warn(`${owner} › ${p.name} (passive): ${msg}`));
}

export function warnIgnoredEffects(owner: string, abilities: readonly Ability[]): void {
  for (const a of abilities) {
    const warn = (msg: string) => console.warn(`${owner} › ${a.name}: ${msg}`);
    for (const e of a.effects) {
      if (e.appliesTo === 'source') warn(`its '${e.type}' effect on 'source' does nothing outside a trigger`);
      if ((e.type === 'buff' || e.type === 'debuff') && e.trigger) {
        warnTrigger(e.trigger, warn);
        if ((e.maxStacks ?? 1) > 1) warn('its trigger never stacks, so its maxStacks is ignored');
      }
      if (e.appliesTo !== 'target') continue;
      const ignored = (a.target === 'enemy' && !ENEMY_TARGET_EFFECTS.has(e.type)) || a.target === 'tile';
      if (ignored) warn(`its '${e.type}' effect on 'target' does nothing on a '${a.target}' ability`);
    }
  }
}
