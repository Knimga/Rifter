// TEMP: FOR TESTING ONLY (see runRecorder.ts). What the run recorder writes about the party and its creatures: reads
// game values, so only the game screen imports it (the rest of the game imports runRecorder.ts alone).
import type { Ability } from '../data/combat/abilities';
import { GEAR_SLOTS, isWeaponItem, type Affix, type GearSlots, type Item } from '../data/gear';
import { creatureName, type EnemyInstance } from '../data/units/enemies';
import { memberAbilities, type MemberState, type PartyMemberConfig } from '../data/units/party';
import type { Stats } from '../data/units/stats';
import { effectNames, firstOfClass, plainAbility } from './runRecorder';

const affixText = (a: Affix) => `${a.stat} ${a.value}${a.percent ? '%' : ''}${a.tier ? ` (tier ${a.tier})` : ''}`;

function describeItem(item: Item | null) {
  if (!item) return null;
  const armor = (item as { armorValue?: number }).armorValue;
  return {
    name: item.name, rarity: item.rarity, itemLevel: item.level,
    ...(isWeaponItem(item) ? { weapon: `${item.weaponType} ${item.minDamage}-${item.maxDamage} ${item.damageElement}, ${item.attackCategory}, range ${item.range}` } : {}),
    ...(armor ? { armor } : {}),
    ...(item.implicit ? { implicit: affixText(item.implicit) } : {}),
    affixes: item.affixes.map(affixText),
  };
}

const describeGear = (gear: GearSlots) => Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, describeItem(gear[slot])]));

/** What a party view needs: the members, their stats and state now. */
export interface PartyView {
  party: readonly PartyMemberConfig[];
  stats: readonly Stats[];
  members: readonly MemberState[];
}

/** The party's HP, MP and effects now (a fight's start and end). */
export const partyVitals = ({ party, stats, members }: PartyView) => party.map((m, i) => ({
  name: m.characterName, hp: `${members[i]?.hp}/${stats[i]?.hp}`, mp: `${members[i]?.mp}/${stats[i]?.mp}`,
  effects: effectNames(members[i]?.buffs ?? []),
}));

/** The whole party as a recording begins: who they are, every stat, gear, points and action bar. */
export function describeRun(view: PartyView & {
  level: number; xp: number; where: string;
  /** Each member's action bar: 'weapon-attack', an ability, or empty. */
  slots: readonly (readonly (Ability | 'weapon-attack' | null)[])[];
}) {
  return {
    level: view.level, xp: view.xp, where: view.where,
    members: view.party.map((m, i) => ({
      name: m.characterName, class: m.selectedClass, subclass: m.subclass ?? null,
      hp: view.members[i]?.hp, mp: view.members[i]?.mp,
      stats: view.stats[i],
      pointsSpent: { attributes: m.pointsSpent, skills: m.skillPointsSpent },
      unspentPoints: { attributes: m.unspentAttributePoints, skills: m.unspentSkillPoints },
      gear: describeGear(m.gear),
      actionBar: (view.slots[i] ?? []).map((s) => (s === 'weapon-attack' ? 'Attack (weapon)' : s?.name ?? null)),
      abilities: memberAbilities(m).map(plainAbility),
    })),
  };
}

/** A creature as a fight meets it: class, level, HP, every stat, where it stands; its abilities the first time its class appears. */
export const describeCreature = (e: EnemyInstance) => ({
  id: e.id, name: creatureName(e), class: e.classData.id, level: e.level,
  hp: e.currentHp, mp: e.currentMp, pos: e.pos, stats: e.stats,
  ...(firstOfClass(e.classData.id) ? { abilities: e.classData.abilities.map(plainAbility) } : {}),
});
