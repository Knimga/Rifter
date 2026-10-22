import { Children, memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useLatest } from '../hooks/useLatest';
import { TILE_SIZE, boardLayout, type BoardLayout } from '../viewEngine/board';
import { yawFromGridMove } from '../forge/core/facing';
import type { ClassKey } from '../data/classes';
import type { ModelLink } from '../forge/core/types';
import type { HeldWeapon } from '../forge/equip';
import type { MapPartyMember } from './ModelLayer';
import { brightenHex, samePos, type Pos } from '../data/dungeonHelpers';
import UnitStatus, { type StatusMarker } from './hud/UnitStatus';
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

/** The 3D model layer's view of a party member, with its over-head status (effect markers, HP/MP bars). */
export function toMapMember(m: PartyTokenData, markers: StatusMarker[] = []): MapPartyMember {
  return {
    id: `party-${m.partyIndex}`,
    classKey: m.classKey,
    pos: m.pos,
    weapon: m.weapon,
    shield: m.shield,
    active: m.active,
    overlay: <UnitStatus markers={markers} hp={m.hp} maxHp={m.maxHp} mp={m.mp} maxMp={m.maxMp} />,
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
 * A soft pulsing glow filling a floor tile: something there (a door, a portal) can be used now. `color` is
 * any CSS color (a palette variable); it brightens on hover. Goes inside the tile, on the floor layer.
 */
export function UsableGlow({ color, hovered }: { color: string; hovered: boolean }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none animate-pulse"
      style={{ boxShadow: `inset 0 0 ${hovered ? 16 : 10}px ${hovered ? 4 : 2}px color-mix(in srgb, ${color} ${hovered ? 80 : 50}%, transparent)` }}
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
        background: 'radial-gradient(ellipse closest-side, color-mix(in srgb, var(--rift-active) 32%, transparent) 0%, color-mix(in srgb, var(--rift-active) 14%, transparent) 50%, transparent 100%)',
      }}
    />
  );
}

// ─── Floor tiles ──────────────────────────────────────────────────────────────

/** Border color of every floor/wall tile. A real color (not a CSS variable): the forge's snapshots draw it on a canvas. */
export const TILE_BORDER_COLOR = 'rgba(55, 65, 81, 0.3)';

/** The tile under the pointer, tracked by FloorTile's hover handlers. */
export function useHoveredTile() {
  const [hovered, setHovered] = useState<Pos | null>(null);
  // Stable, so tiles (memoized) don't redraw just because the hovered tile changed
  const enter = useCallback((p: Pos) => setHovered(p), []);
  const leave = useCallback((p: Pos) => setHovered((prev) => (prev && samePos(prev, p) ? null : prev)), []);
  return {
    hovered,
    isHovered: (p: Pos) => !!hovered && samePos(hovered, p),
    enter,
    leave,
  };
}
export type HoveredTile = ReturnType<typeof useHoveredTile>;

