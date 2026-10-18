import type { Item } from '../data/gear';
import ModelIcon from './ModelIcon';

/** Icon for any item: its forge model. `className` sizes it. */
export default function ItemIcon({ item, className }: { item: Item; className: string }) {
  return <ModelIcon link={item.model} alt={item.name} className={className} />;
}
