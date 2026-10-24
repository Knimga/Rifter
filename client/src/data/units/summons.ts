// Summoned creatures (an ability's 'summon' effect, by id): the creatures only summoned (SUMMON_CLASSES), and any
// enemy class too (e.g. a spore that also roams in packs). Configured like enemy classes (CreatureClassData:
// attributes, armor, abilities, passives, model) and run by the same AI, on their summoner's side. Their level
// is their summoner's.
import { BOSS_CLASSES, ENEMY_CLASSES, generateEnemyInstance, type CreatureClassData, type EnemyInstance } from './enemies';
import type { Pos } from '../world/grid';
import { warnIgnoredEffects } from '../combat/abilities';

/** A creature an action summons (executeAction's outcome; placed where the outcome lands). */
export interface SummonRequest {
  creature: string;  // a creature class id (summonClass)
  rounds: number;
  max: number;       // at most this many out from its ability at once: casting it again replaces the oldest
  ability: string;   // the ability that summons it
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
    resistances: { shadow: 30 },
    passives: {
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

/** A summonable creature's class, by id: a summon-only creature, else an enemy class. */
export const summonClass = (id: string): CreatureClassData | undefined =>
  [...SUMMON_CLASSES, ...ENEMY_CLASSES, ...BOSS_CLASSES].find((c) => c.id === id);

let summonCounter = 0;

/**
 * A summoned creature: `owner`'s (its unitKey), on the party's side if `allied`, else the enemies'; at `level`
 * (its summoner's), on `pos` in zone `zoneId`. In the fight from the start (aggroed). Null for an unknown id.
 */
export function createSummon(req: SummonRequest, owner: string, allied: boolean, level: number, pos: Pos, zoneId: number): EnemyInstance | null {
  const classData = summonClass(req.creature);
  if (!classData) return null;
  const id = `summon-${Date.now().toString(36)}-${(summonCounter++).toString(36)}`;
  return {
    ...generateEnemyInstance(classData, level, id, pos, zoneId, -1),
    aggroed: true,
    summon: { owner, ability: req.ability, roundsLeft: req.rounds, allied },
  };
}

/** The living creatures `owner` (a unitKey) has out from `ability`, oldest first (the order they were added in). */
export const summonsOf = (creatures: EnemyInstance[], owner: string, ability: string) =>
  creatures.filter(e => e.currentHp > 0 && e.summon?.owner === owner && e.summon.ability === ability);
