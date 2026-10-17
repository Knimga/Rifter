import { isArmorItem, isShieldItem, isWeaponItem, SHIELD_ICON, type Item } from '../data/gear';

/**
 * Icon for any item: image icons for weapons/shields, react-icon components for armor.
 * `className` sizes both kinds; `iconClassName` adds color to component icons (e.g. 'text-gray-200').
 */
export default function ItemIcon({ item, className, iconClassName = 'text-gray-200' }: {
  item: Item;
  className: string;
  iconClassName?: string;
}) {
  if ((isWeaponItem(item) || isShieldItem(item)) && item.iconPath) {
    return <img src={item.iconPath} alt={item.name} className={`${className} object-contain`} />;
  }
  const Icon = isArmorItem(item) ? item.icon : isShieldItem(item) ? SHIELD_ICON : undefined;
  return Icon ? <Icon className={`${className} ${iconClassName}`} /> : null;
}
