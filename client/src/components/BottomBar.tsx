import { CLASSES } from '../data/classes';
import type { Stats } from '../data/stats';
import type { CombatState, Combatant } from '../data/combat';
import type { PartyMemberConfig } from '../data/party';
import ActionBar, { type SlotContent } from './ActionBar';

interface Props {
  party: PartyMemberConfig[];
  partySlots: SlotContent[][];
  partyActiveSlot: (number | null)[];
  partyAllStats: Stats[];
  barViewIdx: number;
  setBarViewIdx: (i: number) => void;
  onSlotsChange: (i: number, slots: SlotContent[]) => void;
  onActiveSlotChange: (i: number, slot: number | null) => void;
  combat: CombatState;
  activePartyIdx: number;
  currentCombatant: Combatant | null;
  activeStats: Stats;
  isPlayerTurn: boolean;
  onEndTurn: () => void;
}

export default function BottomBar({
  party, partySlots, partyActiveSlot, partyAllStats,
  barViewIdx, setBarViewIdx, onSlotsChange, onActiveSlotChange,
  combat, activePartyIdx, currentCombatant, activeStats,
  isPlayerTurn, onEndTurn,
}: Props) {
  const viewedMember = party[barViewIdx];
  const viewedClass = viewedMember?.selectedClass;

  return (
    <div className="shrink-0 bg-blue-950 border-t border-blue-900 px-6 py-3 z-10">
      <div className="max-w-7xl mx-auto flex items-center">
        <div className="flex-1" />

        {/* Action bar with member tabs */}
        <div className="flex flex-col items-center gap-1">
          {/* Member tabs */}
          <div className="flex gap-2">
            {party.map((m, i) => {
              const isActing = combat.active && activePartyIdx === i;
              return (
                <button
                  key={i}
                  onClick={() => setBarViewIdx(i)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors
                    ${barViewIdx === i ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}
                    ${isActing ? 'ring-2 ring-yellow-400' : ''}`}
                >
                  <span style={{ color: CLASSES[m.selectedClass!].color }}>{m.characterName}</span>
                  {isActing && <span className="ml-1 text-yellow-300">▶</span>}
                </button>
              );
            })}
          </div>

          {/* Action bar for the viewed member */}
          {viewedMember && viewedClass && (
            <ActionBar
              gear={viewedMember.gear}
              abilities={CLASSES[viewedClass].abilities}
              slots={partySlots[barViewIdx] ?? []}
              onSlotsChange={slots => onSlotsChange(barViewIdx, slots)}
              activeSlot={partyActiveSlot[barViewIdx] ?? null}
              onActiveSlotChange={slot => onActiveSlotChange(barViewIdx, slot)}
              inCombat={combat.active}
              isPlayerTurn={!combat.active || currentCombatant?.partyIndex === barViewIdx}
              playerActedThisTurn={combat.active && currentCombatant?.partyIndex === barViewIdx && combat.playerActedThisTurn}
              stats={partyAllStats[barViewIdx] ?? activeStats}
            />
          )}
        </div>

        <div className="flex-1 flex justify-end items-center gap-3">
          {combat.active && isPlayerTurn && (
            <>
              <span className="text-sm text-gray-400">
                Movement: {combat.movementRemaining} / {activeStats.movement}
              </span>
              <button
                onClick={onEndTurn}
                className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors"
              >
                End Turn
              </button>
            </>
          )}
          {combat.active && !isPlayerTurn && currentCombatant && (
            <span className="text-sm text-yellow-400 animate-pulse">
              {currentCombatant.name}'s turn...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
