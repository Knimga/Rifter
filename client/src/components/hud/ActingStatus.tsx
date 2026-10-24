// On a creature's turn (an enemy or a summoned ally, run by the AI), in the action bar's place: who is acting,
// and while it targets and uses an ability, which one (in its element's color).
import type { Ability } from '../../data/combat/abilities';
import { abilityTint } from '../ui/AbilityCard';

export default function ActingStatus({ name, ability }: { name: string; ability: Ability | null }) {
  return (
    <div role="status" className="rf-hud flex items-baseline gap-3.5 px-8 py-5">
      <span className="font-display text-lg tracking-[0.06em] text-rift-ink">{name}</span>
      {ability ? (
        <span className="text-sm text-rift-muted">
          uses <span className="font-display tracking-[0.04em]" style={{ color: abilityTint(ability, null) ?? 'var(--rift-ink)' }}>{ability.name}</span>!
        </span>
      ) : (
        <span className="text-xs text-rift-muted">is acting</span>
      )}
    </div>
  );
}
