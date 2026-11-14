// The game's HUD over the map: where the party is and its quests, the edge pulses and announcements, the turn order,
// the menus (Party, and the TEMP testing tools), the party's XP and hints, the party rows, and the action bar (or, on
// a creature's turn, what it is doing). Not drawn while the party arrives; not usable while it watches a scene.
import type { Dispatch, SetStateAction } from 'react';
import type { WeaponItem } from '../../data/gear';
import type { CombatState, Combatant } from '../../data/combat/combat';
import type { EnemyInstance } from '../../data/units/enemies';
import { hasPointsToSpend, type MemberState, type PartyMemberConfig } from '../../data/units/party';
import type { ActiveBuff, Stats } from '../../data/units/stats';
import type { PartyProgress } from '../../data/units/xp';
import type { QuestLog } from '../../data/world/quests';
import type { useAnnouncements } from '../../hooks/useAnnouncements';
import type { EnemyActivity } from '../../hooks/useEnemyTurn';
import type { useHints } from '../../hooks/useHints';
import type { PartyTokenData } from '../mapParts';
import RiftButton from '../ui/RiftButton';
import ActionDock, { type SlotContent } from './ActionDock';
import ActingStatus from './ActingStatus';
import AnnouncementText from './Announcement';
import { apState } from './ApTracker';
import EdgePulse from './EdgePulse';
import HintPane from './HintPane';
import PartyRows from './PartyRows';
import QuestTracker from './QuestTracker';
import TurnOrderStrip from './TurnOrderStrip';
import { XpStrip } from './XpBar';

type Announcements = ReturnType<typeof useAnnouncements>;

