import type { ArmorProficiency, WeaponProficiency } from './classes';

// ─── Slots ────────────────────────────────────────────────────────────────────

export type ArmorSlot = 'helm' | 'chest' | 'gloves' | 'boots';
export type WeaponSlot = 'mainhand' | 'offhand';
export type GearSlot = ArmorSlot | WeaponSlot;

export const ARMOR_SLOTS: ArmorSlot[] = ['helm', 'chest', 'gloves', 'boots'];
export const GEAR_SLOTS: GearSlot[] = ['helm', 'chest', 'gloves', 'boots', 'mainhand', 'offhand'];

// ─── Items ────────────────────────────────────────────────────────────────────

export interface Item {
  name: string;
  slot: GearSlot;
}

export interface ArmorItem extends Item {
  slot: ArmorSlot;
  armorType: ArmorProficiency;
  armorValue: number;
  magicResistance?: number;
}

export interface ShieldItem extends Item {
  slot: 'offhand';
  armorType: ArmorProficiency;
  armorValue: number;
}

export type WeaponType = Exclude<WeaponProficiency, 'Shields'> | 'Unarmed';
export type AttackCategory = 'melee' | 'ranged' | 'magic';
export type DamageElement =
  | 'slashing' | 'piercing' | 'bludgeoning'
  | 'fire' | 'ice' | 'lightning' | 'shadow' | 'poison' | 'holy' | 'nature';

export const PHYSICAL_ELEMENTS: ReadonlySet<DamageElement> = new Set([
  'slashing', 'piercing', 'bludgeoning',
]);

const MAGIC_ELEMENTS: DamageElement[] = [
  'fire', 'ice', 'lightning', 'shadow', 'poison', 'holy', 'nature',
];

export interface WeaponItem extends Item {
  slot: 'mainhand';
  weaponType: WeaponType;
  attackCategory: AttackCategory;
  damageElement: DamageElement;
  level: number;
  minDamage: number;
  maxDamage: number;
  range: number;
}

export type GearSlots = Record<GearSlot, Item | null>;

export const EMPTY_GEAR: GearSlots = {
  helm: null,
  chest: null,
  gloves: null,
  boots: null,
  mainhand: null,
  offhand: null,
};

// ─── Type Guards ──────────────────────────────────────────────────────────────

export function isArmorItem(item: Item): item is ArmorItem {
  return (ARMOR_SLOTS as readonly string[]).includes(item.slot);
}

export function isShieldItem(item: Item): item is ShieldItem {
  return item.slot === 'offhand' && 'armorValue' in item;
}

export function isWeaponItem(item: Item): item is WeaponItem {
  return item.slot === 'mainhand';
}

export function getGearArmorBonus(gear: GearSlots): number {
  const fromArmor = ARMOR_SLOTS.reduce((total, slot) => {
    const item = gear[slot];
    return total + (item && isArmorItem(item) ? item.armorValue : 0);
  }, 0);
  const offhand = gear.offhand;
  const fromShield = offhand && isShieldItem(offhand) ? offhand.armorValue : 0;
  return fromArmor + fromShield;
}

// ─── Armor Generation ─────────────────────────────────────────────────────────

const ARMOR_TYPE_BASE: Record<ArmorProficiency, number> = {
  Light: 4,
  Medium: 8,
  Heavy: 12,
};

// Slot multipliers — ordering: Chest > Shield > Helm > Boots > Gloves
const ARMOR_SLOT_MULTIPLIER: Record<ArmorSlot, number> = {
  chest:  1.00,
  helm:   0.65,
  boots:  0.45,
  gloves: 0.35,
};
const SHIELD_MULTIPLIER = 0.80;

const ARMOR_SLOT_LABEL: Record<ArmorSlot, string> = {
  helm:   'Helm',
  chest:  'Chest',
  gloves: 'Gloves',
  boots:  'Boots',
};

const ARMOR_WOBBLE = 0.15;

function applyWobble(base: number, spread: number): number {
  return Math.max(1, Math.round(base * (1 + (Math.random() * 2 - 1) * spread)));
}

export function generateArmorItem(
  slot: ArmorSlot,
  level: number,
  armorType: ArmorProficiency
): ArmorItem {
  return {
    name: `${armorType} ${ARMOR_SLOT_LABEL[slot]}`,
    slot,
    armorType,
    armorValue: applyWobble(ARMOR_TYPE_BASE[armorType] * level * ARMOR_SLOT_MULTIPLIER[slot], ARMOR_WOBBLE),
  };
}

