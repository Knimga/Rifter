// On a creature's turn (an enemy or a summoned ally, run by the AI), in the action bar's place: who is acting, and
// what it is doing: moving, or using an ability (its name in its displayElement's color). When what it does (or
// who is acting) changes, the whole line, name and action, fades out quickly, the pane stays empty a beat, and the
// new line fades in: the flash of dark draws the eye to the new action.
import { useEffect, useState } from 'react';
import type { EnemyActivity } from '../../hooks/useEnemyTurn';
import { elementTint } from '../ui/AbilityCard';

/** The fade out (and in), then the empty beat between (ms). */
const FADE_MS = 110, GAP_MS = 70;

export default function ActingStatus({ name, activity, seq }: {
  name: string;
  activity: EnemyActivity;
  /** Counts activities: a new value is a new one, even the same ability again. */
  seq: number;
}) {
  // A new line whenever the activity is new (consecutive moves read as one) or another creature acts
  const key = `${name}|${!activity ? 'acting' : activity.kind === 'moving' ? 'moving' : `ability-${seq}`}`;
  const [shown, setShown] = useState({ key, name, activity });
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (key === shown.key) return;
    setVisible(false);
    const id = setTimeout(() => { setShown({ key, name, activity }); setVisible(true); }, FADE_MS + GAP_MS);
    return () => clearTimeout(id);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const a = shown.activity;
  return (
    <div role="status" className="rf-hud px-8 py-5">
      <div className={`flex items-baseline gap-3.5 transition-opacity ease-out ${visible ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDuration: `${FADE_MS}ms` }}>
        <span className="font-display text-lg tracking-[0.06em] text-rift-ink">{shown.name}</span>
        {a?.kind === 'ability' ? (
          <span className="text-sm text-rift-muted">
            uses <span className="font-display tracking-[0.04em]"
              style={{ color: a.ability.displayElement ? elementTint(a.ability.displayElement) : 'var(--rift-ink)' }}>{a.ability.name}</span>!
          </span>
        ) : (
          <span className="text-xs text-rift-muted">{a?.kind === 'moving' ? 'is moving…' : 'is acting…'}</span>
        )}
      </div>
    </div>
  );
}
