// The party (UI handoff, game screen, bottom left): a row per member with portrait, name, class and HP/MP.
// The selected member (acting in combat; chosen out of combat) glows. Out of combat a click selects.
// A member with level-up points to spend gets the pale yellow level-up treatment and a LEVEL UP tag.
import { CLASSES } from '../../data/classes';
import type { PartyTokenData } from '../mapParts';
import Portrait from './Portrait';
import { StatBar } from './UnitStatus';

export interface PartyRow {
  token: PartyTokenData;
  name: string;
  /** Has level-up points to spend. */
  levelUp: boolean;
}

export default function PartyRows({ rows, selectedIdx, canSelect, onSelect }: {
  rows: PartyRow[];
  selectedIdx: number;
  canSelect: boolean;
  onSelect: (partyIndex: number) => void;
}) {
  return (
    <section aria-label="Party" className="w-[264px] flex flex-col gap-2">
      {rows.map(({ token: t, name, levelUp }) => {
        const sel = t.partyIndex === selectedIdx;
        return (
          <button key={t.partyIndex} type="button" aria-pressed={sel}
            className={`rf-row ${sel ? 'is-sel' : ''} ${levelUp ? 'is-levelup' : ''} relative flex items-center gap-3 w-full box-border px-3 py-2.5 text-left text-inherit`}
            onClick={() => canSelect && onSelect(t.partyIndex)}>
            {/* On the top edge, overlapping the border, so the panel doesn't grow */}
            {levelUp && <span className="rf-levelup-tag">Level up</span>}
            <Portrait classKey={t.classKey} weapon={t.weapon} shield={t.shield} size={44} />
            <span className="flex-1 min-w-0 flex flex-col gap-[5px]">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-display text-[15px] tracking-[0.04em] text-rift-ink truncate">{name}</span>
                <span className="text-[11px] text-rift-label">{CLASSES[t.classKey].name}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="flex-1"><StatBar value={t.hp} max={t.maxHp} kind="hp" /></span>
                <span className="w-[46px] text-right text-[11px] text-rift-muted">{t.hp}/{t.maxHp}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="flex-1"><StatBar value={t.mp} max={t.maxMp} kind="mp" /></span>
                <span className="w-[46px] text-right text-[11px] text-rift-muted">{t.mp}/{t.maxMp}</span>
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
