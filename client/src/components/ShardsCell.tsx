// Affix shards in a slot (a chest's shards, one of ItemGrid's `leading` cells): the Affix Shards model as its icon (seen
// from above at an angle, like on the floor: LOOT_ICON_CAMERA), how many in the slot's corner, and a tooltip listing
// them, each type with its category's color and its count. Right-click takes them all.
import type { MouseEvent } from 'react';
import { loot } from '../data/gear/loot';
import { SHARDS, shardCategory, shardCount, shardName, totalShards, type ShardCounts } from '../data/gear/shards';
import { ClickHint, Tooltip } from './Tooltip';
import ModelIcon from './ModelIcon';

export default function ShardsCell({ shards, onTake }: { shards: ShardCounts; onTake: () => void }) {
  const take = (e: MouseEvent) => {
    e.preventDefault(); // never the browser's menu over it
    onTake();
  };
  const total = totalShards(shards);
  const rows = SHARDS.filter((s) => shardCount(shards, s.stat) > 0);
  return (
    <Tooltip gap={10} content={
      <div className="box-border px-3.5 py-3 text-xs">
        <div className="font-display text-sm tracking-[0.03em] text-rift-loot">Affix Shards</div>
        <ul className="mt-1.5 flex flex-col gap-0.5 text-rift-soft">
          {rows.map(({ stat, category }) => (
            <li key={stat} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: shardCategory(category).color }} />
              <span className="flex-1">{shardName(stat)}</span>
              <span className="font-tech text-rift-ink">{shardCount(shards, stat)}</span>
            </li>
          ))}
        </ul>
        <ClickHint button="right" className="mt-2">Loot</ClickHint>
      </div>
    }>
      <div className="rf-cell is-filled relative" aria-label={`${total} affix shards`} onContextMenu={take}>
        <ModelIcon link={loot('affix-shards').model} alt="Affix Shards" className="w-[34px] h-[34px]" />
        <span className="absolute right-[3px] bottom-[2px] font-tech text-[9px] leading-none text-rift-loot drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
          {total}
        </span>
      </div>
    </Tooltip>
  );
}
