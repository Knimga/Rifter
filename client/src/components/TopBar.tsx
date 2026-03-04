import { CLASSES, type ClassKey } from '../data/classes';
import type { Stats } from '../data/stats';
import type { CombatState, Combatant } from '../data/combat';
import type { EnemyInstance } from '../data/enemies';
import type { ZoneData } from '../data/dungeonGen';
import type { PartyMemberConfig } from '../data/party';
import TurnOrderBar from './TurnOrderBar';

interface Props {
  selectedClass: ClassKey;
  stats: Stats;
  location: 'sanctum' | 'dungeon';
  zone: ZoneData | null;
  party: PartyMemberConfig[];
  partyAllStats: Stats[];
  partyHp: number[];
  partyMp: number[];
  combat: CombatState;
  activePartyIdx: number;
  zoneEnemies: EnemyInstance[];
  currentCombatant: Combatant | null;
  onShowCharSheet: () => void;
}

export default function TopBar({
  stats, location, zone,
  party, partyAllStats, partyHp, partyMp,
  combat, activePartyIdx, zoneEnemies,
  onShowCharSheet,
}: Props) {

  return (
    <div className="shrink-0 bg-blue-950 border-b border-blue-900 px-6 pt-3 pb-2 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-start">
          <div>           
            {location === 'sanctum' && <h1 className="text-purple-400 mt-0.5">The Sanctum</h1>}
            {location === 'dungeon' && zone && <h1 className="text-red-400 mt-0.5">Dungeon — Zone {zone.id + 1}</h1>}
            <p className="text-sm text-gray-400">Level {stats.level}</p>
          </div>
          <button
            onClick={onShowCharSheet}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg transition-colors"
          >
            Character
          </button>
          {/* Party HP bars */}
          <div className="flex gap-3">
            {party.map((m, i) => {
              const memberStats = partyAllStats[i];
              const hp = partyHp[i] ?? memberStats.hp;
              const mp = partyMp[i] ?? memberStats.mp;
              const isActive = combat.active && activePartyIdx === i;
              return (
                <div key={i} className={`bg-gray-800 px-3 py-2 rounded text-xs min-w-[120px] ${isActive ? 'ring-2 ring-yellow-400' : ''}`}>
                  <div className="font-semibold mb-1" style={{ color: CLASSES[m.selectedClass!].color }}>{m.characterName}</div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-green-400 font-bold w-6">HP</span>
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 transition-all" style={{ width: `${(hp / memberStats.hp) * 100}%` }} />
                    </div>
                    <span className="text-gray-300 w-14 text-right">{hp}/{memberStats.hp}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-blue-400 font-bold w-6">MP</span>
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${(mp / memberStats.mp) * 100}%` }} />
                    </div>
                    <span className="text-gray-300 w-14 text-right">{mp}/{memberStats.mp}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Turn order bar */}
        <div className="h-10 mt-2 flex items-center justify-center">
          {combat.active && (
            <TurnOrderBar
              turnOrder={combat.turnOrder}
              currentTurnIndex={combat.currentTurnIndex}
              enemies={zoneEnemies}
              partyNames={party.map(m => m.characterName)}
              partyColors={party.map(m => m.selectedClass ? CLASSES[m.selectedClass].color : '#fff')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
