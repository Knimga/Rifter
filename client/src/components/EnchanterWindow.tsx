// An enchanter's window (an NPC with the 'enchanting' service, data/world/npcs.ts), opened by speaking to her: her bench
// above, with four services as tabs (data/gear/enchanting.ts), and the party's items (or, selling, its shards) and
// gold below: a tab for the inventory and one for each member's gear (laid out as in the party window). Right-click an
// item, carried or worn, to put it on the bench; click or right-click it on the bench (or right-click it again) to
// clear it. The bench only points at the item (a BenchRef) and the item never moves, so there is no unequipping and
// re-equipping, and closing the window, for any reason, leaves everything where it was. Worn gear can be enchanted in
// place, but not destroyed (Disenchant, Shatter): it has to be unequipped first.
// - Enchant: each of the bench's four affix rows (two per affix group, told apart by color) upgrades its affix or adds
//   one from a shard (a picker of the shards that fit), within the tier total's cap.
// - Disenchant: pick affixes to extract as shards; Shatter: break it for a random few. Both destroy the item and ask a
//   second click to confirm, then show what came back.
// - Sell shards: right-click a shard to sell one (shift: all of it); what was sold this session can be bought back.
// The game around it isn't dimmed (the enchanter turns to face the leader while it is open).
import { useEffect, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import ModalWindow, { WindowCloseButton } from './ui/ModalWindow';
import GoldAmount from './ui/GoldAmount';
import RightClickHint from './ui/RightClickHint';
import { PartyGold, StatusLine, useGoldPulse } from './ui/TradeStatus';
import ItemGrid from './ItemGrid';
import ItemIcon, { rarityGlow } from './ItemIcon';
import { SLOT_ICON, SLOT_POS } from './gearSlotLayout';
import { ShardIcon, ShardRail, type ShardFilter } from './ShardsTab';
import { ItemTooltipContent, Tooltip, itemTypeLine } from './Tooltip';
import type { NpcData } from '../data/world/npcs';
import { CLASSES } from '../data/units/classes';
import type { PartyMemberConfig } from '../data/units/party';
import { GEAR_SLOTS, type GearSlot, type Item } from '../data/gear';
import type { AffixStat } from '../data/gear/affixes';
import { MAX_TIER, itemTierSum, tierSumCap } from '../data/gear/affixes';
import { INVENTORY_COLS, INVENTORY_SIZE, type Inventory } from '../data/gear/inventory';
import { SHARDS, categoryOfShard, shardCategory, shardCount, shardName, type ShardCounts } from '../data/gear/shards';
import {
  BENCH_ROWS, DISENCHANT_COST, SHARD_PRICE, SHATTER_COST, addAffixCost, addBlocked, addableShards, affixGroup, affixValueText,
  benchItem, benchRows, sameBenchRef, tierValueText, upgradeBlocked, upgradeCost, type BenchParty, type BenchRef,
} from '../data/gear/enchanting';
import type { EnchantResult, SoldShard } from '../hooks/useEnchanter';
import { AFFIX_GROUP_COLOR, RARITY_COLOR } from '../data/constants';
import { SLOT_LABEL, formatModifier } from '../data/detailStrings';

/** The window's design size (px). */
const WIDTH = 672, HEIGHT = 790;

type Mode = 'enchant' | 'disenchant' | 'shatter' | 'sell';

/** Each service: its tab, its hint at the tabs' right, its accent, and the status line it starts with. */
const MODES: Record<Mode, { tab: string; hint: string; accent: string; start: string }> = {
  enchant: { tab: 'Enchant', hint: 'Upgrade or add affixes', accent: 'var(--bench-enchant)', start: 'Pick an affix to improve.' },
  disenchant: { tab: 'Disenchant', hint: 'Choose affixes to extract', accent: 'var(--bench-disenchant)', start: 'Select the affixes to extract.' },
  shatter: { tab: 'Shatter', hint: 'Break an item into shards', accent: 'var(--bench-shatter)', start: 'Shatter the item to break it into shards.' },
  sell: { tab: 'Sell shards', hint: `Shards sell for ${SHARD_PRICE} each`, accent: 'var(--bench-sell)', start: 'Right-click a shard to sell one. Shift + right-click sells all of it.' },
};
const MODE_ORDER: Mode[] = ['enchant', 'disenchant', 'shatter', 'sell'];
const EMPTY_BENCH = 'Right-click an item in your inventory or on a party member to put it on the bench.';

/** Where the party's items are picked from: the inventory, or (by index) a member's gear. */
type Source = 'inventory' | number;

/** What the enchanter does for the window (useEnchanter). */
export interface EnchanterActions {
  party: BenchParty;
  sold: SoldShard[];
  upgrade: (at: BenchRef, idx: number) => EnchantResult;
  add: (at: BenchRef, stat: AffixStat) => EnchantResult;
  extract: (at: BenchRef, idxs: number[]) => EnchantResult;
  shatter: (at: BenchRef) => EnchantResult;
  sell: (stat: AffixStat, all?: boolean) => EnchantResult;
  buyBack: (stat: AffixStat) => EnchantResult;
}

/** A destroyed item's result card: what was done, the item, and the shards it gave. */
interface Outcome {
  title: string;
  item: Item;
  stats: AffixStat[];
}


export default function EnchanterWindow({ enchanter, npc, party, inventory, gold, shards, canUse, onClose }: {
  enchanter: EnchanterActions;
  npc: NpcData;
  /** The party members: their worn gear can go on the bench too. */
  party: PartyMemberConfig[];
  inventory: Inventory;
  gold: number;
  shards: ShardCounts;
  /** Whether someone in the party can use an item (unusable items show tinted, as in the inventory). */
  canUse: (item: Item) => boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('enchant');
  // The item on the bench (where it lives), and the tab of the panel below that is showing
  const [bench, setBench] = useState<BenchRef | null>(null);
  const [source, setSource] = useState<Source>('inventory');
  // Disenchant: the affixes picked to extract (item.affixes indexes)
  const [picked, setPicked] = useState<number[]>([]);
  // Disenchant / Shatter: the main button was clicked once and asks for a second click
  const [armed, setArmed] = useState(false);
  // Enchant: the bench row whose shard picker is open
  const [picker, setPicker] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [category, setCategory] = useState<ShardFilter>('all');
  const [message, setMessage] = useState<{ text: string; bad: boolean }>({ text: EMPTY_BENCH, bad: false });
  // The gold readout's pulse, and the last changed row's glow (a count, so each restarts it: alternating animations)
  const goldPulse = useGoldPulse();
  const [flash, setFlash] = useState<{ row: number; n: number }>({ row: -1, n: 0 });

  const item = benchItem(bench, inventory, party);
  // Whose gear the benched item is worn by, if worn
  const owner = bench?.kind === 'gear' ? party[bench.member].characterName : null;
  const accent = MODES[mode].accent;
  const say = (text: string, bad = false) => setMessage({ text, bad });

  /** Show what an action did; a spend (or a failure for want of gold) pulses the gold. */
  const report = (r: EnchantResult, row?: number) => {
    say(r.message, !r.ok);
    if (r.ok || r.message.includes('gold')) goldPulse.pulse(!r.ok);
    if (r.ok && row !== undefined) setFlash((f) => ({ row, n: f.n + 1 }));
  };
  /** Back to the service's start: no selection, picker, armed confirm or result. */
  const reset = () => { setPicked([]); setArmed(false); setPicker(null); setOutcome(null); };
  /** Put the item `ref` points at on the bench (null: clear it). */
  const place = (ref: BenchRef | null) => {
    reset();
    setBench(ref);
    const it = benchItem(ref, inventory, party);
    say(!ref || !it ? 'Bench cleared.' : `Put ${ref.kind === 'gear' ? `${party[ref.member].characterName}'s ` : ''}${it.name} on the bench.`);
  };
  /** Right-click: put an item on the bench, or, if it is the one there, clear it. */
  const toggle = (ref: BenchRef) => place(sameBenchRef(bench, ref) ? null : ref);
  const switchMode = (m: Mode) => {
    reset();
    setMode(m);
    say(m !== 'sell' && !item ? EMPTY_BENCH : MODES[m].start);
  };

  // Esc backs out one layer: the shard picker, then an armed confirm; only then (GameScreen) does it close the window
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || (picker === null && !armed)) return;
      e.stopImmediatePropagation();
      if (picker !== null) setPicker(null);
      else { setArmed(false); say(MODES[mode].start); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [picker, armed, mode]);

  /** Disenchant or Shatter, on its second click: the item is destroyed and its shards shown. */
  const destroy = () => {
    if (!bench || !item || bench.kind === 'gear') return;
    const r = mode === 'disenchant' ? enchanter.extract(bench, picked) : enchanter.shatter(bench);
    report(r);
    setArmed(false);
    if (!r.returned) return;
    setBench(null);
    setPicked([]);
    setOutcome({ title: mode === 'disenchant' ? 'Affixes extracted' : 'Item shattered', ...r.returned });
  };

  const goldReadout = <PartyGold gold={gold} cls={goldPulse.cls} />;

  return (
    <ModalWindow width={WIDTH} height={HEIGHT} labelledBy="enchanter-title" closeLabel={`Stop talking to ${npc.name}`} onClose={onClose} dim={false}
      className="flex flex-col pt-5 px-6 pb-[22px]">
      <header className="flex-none flex items-center justify-between gap-4 min-h-[52px]">
        <div className="min-w-0">
          <h2 id="enchanter-title" className="m-0 font-display font-normal text-[26px] tracking-[0.06em] leading-[1.1] text-rift-bright">{npc.name}</h2>
          <p className="mt-1.5 mb-0 text-xs tracking-[0.14em] uppercase text-rift-muted">{npc.title}</p>
        </div>
        <WindowCloseButton onClose={onClose} />
      </header>

      {/* The bench: its service's tabs, then the item and its affixes (or, selling, what was sold) */}
      <section aria-label="Enchanting bench" className="rf-panel rf-bench relative isolate flex-none mt-3 h-[332px] p-3.5" style={{ ['--ac' as string]: accent }}>
        <BenchDecor mode={mode} />
        <div className="flex items-center justify-between gap-3 h-[30px]">
          <div role="tablist" aria-label="Service" className="rf-segs">
            {MODE_ORDER.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} className={`rf-seg ${mode === m ? 'is-on' : ''}`} onClick={() => switchMode(m)}>
                {MODES[m].tab}
              </button>
            ))}
          </div>
          <span className="text-[10px] tracking-[0.1em] uppercase text-rift-off whitespace-nowrap">{MODES[mode].hint}</span>
        </div>

        {mode === 'sell' ? <SoldList sold={enchanter.sold} gold={gold} onBuyBack={(stat) => report(enchanter.buyBack(stat))} /> : (
          <div className="flex gap-4 mt-3 h-[262px]">
            <ItemColumn item={item} owner={owner} partyLevel={enchanter.party.partyLevel} onClear={() => place(null)} />
            <div className="flex-1 min-w-0 flex flex-col">
              {outcome ? <ResultCard outcome={outcome} onDone={() => setOutcome(null)} /> : (
                <>
                  <AffixRows mode={mode} item={item} worn={bench?.kind === 'gear'} party={enchanter.party} picked={picked} flash={flash}
                    onUpgrade={(idx, row) => report(enchanter.upgrade(bench!, idx), row)}
                    onBlocked={(why) => say(why, true)}
                    onOpenPicker={(row) => setPicker(row)}
                    onTogglePick={(idx) => { setArmed(false); setPicked((p) => (p.includes(idx) ? p.filter((i) => i !== idx) : [...p, idx])); }} />
                  <Footer mode={mode} item={item} worn={bench?.kind === 'gear'} picked={picked} gold={gold} armed={armed}
                    onBlocked={(why) => { say(why, true); if (why.includes('gold')) goldPulse.pulse(true); }}
                    onArm={() => { setArmed(true); say('Click again to confirm. The item will be destroyed.', true); }}
                    onConfirm={destroy}
                    onDisarm={() => setArmed(false)} />
                </>
              )}
            </div>
          </div>
        )}

        {picker !== null && item && (
          <ShardPicker item={item} row={picker} shards={shards}
            onPick={(stat) => { report(enchanter.add(bench!, stat), picker); setPicker(null); }}
            onClose={() => setPicker(null)} />
        )}
      </section>

      {mode === 'sell' ? (
        // The party's shards, to sell
        <section aria-label="Party shards" className="rf-panel flex-none mt-3 p-3.5">
          <div className="flex items-baseline justify-between mb-2.5">
            <h3 className="rf-h">Shards <RightClickHint text="Sell" label="Right-click to sell" /></h3>
            {goldReadout}
          </div>
          <ShardSale shards={shards} category={category} onCategory={setCategory}
            onSell={(stat, all) => report(enchanter.sell(stat, all))} />
        </section>
      ) : (
        // The party's items: the inventory, or a member's gear. Right-click one to put it on the bench (it stays where it is)
        <section aria-label="Party gear" className="rf-panel flex-none mt-3 p-3.5" style={{ ['--ac' as string]: accent }}>
          <div className="flex items-center justify-between h-[26px] mb-2.5">
            <span className="flex items-center gap-3.5">
              <div role="tablist" aria-label="Item source" className="rf-segs" style={{ height: 26 }}>
                {(['inventory', ...party.map((_, i) => i)] as Source[]).map((src) => (
                  <button key={src} type="button" role="tab" aria-selected={source === src} className={`rf-seg ${source === src ? 'is-on' : ''}`} onClick={() => setSource(src)}>
                    {src === 'inventory' ? 'Inventory' : party[src].characterName}
                    {/* The benched item is worn by this member (the inventory shows its own mark in the grid) */}
                    {src !== 'inventory' && bench?.kind === 'gear' && bench.member === src && (
                      <span aria-label=", item on the bench" className="inline-block w-[5px] h-[5px] ml-[7px] align-[2px] rotate-45"
                        style={{ background: 'var(--ac)', boxShadow: '0 0 6px var(--ac)' }} />
                    )}
                  </button>
                ))}
              </div>
              <RightClickHint text="Bench" label="Right-click to put on bench" />
            </span>
            {goldReadout}
          </div>
          {source === 'inventory' ? (
            <ItemGrid label="Party inventory" items={inventory} cols={INVENTORY_COLS} size={INVENTORY_SIZE}
              canUse={canUse} unusableNote=", no one can use it" affixTiers
              action={() => 'Put on bench'} onAction={(idx) => toggle({ kind: 'inventory', idx })}
              selected={(idx) => sameBenchRef(bench, { kind: 'inventory', idx })} />
          ) : (
            <GearView member={party[source]} memberIdx={source} bench={bench} partyLevel={enchanter.party.partyLevel} onBench={toggle} />
          )}
        </section>
      )}

      {/* What the last action did, or why it couldn't */}
      <StatusLine text={message.text} bad={message.bad} />
    </ModalWindow>
  );
}

