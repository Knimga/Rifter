// The party window (UI handoff, 04 party modal): party rail, the member's model and equipment, the shared
// inventory, and their attributes, skills, stats and offense. Values raised or lowered by buffs and debuffs
// show green / red with an arrow.
// Level-up (UI handoff: level-up and XP tracking): the party's XP bar on the rail; a member with points to
// spend is marked on the rail, gets a header banner (Reset, Confirm) and + / - on their attribute and skill
// rows. Placed points stay pending (kept by GameScreen, so closing the window keeps them) until Confirm.
import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType, type MouseEvent, type ReactNode } from 'react';
import { Crown, Shirt, Hand, Footprints, Sword, Shield } from 'lucide-react';
import { CLASSES } from '../data/units/classes';
import { ATTACK_CATEGORY_COLOR } from '../data/constants';
import { ATTRIBUTE_KEYS, SKILL_KEYS, recomputeStats, formatStat, type Stats } from '../data/units/stats';
import { GEAR_SLOTS, getGearBuffs, type GearSlot, type Item } from '../data/gear';
import { hasPointsToSpend, memberStatInput, noPendingPoints, pointsLeft, type PartyMemberConfig, type PendingPoints } from '../data/units/party';
import { xpToNext, type PartyProgress } from '../data/units/xp';
import { INVENTORY_COLS, INVENTORY_SIZE, canEquip, canUnequip, isFull, isProficient, type Inventory } from '../data/gear/inventory';
import { AttributeTooltips, SkillTooltips, ATTR_LABEL, SLOT_LABEL, capitalize } from '../data/detailStrings';
import { Tooltip, ItemTooltipContent, TextTip } from './Tooltip';
import { damageReduction } from '../data/combat/attackResolution';
import ItemIcon, { rarityGlow } from './ItemIcon';
import ItemGrid from './ItemGrid';
import Portrait from './hud/Portrait';
import { PanelTitle } from './ui/Panel';
import { XpBar } from './hud/XpBar';
import { characterLookKey, characterModel, heldGear } from './characterModel';

// The turning model (lazy: it pulls in three.js)
const ModelTurntable = lazy(() => import('./ModelTurntable'));

interface Props {
  party: PartyMemberConfig[];
  partyHp: number[];
  partyMp: number[];
  partyStats: Stats[];
  inventory: Inventory;
  onClose: () => void;
  onEquipItem?: (inventoryIdx: number, charIdx: number) => void;
  onUnequipItem?: (slot: GearSlot, charIdx: number) => void;
  /** The party's shared level and XP. */
  progress: PartyProgress;
  /** Each member's placed, unconfirmed level-up points. */
  pending: PendingPoints[];
  /** Change a member's placed points: `update` gets the latest ones (so quick clicks never overwrite each other). */
  onPendingChange: (charIdx: number, update: (pending: PendingPoints) => PendingPoints) => void;
  /** Spend the member's pending points (Confirm). */
  onConfirmPoints: (charIdx: number) => void;
}

/** The window's design size (px); it scales down to fit smaller screens. */
const WIDTH = 1296, HEIGHT = 830;

// Stats panel rows after HP and MP: [label, stat key]. Values go through formatStat (adds % where applicable).
type StatRowKey = 'hpRegen' | 'mpRegen' | 'initiative' | 'movement' | 'armor' | 'dodge'
  | 'parry' | 'block' | 'glancingBlow' | 'magicResistance' | 'healing';
const STAT_ROWS: [string, StatRowKey][] = [
  ['Initiative', 'initiative'], ['Movement', 'movement'], ['Armor', 'armor'], ['Dodge', 'dodge'], ['Parry', 'parry'],
  ['Block', 'block'], ['Glancing Blow', 'glancingBlow'], ['Magic Resistance', 'magicResistance'], ['Healing', 'healing'],
];

const SLOT_ICON: Record<GearSlot, ComponentType<{ className?: string }>> = {
  helm: Crown, chest: Shirt, gloves: Hand, boots: Footprints,
  mainhand: Sword, offhand: Shield,
};

