import type { AttackCategory, DamageElement, Rarity } from './gear';

/* ----- UI CONSTANTS ----- */

/** Floor and wall tile colors for the Sanctum map. */
export const SANCTUM_FLOOR_COLOR = '#1e2030';
export const SANCTUM_WALL_COLOR = '#0d0e18';

// UI colors are CSS variables of the palette in index.css (its one source); these name them for TS.

/** Each damage element's color (text, floating damage, ability washes). */
export const DAMAGE_ELEMENT_COLOR: Record<DamageElement, string> = {
  slashing:    'var(--el-physical)',
  piercing:    'var(--el-physical)',
  bludgeoning: 'var(--el-physical)',
  fire:        'var(--el-fire)',
  ice:         'var(--el-ice)',
  lightning:   'var(--el-lightning)',
  nature:      'var(--el-nature)',
  shadow:      'var(--el-shadow)',
  holy:        'var(--el-holy)',
  poison:      'var(--el-poison)',
};

/** Item name color by rarity. */
export const RARITY_COLOR: Record<Rarity, string> = {
  Common: 'var(--rarity-common)',
  Quality: 'var(--rarity-quality)',
  Superior: 'var(--rarity-superior)',
  Rare: 'var(--rarity-rare)',
  Exquisite: 'var(--rarity-exquisite)',
};

/** Attack category colors (the party window's offense table). */
export const ATTACK_CATEGORY_COLOR: Record<AttackCategory, string> = {
  melee: 'var(--cat-melee)',
  ranged: 'var(--cat-ranged)',
  magic: 'var(--cat-magic)',
};

/** Floating combat text colors (damage takes its element's color). */
export const COMBAT_TEXT_COLOR = {
  damage: 'var(--tone-damage)',
  mpDamage: 'var(--tone-mp-damage)',
  heal: 'var(--tone-heal)',
  dot: 'var(--tone-debuff)',
  stopped: 'var(--rift-bright)',  // missed, dodged, parried, blocked
  loot: 'var(--rift-loot)',
  warn: 'var(--rift-warn)',
  levelUp: 'var(--rift-acting)',
} as const;

/* ----- GAMEPLAY CONSTANTS ----- */

/** How far (tiles, in line of sight) an enemy spots the party: its whole group aggroes. */
export const AGGRO_RANGE = 5;

/* ----- PACING (ms): how the game's turns and ticks feel ----- */

/** Interval between out-of-combat passive regen ticks. */
export const OUT_OF_COMBAT_REGEN_INTERVAL_MS = 5000;

/**
 * How long a unit (party member or enemy) turns toward an ability's target before the ability lands. Just
 * over the model's half-turn time (smoothYaw in forge/core/facing.ts, 170 ms), so it faces the target first.
 */
export const AIM_TURN_LEAD_MS = 180;

/** How long a party member's turn lingers once it has nothing left to spend (no AP, no paid tiles), before it ends by itself. */
export const AUTO_END_TURN_DELAY_MS = 600;

/** How long "Stunned" shows over a unit that starts its turn with no AP, before the next turn. */
export const STUNNED_PAUSE_MS = 900;

/** Each beat of an enemy's first step in its turn (move, show its target, land); its follow-up steps play faster. */
export const ENEMY_STEP_PAUSE_MS = 1000;
export const ENEMY_FOLLOWUP_PAUSE_MS = 500;
