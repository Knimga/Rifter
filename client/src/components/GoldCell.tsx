// Gold in a slot (a chest's gold, ItemGrid's `leading` cell): the Gold Coins model as its icon (seen from above at an
// angle, like on the floor: LOOT_ICON_CAMERA), its amount small in the slot's corner, and a tooltip with the amount.
// Right-click takes it.
import type { MouseEvent } from 'react';
import { loot } from '../data/gear/loot';
import { formatGold } from '../data/detailStrings';
import { ClickHint, Tooltip } from './Tooltip';
import GoldAmount from './ui/GoldAmount';
import ModelIcon from './ModelIcon';

export default function GoldCell({ amount, onTake }: { amount: number; onTake: () => void }) {
  const take = (e: MouseEvent) => {
    e.preventDefault(); // never the browser's menu over it
    onTake();
  };
  return (
    <Tooltip gap={10} content={
      <div className="box-border px-3.5 py-3 text-xs">
        <div className="font-display text-sm tracking-[0.03em]" style={{ color: 'var(--rift-gold-text)' }}>Gold</div>
        <GoldAmount amount={amount} label="Gold" className="mt-1.5 text-rift-soft" />
        <ClickHint button="right" className="mt-2">Loot</ClickHint>
      </div>
    }>
      <div className="rf-cell is-filled relative" aria-label={`${formatGold(amount)} gold`} onContextMenu={take}>
        <ModelIcon link={loot('gold').model} alt="Gold" className="w-[34px] h-[34px]" />
        <span className="absolute right-[3px] bottom-[2px] font-tech text-[9px] leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
          style={{ color: 'var(--rift-gold-text)' }}>
          {formatGold(amount)}
        </span>
      </div>
    </Tooltip>
  );
}
