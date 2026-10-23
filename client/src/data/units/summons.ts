// Creatures the party can summon (an ability's 'summon' effect, by id). Configured like enemy classes
// (CreatureClassData: attributes, armor, abilities, passives, model) and run by the same AI, on the party's
// side. Their level is their summoner's.
import { generateEnemyInstance, type CreatureClassData, type EnemyInstance } from './enemies';
import type { Pos } from '../world/grid';
import { warnIgnoredEffects } from '../combat/abilities';

/** A creature an action summons (executeAction's outcome; placed where the outcome lands). */
export interface SummonRequest {
  creature: string;  // SUMMON_CLASSES id
  rounds: number;
  ability: string;   // the ability that summons it (casting it again replaces the creature)
  at?: Pos;          // the tile it appears on (a 'tile' ability's aim); none = beside the caster
}

export const SUMMON_CLASSES: CreatureClassData[] = [
  {
    id: 'void-wisp',
    name: 'Void Wisp',
    attributes: { mind: 3, finesse: 1 },
    highAttributes: ['mind', 'finesse'],
    lowAttributes: ['strength', 'toughness'],
    baseHp: 10,
    baseArmor: 0,
    armorPerLevel: 2,
    passives: {
      shadowResistance: { name: 'Shadowborn', flat: 30 },
      dodge: { name: 'Ethereal', flat: 10 }
    },
    abilities: [
      {
        name: 'Void Spit',
        mpCost: 0,
        apCost: 1,
        range: 3,
        target: 'enemy',
        attackCategory: 'magic',
        displayElement: 'shadow',
        effects: [{ type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 2, maxDamage: 4 }],
      },
    ],
    model: 'summon.void-wisp',
  },
];

// Effects an ability would silently ignore: warned at load
for (const c of SUMMON_CLASSES) warnIgnoredEffects(`summons › ${c.id}`, c.abilities);

/** A summonable creature's class, by id. */
export const summonClass = (id: string): CreatureClassData | undefined => SUMMON_CLASSES.find((c) => c.id === id);

let summonCounter = 0;

/**
 * A summoned creature, on the party's side: party member `ownerIdx`'s, at `level` (its summoner's), on `pos`
 * in zone `zoneId`. In the fight from the start (aggroed). Null for an unknown creature id.
 */
export function createSummon(req: SummonRequest, ownerIdx: number, level: number, pos: Pos, zoneId: number): EnemyInstance | null {
  const classData = summonClass(req.creature);
  if (!classData) return null;
  const id = `summon-${Date.now().toString(36)}-${(summonCounter++).toString(36)}`;
  return {
    ...generateEnemyInstance(classData, level, id, pos, zoneId, -1),
    aggroed: true,
    ally: { ownerIdx, ability: req.ability, roundsLeft: req.rounds },
  };
}

/** Whether a creature is party member `ownerIdx`'s summon from `ability` (casting it again replaces it). */
export const isSummonOf = (e: EnemyInstance, ownerIdx: number, ability: string) =>
  e.ally?.ownerIdx === ownerIdx && e.ally.ability === ability;
