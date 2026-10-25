// The action bar (UI handoff, game screen, bottom centre): the acting member (portrait, name, class,
// movement and, in combat, its AP tracker), five slots (weapon attack or an ability, its AP cost as dots;
// right-click to assign; number keys 1-5 use them like clicks) and End Turn (Space). A slot dims when its ability
// costs more MP or AP than the member has, or the member can't act now.
import { createElement, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { CLASSES } from '../../data/units/classes';
import { type Ability } from '../../data/combat/abilities';
import type { PartyMemberConfig } from '../../data/units/party';
import type { Stats } from '../../data/units/stats';
import { isWeaponItem } from '../../data/gear';
import { toAction } from '../../data/combat/abilityExecution';
import { ClickHint, TextTip, Tooltip } from '../Tooltip';
import ItemIcon from '../ItemIcon';
import AbilityCard, { ApDots, abilityTint } from '../ui/AbilityCard';
import ApTracker, { type ApState } from './ApTracker';
import RiftButton from '../ui/RiftButton';
import Portrait from './Portrait';
import { heldGear } from '../characterModel';
import { useLatest } from '../../hooks/useLatest';

/** Number keys 1..SLOT_KEYS use the action bar's slots, left to right (each slot shows its key). */
const SLOT_KEYS = 5;

/** What an action bar slot holds: the weapon attack, an ability, or nothing. */
export type SlotContent = 'weapon-attack' | Ability | null;

export default function ActionDock({ member, stats, mp, slots, onSlotsChange, armedSlot, onArmedSlotChange, inCombat, canAct, ap, paidTiles, onEndTurn }: {
  member: PartyMemberConfig;
  stats: Stats;
  mp: number;
  slots: SlotContent[];
  onSlotsChange: (slots: SlotContent[]) => void;
  armedSlot: number | null;
  onArmedSlotChange: (slot: number | null) => void;
  inCombat: boolean;
  /** The member may use an action now (out of combat: always; in combat: on their turn, AP permitting). */
  canAct: boolean;
  /** In combat: the member's action points this turn (the tracker; abilities it can't pay for dim). */
  ap: ApState | null;
  /** In combat: tiles already paid for this turn and not walked yet. */
  paidTiles: number;
  /** End Turn (shown in combat only). */
  onEndTurn?: () => void;
}) {
  const [menuSlot, setMenuSlot] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const weapon = member.gear.mainhand && isWeaponItem(member.gear.mainhand) ? member.gear.mainhand : null;
  const abilities = CLASSES[member.selectedClass].abilities;

  // The menu closes on a click outside it
  useEffect(() => {
    if (menuSlot === null) return;
    const close = (e: globalThis.MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuSlot(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuSlot]);

  // Put `content` in slot i; an ability already in another slot moves here
  const assign = (i: number, content: SlotContent) => {
    const next = slots.map((s) => (content !== null && s === content ? null : s));
    next[i] = content;
    onSlotsChange(next);
    if (armedSlot !== null && next[armedSlot] === null) onArmedSlotChange(null);
    setMenuSlot(null);
  };

  const weaponAttack = weapon ? toAction('weapon-attack', weapon) : null;

  /** Slot i's ability (the weapon attack, or the slot's own), and whether it can be used now (MP, AP, turn). */
  const slotState = (i: number) => {
    const slot = slots[i];
    const ability = slot === 'weapon-attack' ? weaponAttack : slot;
    const afford = !ability || ability.mpCost <= mp;
    const affordAp = !ability || !ap || ability.apCost <= ap.available;
    return { slot, ability, afford, affordAp, usable: !!ability && afford && affordAp && canAct };
  };
  /** Clicking slot i, or pressing its number key: arm its ability (or disarm it, if armed), when usable. */
  const toggleSlot = (i: number) => {
    const { ability, usable } = slotState(i);
    if (usable) onArmedSlotChange(armedSlot === i && ability ? null : i);
  };

  // Number keys 1-5 use slots 1-5, like clicking them; Space ends the turn, like End Turn (in combat). Not while
  // typing in a field, or with a modifier held.
  const toggleSlotRef = useLatest(toggleSlot);
  const endTurnRef = useLatest(inCombat ? onEndTurn : undefined);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (e.key === ' ') {
        if (!endTurnRef.current) return;
        // Not also the browser's own Space: clicking whatever button has focus, or scrolling
        e.preventDefault();
        endTurnRef.current();
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= SLOT_KEYS) toggleSlotRef.current(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSlotRef, endTurnRef]);

  // The armed slot's AP cost, previewed on the tracker
  const armedContent = armedSlot !== null ? slots[armedSlot] : null;
  const armedCost = (armedContent === 'weapon-attack' ? weaponAttack : armedContent)?.apCost ?? 0;
  const choices: { content: SlotContent; name: string; cost: string }[] = [
    ...(weaponAttack && weapon ? [{ content: 'weapon-attack' as const, name: weapon.name, cost: `${weaponAttack.apCost} AP` }] : []),
    ...abilities.map((a) => ({ content: a as SlotContent, name: a.name, cost: `${a.apCost} AP · ${a.mpCost} MP` })),
  ];

  return (
    <section aria-label="Actions" className="rf-hud relative flex items-center gap-5 px-[18px] py-4" style={{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 12px 30px rgba(0, 0, 0, 0.5)' }}>
      {/* The member */}
      <div className="flex items-center gap-3.5 w-[244px]">
        <Portrait classKey={member.selectedClass} {...heldGear(member.gear)} size={56} />
        <div className="min-w-0 flex flex-col gap-[3px]">
          <span className="font-display text-lg tracking-[0.04em] text-rift-bright truncate">{member.characterName}</span>
          <span className="text-[11px] text-rift-label">{CLASSES[member.selectedClass].name}</span>
          <span className="text-xs text-rift-soft">
            {!inCombat ? `Movement ${stats.movement}` : paidTiles > 0 ? `Move ${paidTiles} more · 0 AP` : `Move up to ${stats.movement} · 1 AP`}
          </span>
          {inCombat && ap ? <ApTracker ap={ap} previewCost={armedCost} movement={stats.movement} /> : <span className="min-h-4" />}
        </div>
      </div>

      <div aria-hidden="true" className="self-stretch w-px bg-rift-line" />

      {/* Slots */}
      <div className="flex gap-2">
        {slots.map((_, i) => {
          const { slot, ability, afford, affordAp, usable } = slotState(i);
          const warning = !affordAp ? 'Not enough action points' : !afford ? 'Not enough mana' : undefined;
          const armed = armedSlot === i && !!ability;
          const card = ability && (slot === 'weapon-attack' && weapon ? { ...ability, name: weapon.name } : ability);
          // The same element wash as the ability's card
          const tint = ability ? abilityTint(ability, weapon) : null;
          return (
            <span key={i} className="relative block">
              <Tooltip bare={!!card} gap={14} content={menuSlot === i ? null : card ? (
                <AbilityCard ability={card} weapon={weapon} weaponAttack={slot === 'weapon-attack'} warning={warning} elevated className="w-[252px]" />
              ) : (
                <TextTip>
                  Empty slot.
                  <ClickHint button="right" className="mt-1.5">Assign an ability</ClickHint>
                </TextTip>
              )}>
                <button type="button"
                  className={`rf-aslot ${!ability ? 'is-empty' : ''} ${ability && !usable ? 'is-dim' : ''} ${armed ? 'is-armed' : ''}`}
                  style={tint ? ({ '--tint': tint } as CSSProperties) : undefined}
                  aria-pressed={armed} aria-disabled={!usable}
                  aria-label={ability ? `${card?.name}, ${ability.apCost} AP${ability.mpCost ? `, ${ability.mpCost} MP` : ''}${warning ? `, ${warning.toLowerCase()}` : ''}` : `Empty slot ${i + 1}`}
                  onClick={() => toggleSlot(i)}
                  onContextMenu={(e: MouseEvent) => { e.preventDefault(); setMenuSlot(menuSlot === i ? null : i); }}>
                  {slot === 'weapon-attack' && weapon && <ItemIcon item={weapon} className="w-10 h-10" />}
                  {slot && slot !== 'weapon-attack' && slot.icon && createElement(slot.icon, { className: 'w-7 h-7' })}
                  {ability && <ApDots count={ability.apCost} />}
                  {i < SLOT_KEYS && <span aria-hidden="true" className="rf-aslot-key">{i + 1}</span>}
                  {!ability && (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"><path d="M9 4v10M4 9h10" /></svg>
                  )}
                </button>
              </Tooltip>

              {menuSlot === i && (
                <div ref={menuRef} role="menu" aria-label={`Assign to slot ${i + 1}`}
                  className="rf-tip absolute right-0 z-[60] w-[248px] box-border flex flex-col p-2"
                  style={{ bottom: 'calc(100% + 14px)' }}>
                  <span className="rf-label px-2 pt-1.5 pb-2">Assign to slot {i + 1}</span>
                  {choices.map((c) => (
                    <button key={c.name} type="button" role="menuitem" className="rf-mi" onClick={() => assign(i, c.content)}>
                      <span className="flex items-center gap-2">
                        {/* Marked when it's already on the bar */}
                        <span aria-hidden="true" className="flex-none w-[5px] h-[5px] rotate-45" style={{ background: slots.includes(c.content) ? 'var(--rift-soft)' : 'transparent' }} />
                        {c.name}
                      </span>
                      <span className="text-rift-label">{c.cost}</span>
                    </button>
                  ))}
                  <span aria-hidden="true" className="block h-px my-1.5 bg-rift-line" />
                  <button type="button" role="menuitem" className="rf-mi" disabled={!slot} onClick={() => assign(i, null)}>Clear slot</button>
                </div>
              )}
            </span>
          );
        })}
      </div>

      {inCombat && onEndTurn && (
        <>
          <div aria-hidden="true" className="self-stretch w-px bg-rift-line" />
          <RiftButton size="md" className="!min-h-[48px] !px-[22px] !text-[13px] flex-col whitespace-nowrap" aria-keyshortcuts="Space" onClick={onEndTurn}>
            <span>End Turn</span>
            {/* Its key, small and dim like the slots' numbers */}
            <span aria-hidden="true" className="rf-btn-key">SPACE</span>
          </RiftButton>
        </>
      )}
    </section>
  );
}
