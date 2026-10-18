import type { ActiveBuff, ActiveDot, ActiveHot } from '../data/stats';
import type { ClassKey } from '../data/classes';
import type { ModelLink } from '../forge/core/types';
import type { HeldWeapon } from '../forge/equip';
import type { MapPartyMember } from './ModelLayer';
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
  /** The member whose turn it is (in combat) or whose action bar is shown (out of combat). */
  active: boolean;
  /** Equipped weapon and shield, as the member's 3D model holds them (none = nothing in that hand). */
  weapon?: HeldWeapon;
  shield?: ModelLink;
}

/** The 3D model layer's view of a party member, with its over-head HP/MP bars and effect dots. */
export function toMapMember(m: PartyTokenData, dots: EffectDot[] = []): MapPartyMember {
  return {
    id: `party-${m.partyIndex}`,
    classKey: m.classKey,
    pos: m.pos,
    weapon: m.weapon,
    shield: m.shield,
    overlay: <PartyOverlay member={m} dots={dots} />,
  };
}

/**
 * Floor glow under the active party member (drawn on the tile, beneath the model): a faint oval centered
 * on the feet, wider than tall, so it reads as lying on the floor in the game camera's perspective.
 */
export function ActiveGlow() {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: '14%', right: '14%', top: '29%', bottom: '29%',
        // closest-side: the gradient reaches 0 exactly at the oval's edge, so it fades out with no rim
        background: 'radial-gradient(ellipse closest-side, rgba(240, 232, 196, 0.32) 0%, rgba(240, 232, 196, 0.14) 50%, rgba(240, 232, 196, 0) 100%)',
      }}
    />
  );
}

/** Above a party model's head: effect dots over HP and MP bars. */
function PartyOverlay({ member, dots }: { member: PartyTokenData; dots: EffectDot[] }) {
  return (
    <>
      {dots.length > 0 && <div className="relative h-2 w-8 pointer-events-auto"><EffectDotRow dots={dots} /></div>}
      <div className="w-8 flex flex-col gap-px">
        <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-red-500 transition-all" style={{ width: `${(member.hp / member.maxHp) * 100}%` }} />
        </div>
        <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${(member.mp / member.maxMp) * 100}%` }} />
        </div>
      </div>
    </>
  );
}

/** Border color of a plain floor/wall tile (tiles also use Tailwind's `border`). Shared by both maps and the forge's game view. */
export const TILE_BORDER_CLASS = 'border-gray-700/30';

// ─── Effect dots ──────────────────────────────────────────────────────────────

interface EffectDot {
  name: string;
  color: string;
  sign: '+' | '-';
}

/** One dot per buff source, HoT and DoT on a unit (party member or enemy), shown above its model's head. */
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

// ─── Enemy HP bar ─────────────────────────────────────────────────────────────

/** Enemy health bar, above its model's head. */
export function EnemyHpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  return (
    <div className="w-8 h-1 bg-gray-700 rounded-full overflow-hidden">
      <div className="h-full bg-red-500 transition-all" style={{ width: `${(hp / maxHp) * 100}%` }} />
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