export function generateShieldItem(
  level: number,
  armorType: ArmorProficiency
): ShieldItem {
  return {
    name: `${armorType} Shield`,
    slot: 'offhand',
    armorType,
    armorValue: applyWobble(ARMOR_TYPE_BASE[armorType] * level * SHIELD_MULTIPLIER, ARMOR_WOBBLE),
  };
}

// ─── Weapon Generation ────────────────────────────────────────────────────────

const WEAPON_NAME: Record<WeaponType, string> = {
  '1h Swords': 'Sword',
  '2h Swords': 'Greatsword',
  '1h Maces':  'Mace',
  '2h Maces':  'Maul',
  '2h Axes':   'Greataxe',
  '1h Axes':   'Axe',
  'Daggers':   'Dagger',
  'Bows':      'Bow',
  'Staves':    'Staff',
  'Wands':     'Wand',
  'Unarmed':   'Unarmed',
};

const WEAPON_ATTACK_CATEGORY: Record<WeaponType, AttackCategory> = {
  '1h Swords': 'melee',
  '2h Swords': 'melee',
  '1h Maces':  'melee',
  '2h Maces':  'melee',
  '1h Axes':   'melee',
  '2h Axes':   'melee',
  'Daggers':   'melee',
  'Bows':      'ranged',
  'Staves':    'magic',
  'Wands':     'magic',
  'Unarmed':   'melee',
};

const WEAPON_DEFAULT_ELEMENT: Partial<Record<WeaponType, DamageElement>> = {
  '1h Swords': 'slashing',
  '2h Swords': 'slashing',
  '1h Maces':  'bludgeoning',
  '2h Maces':  'bludgeoning',
  '1h Axes':   'slashing',
  '2h Axes':   'slashing',
  'Daggers':   'piercing',
  'Bows':      'piercing',
  'Unarmed':   'bludgeoning',
  // Staves and Wands pick a random magic element at generation time
};

const WEAPON_RANGE: Record<WeaponType, number> = {
  '1h Swords': 1,
  '2h Swords': 1,
  '1h Maces':  1,
  '2h Maces':  1,
  '1h Axes':   1,
  '2h Axes':   1,
  'Daggers':   1,
  'Bows':      5,
  'Staves':    5,
  'Wands':     5,
  'Unarmed':   1,
};

export const WEAPON_ICON_PATH: Partial<Record<WeaponType, string>> = {
  '1h Swords': '/gearIcons/weapons/sword.png',
  '2h Swords': '/gearIcons/weapons/sword.png',
  '1h Maces':  '/gearIcons/weapons/mace.png',
  '2h Maces':  '/gearIcons/weapons/mace.png',
  '1h Axes':   '/gearIcons/weapons/axe.png',
  '2h Axes':   '/gearIcons/weapons/battleaxe.png',
  'Daggers':   '/gearIcons/weapons/dagger.png',
  'Bows':      '/gearIcons/weapons/bow.png',
  'Staves':    '/gearIcons/weapons/staff.png',
  'Wands':     '/gearIcons/weapons/wand.png',
};

// 2h weapons (including bows and staves) deal ~1.67x more damage than 1h
const IS_TWO_HANDED = new Set<WeaponType>(['2h Swords', '2h Maces', '2h Axes', 'Bows', 'Staves']);

const DMG_BASE_1H = 5;
const DMG_BASE_2H = 8;
const DMG_SCALE_EXP = 0.7;  // sublinear power curve: base * level^0.7
const DMG_SPREAD_1H = 0.20; // min = base × 0.80, max = base × 1.20
const DMG_SPREAD_2H = 0.35; // min = base × 0.65, max = base × 1.35

export function generateWeaponItem(
  level: number,
  weaponType: WeaponType,
  element?: DamageElement
): WeaponItem {
  const is2h = IS_TWO_HANDED.has(weaponType);
  const base = (is2h ? DMG_BASE_2H : DMG_BASE_1H) * Math.pow(level, DMG_SCALE_EXP);
  const spread = is2h ? DMG_SPREAD_2H : DMG_SPREAD_1H;
  const damageElement = element
    ?? WEAPON_DEFAULT_ELEMENT[weaponType]
    ?? MAGIC_ELEMENTS[Math.floor(Math.random() * MAGIC_ELEMENTS.length)];

  return {
    name: WEAPON_NAME[weaponType],
    slot: 'mainhand',
    weaponType,
    attackCategory: WEAPON_ATTACK_CATEGORY[weaponType],
    damageElement,
    level,
    minDamage: Math.max(1, Math.round(base * (1 - spread))),
    maxDamage: Math.max(1, Math.round(base * (1 + spread))),
    range: WEAPON_RANGE[weaponType],
  };
}
