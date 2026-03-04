import type { DamageElement } from './gear';

/** Pixel size of each grid tile in the dungeon and sanctum maps. */
export const TILE_SIZE = 50;

export const DAMAGE_ELEMENT_COLOR: Record<DamageElement, string> = {
  slashing:    'white',
  piercing:    'white',
  bludgeoning: 'white',
  fire:        'firebrick',
  ice:         'lightblue',
  lightning:   'darkturquoise',
  nature:      'forestgreen',
  shadow:      'purple',
  holy:        'gold',
  poison:      'olivedrab'
};

export const DAMAGE_ELEMENT_DARK_COLOR: Record<DamageElement, string> = {
  slashing:    'gray',
  piercing:    'gray',
  bludgeoning: 'gray',
  fire:        '#300300',
  ice:         '#165e80',
  lightning:   '#007173',
  nature:      '#0f400f',
  shadow:      '#21072b',
  holy:        '#474701',
  poison:      '#021f00'
};