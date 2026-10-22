import type { CSSProperties } from 'react';
import type { Item } from '../data/gear';
import { RARITY_COLOR } from '../data/constants';
import ModelIcon from './ModelIcon';

/** Icon for any item: its forge model. `className` sizes it. */
export default function ItemIcon({ item, className }: { item: Item; className: string }) {
  return <ModelIcon link={item.model} alt={item.name} className={className} />;
}

/**
 * The faint rarity glow for an item's cell or slot (.has-rarity in index.css): its class and color, to
 * spread onto the cell element. Nothing for a Common item.
 */
export function rarityGlow(item: Item): { className: string; style?: CSSProperties } {
  if (item.rarity === 'Common') return { className: '' };
  return { className: 'has-rarity', style: { '--rarity': RARITY_COLOR[item.rarity] } as CSSProperties };
}