// ─── The bench's decoration ───────────────────────────────────────────────────

/** A corner bracket with a small diamond, turned to its corner. */
function Bracket({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  const place = { tl: 'left-[5px] top-[5px]', tr: 'right-[5px] top-[5px] -scale-x-100', bl: 'left-[5px] bottom-[5px] -scale-y-100', br: 'right-[5px] bottom-[5px] -scale-100' }[corner];
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={`absolute opacity-70 ${place}`} style={{ color: 'var(--ac)' }}>
      <path d="M1 19V6a5 5 0 015-5h13" stroke="currentColor" strokeWidth="1" />
      <path d="M6 6l2.5 2.5L6 11 3.5 8.5z" fill="currentColor" />
    </svg>
  );
}

/** Each service's faint motif behind the rows: a rune circle, broken rings, a cracked ring, a ring of coins. */
const MOTIF: Record<Mode, ReactNode> = {
  enchant: (
    <g transform="translate(290 131)" stroke="currentColor" strokeOpacity="0.5">
      <circle r="122" strokeWidth="1" /><circle r="108" strokeWidth="1.2" strokeDasharray="2 7" strokeLinecap="round" /><circle r="84" strokeWidth="1" strokeDasharray="14 5 3 5" />
      <path d="M0 -84V-122M0 84V122M-84 0H-122M84 0H122M59 -59L86 -86M-59 -59L-86 -86M59 59L86 86M-59 59L-86 86" strokeWidth="1" />
      <rect x="-44" y="-44" width="88" height="88" strokeWidth="1" /><rect x="-44" y="-44" width="88" height="88" strokeWidth="1" transform="rotate(45)" />
      <circle r="14" strokeWidth="1" /><circle r="3" fill="currentColor" stroke="none" />
      <path d="M0 -122l4 4-4 4-4-4zM0 122l4-4-4-4-4 4zM-122 0l4-4 4 4-4 4zM122 0l-4-4-4 4 4 4z" fill="currentColor" stroke="none" />
    </g>
  ),
  disenchant: (
    <g transform="translate(290 131)" stroke="currentColor" strokeOpacity="0.5">
      <circle r="46" strokeWidth="1.2" /><circle r="30" strokeWidth="1" strokeDasharray="3 5" />
      <circle r="92" strokeWidth="1" strokeDasharray="58 22" /><circle r="118" strokeWidth="1" strokeDasharray="22 40 6 40" strokeLinecap="round" />
      <path d="M0 -54V-140M0 54V140M-54 0H-140M54 0H140M38 -38L98 -98M-38 -38L-98 -98M38 38L98 98M-38 38L-98 98M20 -50L48 -130M-20 50L-48 130M50 20L130 48M-50 -20L-130 -48" strokeWidth="1" strokeDasharray="3 7" strokeLinecap="round" />
      <path d="M-8 -66l8-8 8 8M-8 66l8 8 8-8M-66 -8l-8 8 8 8M66 -8l8 8-8 8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  shatter: (
    <g transform="translate(290 131)" stroke="currentColor" strokeOpacity="0.55" strokeLinejoin="round" strokeLinecap="round">
      <circle r="112" strokeWidth="1" strokeDasharray="46 12 20 30 70 18" /><circle r="70" strokeWidth="1" strokeDasharray="3 6" />
      <path d="M0 0L-14 -26L6 -46L-8 -78L14 -100L8 -140" strokeWidth="1.2" /><path d="M0 0L28 -14L52 6L88 -4L110 20L150 16" strokeWidth="1.2" />
      <path d="M0 0L18 30L-4 54L22 84L10 120L26 150" strokeWidth="1.2" /><path d="M0 0L-30 12L-46 -4L-84 14L-104 -6L-150 4" strokeWidth="1.2" />
      <path d="M-46 -4L-52 -34M52 6L60 38M22 84L58 96M-14 -26L-40 -40" strokeWidth="1" />
      <path d="M0 -7L7 0L0 7L-7 0z" fill="currentColor" stroke="none" />
    </g>
  ),
  sell: (
    <g transform="translate(290 131)" stroke="currentColor" strokeOpacity="0.5">
      <circle r="124" strokeWidth="1" /><circle r="92" strokeWidth="1" strokeDasharray="2 7" strokeLinecap="round" />
      <g strokeWidth="1">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <circle key={i} cx={(108 * Math.cos(a)).toFixed(1)} cy={(108 * Math.sin(a)).toFixed(1)} r="5" />;
        })}
      </g>
      <circle r="64" strokeWidth="1" /><circle r="50" strokeWidth="1.2" strokeDasharray="14 5 3 5" /><circle r="30" strokeWidth="1" />
      <path d="M0 -20L14 0L0 20L-14 0z" strokeWidth="1.2" /><path d="M0 -124V-92M0 124V92M-124 0H-92M124 0H92" strokeWidth="1" />
    </g>
  ),
};

