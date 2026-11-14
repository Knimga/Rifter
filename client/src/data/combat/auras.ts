// Auras: an effect on its bearer (an 'aura' Effect on an ability, or a creature's or class's passive one: PassiveEffect) whose own effects land on
// the units inside an area round the bearer, and stay on them only while they are. Pure: who is inside whose aura
// (auraWants), and what that puts on a unit or takes off it (syncAuraEffects). hooks/useAuras.ts runs it whenever
// anyone moves, falls, joins or an aura comes or goes.
//
// An aura's effects are written on the units inside it, as entries tagged `fromAura` that never count down
// (turnsLeft Infinity): so stats, turn ticks (a HoT or DoT ticks at the start of its unit's turn, as any), triggers and
// status markers work on them with no more rules. A buff or debuff takes effect at once.
import { atLevel, type Aura, type AuraEffect } from './abilities';
import { damageFactor } from './attackResolution';
import { blastRadius } from './areas';
import { effectToBuffs, type ActiveBuff, type ActiveDot, type ActiveHot, type AuraTag, type DamageElement } from '../units/stats';
import { bodyDistance, type Body } from '../world/grid';

type BuffEffect = Parameters<typeof effectToBuffs>[0];

/** An aura a unit has now: its name (what its effects show as), element (their color) and what it does. */
export interface AuraSource {
  name: string;
  element?: DamageElement;
  aura: Aura;
}

/** The auras a unit has: the ones on it (ActiveBuff.aura): cast on it while they last, or its kind's or class's passive ones for good. */
export const auraSources = (buffs: readonly ActiveBuff[]): AuraSource[] =>
  buffs.filter(b => b.aura).map(b => ({ name: b.source ?? b.id, element: b.damageElement, aura: b.aura!.def }));

/** A living unit as the auras see it. */
export interface AuraUnit {
  /** Its unitKey. */
  key: string;
  /** Its side: the party's (members, and creatures summoned by them) or the enemies'. */
  side: 'party' | 'enemy';
  body: Body;
  /** The zone it is in: auras reach only within one. */
  zone: number;
  /** Its level, which its HoTs' and DoTs' amounts grow with (as a HoT or DoT cast by it: levelScale). */
  level: number;
  /** Its healing %, which its HoTs' amounts take half of (as a HoT cast by it). */
  healing: number;
  /** Where the threat of its DoTs' ticks goes (threatKey): none for a hostile creature. */
  threatKey?: string;
  auras: AuraSource[];
}

/** Whether `unit` is inside the area of an aura on `bearer` (body to body, as a blast ability's reach). */
export const inAura = (bearer: Body, unit: Body, area: Aura['area']): boolean => bodyDistance(bearer, unit) <= blastRadius(area);

/** One effect of an aura that a unit is to have, and the bearers of it that reach the unit (in order of preference). */
export interface AuraWant {
  /** Which effect of which aura: `<aura name>:<its place in the aura>`. A unit has each key once, whatever the bearers. */
  key: string;
  name: string;
  effect: AuraEffect;
  element?: DamageElement;
  bearers: AuraUnit[];
}

/**
 * What every unit is to have from auras now, by unit key and then effect key (AuraWant.key): units outside every aura
 * are not in it. An effect on 'allies' reaches the bearer's side (the bearer itself only if the aura `includesBearer`),
 * one on 'enemies' the other side. `units`: the living ones, the party's first (the bearer an effect comes from is the
 * first that reaches the unit).
 */
export function auraWants(units: readonly AuraUnit[]): Map<string, Map<string, AuraWant>> {
  const wants = new Map<string, Map<string, AuraWant>>();
  const bearers = units.filter(u => u.auras.length > 0);
  for (const unit of units) {
    for (const bearer of bearers) {
      if (bearer.zone !== unit.zone) continue;
      for (const { name, element, aura } of bearer.auras) {
        if (!inAura(bearer.body, unit.body, aura.area)) continue;
        aura.effects.forEach((effect, i) => {
          const reached = effect.appliesTo === 'allies'
            ? bearer.side === unit.side && (bearer.key !== unit.key || !!aura.includesBearer)
            : bearer.side !== unit.side;
          if (!reached) return;
          let mine = wants.get(unit.key);
          if (!mine) wants.set(unit.key, mine = new Map());
          const key = `${name}:${i}`;
          const want = mine.get(key);
          if (want) want.bearers.push(bearer);
          else mine.set(key, { key, name, effect, element, bearers: [bearer] });
        });
      }
    }
  }
  return wants;
}

