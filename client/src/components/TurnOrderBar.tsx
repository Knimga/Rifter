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

function resolvePlayer(id: string, partyNames: string[], partyColors: string[]): { name: string; color: string } {
  if (id === 'player') return { name: partyNames[0] ?? 'You', color: partyColors[0] ?? '#fff' };
  const m = id.match(/^player-(\d+)$/);
  const idx = m ? Number(m[1]) : 0;
  return { name: partyNames[idx] ?? 'You', color: partyColors[idx] ?? '#fff' };
}

export default function TurnOrderBar({ turnOrder, currentTurnIndex, enemies, partyNames, partyColors }: Props) {
  return (
    <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide mr-1">Turn Order</span>
      {turnOrder.map((c, i) => {
        const isCurrent = i === currentTurnIndex;
        const isDead = !c.isPlayer && !enemies.some(e => e.id === c.id && e.currentHp > 0);
        const enemy = !c.isPlayer ? enemies.find(e => e.id === c.id) : null;

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
              ? (() => { const p = resolvePlayer(c.id, partyNames, partyColors); return <span style={{ color: p.color }}>{p.name}</span>; })()
              : <span className="flex items-center gap-1">{enemy && createElement(enemy.classData.token, { className: 'w-4 h-4 shrink-0' })}{c.name}</span>
            }
            <span className="ml-1 text-xs opacity-60">({c.initiativeRoll})</span>
          </div>
        );
      })}
    </div>
  );
}