/** The bench's backdrop in its service's accent: a gradient wash, its motif, and corner brackets. Behind everything. */
function BenchDecor({ mode }: { mode: Mode }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden pointer-events-none rounded-sm"
      style={{
        background: 'radial-gradient(ellipse 62% 95% at 76% 58%, color-mix(in srgb, var(--ac) 16%, transparent) 0%, transparent 72%), '
          + 'radial-gradient(ellipse 40% 60% at 8% 30%, color-mix(in srgb, var(--ac) 9%, transparent) 0%, transparent 80%), '
          + 'linear-gradient(180deg, color-mix(in srgb, var(--ac) 8%, transparent) 0%, transparent 38%)',
      }}>
      <svg width="420" height="262" viewBox="0 0 420 262" fill="none" className="absolute right-2 bottom-1.5 opacity-95" style={{ color: 'var(--ac)' }}>
        {MOTIF[mode]}
      </svg>
      <Bracket corner="tl" /><Bracket corner="tr" /><Bracket corner="bl" /><Bracket corner="br" />
    </div>
  );
}

// ─── The item column ──────────────────────────────────────────────────────────

/** The item on the bench (or its empty slot), who wears it, its implicit, and the tier total against the party level's cap. */
function ItemColumn({ item, owner, partyLevel, onClear }: { item: Item | null; owner: string | null; partyLevel: number; onClear: () => void }) {
  const cap = tierSumCap(partyLevel);
  const sum = item ? itemTierSum(item.affixes) : 0;
  const atCap = !!item && sum >= cap;
  const glow = item ? rarityGlow(item) : null;
  const clear = (e: MouseEvent) => { e.preventDefault(); onClear(); };
  return (
    <div className="flex-none w-[168px] flex flex-col">
      {item ? (
        <>
          <button type="button" className={`rf-cell is-filled ${glow!.className}`} aria-label={`${item.name} on the bench. Click to clear the bench.`}
            onClick={onClear} onContextMenu={clear}
            style={{ ...glow!.style, width: 72, height: 72, borderColor: 'color-mix(in srgb, var(--ac) 45%, var(--rift-edge))',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04), inset 0 -2px 8px rgba(0, 0, 0, 0.6), 0 0 28px color-mix(in srgb, var(--ac) 28%, transparent)' }}>
            <ItemIcon item={item} className="w-[48px] h-[48px]" />
          </button>
          <span className="block mt-2.5 font-display text-sm leading-[1.25] tracking-[0.03em]" style={{ color: RARITY_COLOR[item.rarity] }}>{item.name}</span>
          <span className="block mt-[3px] text-[11px] capitalize text-rift-muted">{itemTypeLine(item)}</span>
          {owner && <span className="block mt-1 text-[11px]" style={{ color: 'var(--ac)' }}>Equipped · {owner}</span>}
          <span className="block mt-2 pt-2 text-xs text-rift-ink" style={{ borderTop: '1px solid color-mix(in srgb, var(--ac) 22%, var(--rift-seam))' }}>
            {item.implicit ? formatModifier(item.implicit.stat, item.implicit.value) : ''}
          </span>
        </>
      ) : (
        <>
          <div className="rf-cell" aria-hidden="true"
            style={{ width: 72, height: 72, borderStyle: 'dashed', borderColor: 'color-mix(in srgb, var(--ac) 35%, var(--rift-edge))',
              boxShadow: '0 0 22px color-mix(in srgb, var(--ac) 14%, transparent), inset 0 1px 6px rgba(0, 0, 0, 0.7)' }} />
          <span className="block mt-2.5 text-xs leading-normal text-rift-label">Right-click an item in your inventory or on a party member to put it here.</span>
        </>
      )}
      <div className="mt-auto">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] tracking-[0.1em] uppercase text-rift-off">Tier total</span>
          <span className="text-base" style={{ color: !item ? 'var(--rift-off)' : atCap ? 'var(--tier-cap)' : 'var(--rift-ink)' }}>
            {sum}<span className="text-xs text-rift-off"> / {cap}</span>
          </span>
        </div>
        <div role="img" aria-label={`Tier total ${sum} of ${cap}`} className="flex gap-0.5 mt-1.5 h-1.5">
          {Array.from({ length: cap }, (_, i) => (
            <span key={i} className="flex-1" style={i < sum
              ? { background: atCap ? 'var(--tier-cap)' : 'var(--rift-soft)', boxShadow: '0 0 5px color-mix(in srgb, var(--rift-soft) 35%, transparent)' }
              : { background: 'var(--rift-seam)' }} />
          ))}
        </div>
        <span className="block mt-[7px] text-[11px] leading-[1.4] text-rift-off">The cap rises with party level.</span>
      </div>
    </div>
  );
}

