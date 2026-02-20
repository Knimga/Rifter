import type { Combatant } from '../data/combat';
import type { EnemyInstance } from '../data/enemies';

interface Props {
  turnOrder: Combatant[];
  currentTurnIndex: number;
  enemies: EnemyInstance[];
}

export default function TurnOrderBar({ turnOrder, currentTurnIndex, enemies }: Props) {
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
                  ? 'bg-yellow-500 text-gray-900'
                  : c.isPlayer
                    ? 'bg-blue-900 text-blue-200'
                    : 'bg-gray-700 text-gray-300'
            }`}
          >
            {c.isPlayer ? 'You' : `${enemy?.type.token ?? ''} ${c.name}`}
            <span className="ml-1 text-xs opacity-60">({c.initiativeRoll})</span>
          </div>
        );
      })}
    </div>
  );
}
