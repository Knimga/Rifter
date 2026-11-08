// The party window's Shards tab: the party's affix shards (data/gear/shards.ts), kept as counts in a list instead of
// inventory slots (there is a type for every affix). At the left a rail of categories, each with the number of shard
// types the list would show for it; at the right a Carried / All toggle over the list: two columns of rows, the
// shard's icon (the Affix Shard model in its category's color), its name, and how many are carried. All lists every type,
// the ones not carried dimmed with a dash, so it doubles as a checklist.
import type { AffixStat } from '../data/gear/affixes';
import { SHARD_CATEGORIES, SHARDS, shardCategory, shardCount, shardName, type ShardCategory, type ShardCategoryId, type ShardCounts } from '../data/gear/shards';
import { loot } from '../data/gear/loot';
import { linkedDesign } from '../forge/core/link';
import { mulberry32 } from '../forge/core/rng';
import { designs } from '../forge/registry.vite';
import ModelIcon from './ModelIcon';
import type { IconTurn } from '../viewEngine/three/icons';

/** The rail's first row: every category together. */
export type ShardFilter = ShardCategoryId | 'all';

/** The All row has no category of its own: it takes the soft text color (the same as Attributes). */
const ALL_COLOR = 'var(--rift-soft)';

/**
 * A rail of shard categories (the Shards tab's, the enchanter's Sell shards): All, then each category, each with how
 * many of `pool`'s shard types are in it (dim at none). Click one to show only it.
 */
export function ShardRail({ pool, category, onCategory, label }: {
  /** The shard types the list beside it can show now: what the rail counts. */
  pool: readonly { category: ShardCategoryId }[];
  category: ShardFilter;
  onCategory: (c: ShardFilter) => void;
  /** Its name, for screen readers. */
  label: string;
}) {
  const rail = [
    { id: 'all' as const, name: 'All', color: ALL_COLOR, n: pool.length },
    ...SHARD_CATEGORIES.map((c) => ({ id: c.id, name: c.name, color: c.color, n: pool.filter((s) => s.category === c.id).length })),
  ];
  return (
    <div role="group" aria-label={label} className="rf-shrail">
      {rail.map((c) => {
        const sel = category === c.id;
        return (
          <button key={c.id} type="button" aria-pressed={sel} className={`rf-shcat ${sel ? 'is-sel' : ''}`} style={{ ['--cc' as string]: c.color }} onClick={() => onCategory(c.id)}>
            <span className="flex-1 min-w-0 text-xs whitespace-nowrap" style={{ color: sel ? 'var(--rift-bright)' : c.n ? 'var(--rift-soft)' : 'var(--rift-cap)' }}>{c.name}</span>
            <span className="flex-none text-[11px]" style={{ color: c.n ? 'var(--rift-soft)' : 'var(--rift-faint)' }}>{c.n}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function ShardsTab({ counts, category, onCategory, showAll, onShowAll }: {
  counts: ShardCounts;
  /** The rail's selected row. */
  category: ShardFilter;
  onCategory: (c: ShardFilter) => void;
  /** Whether the list shows every shard type (All), or only those the party carries (Carried). */
  showAll: boolean;
  onShowAll: (all: boolean) => void;
}) {
  const carried = (stat: AffixStat) => shardCount(counts, stat) > 0;
  // The shard types the list can show now (the rail counts these), and those of the selected category
  const pool = SHARDS.filter((s) => showAll || carried(s.stat));
  const rows = pool.filter((s) => category === 'all' || s.category === category);
  // Carried mode, nothing to list here: how many the category (or the whole list) has that the party doesn't carry
  const hidden = showAll ? 0 : SHARDS.filter((s) => (category === 'all' || s.category === category) && !carried(s.stat)).length;
  const noun = category === 'all' ? '' : ' in this category';

  return (
    <div className="rf-shards">
      <ShardRail pool={pool} category={category} onCategory={onCategory} label="Shard types" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex-none flex items-center justify-end gap-2 h-[30px]">
          <div role="group" aria-label="Which shards to list" className="rf-shsegs">
            <button type="button" aria-pressed={!showAll} className={`rf-shseg ${showAll ? '' : 'is-on'}`} onClick={() => onShowAll(false)}>Carried</button>
            <button type="button" aria-pressed={showAll} className={`rf-shseg ${showAll ? 'is-on' : ''}`} onClick={() => onShowAll(true)}>All {SHARDS.length}</button>
          </div>
        </div>
        <div role="list" aria-label="Shards" className="rf-shlist flex-1 min-h-0">
          {rows.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2.5 text-xs text-rift-label">
              <span>No shards carried{noun}.</span>
              {hidden > 0 && <button type="button" className="rf-shseg is-solo" onClick={() => onShowAll(true)}>Show all {hidden}{noun}</button>}
            </div>
          ) : (
            <div className="rf-shgrid">
              {rows.map(({ stat, category: cat }) => {
                const n = shardCount(counts, stat), c = shardCategory(cat);
                return (
                  <div key={stat} role="listitem" className="rf-shrow" style={{ opacity: n ? 1 : 0.45 }}
                    aria-label={`${shardName(stat)}, ${c.name}, ${n ? `${n} carried` : 'none carried'}`}>
                    <ShardIcon stat={stat} category={c} />
                    <span className="min-w-0 flex-1 whitespace-nowrap overflow-hidden text-ellipsis text-xs text-rift-keyname">{shardName(stat)}</span>
                    <span className="flex-none text-xs" style={{ color: n ? 'var(--rift-ink)' : 'var(--rift-faint)' }}>{n ? `×${n}` : '—'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A shard type's icon turn: a random 3D orientation (a uniformly random rotation, as a quaternion: Shoemake's
 * method), drawn from a seed made of its stat name. So every type is turned its own, random-looking way, and keeps
 * that turn (it never changes between renders, openings of the window or sessions).
 */
function shardTurn(stat: AffixStat): IconTurn {
  let h = 0;
  for (const ch of stat) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  // Three uniform numbers in [0, 1) from the seed
  const next = mulberry32(h);
  const u1 = next(), u2 = next(), u3 = next();
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1), p = 2 * Math.PI * u2, q = 2 * Math.PI * u3;
  return [a * Math.sin(p), a * Math.cos(p), b * Math.sin(q), b * Math.cos(q)];
}

/**
 * A shard's icon: the Affix Shard model painted in its category's color (one tinted model for every shard), turned
 * in 3D to the shard type's own angle (shardTurn) so the list doesn't look stamped: one icon rendered and cached per
 * type, with a subtle glow in the category's color (CSS: the model itself has no halo). Until that design is approved
 * (the game draws only approved designs), the category's dot.
 */
export function ShardIcon({ stat, category }: { stat: AffixStat; category: ShardCategory }) {
  const link = loot('affix-shard').model;
  if (!linkedDesign(designs, link)) return <span aria-hidden="true" className="flex-none w-1.5 h-1.5 rounded-full" style={{ background: category.color }} />;
  return <ModelIcon link={link} alt="" tint={category.tint} turn={shardTurn(stat)} className="flex-none w-[18px] h-[18px]"
    style={{ filter: `drop-shadow(0 0 ${SHARD_GLOW.px}px color-mix(in srgb, ${category.color} ${SHARD_GLOW.strength}%, transparent))` }} />;
}

/** The shard icons' glow: its blur radius (px) and how much of the category's color it holds (%), kept subtle. */
const SHARD_GLOW = { px: 2.5, strength: 55 };