/** A callback that never changes identity but always runs the latest `fn` (for memoized children's handlers). */
export function useStableHandler<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  const latest = useLatest(fn);
  return useCallback((...args: A) => latest.current(...args), []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** A map's floor grid: `tile(p)` draws each tile (a FloorTile), row by row. */
export function FloorGrid({ cols, rows, tile }: { cols: number; rows: number; tile: (p: Pos) => ReactNode }) {
  return (
    <>
      {Array.from({ length: rows }, (_, y) => (
        <div key={y} className="flex">
          {Array.from({ length: cols }, (_, x) => tile({ x, y }))}
        </div>
      ))}
    </>
  );
}

interface FloorTileProps {
  p: Pos;
  /** Floor or wall color (hex). */
  color: string;
  /** Lit as the hovered move target. */
  brighten?: boolean;
  hover: HoveredTile;
  /** Stable across renders (useStableHandler), so the tile's memo holds. */
  onClick: (p: Pos) => void;
  children?: ReactNode;
}

/**
 * One floor or wall tile: its color (a move target brightens under the pointer), hover tracking and clicks.
 * Overlays (highlights, glows) go inside as children.
 *
 * Memoized: a map has hundreds of tiles and re-renders on every hovered tile, but only the few tiles whose
 * look changes need to redraw. A tile with overlays always redraws (its children are new elements).
 */
export const FloorTile = memo(function FloorTile({ p, color, brighten = false, hover, onClick, children }: FloorTileProps) {
  return (
    <div
      onClick={() => onClick(p)}
      onMouseEnter={() => hover.enter(p)}
      onMouseLeave={() => hover.leave(p)}
      className="relative shrink-0 border"
      style={{ width: TILE_SIZE, height: TILE_SIZE, borderColor: TILE_BORDER_COLOR, backgroundColor: brighten ? brightenHex(color, 1.5) : color }}
    >
      {children}
    </div>
  );
}, (a: FloorTileProps, b: FloorTileProps) =>
  a.p.x === b.p.x && a.p.y === b.p.y && a.color === b.color && !!a.brighten === !!b.brighten && a.onClick === b.onClick
  && a.hover.enter === b.hover.enter && a.hover.leave === b.hover.leave
  && noChildren(a.children) && noChildren(b.children));

/** No overlays: nothing but empty nodes (false, null) from `{cond && <X />}` children. */
const noChildren = (children: ReactNode) => Children.toArray(children).length === 0;

/**
 * Overlays drawn over a floor tile (on the floor layer, taking no clicks): targeting in the theme's muted
 * green (allies, helpful areas) and red (enemies, harmful areas), whose turn it is, and the hovered unit.
 * Shared by both maps.
 */
export const TILE_HIGHLIGHT = {
  /** A valid ally (or self) target. */
  ally: 'bg-[color-mix(in_srgb,var(--rift-ally)_16%,transparent)] border-2 border-rift-ally',
  /** A valid enemy target, or a party member an enemy is about to hit. */
  enemy: 'bg-[color-mix(in_srgb,var(--rift-foe)_14%,transparent)] border-2 border-rift-foe',
  /** Tiles an area ability would cover: helpful / harmful. */
  areaHelp: 'bg-[color-mix(in_srgb,var(--rift-ally)_28%,transparent)] border border-[color-mix(in_srgb,var(--rift-ally)_60%,black)]',
  areaHarm: 'bg-[color-mix(in_srgb,var(--rift-foe)_28%,transparent)] border border-[color-mix(in_srgb,var(--rift-foe)_60%,black)]',
  /** An enemy's area attack about to land. */
  enemyArea: 'bg-[color-mix(in_srgb,var(--rift-hp)_30%,transparent)] border border-rift-hp',
  /** The enemy whose turn it is. */
  acting: 'border-2 border-rift-acting',
  /** The party member whose turn it is (their own tile). */
  mover: 'border border-rift-rim-hi',
  /** The unit under a hovered turn-order pill. */
  hovered: 'border-2 border-rift-bright bg-[color-mix(in_srgb,var(--glow)_22%,transparent)]',
} as const;

/** One highlight overlay on a floor tile (see TILE_HIGHLIGHT). */
export function TileHighlight({ kind, className = '' }: { kind: keyof typeof TILE_HIGHLIGHT; className?: string }) {
  return <div className={`absolute inset-0 pointer-events-none ${TILE_HIGHLIGHT[kind]} ${className}`} />;
}

// ─── Move line ────────────────────────────────────────────────────────────────

/** Animated line from the active mover to the hovered tile, in tile coordinates. */
export function MoveLineOverlay({ from, to }: { from: Pos; to: Pos }) {
  const half = TILE_SIZE / 2;
  return (
    <MoveLine
      x1={from.x * TILE_SIZE + half} y1={from.y * TILE_SIZE + half}
      x2={to.x * TILE_SIZE + half} y2={to.y * TILE_SIZE + half}
    />
  );
}