// Grid position for each slot (col, row) in the 3×4 equipment grid
const SLOT_POS: Record<GearSlot, { col: number; row: number }> = {
  helm:     { col: 2, row: 1 },
  chest:    { col: 2, row: 2 },
  mainhand: { col: 1, row: 3 },
  gloves:   { col: 2, row: 3 },
  offhand:  { col: 3, row: 3 },
  boots:    { col: 2, row: 4 },
};

/** Offense columns, each with a small glyph (sword, bow, flame). */
const OFFENSE = [
  { key: 'melee', icon: 'M9 2v10M7 4.5L9 2l2 2.5M6 12h6M9 12v4' },
  { key: 'ranged', icon: 'M5 2c7 2 7 12 0 14M5 2v14M5 9h9M11 6.5l3 2.5-3 2.5' },
  { key: 'magic', icon: 'M9 16c-3 0-5-2.2-5-5 0-2.5 1.7-4 2.5-6 1 1 1.5 2 1.5 3 1.5-1 2-3 1.5-5 2.5 1.5 4.5 4 4.5 7 0 3.3-2 6-5 6z' },
] as const;

/** A value, green with an up arrow when a buff raised it, red with a down arrow when a debuff lowered it. */
function Val({ delta, children, className = '' }: { delta: number; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${delta > 0 ? 'text-rift-up' : delta < 0 ? 'text-rift-down' : 'text-rift-ink'} ${className}`}>
      {delta !== 0 && (
        <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
          <path d={delta > 0 ? 'M4 1l3.5 6h-7z' : 'M4 7L.5 1h7z'} />
        </svg>
      )}
      {children}
      {delta !== 0 && <span className="sr-only">{delta > 0 ? ' (raised by a buff)' : ' (lowered by a debuff)'}</span>}
    </span>
  );
}

/** Level-up controls on an attribute or skill row. */
interface PointControls {
  /** Points placed here, not yet confirmed (shown as "+n"). */
  pending: number;
  /** The panel still has points to place: show "+". */
  canAdd: boolean;
  onAdd: () => void;
}

/**
 * A labelled value on a dark strip (attributes and skills); hovering or focusing the label explains it.
 * While levelling up, "+" adds a point (the banner's Reset takes them all back); the value includes placed points.
 */
function TipRow({ label, tip, delta, value, caps, points }: { label: string; tip: string; delta: number; value: number; caps?: boolean; points?: PointControls }) {
  const name = capitalize(label.toLowerCase());
  return (
    <div className="flex items-center justify-between gap-1.5 box-border min-h-6 px-2.5 bg-rift-void border border-rift-seam rounded-sm">
      <Tooltip content={<TextTip>{tip}</TextTip>} gap={6}>
        <span tabIndex={0} className={`rf-tiplabel text-[11px] ${caps ? 'tracking-[0.08em]' : ''}`}>{label}</span>
      </Tooltip>
      <span className="flex items-center gap-1.5">
        {points && points.pending > 0 && <span className="text-[11px]" style={{ color: 'var(--glow)' }}>+{points.pending}</span>}
        {points?.canAdd && (
          <button type="button" className="rf-pt" aria-label={`Add point to ${name}`} onClick={points.onAdd}>
            <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M1 4h6M4 1v6" /></svg>
          </button>
        )}
        <Val delta={delta} className="text-sm min-w-[2ch] justify-end">{value}</Val>
      </span>
    </div>
  );
}

/** The level-up banner's Reset and Confirm: small raised buttons in the technical font. */
const BANNER_BTN = 'rf-btn relative min-h-[36px] px-4 font-tech text-[11px] tracking-[0.14em]';

/** "n left" beside an Attributes / Skills heading while levelling up, "Done" once all are placed. */
function PointsLeft({ left }: { left: number }) {
  return <span className="text-[11px] tracking-[0.04em]" style={{ color: 'var(--glow)' }}>{left > 0 ? `${left} left` : 'Done'}</span>;
}

/** Right-click handler that suppresses the browser menu on item cells and runs `action` when allowed. */
const rightClick = (hasItem: boolean, action: (() => void) | null) => (e: MouseEvent) => {
  if (!hasItem) return;
  e.preventDefault();
  action?.();
};

function GearSlotBox({ slot, item, stats, onUnequip }: { slot: GearSlot; item: Item | null; stats: Stats; onUnequip: (() => void) | null }) {
  const EmptyIcon = SLOT_ICON[slot];
  const pos = { gridColumn: SLOT_POS[slot].col, gridRow: SLOT_POS[slot].row };
  if (!item) {
    return (
      <div className="rf-eqs" style={pos} role="img" aria-label={`${SLOT_LABEL[slot]}: empty`}>
        <EmptyIcon className="w-[26px] h-[26px] text-rift-rim" />
        <span className="text-[10px] tracking-[0.08em] uppercase">{SLOT_LABEL[slot]}</span>
      </div>
    );
  }
  return (
    <Tooltip gap={10} style={pos} content={<ItemTooltipContent item={item} stats={stats} clickAction={onUnequip ? 'Unequip' : undefined} />}>
      <div className={`rf-eqs is-filled ${rarityGlow(item).className}`} style={rarityGlow(item).style} aria-label={`${SLOT_LABEL[slot]}: ${item.name}`} onContextMenu={rightClick(true, onUnequip)}>
        <ItemIcon item={item} className="w-[34px] h-[34px]" />
        <span className="text-[10px] tracking-[0.08em] uppercase">{SLOT_LABEL[slot]}</span>
      </div>
    </Tooltip>
  );
}

/** The window's scale: as large as fits the viewport (with a margin), never above 1. */
function useFitScale(): number {
  const fit = () => Math.max(0.4, Math.min(1, (window.innerWidth - 40) / WIDTH, (window.innerHeight - 40) / HEIGHT));
  const [scale, setScale] = useState(fit);
  useEffect(() => {
    const onResize = () => setScale(fit());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

export default function CharacterSheet({ party, partyHp, partyMp, partyStats, inventory, onClose, onEquipItem, onUnequipItem, progress, pending: pendingAll, onPendingChange, onConfirmPoints }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const scale = useFitScale();

  const member = party[selectedIdx];
  const { characterName, selectedClass, gear } = member;
  const stats = partyStats[selectedIdx];
  const classData = CLASSES[selectedClass];
  const hp = partyHp[selectedIdx] ?? stats.hp;
  const mp = partyMp[selectedIdx] ?? stats.mp;

  // Stats without combat buffs (gear affixes and spent points included, at the party's level): what buffs and
  // debuffs are compared against
  const baseStats = recomputeStats(memberStatInput(member, stats.level), getGearBuffs(gear));

  // The member's model, holding their equipped weapon and shield
  const held = heldGear(gear);
  const lookKey = characterLookKey(selectedClass, held.weapon, held.shield);
  const model = useMemo(() => characterModel(selectedClass, held.weapon, held.shield), [lookKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const invFull = isFull(inventory);

  // Level-up: the member's placed points and what's left to place
  const pending = pendingAll[selectedIdx];
  const leveling = hasPointsToSpend(member);
  const left = pointsLeft(member, pending);
  const placed = left.attr < member.unspentAttributePoints || left.skill < member.unspentSkillPoints;
  const ready = leveling && left.attr === 0 && left.skill === 0;
  const setPending = (fn: (p: PendingPoints) => PendingPoints) => onPendingChange(selectedIdx, fn);
  const attrPoints = (k: (typeof ATTRIBUTE_KEYS)[number]): PointControls | undefined => leveling ? {
    pending: pending.attr[k], canAdd: left.attr > 0,
    onAdd: () => setPending(p => (pointsLeft(member, p).attr > 0 ? { ...p, attr: { ...p.attr, [k]: p.attr[k] + 1 } } : p)),
  } : undefined;
  const skillPoints = (k: (typeof SKILL_KEYS)[number]): PointControls | undefined => leveling ? {
    pending: pending.skill[k], canAdd: left.skill > 0,
    onAdd: () => setPending(p => (pointsLeft(member, p).skill > 0 ? { ...p, skill: { ...p.skill, [k]: p.skill[k] + 1 } } : p)),
  } : undefined;
  const hint = ready ? 'All points spent. Confirm to apply.'
    : `Spend ${[left.attr > 0 && `${left.attr} attribute`, left.skill > 0 && `${left.skill} skill`].filter(Boolean).join(' and ')} point${left.attr + left.skill === 1 ? '' : 's'}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center font-tech text-rift-ink bg-[rgba(4,5,6,0.76)] backdrop-blur-[2px]">
      {/* Clicking outside the window closes it */}
      <button type="button" aria-label="Close party window" tabIndex={-1} onClick={onClose} className="absolute inset-0 w-full h-full p-0 bg-transparent border-0" />

      <div
        role="dialog" aria-modal="true" aria-labelledby="party-who"
        className="relative flex-none box-border flex gap-4 px-6 py-5 bg-rift-sunk border border-rift-edge rounded-sm"
        style={{
          width: WIDTH, height: HEIGHT, transform: `scale(${scale})`,
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 30px 90px rgba(0, 0, 0, 0.8), 0 0 90px color-mix(in srgb, var(--glow) 7%, transparent)',
        }}
      >
        {/* ── Party rail ── */}
        <nav aria-label="Party members" className="flex-none w-[188px] flex flex-col gap-2">
          {/* The heading block: "Party" and the party's XP toward the next level */}
          <div className="h-14 flex flex-col justify-center gap-2">
            <PanelTitle variant="heading">Party</PanelTitle>
            <div className="flex items-center gap-2.5 text-[10px] tracking-[0.1em]">
              <span className="flex-none uppercase text-rift-muted">LV {progress.level}</span>
              <XpBar progress={progress} className="flex-1" />
              <span className="flex-none text-rift-soft">{progress.xp} / {xpToNext(progress.level)}</span>
            </div>
          </div>
          {party.map((m, i) => {
            const sel = i === selectedIdx;
            const held = heldGear(m.gear);
            const memberLeveling = hasPointsToSpend(m);
            const memberLeft = pointsLeft(m, pendingAll[i]);
            return (
              <button key={i} type="button" aria-pressed={sel} onClick={() => setSelectedIdx(i)}
                className={`rf-row ${sel ? 'is-view' : ''} ${memberLeveling ? 'is-levelup' : ''} flex items-center gap-3 w-full min-h-16 box-border px-3 py-2 text-left text-inherit`}>
                <Portrait classKey={m.selectedClass} {...held} size={36} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] truncate ${sel ? 'text-rift-bright' : 'text-rift-soft'}`}>{m.characterName}</span>
                  <span className="block mt-[3px] text-[11px] tracking-[0.08em] uppercase text-rift-label">{CLASSES[m.selectedClass].name}</span>
                  {memberLeveling && (
                    <span className="rf-levelup-label block mt-[3px]">{memberLeft.attr === 0 && memberLeft.skill === 0 ? 'Confirm' : 'Level up'}</span>
                  )}
                </span>
                {sel && <span aria-hidden="true" className="flex-none w-1.5 h-1.5 rotate-45" style={{ background: 'var(--glow)' }} />}
              </button>
            );
          })}
          <p className="mt-auto mb-0 text-[10px] leading-[1.7] tracking-[0.08em] uppercase text-rift-label">I &nbsp;toggle<br />Esc &nbsp;close</p>
        </nav>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* ── Header ── */}
          <header className="flex-none flex items-center justify-between gap-4 min-h-14">
            <div className="min-w-0">
              <h2 id="party-who" className="m-0 font-display font-normal text-[26px] tracking-[0.06em] leading-[1.1] text-rift-bright">{characterName}</h2>
              <p className="mt-1.5 mb-0 text-xs tracking-[0.14em] uppercase text-rift-muted">{classData.name} · Level {stats.level}</p>
            </div>
            {leveling && (
              <div role="status" className="relative ml-auto flex items-center gap-4">
                <span className="relative text-right">
                  {/* A pale yellow wedge glowing behind the label and hint (tall on the right, tapering to a point
                      about 64px left of the text). Blurred on a wrapper: the clip on the inner shape keeps its form,
                      the blur on the outside softens its edges. */}
                  <span aria-hidden="true" className="absolute -left-16 right-0 -top-2.5 -bottom-2.5 pointer-events-none" style={{ filter: 'blur(14px)' }}>
                    <span className="absolute inset-0" style={{ background: 'color-mix(in srgb, var(--rift-levelup) 16%, transparent)', clipPath: 'polygon(0 50%, 100% 0, 100% 100%)' }} />
                  </span>
                  <span className="relative block font-display text-base tracking-[0.04em] text-rift-bright">Level up</span>
                  <span className="relative block mt-0.5 text-xs text-rift-soft">{hint}</span>
                </span>
                <button type="button" className={BANNER_BTN} disabled={!placed} onClick={() => onPendingChange(selectedIdx, noPendingPoints)}>Reset</button>
                <button type="button" className={BANNER_BTN} disabled={!ready} onClick={() => onConfirmPoints(selectedIdx)}>Confirm</button>
              </div>
            )}
            <button type="button" className="rf-btn flex-none w-11 h-11 flex items-center justify-center p-0 text-rift-soft" aria-label="Close" onClick={onClose}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
            </button>
          </header>

          <div className="flex-1 min-h-0 flex gap-4 mt-3">
            {/* ── Left: model, equipment, inventory ── */}
            <div className="flex-none w-[624px] flex flex-col gap-3">
              <div className="flex-1 min-h-0 flex gap-3">
                <div className="rf-panel relative flex-1 min-w-0 overflow-hidden"
                  style={{ backgroundImage: 'radial-gradient(ellipse 70% 55% at 50% 62%, color-mix(in srgb, var(--glow) 14%, transparent) 0%, transparent 100%)' }}>
                  <Suspense fallback={null}>
                    <ModelTurntable model={model} scale={1.3} />
                  </Suspense>
                </div>

                <section aria-label="Equipment" className="rf-panel flex-none flex flex-col px-3.5 pt-3.5 pb-3">
                  <PanelTitle variant="heading">Equipment</PanelTitle>
                  <div className="flex-1 grid content-between mt-3.5 gap-x-6 gap-y-2" style={{ gridTemplateColumns: 'repeat(3, 84px)', gridTemplateRows: 'repeat(4, 60px)' }}>
                    {GEAR_SLOTS.map(slot => (
                      <GearSlotBox key={slot} slot={slot} item={gear[slot]} stats={stats}
                        onUnequip={onUnequipItem && canUnequip(inventory, gear, slot) ? () => onUnequipItem(slot, selectedIdx) : null} />
                    ))}
                  </div>
                </section>
              </div>

              <section aria-label="Inventory" className="rf-panel flex-none p-3.5">
                <div className="flex items-baseline justify-between mb-2.5">
                  <PanelTitle variant="heading">Inventory <span className="font-tech text-[10px] tracking-[0.1em] text-rift-label">Shared</span></PanelTitle>
                  <span className={`text-xs ${invFull ? 'text-rift-warn' : 'text-rift-muted'}`}>{inventory.length} / {INVENTORY_SIZE}{invFull ? ' · Full' : ''}</span>
                </div>
                <ItemGrid items={inventory} cols={INVENTORY_COLS} size={INVENTORY_SIZE} stats={stats}
                  canUse={(item) => isProficient(classData, item)}
                  action={(item) => (onEquipItem && canEquip(classData, item) ? 'Equip' : null)}
                  onAction={(i) => onEquipItem?.(i, selectedIdx)} unusableNote=", not proficient" />
              </section>
            </div>

            {/* ── Right: attributes, skills, stats, offense ── */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="flex-none flex gap-2 items-stretch">
                <section aria-label="Attributes" className="rf-panel flex-1 min-w-0 p-3 flex flex-col">
                  <div className="flex items-baseline justify-between">
                    <PanelTitle variant="heading">Attributes</PanelTitle>
                    {leveling && <PointsLeft left={left.attr} />}
                  </div>
                  <div className="flex-1 min-h-0 grid grid-cols-1 auto-rows-fr gap-1 mt-2">
                    {ATTRIBUTE_KEYS.map(attr => (
                      <TipRow key={attr} label={ATTR_LABEL[attr]} tip={AttributeTooltips[attr]} caps points={attrPoints(attr)}
                        value={stats.attributes[attr] + pending.attr[attr]} delta={stats.attributes[attr] - baseStats.attributes[attr]} />
                    ))}
                  </div>
                </section>
                <section aria-label="Skills" className="rf-panel flex-1 min-w-0 p-3">
                  <div className="flex items-baseline justify-between">
                    <PanelTitle variant="heading">Skills</PanelTitle>
                    {leveling && <PointsLeft left={left.skill} />}
                  </div>
                  <div className="grid grid-cols-1 gap-1 mt-2">
                    {SKILL_KEYS.map(skill => (
                      <TipRow key={skill} label={capitalize(skill)} tip={SkillTooltips[skill]} points={skillPoints(skill)}
                        value={stats.skills[skill] + pending.skill[skill]} delta={stats.skills[skill] - baseStats.skills[skill]} />
                    ))}
                  </div>
                </section>
              </div>

              <section aria-label="Stats" className="rf-panel p-3">
                <PanelTitle variant="heading">Stats</PanelTitle>
                <ul className="list-none mt-1.5 mb-0 p-0 text-xs">
                  <StatLine label="HP" delta={stats.hp - baseStats.hp}>{hp} / {stats.hp}</StatLine>
                  <StatLine label="HP Regen" delta={stats.hpRegen - baseStats.hpRegen}>{formatStat('hpRegen', stats.hpRegen)}</StatLine>
                  <StatLine label="MP" delta={stats.mp - baseStats.mp}>{mp} / {stats.mp}</StatLine>
                  <StatLine label="MP Regen" delta={stats.mpRegen - baseStats.mpRegen}>{formatStat('mpRegen', stats.mpRegen)}</StatLine>
                  {STAT_ROWS.map(([label, key]) => (
                    <StatLine key={key} label={label} delta={stats[key] - baseStats[key]} tip={statTip(key, stats)}>{formatStat(key, stats[key])}</StatLine>
                  ))}
                </ul>
              </section>

              <section aria-label="Offense" className="rf-panel p-3">
                <PanelTitle variant="heading">Offense</PanelTitle>
                <div className="mt-1.5 text-xs grid" style={{ gridTemplateColumns: '56px repeat(3, 1fr)' }}>
                  <span />
                  {OFFENSE.map(o => (
                    <span key={o.key} className="flex items-center justify-end gap-[5px] h-5 text-[10px] tracking-[0.1em] uppercase border-b border-rift-divider" style={{ color: ATTACK_CATEGORY_COLOR[o.key] }}>
                      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={o.icon} /></svg>
                      {o.key}
                    </span>
                  ))}
                  {(['hit', 'damage', 'crit'] as const).map(row => (
                    <OffenseRow key={row} row={row} stats={stats} baseStats={baseStats} />
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatLine({ label, delta, tip, children }: { label: string; delta: number; tip?: string; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between h-[19px] border-b border-rift-divider">
      {tip ? (
        // Hovering or focusing the label explains the value (like the attribute and skill rows)
        <Tooltip content={<TextTip>{tip}</TextTip>} gap={6}>
          <span tabIndex={0} className="rf-tiplabel text-rift-muted">{label}</span>
        </Tooltip>
      ) : <span className="text-rift-muted">{label}</span>}
      <Val delta={delta} className="gap-[5px]">{children}</Val>
    </li>
  );
}

/** A DR fraction as a percentage, e.g. 0.173 -> '17.3%'. */
const drPct = (dr: number) => `${(dr * 100).toFixed(1)}%`;

/** What a defensive stat's value does, as damage reduction (the same formula combat uses: attackResolution). */
function statTip(key: StatRowKey, stats: Stats): string | undefined {
  if (key === 'armor') {
    return `Reduces physical damage taken by ${drPct(damageReduction(stats, true))}. `
      + 'A quarter of it also counts toward magical defense.';
  }
  if (key === 'magicResistance') {
    return `Reduces magical damage taken by ${drPct(damageReduction(stats, false))} (with a quarter of your armor). `
      + 'Fire, ice, lightning, shadow, poison, holy and nature.';
  }
  return undefined;
}

function OffenseRow({ row, stats, baseStats }: { row: 'hit' | 'damage' | 'crit'; stats: Stats; baseStats: Stats }) {
  return (
    <>
      <span className="flex items-center h-5 text-rift-muted">{capitalize(row)}</span>
      {OFFENSE.map(({ key }) => {
        const v = stats[key][row];
        return (
          <span key={key} className="flex items-center justify-end h-5">
            <Val delta={v - baseStats[key][row]} className="gap-[5px]">
              {row === 'damage' ? `+${v}` : formatStat(`${key}${capitalize(row)}`, v)}
            </Val>
          </span>
        );
      })}
    </>
  );
}
