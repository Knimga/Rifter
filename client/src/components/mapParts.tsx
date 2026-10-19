import { useMemo, type ReactNode } from 'react';
import { TILE_SIZE, boardLayout, type BoardLayout } from '../viewEngine/board';
import { yawFromGridMove } from '../forge/core/facing';
import type { ActiveBuff, ActiveDot, ActiveHot } from '../data/stats';
import type { ClassKey } from '../data/classes';
import type { ModelLink } from '../forge/core/types';
import type { HeldWeapon } from '../forge/equip';
import type { MapPartyMember } from './ModelLayer';
import type { Pos } from '../data/dungeonHelpers';
import { DAMAGE_ELEMENT_COLOR } from '../data/constants';
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
    active: m.active,
    overlay: <PartyOverlay member={m} dots={dots} />,
  };
}

// ─── Board ────────────────────────────────────────────────────────────────────

/** A map's board layout (the game view's projection of its cols x rows grid), stable while the size is. */
export function useBoard(cols: number, rows: number): BoardLayout {
  return useMemo(() => boardLayout(cols, rows, TILE_SIZE), [cols, rows]);
}

/**
 * A map's board, drawn in the game view (GAME_CAMERA): a box sized to the projected grid. `floor` is the
 * flat tile grid and anything lying on it (highlights, the move line), in flat tile px (tile (x, y) at
 * x·TILE_SIZE, y·TILE_SIZE); it is laid on the floor by one CSS transform, so clicks and hovers land on
 * the right tiles. `children` are drawn above it, upright (models, overlays, markers), placed with
 * board.toScreen (see UprightAt).
 */
export function Board({ board, floor, children }: { board: BoardLayout; floor: ReactNode; children?: ReactNode }) {
  return (
    <div className="relative" style={{ width: board.width, height: board.height }}>
      <div
        className="absolute left-0 top-0"
        style={{ width: board.cols * TILE_SIZE, height: board.rows * TILE_SIZE, transform: board.floorTransform, transformOrigin: '0 0' }}
      >
        {floor}
      </div>
      {children}
    </div>
  );
}

/**
 * Upright DOM on the board (not laid on the floor): a TILE_SIZE-wide box centered on tile (x, y), its
 * center `height` world tiles above the floor. Doesn't take clicks (the tile under it does).
 */
export function UprightAt({ board, x, y, height = 0, className = '', children }: { board: BoardLayout; x: number; y: number; height?: number; className?: string; children: ReactNode }) {
  const p = board.toScreen(x + 0.5, y + 0.5, height);
  return (
    <div
      className={`absolute pointer-events-none flex items-center justify-center ${className}`}
      style={{ left: p.left - TILE_SIZE / 2, top: p.top - TILE_SIZE / 2, width: TILE_SIZE, height: TILE_SIZE }}
    >
      {children}
    </div>
  );
}

/**
 * Yaw (radians) for a game object at `pos` to face its open side: the first walkable side tile (south, east,
 * north, west), e.g. a door in a wall facing the floor it opens onto. 0 (south) if none is open.
 */
export function facingOpenSide(pos: Pos, isOpen: (p: Pos) => boolean): number {
  for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) if (isOpen({ x: pos.x + dx, y: pos.y + dy })) return yawFromGridMove(dx, dy);
  return 0;
}

/**
 * A soft pulsing glow filling a floor tile: something there (a door, a portal) can be used now. `color`
 * is "r, g b" (0-255); it brightens on hover. Goes inside the tile, on the floor layer.
 */
export function UsableGlow({ color, hovered }: { color: string; hovered: boolean }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none animate-pulse"
      style={{ boxShadow: `inset 0 0 ${hovered ? 16 : 10}px ${hovered ? 4 : 2}px rgba(${color}, ${hovered ? 0.8 : 0.5})` }}
    />
  );
}

/**
 * Floor glow under the active party member: a faint disc on the floor plane, beneath the model (ModelLayer
 * moves it with the model). The floor transform turns it into the oval the floor shows in perspective.
 */
export function ActiveGlow() {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        inset: '2%',
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
