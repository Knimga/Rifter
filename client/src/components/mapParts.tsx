import type { ActiveBuff, ActiveDot, ActiveHot } from '../data/stats';
import type { ClassKey } from '../data/classes';
import { CLASSES } from '../data/classes';
import type { Pos } from '../data/dungeonHelpers';
import { DAMAGE_ELEMENT_COLOR, TILE_SIZE } from '../data/constants';
import { Tooltip } from './Tooltip';
import MoveLine from './MoveLine';

// ─── Shared pieces of the Sanctum and Dungeon maps ────────────────────────────

/** A party member as drawn on a map. partyIndex 0 is the leader. */
export interface PartyTokenData {
  pos: Pos;
  classKey: ClassKey;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  partyIndex: number;
}

// ─── Effect dots ──────────────────────────────────────────────────────────────

interface EffectDot {
  name: string;
  color: string;
  sign: '+' | '-';
}

/** One dot per buff source, HoT and DoT on a unit (party member or enemy). */
export function computeEffectDots(buffs: ActiveBuff[], hots: ActiveHot[], dots: ActiveDot[]): EffectDot[] {
  const result: EffectDot[] = [];
  const seen = new Set<string>();
  for (const buff of buffs) {
    const key = buff.source ?? buff.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const isNeg = buff.amount < 0 || (buff.percent !== undefined && buff.percent < 0);
    result.push({ name: key, color: buff.damageElement ? DAMAGE_ELEMENT_COLOR[buff.damageElement] : '#888', sign: isNeg ? '-' : '+' });
  }
  for (const hot of hots) {
    result.push({ name: hot.name ?? 'HoT', color: hot.damageElement ? DAMAGE_ELEMENT_COLOR[hot.damageElement] : '#888', sign: '+' });
  }
  for (const dot of dots) {
    result.push({ name: dot.name ?? `${dot.damageElement} DoT`, color: DAMAGE_ELEMENT_COLOR[dot.damageElement], sign: '-' });
  }
  return result;
}

export function EffectDotRow({ dots }: { dots: EffectDot[] }) {
  if (dots.length === 0) return null;
  return (
    <div className="absolute top-0 left-0 flex flex-wrap gap-px p-px z-10">
      {dots.map((dot, i) => (
        <Tooltip key={i} content={<span className="px-1.5 py-0.5 text-xs text-gray-100 whitespace-nowrap">{dot.name}</span>}>
          <div
            style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dot.color, flexShrink: 0, cursor: 'default' }}
            className="flex items-center justify-center"
          >
            <span className="text-white font-bold leading-none select-none" style={{ fontSize: 6 }}>
              {dot.sign}
            </span>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

// ─── Party token ──────────────────────────────────────────────────────────────

/** Class-colored circle with HP/MP bars. The leader is drawn slightly larger and fully opaque. */
export function PartyToken({ member, dots = [] }: { member: PartyTokenData; dots?: EffectDot[] }) {
  const isLeader = member.partyIndex === 0;
  const size = isLeader ? 'w-8' : 'w-7';
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className={`${size} ${isLeader ? 'h-8' : 'h-7 opacity-75'} rounded-full`} style={{ backgroundColor: CLASSES[member.classKey].color }} />
      <div className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 ${size} flex flex-col gap-px`}>
        <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-red-500 transition-all" style={{ width: `${(member.hp / member.maxHp) * 100}%` }} />
        </div>
        <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${(member.mp / member.maxMp) * 100}%` }} />
        </div>
      </div>
      <EffectDotRow dots={dots} />
    </div>
  );
}

// ─── Move line ────────────────────────────────────────────────────────────────

/** Animated line from the active mover to the hovered tile, in tile coordinates. */
export function MoveLineOverlay({ from, to, cols, rows }: { from: Pos; to: Pos; cols: number; rows: number }) {
  const half = TILE_SIZE / 2;
  return (
    <MoveLine
      svgWidth={cols * TILE_SIZE} svgHeight={rows * TILE_SIZE}
      x1={from.x * TILE_SIZE + half} y1={from.y * TILE_SIZE + half}
      x2={to.x * TILE_SIZE + half} y2={to.y * TILE_SIZE + half}
    />
  );
}
