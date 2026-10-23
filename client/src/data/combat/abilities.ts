// Abilities: what a party member or creature can do on its turn (Ability), and the effects it has (Effect).
// Shared by player classes (units/classes.ts), enemies and summons (units/enemies.ts, units/summons.ts).
import type { IconType } from 'react-icons';
import type { ComponentType } from 'react';
import type { AttackCategory, DamageElement } from '../gear';
import type { BuffableStat } from '../units/stats';

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
 */
export type EffectTarget = 'target' | 'caster' | 'allies';

export type Effect =
  // damagesMP: the damage goes to the target's MP instead of HP (scaled and reduced exactly like HP
  // damage; generates half the threat)
  | { type: 'damage';  appliesTo: EffectTarget; damageElement: DamageElement; minDamage: number; maxDamage: number; damagesMP?: boolean }
  | { type: 'dot';     appliesTo: EffectTarget; damageElement: DamageElement; damagePerRound: number; rounds: number; damagesMP?: boolean }
  | { type: 'heal';    appliesTo: EffectTarget; damageElement: DamageElement; minHeal: number; maxHeal: number }
  | { type: 'hot';     appliesTo: EffectTarget; damageElement: DamageElement; healPerRound: number; rounds: number }
  | { type: 'buff';    appliesTo: EffectTarget; damageElement?: DamageElement; stats: Partial<Record<BuffableStat, number>>; statsPercent?: Partial<Record<BuffableStat, number>>; rounds: number }
  | { type: 'debuff';  appliesTo: EffectTarget; damageElement?: DamageElement; stats: Partial<Record<BuffableStat, number>>; statsPercent?: Partial<Record<BuffableStat, number>>; rounds: number }
  // The caster's threat: `amount` flat, `percent` of their current threat; negative reduces it (to 0 at
  // least). Gains are scaled by the caster's threatMultiplier, reductions aren't (see applyThreatChange).
  | { type: 'threat'; appliesTo: EffectTarget; damageElement?: DamageElement; amount?: number; percent?: number }
  // Calls up a creature (units/summons.ts SUMMON_CLASSES, by id), fighting on the caster's side for `rounds`
  // rounds (combat only; it vanishes when combat ends). On a 'tile' ability it appears on the aimed tile;
  // otherwise beside the caster. Casting it again replaces the last one.
  | { type: 'summon'; appliesTo: 'caster'; damageElement?: DamageElement; creature: string; rounds: number }
  // Roots the unit in place for `rounds` rounds: it can't move (it can still attack and use abilities).
  // Lands like a debuff (on an enemy-targeting ability, only on a hit), and shows as one.
  | { type: 'root'; appliesTo: EffectTarget; damageElement?: DamageElement; rounds: number };

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
  effects: Effect[];
}

/** Effect types an enemy-target ability applies to its targets (executeAction); any other there does nothing. */
const ENEMY_TARGET_EFFECTS: ReadonlySet<Effect['type']> = new Set(['damage', 'dot', 'debuff', 'root']);

/**
 * Warn (at load) about effects in `abilities` that would silently do nothing: on an enemy-target ability, a
 * 'target' effect of a kind that only helps (a heal or buff on the enemy); on a 'tile' ability, any 'target'
 * effect (the tile has no unit). `owner` names the table in the warning.
 */
export function warnIgnoredEffects(owner: string, abilities: readonly Ability[]): void {
  for (const a of abilities) {
    for (const e of a.effects) {
      if (e.appliesTo !== 'target') continue;
      const ignored = (a.target === 'enemy' && !ENEMY_TARGET_EFFECTS.has(e.type)) || a.target === 'tile';
      if (ignored) console.warn(`${owner} › ${a.name}: its '${e.type}' effect on 'target' does nothing on a '${a.target}' ability`);
    }
  }
}
