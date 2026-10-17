import { isArmorItem, isShieldItem, SHIELD_ICON, type Item } from '../data/gear';
import { isRenderable } from '../forge/registry.vite';
import ModelIcon from './ModelIcon';

/**
 * Icon for any item: its forge model when it links to an approved design (every weapon, armor once
 * linked), otherwise its image (shields) or react-icon component (armor).
 * `className` sizes every kind; `iconClassName` adds color to component icons (e.g. 'text-gray-200').
 */
export default function ItemIcon({ item, className, iconClassName = 'text-gray-200' }: {
  item: Item;
  className: string;
  iconClassName?: string;
}) {
  if (item.model && isRenderable(item.model)) {
    return <ModelIcon link={item.model} instanceId={item.id} alt={item.name} className={className} />;
  }
  if (isShieldItem(item) && item.iconPath) {
    return <img src={item.iconPath} alt={item.name} className={`${className} object-contain`} />;
  }
  const Icon = isArmorItem(item) ? item.icon : isShieldItem(item) ? SHIELD_ICON : undefined;
  return Icon ? <Icon className={`${className} ${iconClassName}`} /> : null;
}