export default function GameHud({
  locked, locationName, questLog, levelUps, combatStarts, announcement, onAnnouncementEnd,
  combat, currentCombatant, isPlayerTurn, zoneEnemies, onHoverCombatant, enemyActivity,
  party, progress, xpGain, memberTokens, partyStats, members, partyBuffs,
  activePartyIdx, barViewIdx, onSelectMember, activeAp, activeWeapon,
  partySlots, setPartySlots, partyActiveSlot, setPartyActiveSlot, onEndTurn, keysEnabled,
  hints, anyoneLeveling, onOpenParty, recording, onOpenTesting,
}: {
  /** The party watches a scene: nothing here takes clicks. */
  locked: boolean;
  locationName: string;
  questLog: QuestLog;
  /** How many level-ups and fights there have been: each new one plays its edge pulse. */
  levelUps: number;
  combatStarts: number;
  announcement: Announcements['announcement'];
  onAnnouncementEnd: Announcements['endAnnouncement'];
  combat: CombatState;
  currentCombatant: Combatant | null;
  isPlayerTurn: boolean;
  zoneEnemies: EnemyInstance[];
  /** A turn-order pill hovered (its unit outlined on the map), or none. */
  onHoverCombatant: (id: string | null) => void;
  /** What the acting creature is doing (`seq` tells a new activity from the same one). */
  enemyActivity: { activity: EnemyActivity; seq: number };
  party: PartyMemberConfig[];
  progress: PartyProgress;
  xpGain: Parameters<typeof XpStrip>[0]['gain'];
  /** Every member as drawn (the party rows show the fallen too). */
  memberTokens: PartyTokenData[];
  partyStats: Stats[];
  members: MemberState[];
  partyBuffs: ActiveBuff[][];
  /** The acting member (in a fight) or the selected one; the selected one out of a fight (its action bar). */
  activePartyIdx: number;
  barViewIdx: number;
  onSelectMember: (idx: number) => void;
  activeAp: number;
  activeWeapon: WeaponItem | null;
  /** Each member's action bar, and which of its slots is armed. */
  partySlots: SlotContent[][];
  setPartySlots: Dispatch<SetStateAction<SlotContent[][]>>;
  partyActiveSlot: (number | null)[];
  setPartyActiveSlot: Dispatch<SetStateAction<(number | null)[]>>;
  onEndTurn: () => void;
  /** The action bar's number keys work (no window open, no scene). */
  keysEnabled: boolean;
  hints: ReturnType<typeof useHints>;
  anyoneLeveling: boolean;
  onOpenParty: () => void;
  /** TEMP (testing only): the run recorder is on, and opening the testing tools. */
  recording: boolean;
  onOpenTesting: () => void;
}) {
  // A creature the AI runs (an enemy or a summoned ally) is taking its turn
  const aiActing = combat.active && !!currentCombatant && !currentCombatant.isPlayer;
  // The action bar's member: the acting one in combat (none on an enemy's turn), the selected one out of it
  const dockIdx = combat.active ? (isPlayerTurn ? activePartyIdx : null) : barViewIdx;
  const dockSlotContent = dockIdx !== null ? partySlots[dockIdx]?.[partyActiveSlot[dockIdx] ?? -1] ?? null : null;
  const armedName = dockSlotContent === 'weapon-attack' ? (activeWeapon?.name ?? 'Attack') : dockSlotContent?.name;

  return (
    <div className={`contents ${locked ? '[&_*]:pointer-events-none' : ''}`}>

      {/* Where the party is, and its active quests under it */}
      <div className="absolute top-5 left-6 z-30 flex flex-col gap-12 pointer-events-none">
        <div className="rf-label">{locationName}</div>
        <QuestTracker log={questLog} />
      </div>

      {/* Pulses around the screen's edge: a level-up's (yellow), and combat beginning (dark red). Each new key plays one */}
      {levelUps > 0 && <EdgePulse key={`level-${levelUps}`} kind="levelUp" />}
      {combatStarts > 0 && <EdgePulse key={`combat-${combatStarts}`} kind="combat" />}

      {/* Announcements, just above the screen's center: one at a time */}
      {announcement && <AnnouncementText key={announcement.id} announcement={announcement} onEnd={onAnnouncementEnd} />}

      {/* Turn order */}
      {combat.active && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30" style={{ maxWidth: 'calc(100% - 520px)' }}>
          <TurnOrderStrip
            round={combat.round}
            turnOrder={combat.turnOrder}
            currentTurnIndex={combat.currentTurnIndex}
            enemies={zoneEnemies}
            partyNames={party.map(m => m.characterName)}
            onHover={onHoverCombatant}
          />
        </div>
      )}

      {/* Menus */}
      <div className="absolute top-5 right-6 z-30 flex gap-2">
        {/* TEMP (testing only): the testing tools' window (components/DevToolsWindow.tsx). Dev builds only. */}
        {import.meta.env.DEV && (
          <RiftButton size="sm" onClick={onOpenTesting}>
            {recording && <span aria-label="Recording" className="inline-block size-2 mr-2 rounded-full bg-red-600 align-middle" />}Testing
          </RiftButton>
        )}
        <RiftButton size="sm" aria-label={anyoneLeveling ? 'Party (I), level up available' : 'Party (I)'} className={`${anyoneLeveling ? 'is-levelup' : ''} ${hints.current?.target === 'party' ? 'is-hinted' : ''}`} onClick={onOpenParty}>
          Party<kbd aria-hidden="true" className="rf-keycap">I</kbd>
        </RiftButton>
      </div>
      {/* The party's XP, under the top buttons */}
      <div className="absolute top-[72px] right-6 z-30">
        <XpStrip progress={progress} gain={xpGain} />
      </div>
      {/* A new player's hint, under what it points at (the Party button) */}
      {hints.current && (
        <div className="absolute top-[104px] right-6 z-30">
          <HintPane hint={hints.current} onDismiss={() => hints.dismiss(hints.current!.id)} />
        </div>
      )}

      {/* The party */}
      <div className="absolute left-6 bottom-6 z-30">
        <PartyRows
          rows={memberTokens.map((t, i) => ({ token: t, name: party[i].characterName, levelUp: hasPointsToSpend(party[i]) }))}
          level={progress.level}
          selectedIdx={activePartyIdx}
          canSelect={!combat.active}
          onSelect={onSelectMember}
        />
      </div>

      {/* An ability is armed: how to use or cancel it */}
      {armedName && (
        <div role="status" className="rf-hud absolute left-1/2 -translate-x-1/2 bottom-[144px] z-30 px-4 py-2 whitespace-nowrap text-xs tracking-[0.04em] text-rift-soft">
          {armedName} — choose a target. Click it again or press Esc to cancel.
        </div>
      )}

      {/* The action bar, or on an enemy's turn, who is acting */}
      {dockIdx !== null && party[dockIdx] && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-30">
          <ActionDock
            member={party[dockIdx]}
            stats={partyStats[dockIdx]}
            mp={members[dockIdx]?.mp ?? 0}
            buffs={partyBuffs[dockIdx] ?? []}
            slots={partySlots[dockIdx] ?? []}
            onSlotsChange={slots => setPartySlots(prev => prev.map((s, idx) => idx === dockIdx ? slots : s))}
            armedSlot={partyActiveSlot[dockIdx] ?? null}
            onArmedSlotChange={slot => setPartyActiveSlot(prev => prev.map((s, idx) => idx === dockIdx ? slot : s))}
            inCombat={combat.active}
            canAct={!combat.active || (isPlayerTurn && activeAp > 0)}
            ap={combat.active ? apState(partyStats[dockIdx].apMax, members[dockIdx]?.buffs ?? [], dockIdx === activePartyIdx ? activeAp : 0) : null}
            paidTiles={combat.active && dockIdx === activePartyIdx ? combat.paidTiles : 0}
            onEndTurn={combat.active ? onEndTurn : undefined}
            keysEnabled={keysEnabled}
          />
        </div>
      )}
      {aiActing && currentCombatant && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-30">
          <ActingStatus name={currentCombatant.name} activity={enemyActivity.activity} seq={enemyActivity.seq} />
        </div>
      )}
    </div>
  );
}
