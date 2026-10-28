// Turn order: "Round N" and a pill per combatant, party grey with a diamond,
// summoned allies grey, enemies dark red. The current one glows; those that have acted this round fade. Hovering a pill
// highlights that unit on the map.
import type { Combatant } from '../../data/combat/combat';
import type { EnemyInstance } from '../../data/units/enemies';
import { Hint } from '../Tooltip';

export default function TurnOrderStrip({ round, turnOrder, currentTurnIndex, enemies, partyNames, onHover }: {
  round: number;
  turnOrder: Combatant[];
  currentTurnIndex: number;
  enemies: EnemyInstance[];
  partyNames: string[];
  /** The combatant id under the pointer (null when none). */
  onHover: (id: string | null) => void;
}) {
  const alive = new Set(enemies.filter((e) => e.currentHp > 0).map((e) => e.id));
  return (
    <nav aria-label="Turn order" className="rf-hud flex items-center gap-3.5 w-max max-w-full box-border py-2 pl-3.5 pr-2.5">
      <span className="flex-none rf-label">Round {round}</span>
      <ol className="m-0 p-0 list-none flex gap-1.5 min-w-0">
        {turnOrder.map((c, i) => {
          // The dead are out of the fight (their turns are skipped)
          if (!c.isPlayer && !alive.has(c.id)) return null;
          const name = c.isPlayer ? (partyNames[c.partyIndex ?? 0] ?? c.name) : c.name;
          const current = i === currentTurnIndex;
          const done = i < currentTurnIndex;
          // Party members and their summoned allies share the party's look (allies without its diamond)
          const partySide = c.isPlayer || c.isAlly;
          return (
            <li key={c.id} className="flex min-w-0" style={{ flex: '0 1 112px' }}>
              {/* The name, in full, in case the pill cuts it short */}
              <Hint text={c.isAlly ? `${name} (summoned)` : name} className="flex min-w-0 w-full">
                <button type="button"
                  className={`rf-pill ${partySide ? '' : 'is-enemy'} ${current ? 'is-current' : ''} ${done ? 'is-done' : ''}`}
                  aria-current={current}
                  aria-label={`${name}, ${c.isPlayer ? 'party' : c.isAlly ? 'summoned ally' : 'enemy'}${current ? ', current turn' : done ? ', has acted this round' : ''}`}
                  onMouseEnter={() => onHover(c.id)} onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(c.id)} onBlur={() => onHover(null)}>
                  {c.isPlayer && <span aria-hidden="true" className="flex-none w-1.5 h-1.5 rotate-45" style={{ background: 'var(--glow)' }} />}
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{name}</span>
                </button>
              </Hint>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