// ─── A member's gear ──────────────────────────────────────────────────────────

/** One of a member's gear slots (the party window's arrangement): right-click (or Enter / Space) puts its item on the bench. */
function GearSlotButton({ slot, item, picked, onBench }: { slot: GearSlot; item: Item | null; picked: boolean; onBench: () => void }) {
  const Icon = SLOT_ICON[slot];
  const pos = { gridColumn: SLOT_POS[slot].col, gridRow: SLOT_POS[slot].row };
  const label = <span className="text-[10px] leading-none tracking-[0.08em] uppercase">{SLOT_LABEL[slot]}</span>;
  if (!item) {
    return (
      <div className="rf-eqs opacity-60" style={{ ...pos, height: 42 }} role="img" aria-label={`${SLOT_LABEL[slot]}: empty`}>
        <Icon className="w-5 h-5 text-rift-rim" />
        {label}
      </div>
    );
  }
  const glow = rarityGlow(item);
  return (
    <Tooltip gap={10} style={pos} content={<ItemTooltipContent item={item} clickAction="Put on bench" affixTiers />}>
      <button type="button" className={`rf-eqs is-filled ${glow.className} ${picked ? 'is-bench' : ''}`} style={{ ...glow.style, height: 42 }}
        aria-label={`${SLOT_LABEL[slot]}: ${item.name}, ${item.rarity}${picked ? ', on the bench' : ''}`}
        onContextMenu={(e) => { e.preventDefault(); onBench(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBench(); } }}>
        <ItemIcon item={item} className="w-[22px] h-[22px]" />
        {label}
      </button>
    </Tooltip>
  );
}

