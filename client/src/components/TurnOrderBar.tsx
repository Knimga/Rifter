import { createElement } from 'react';
import type { Combatant } from '../data/combat';
import type { EnemyInstance } from '../data/enemies';

interface Props {
  turnOrder: Combatant[];
  currentTurnIndex: number;
  enemies: EnemyInstance[];
  partyNames: string[];
  partyColors: string[];
}

export default function TurnOrderBar({ turnOrder, currentTurnIndex, enemies, partyNames, partyColors }: Props) {
  return (
    <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide mr-1">Turn Order</span>
      {turnOrder.map((c, i) => {
        const isCurrent = i === currentTurnIndex;
        const enemy = c.isPlayer ? null : enemies.find(e => e.id === c.id);
        const isDead = !c.isPlayer && !(enemy && enemy.currentHp > 0);

        return (
          <div
            key={c.id}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              isDead
                ? 'bg-gray-700 text-gray-500 line-through'
                : isCurrent
                  ? `ring-2 ring-green-400 ${c.isPlayer ? 'bg-blue-900 text-blue-200' : 'bg-gray-700 text-gray-300'}`
                  : c.isPlayer
                    ? 'bg-blue-900 text-blue-200'
                    : 'bg-gray-700 text-gray-300'
            }`}
          >
            {c.isPlayer
              ? <span style={{ color: partyColors[c.partyIndex ?? 0] ?? '#fff' }}>{partyNames[c.partyIndex ?? 0] ?? c.name}</span>
              : <span className="flex items-center gap-1">{enemy && createElement(enemy.classData.token, { className: 'w-4 h-4 shrink-0' })}{c.name}</span>
            }
            <span className="ml-1 text-xs opacity-60">({c.initiativeRoll})</span>
          </div>
        );
      })}
    </div>
  );
}