/** A unit's lasting effects. */
export interface EffectLists {
  buffs: ActiveBuff[];
  hots: ActiveHot[];
  dots: ActiveDot[];
}

/** What an aura effect puts on a unit, from `want`'s first bearer (the tagged entries that last while it is inside). */
function entriesOf(want: AuraWant): EffectLists {
  const bearer = want.bearers[0];
  const fromAura: AuraTag = { key: want.key, bearer: bearer.key };
  const { effect, name } = want;
  const none: EffectLists = { buffs: [], hots: [], dots: [] };
  switch (effect.type) {
    case 'buff':
    case 'debuff': {
      // As a buff or debuff of the bearer's, for good: no stack (an aura's effect never stacks with itself: syncAuraEffects)
      const eff = { ...effect, appliesTo: 'target', turns: Infinity, damageElement: effect.damageElement ?? want.element } as BuffEffect;
      return { ...none, buffs: effectToBuffs(eff, `aura-${want.key}-${bearer.key}`, name, bearer.key).map(b => ({ ...b, stack: undefined, fromAura })) };
    }
    case 'hot':
      return { ...none, hots: [{
        name, damageElement: effect.damageElement, healPerTurn: Math.round(effect.healPerTurn * damageFactor(bearer.level, bearer.healing, 0.5)),
        restoresMP: effect.restoresMP, turnsLeft: Infinity, fromAura,
      }] };
    case 'dot':
      return { ...none, dots: [{
        name, damageElement: effect.damageElement, damagePerTurn: atLevel(effect.damagePerTurn, bearer.level), turnsLeft: Infinity,
        // Only a DoT on foes builds its bearer threat (one on the bearer's own side, a sacrifice, builds none)
        sourceKey: effect.appliesTo === 'enemies' ? bearer.threatKey : undefined, damagesMP: effect.damagesMP, fromAura,
      }] };
  }
}

/**
 * A unit's lasting effects, brought in step with the auras it is in (`wants`: its entry of auraWants; none when it is
 * in none, or is down): an aura effect it no longer gets from the bearer it came from goes, one it should now have comes
 * (from the first bearer that reaches it). One still reached by its bearer is left as it is. A list this changes not at
 * all stays the same array, so unchanged units cost no redraw or stat recompute.
 */
export function syncAuraEffects(lists: EffectLists, wants?: ReadonlyMap<string, AuraWant>): EffectLists {
  const valid = (t: AuraTag) => !!wants?.get(t.key)?.bearers.some(b => b.key === t.bearer);
  const kept = <T extends { fromAura?: AuraTag }>(list: T[]): T[] => {
    const out = list.filter(x => !x.fromAura || valid(x.fromAura));
    return out.length === list.length ? list : out;
  };
  const buffs = kept(lists.buffs), hots = kept(lists.hots), dots = kept(lists.dots);
  const have = new Set([...buffs, ...hots, ...dots].flatMap(x => (x.fromAura ? [x.fromAura.key] : [])));
  const added: EffectLists = { buffs: [], hots: [], dots: [] };
  for (const [key, want] of wants ?? []) {
    if (have.has(key)) continue;
    const e = entriesOf(want);
    added.buffs.push(...e.buffs);
    added.hots.push(...e.hots);
    added.dots.push(...e.dots);
  }
  return {
    buffs: added.buffs.length ? [...buffs, ...added.buffs] : buffs,
    hots: added.hots.length ? [...hots, ...added.hots] : hots,
    dots: added.dots.length ? [...dots, ...added.dots] : dots,
  };
}