/**
 * A member's gear, as the bottom panel shows it: the slots as in the party window, and a read-only list of each
 * piece's tier total against the cap (which pieces still have room).
 */
function GearView({ member, memberIdx, bench, partyLevel, onBench }: {
  member: PartyMemberConfig; memberIdx: number; bench: BenchRef | null; partyLevel: number; onBench: (ref: BenchRef) => void;
}) {
  const cap = tierSumCap(partyLevel);
  return (
    <div className="flex gap-6 h-[246px]">
      <div role="group" aria-label={`${member.characterName} equipment`} className="flex-none grid gap-x-6"
        style={{ gridTemplateColumns: 'repeat(3, 84px)', gridTemplateRows: 'repeat(5, 42px)', rowGap: 9 }}>
        {GEAR_SLOTS.map((slot) => {
          const ref: BenchRef = { kind: 'gear', member: memberIdx, slot };
          return <GearSlotButton key={slot} slot={slot} item={member.gear[slot]} picked={sameBenchRef(bench, ref)} onBench={() => onBench(ref)} />;
        })}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <h3 className="m-0 font-display font-normal text-lg tracking-[0.05em] text-rift-bright">{member.characterName}</h3>
        <span className="mt-[3px] text-[10px] tracking-[0.12em] uppercase text-rift-off">{CLASSES[member.selectedClass].name} · Level {partyLevel}</span>
        <div className="mt-3 border-t border-rift-seam">
          <div className="flex justify-between pt-1.5 pb-1 text-[10px] tracking-[0.1em] uppercase text-rift-off"><span>Gear</span><span>Tier total</span></div>
          {GEAR_SLOTS.map((slot) => {
            const worn = member.gear[slot], sum = worn ? itemTierSum(worn.affixes) : 0;
            return (
              <div key={slot} className="rf-grow">
                <span className="flex-none w-[74px] text-[10px] tracking-[0.08em] uppercase text-rift-off">{SLOT_LABEL[slot]}</span>
                <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: worn ? RARITY_COLOR[worn.rarity] : 'var(--rift-off)' }}>{worn?.name ?? ''}</span>
                <span className="flex-none" style={{ color: !worn ? 'var(--rift-off)' : sum >= cap ? 'var(--tier-cap)' : 'var(--rift-ink)' }}>{worn ? `${sum} / ${cap}` : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── The affix rows ───────────────────────────────────────────────────────────

/** A row's button: its label (or why it is blocked), and its gold cost (red when short of it). */
function ActButton({ label, cost, blocked, short, aria, onClick, className = 'rf-act', width }: {
  label: string; cost?: number; blocked: boolean; short?: boolean; aria: string; onClick: () => void; className?: string; width?: number;
}) {
  return (
    <button type="button" className={`${className} ${blocked ? 'is-block' : ''}`} aria-disabled={blocked} aria-label={aria} onClick={onClick} style={width ? { width } : undefined}>
      <span>{label}</span>
      {cost !== undefined && (
        <GoldAmount amount={cost} label="Gold" className="tracking-normal text-xs" color={short ? 'var(--rift-down)' : 'var(--rift-gold-text)'} />
      )}
    </button>
  );
}

/** An affix's five tier pips: reached ones filled, the next one dashed when it can be bought. */
function Pips({ tier, next, color }: { tier: number; next: boolean; color: string }) {
  return (
    <span aria-hidden="true" className="flex gap-[3px]">
      {Array.from({ length: MAX_TIER }, (_, i) => (
        <span key={i} className="w-2 h-2 box-border" style={i < tier
          ? { background: color, border: `1px solid ${color}`, boxShadow: `0 0 6px color-mix(in srgb, ${color} 55%, transparent)` }
          : i === tier && next ? { background: 'transparent', border: `1px dashed ${color}` }
            : { background: 'var(--rift-sunk)', border: '1px solid var(--rift-edge)' }} />
      ))}
    </span>
  );
}

/** The bench's four affix rows (two per group), as each service shows them. */
function AffixRows({ mode, item, worn, party, picked, flash, onUpgrade, onBlocked, onOpenPicker, onTogglePick }: {
  /** `worn`: the item is worn, so nothing can be extracted from it (Disenchant shows its affixes, with nothing to pick). */
  mode: Mode; item: Item | null; worn: boolean; party: BenchParty; picked: number[]; flash: { row: number; n: number };
  onUpgrade: (idx: number, row: number) => void;
  onBlocked: (why: string) => void;
  onOpenPicker: (row: number) => void;
  onTogglePick: (idx: number) => void;
}) {
  const rows = item ? benchRows(item) : BENCH_ROWS.map(() => null);
  const pickable = mode === 'disenchant' && !worn;
  return (
    <div role="list" aria-label="Affixes" className="flex flex-col gap-1">
      {rows.map((idx, row) => {
        const gc = AFFIX_GROUP_COLOR[BENCH_ROWS[row]];
        const fl = flash.row === row ? (flash.n % 2 ? ' fl-a' : ' fl-b') : '';
        const style = { ['--gc' as string]: gc, ...(row === 2 ? { marginTop: 10 } : {}) };
        if (!item || idx === null) {
          // An empty slot: in Enchant, adding an affix of its group
          const why = item && mode === 'enchant' ? addBlocked(item, BENCH_ROWS[row], party) : null;
          const cost = item ? addAffixCost(item.affixes.length) : 0;
          return (
            <div key={row} role="listitem" className={`rf-erow is-empty${fl}`} style={style}>
              <span className="text-xs" style={{ color: 'color-mix(in srgb, var(--rift-off) 50%, var(--rift-faint))' }}>{item ? 'Empty slot' : '—'}</span>
              <span aria-hidden="true" /><span />
              <span className="flex justify-end">
                {item && mode === 'enchant' && (
                  <ActButton label={why ? why.short : 'Add'} cost={!why || why.short === 'Need gold' ? cost : undefined} blocked={!!why} short={!!why}
                    aria={why ? `Add affix unavailable: ${why.long}` : `Add affix, ${cost} gold`}
                    onClick={() => (why ? onBlocked(why.long) : onOpenPicker(row))} />
                )}
              </span>
            </div>
          );
        }
        const affix = item.affixes[idx], stat = affix.stat as AffixStat, tier = affix.tier ?? 1, name = shardName(stat);
        const why = mode === 'enchant' ? upgradeBlocked(item, idx, party) : null;
        const canNext = mode === 'enchant' && tier < MAX_TIER;
        const sel = pickable && picked.includes(idx);
        const have = shardCount(party.shards, stat);
        return (
          <div key={row} role="listitem" className={`rf-erow ${sel ? 'is-sel' : ''} ${pickable ? 'can-pick' : ''}${fl}`} style={style}
            onClick={pickable ? () => onTogglePick(idx) : undefined}>
            <span className="min-w-0">
              <span className="block text-xs leading-4 text-rift-ink whitespace-nowrap">{name}</span>
              <span className="block text-[11px] leading-[14px] text-rift-muted whitespace-nowrap">
                {affixValueText(stat, affix.value)}{tier >= MAX_TIER ? ' · max' : ''}
                {canNext && <span style={{ color: gc }}> → {tierValueText(item, stat, tier + 1)}</span>}
              </span>
            </span>
            <Pips tier={tier} next={canNext && !why} color={gc} />
            <span className="text-xs text-right" style={{ color: have > 0 ? 'var(--rift-soft)' : 'var(--rift-down)' }}>{mode === 'enchant' ? `◇ ×${have}` : ''}</span>
            <span className="flex justify-end">
              {mode === 'enchant' && (
                <ActButton label={why ? why.short : 'Upgrade'} cost={!why || why.short === 'Need gold' ? upgradeCost(tier + 1) : undefined} blocked={!!why} short={!!why}
                  aria={why ? `Upgrade ${name} unavailable: ${why.long}` : `Upgrade ${name} to tier ${tier + 1}, ${upgradeCost(tier + 1)} gold`}
                  onClick={() => (why ? onBlocked(why.long) : onUpgrade(idx, row))} />
              )}
              {pickable && (
                <button type="button" role="checkbox" aria-checked={sel} aria-label={`Extract ${name}`} className={`rf-chk ${sel ? 'is-on' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onTogglePick(idx); }}>
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: sel ? 1 : 0 }}>
                    <path d="M2 6.5l2.7 2.7L10 3.2" />
                  </svg>
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The bench's footer: a line of help, and (Disenchant, Shatter) the main button, which asks a second click to confirm. */
function Footer({ mode, item, worn, picked, gold, armed, onBlocked, onArm, onConfirm, onDisarm }: {
  /** `worn`: the item is worn, which can't be destroyed: the button stays blocked, "Unequip first". */
  mode: Mode; item: Item | null; worn: boolean; picked: number[]; gold: number; armed: boolean;
  onBlocked: (why: string) => void; onArm: () => void; onConfirm: () => void; onDisarm: () => void;
}) {
  if (mode === 'enchant') {
    return <div className="mt-auto h-[38px] flex items-center text-[11px] leading-[1.45] text-rift-off">Each change uses one matching shard.</div>;
  }
  if (worn && item) {
    return (
      <div className="mt-auto h-[38px] flex items-center justify-between gap-3">
        <span className="text-[11px] leading-[1.45] text-rift-off">Equipped gear can't be destroyed. Unequip it first.</span>
        <ActButton className="rf-main" label="Unequip first" blocked aria="Unavailable: unequip the item first"
          onClick={() => onBlocked(`Unequip ${item.name} in the party screen first.`)} />
      </div>
    );
  }
  const dis = mode === 'disenchant';
  const count = item?.affixes.length ?? 0;
  const n = dis ? picked.length : count;
  const cost = dis ? (DISENCHANT_COST[n - 1] ?? 0) : SHATTER_COST;
  const poor = !!item && n > 0 && gold < cost;
  const verb = dis ? 'Extract' : 'Shatter';
  const label = !item ? verb : count === 0 ? 'No affixes' : dis && n === 0 ? 'Select affixes' : poor ? 'Need gold' : armed ? 'Confirm' : verb;
  const blocked = !item || count === 0 || (dis && n === 0) || poor;
  const text = dis
    ? n === 0 ? 'Pick the affixes to take. The item is destroyed.' : n === 1 ? 'Returns 1 shard. The item is destroyed.' : `Returns ${n} shards. Each extra affix costs far more.`
    : 'Returns a random number of its affixes as shards. The item is destroyed.';
  const why = poor ? 'Not enough gold.' : !item ? 'Place an item on the bench first.' : count === 0 ? 'This item has no affixes.' : 'Select at least one affix to extract.';
  return (
    <div className="mt-auto h-[38px] flex items-center justify-between gap-3">
      <span className="text-[11px] leading-[1.45]" style={{ color: armed ? 'var(--rift-down)' : 'var(--rift-off)' }}>{text}</span>
      <span onBlur={onDisarm}>
        <ActButton className={`rf-main ${armed && !blocked ? 'is-armed' : ''}`} label={label} blocked={blocked} short={poor}
          cost={item && count > 0 && (!dis || n > 0) ? cost : undefined}
          aria={blocked ? label : armed ? `Confirm. Destroys ${item!.name}` : `${label} for ${cost} gold`}
          onClick={() => (blocked ? onBlocked(why) : armed ? onConfirm() : onArm())} />
      </span>
    </div>
  );
}

/** A destroyed item's result: what was done, the item, and a line per shard returned (in its group's color). */
function ResultCard({ outcome, onDone }: { outcome: Outcome; onDone: () => void }) {
  return (
    <div role="status" className="rf-shlist flex-1 p-4 flex flex-col">
      <h3 className="rf-h">{outcome.title}</h3>
      <span className="block mt-1.5 text-xs text-rift-muted">{outcome.item.name} was destroyed. You received:</span>
      <div className="mt-3 flex flex-col gap-1 overflow-y-auto">
        {outcome.stats.map((stat, i) => (
          <div key={i} className="flex items-center justify-between h-7 px-2.5 box-border bg-rift-raised border border-rift-seam rounded-sm text-xs"
            style={{ borderLeft: `3px solid ${AFFIX_GROUP_COLOR[affixGroup({ stat, value: 0 })]}` }}>
            <span className="text-rift-ink">{shardName(stat)} shard</span><span style={{ color: 'var(--rift-levelup)' }}>+1</span>
          </div>
        ))}
      </div>
      <button type="button" className="rf-main mt-auto self-end" onClick={onDone}>Continue</button>
    </div>
  );
}

/**
 * Adding an affix: the shards that fit the row's slot (its group, carried, not already on the item, one its type can
 * roll), each with its tier-1 value and how many are carried. Click one to add it; Esc or the X cancels.
 */
function ShardPicker({ item, row, shards, onPick, onClose }: {
  item: Item; row: number; shards: ShardCounts; onPick: (stat: AffixStat) => void; onClose: () => void;
}) {
  const group = BENCH_ROWS[row], gc = AFFIX_GROUP_COLOR[group];
  return (
    <div role="dialog" aria-label="Choose a shard" className="absolute left-[198px] right-3.5 top-14 bottom-3.5 z-20 box-border flex flex-col p-2.5 bg-rift-panel rounded-sm"
      style={{ border: `1px solid color-mix(in srgb, ${gc} 50%, var(--rift-line))`, borderLeft: `3px solid ${gc}`, boxShadow: '0 14px 40px rgba(0, 0, 0, 0.7)' }}>
      <div className="flex items-center justify-between h-[30px]">
        <h3 className="rf-h">Choose a shard</h3>
        <span className="flex items-center gap-2.5">
          <GoldAmount amount={addAffixCost(item.affixes.length)} label="Cost" className="text-xs" color="var(--rift-gold-text)" />
          <button type="button" className="rf-btn w-7 h-7 flex items-center justify-center p-0 text-rift-soft" aria-label="Cancel" onClick={onClose}>
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </button>
        </span>
      </div>
      <div className="rf-shlist flex-1 mt-2">
        {addableShards(item, group, shards).map((stat) => (
          <button key={stat} type="button" className="rf-pick" aria-label={`Add ${shardName(stat)}, ${tierValueText(item, stat, 1)}`} onClick={() => onPick(stat)}>
            <span aria-hidden="true" className="flex-none w-1.5 h-1.5 rounded-full" style={{ background: categoryOfShard(stat).color }} />
            <span className="flex-1 text-left text-rift-ink">{shardName(stat)}</span>
            <span style={{ color: gc }}>{tierValueText(item, stat, 1)}</span>
            <span className="w-[34px] text-right text-rift-muted">×{shardCount(shards, stat)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Selling shards ───────────────────────────────────────────────────────────

/** What was sold this session: how many and for how much, and each shard type sold, to buy back. */
function SoldList({ sold, gold, onBuyBack }: { sold: SoldShard[]; gold: number; onBuyBack: (stat: AffixStat) => void }) {
  const count = sold.reduce((s, x) => s + x.n, 0);
  const short = gold < SHARD_PRICE;
  return (
    <div className="flex gap-4 mt-3 h-[262px]">
      <div className="flex-none w-[168px] flex flex-col">
        <span className="text-[10px] tracking-[0.1em] uppercase text-rift-off">Sold this session</span>
        <span className="block mt-1.5 font-display text-[34px] leading-none text-rift-bright">{count}</span>
        <span className="block mt-1 text-[11px] text-rift-muted">{count === 1 ? 'shard' : 'shards'}</span>
        <span className="block mt-[18px] text-[10px] tracking-[0.1em] uppercase text-rift-off">Received</span>
        <GoldAmount amount={count * SHARD_PRICE} label="Received" className="mt-1.5 text-base" color="var(--rift-gold-text)" iconClassName="w-4 h-4" style={{ gap: 7 }} />
        <span className="block mt-auto text-[11px] leading-normal text-rift-off">Every shard sells for {SHARD_PRICE} gold. Buying one back costs the same.</span>
      </div>
      <div role="list" aria-label="Shards sold this session" className="rf-shlist flex-1 min-w-0 p-1">
        {sold.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-6 text-xs leading-normal text-rift-label">Nothing sold yet. Right-click a shard below to sell it.</div>
        ) : sold.map(({ stat, n }) => (
          <div key={stat} role="listitem" className="rf-sold" onContextMenu={(e) => { e.preventDefault(); onBuyBack(stat); }}>
            <span aria-hidden="true" className="flex-none w-1.5 h-1.5 rounded-full" style={{ background: categoryOfShard(stat).color }} />
            <span className="flex-1 min-w-0 text-xs text-rift-ink whitespace-nowrap overflow-hidden text-ellipsis">{shardName(stat)}</span>
            <span className="flex-none text-xs text-rift-muted">sold ×{n}</span>
            <ActButton label={short ? 'Need gold' : 'Buy back'} cost={SHARD_PRICE} blocked={short} short={short} width={128}
              aria={short ? `Buy back ${shardName(stat)} unavailable: not enough gold` : `Buy back a ${shardName(stat)} shard for ${SHARD_PRICE} gold`}
              onClick={() => onBuyBack(stat)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The party's shards for sale: a rail of categories (each with how many shard types it carries of it) and a two-column
 * list of only the shards it carries. Right-click (or Enter / Space) sells one; Shift + right-click sells all of it.
 */
function ShardSale({ shards, category, onCategory, onSell }: {
  shards: ShardCounts; category: ShardFilter; onCategory: (c: ShardFilter) => void; onSell: (stat: AffixStat, all: boolean) => void;
}) {
  const carried = SHARDS.filter((s) => shardCount(shards, s.stat) > 0);
  const rows = carried.filter((s) => category === 'all' || s.category === category);
  const key = (stat: AffixStat) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSell(stat, false); }
  };
  return (
    <div className="rf-shards">
      <ShardRail pool={carried} category={category} onCategory={onCategory} label="Shard categories" />
      <div role="list" aria-label="Shards you carry" className="rf-shlist flex-1 min-w-0">
        {rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-rift-label">
            {carried.length === 0 ? 'You carry no shards.' : 'No shards carried in this category.'}
          </div>
        ) : (
          <div className="rf-shgrid">
            {rows.map(({ stat, category: cat }) => (
              <button key={stat} type="button" role="listitem" className="rf-shrow rf-sellrow"
                aria-label={`${shardName(stat)}, ${shardCount(shards, stat)} carried. Right-click to sell one for ${SHARD_PRICE} gold, Shift + right-click to sell all.`}
                onContextMenu={(e) => { e.preventDefault(); onSell(stat, e.shiftKey); }} onKeyDown={key(stat)}>
                <ShardIcon stat={stat} category={shardCategory(cat)} />
                <span className="min-w-0 flex-1 whitespace-nowrap overflow-hidden text-ellipsis text-xs text-rift-keyname">{shardName(stat)}</span>
                <span className="rf-plus flex-none text-[11px]" style={{ color: 'var(--rift-gold-text)' }}>+{SHARD_PRICE}</span>
                <span className="flex-none text-xs text-rift-soft">×{shardCount(shards, stat)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
