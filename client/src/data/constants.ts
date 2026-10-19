import type { DamageElement } from './gear';

/* ----- UI CONSTANTS ----- */

/** Floor and wall tile colors for the Sanctum map. */
export const SANCTUM_FLOOR_COLOR = '#1e2030';
export const SANCTUM_WALL_COLOR = '#0d0e18';

/** Color of every party member's map token and name. Classes no longer have colors; temporary until a new scheme. */
export const PARTY_MEMBER_COLOR = '#ffffff';

export const DAMAGE_ELEMENT_COLOR: Record<DamageElement, string> = {
  slashing:    'white',
  piercing:    'white',
  bludgeoning: 'white',
  fire:        'firebrick',
  ice:         'lightblue',
  lightning:   'darkturquoise',
  nature:      'forestgreen',
  shadow:      'blueviolet',
  holy:        'gold',
  poison:      'olivedrab'
};

export const DAMAGE_ELEMENT_DARK_COLOR: Record<DamageElement, string> = {
  slashing:    'dimgray',
  piercing:    'dimgray',
  bludgeoning: 'dimgray',
  fire:        '#300300',
  ice:         '#165e80',
  lightning:   '#007173',
  nature:      '#0f400f',
  shadow:      '#21072b',
  holy:        '#474701',
  poison:      '#021f00'
};

/* ----- GAMEPLAY CONSTANTS ----- */

/** Interval in ms between out-of-combat passive regen ticks. */
export const OUT_OF_COMBAT_REGEN_INTERVAL_MS = 10000;

/**
 * How long a unit (party member or enemy) turns toward an ability's target before the ability lands. Just
 * over the model's half-turn time (smoothYaw in forge/core/facing.ts, 170 ms), so it faces the target first.
 */
export const AIM_TURN_LEAD_MS = 180;
