import type { WeaponItem, DamageElement } from './gear';
import type { Ability, Stats } from './classes';

export interface ActiveDot {
  damageElement: DamageElement;
  damagePerRound: number;
  roundsRemaining: number;
}

// ─── Enemy Type Definition ───────────────────────────────────────────────────

export interface EnemyType {
  id: string;
  name: string;
  token: string;
  color: string;           // tailwind bg class
  stats: Stats;
  weapon: WeaponItem;
  abilities: Ability[];
}

export interface EnemyInstance {
  id: string;               // unique runtime id, e.g. 'skeleton-0'
  type: EnemyType;
  pos: { x: number; y: number };
  currentHp: number;
  currentMp: number;
  aggroed: boolean;         // true once the player enters aggro range
  zoneId: number;           // which zone this enemy belongs to
  groupId: number;          // enemies spawned together share a groupId
  dots: ActiveDot[];        // active damage-over-time effects
}

// ─── Bestiary ────────────────────────────────────────────────────────────────

export const ENEMY_TYPES = {
  skeleton: {
    id: 'skeleton',
    name: 'Skeleton',
    token: '\u{1F480}',      // 💀
    color: 'bg-gray-500',
    stats: {
      level: 1,
      hp: 15,
      mp: 0,
      hpRegen: 0,
      mpRegen: 1,
      initiative: 3,
      movement: 3,
      armor: 2,
      dodge: 5,
      magicResistance: 0,
      healing: 0,
      melee:  { hitBonus: 2, damage: 0, crit: 5 },
      ranged: { hitBonus: 0, damage: 0, crit: 0 },
      magic:  { hitBonus: 0, damage: 0, crit: 0 },
    },
    weapon: {
      name: 'Rusted Sword', slot: 'mainhand', weaponType: '1h Swords',
      attackCategory: 'melee', damageElement: 'slashing', level: 1,
      minDamage: 5, maxDamage: 8, range: 1,
    },
    abilities: [],
  },
  zombie: {
    id: 'zombie',
    name: 'Zombie',
    token: '\u{1F9DF}',      // 🧟
    color: 'bg-green-800',
    stats: {
      level: 1,
      hp: 22,
      mp: 0,
      hpRegen: 1,
      mpRegen: 0,
      initiative: 1,
      movement: 2,
      armor: 4,
      dodge: 0,
      magicResistance: 0,
      healing: 0,
      melee:  { hitBonus: 1, damage: 0, crit: 3 },
      ranged: { hitBonus: 0, damage: 0, crit: 0 },
      magic:  { hitBonus: 0, damage: 0, crit: 0 },
    },
    weapon: {
      name: 'Bite', slot: 'mainhand', weaponType: 'Unarmed',
      attackCategory: 'melee', damageElement: 'bludgeoning', level: 1,
      minDamage: 4, maxDamage: 10, range: 1,
    },
    abilities: [],
  },
} satisfies Record<string, EnemyType>;
