// An amount of gold: the coin icon in the gold color, then the number with thousands separators (an item's sell
// value, the party's gold).
import type { CSSProperties } from 'react';
import { FaCoins } from 'react-icons/fa';
import { formatGold } from '../../data/detailStrings';

/** `label`: what the amount is, for screen readers (the icon stands in for it on screen). `color`: the number's. */
export default function GoldAmount({ amount, label, className = '', color, style, iconClassName = 'w-3 h-3' }: {
  amount: number;
  label: string;
  className?: string;
  color?: string;
  style?: CSSProperties;
  /** The coin's size (default 12 px). */
  iconClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} style={{ ...(color ? { color } : {}), ...style }}>
      <FaCoins role="img" aria-label={label} className={`${iconClassName} shrink-0`} style={{ color: 'var(--rift-gold)' }} />
      {formatGold(amount)}
    </span>
  );
}
