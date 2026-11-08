import { Children, memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useLatest } from '../hooks/useLatest';
import { TILE_SIZE, boardLayout, type BoardLayout } from '../viewEngine/board';
import type { ClassKey } from '../data/units/classes';
import type { ModelLink } from '../forge/core/types';
import type { HeldWeapon } from '../forge/equip';
import type { MapLoot, MapPartyMember } from './ModelLayer';
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';
import { RIFT_MODELS } from '../data/world/rifts';
import { keyPos, samePos, type Pos } from '../data/world/grid';
import UnitStatus, { type StatusMarker } from './hud/UnitStatus';
import MoveLine from './MoveLine';
import FloatingCombatText, { type FloatingText } from './FloatingCombatText';

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
  /** Equipped weapon and offhand, as the member's 3D model holds them (none = nothing). */
  weapon?: HeldWeapon;
  offhand?: ModelLink;
  /** The tile its model faces as it appears on the map (MapPartyMember.faces). */
  faces?: Pos;
  /** Its model fades in as it appears (MapPartyMember.fadeIn). */
  fadeIn?: boolean;
}

/** The 3D model layer's view of a party member, with its over-head status (effect markers, HP/MP bars). */
export function toMapMember(m: PartyTokenData, markers: StatusMarker[] = []): MapPartyMember {
  return {
    id: `party-${m.partyIndex}`,
    classKey: m.classKey,
    pos: m.pos,
    weapon: m.weapon,
    offhand: m.offhand,
    active: m.active,
    faces: m.faces,
    fadeIn: m.fadeIn,
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
 * board.toScreen (see UprightAt). `under` is drawn beneath the floor, filling the box (the map's 3D floor).
 */
export function Board({ board, floor, under, children }: { board: BoardLayout; floor: ReactNode; under?: ReactNode; children?: ReactNode }) {
  return (
    <div className="relative" style={{ width: board.width, height: board.height }}>
      {under}
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
 * A soft pulsing glow filling a floor tile: something there (a door, a rift) can be used now. `color` is
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
 * A faint, steady glow at a floor tile's edges: the thing on it (a rift) is under the mouse but can't be used
 * from here (UsableGlow is the one that pulses, when it can). Goes inside the tile, on the floor layer.
 */
export function HoverEdgeGlow({ color }: { color: string }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ boxShadow: `inset 0 0 8px 1px color-mix(in srgb, ${color} 45%, transparent)` }}
    />
  );
}

/**
 * A map object's name tag while it is hovered (e.g. a rift's "To the Crypt"): a small tooltip box, upright
 * over its tile with its bottom edge at `height` world tiles (so it sits above anything that tall), shown at once
 * (no delay).
 */
export function ObjectTag({ board, x, y, height, text, icon }: { board: BoardLayout; x: number; y: number; height: number; text: string; icon?: ReactNode }) {
  return (
    <UprightAt board={board} x={x} y={y} height={height} className="z-30">
      <MapTag text={text} icon={icon} className="-translate-y-1/2" />
    </UprightAt>
  );
}

/** The map's name tag (a rift's destination, a key's name, a hovered enemy's name), with an icon before it if any (an NPC's service). */
export function MapTag({ text, icon, className = '' }: { text: string; icon?: ReactNode; className?: string }) {
  return (
    <div role="tooltip" className={`rf-tip px-2.5 py-1.5 whitespace-nowrap font-tech text-xs text-rift-soft ${icon ? 'flex items-center gap-1.5' : ''} ${className}`}>
      {icon}{text}
    </div>
  );
}

/** How high (world tiles) a rift key's name tag (or a gold pile's amount) sits over the floor it lies on. */
export const KEY_TAG_HEIGHT = 0.35;

/** A rift key lying on the floor at `key` (a tile key), as loot: the keystone, in its dungeon's color. */
export const keyLoot = (key: string, dungeon: DungeonKey): MapLoot =>
  ({ id: `key-${dungeon}`, link: RIFT_MODELS.keystone.model, pos: keyPos(key), tint: DUNGEONS[dungeon].riftColor, halo: KEY_HALO });

/** How much wider (and, drawn twice, brighter) a rift key's halo is lying on the floor than in the Rifter's socket (MapLoot.halo). */
const KEY_HALO = 1.7;

/** How many sparkles twinkle over a loot pile, and how long one sparkle's cycle lasts (ms). */
const SPARKLES = 6;
const SPARKLE_CYCLE = 2000;
/** How wide the sparkles spread around a loot pile: 1 is a 34 x 26 px area (a bit over a tile wide), 1.3 is 30% wider and taller. */
const SPARKLE_SPREAD = 1.3;

/**
 * Loot lying on the floor (an item, a rift key, gold, shards): small four-pointed stars twinkling over the pile,
 * pale gold whatever lies there, so it catches the eye. Upright, over the pile's model. Each pile's sparkles sit
 * and time themselves by its tile (piles don't twinkle in step); the view's own effect, not the loot's design
 * (loot never animates).
 */
export function LootSparkle({ board, x, y }: { board: BoardLayout; x: number; y: number }) {
  // A small hash of the tile: where each sparkle sits around the pile and when it lights
  const at = (i: number, salt: number) => {
    const h = Math.sin((x + 1) * 127.1 + (y + 1) * 311.7 + i * 74.7 + salt * 19.3) * 43758.5453;
    return h - Math.floor(h);
  };
  return (
    <UprightAt board={board} x={x} y={y} height={0.15} className="z-10">
      {Array.from({ length: SPARKLES }, (_, i) => {
        const size = 7 + at(i, 3) * 5;
        return (
          <svg key={i} viewBox="-10 -10 20 20" width={size} height={size} aria-hidden className="rf-sparkle absolute"
            style={{
              left: TILE_SIZE / 2 + (at(i, 1) - 0.5) * 34 * SPARKLE_SPREAD - size / 2,
              top: TILE_SIZE / 2 + (at(i, 2) - 0.5) * 26 * SPARKLE_SPREAD - size / 2,
              // Spread evenly through the cycle (with a little jitter), so one is always lighting
              animationDelay: `${-Math.round(((i + at(i, 4) * 0.6) / SPARKLES) * SPARKLE_CYCLE)}ms`,
              animationDuration: `${SPARKLE_CYCLE}ms`,
            }}>
            <path d="M0 -10 Q1.2 -1.2 10 0 Q1.2 1.2 0 10 Q-1.2 1.2 -10 0 Q-1.2 -1.2 0 -10Z" fill="var(--rift-loot-sparkle)" />
          </svg>
        );
      })}
    </UprightAt>
  );
}

/**
 * How high (world tiles) a rift's tag sits: clear of its top (rifts stand 1.5 tall; the far side of the ring
 * shows higher on screen under the camera's tilt, so with some room to spare).
 */
export const RIFT_TAG_HEIGHT = 1.95;

/** The tag text of a rift to a place: "To the Crypt" (a name starting "The" reads lower-case after "To"). */
export const riftTag = (placeName: string) => `To ${placeName.replace(/^The /, 'the ')}`;

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

/** The tile grid's line color, where the forge shows a grid (the maps have none). A real color (not a CSS variable): the forge's snapshots draw it on a canvas. */
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
  /** Lit as the hovered move target (faintly: the tile is otherwise clear, over the map's 3D floor). */
  brighten?: boolean;
  hover: HoveredTile;
  /** Stable across renders (useStableHandler), so the tile's memo holds. */
  onClick: (p: Pos) => void;
  children?: ReactNode;
}

/**
 * One tile of a map's HTML floor: clear over its 3D floor (a move target lights faintly under the pointer), tracking
 * hover and taking clicks. Overlays (highlights, glows) go inside as children.
 *
 * Memoized: a map has hundreds of tiles and re-renders on every hovered tile, but only the few tiles whose
 * look changes need to redraw. A tile with overlays always redraws (its children are new elements).
 */
export const FloorTile = memo(function FloorTile({ p, brighten = false, hover, onClick, children }: FloorTileProps) {
  return (
    <div
      onClick={() => onClick(p)}
      onMouseEnter={() => hover.enter(p)}
      onMouseLeave={() => hover.leave(p)}
      className="relative shrink-0"
      style={{ width: TILE_SIZE, height: TILE_SIZE, backgroundColor: brighten ? 'color-mix(in srgb, var(--glow) 16%, transparent)' : undefined }}
    >
      {children}
    </div>
  );
}, (a: FloorTileProps, b: FloorTileProps) =>
  a.p.x === b.p.x && a.p.y === b.p.y && !!a.brighten === !!b.brighten && a.onClick === b.onClick
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

// ─── Floating text ────────────────────────────────────────────────────────────

/**
 * A map's floating text (damage, heals, "Level N!", gold), rising from its tile; `shown` (optional) picks which are
 * drawn (a dungeon's: only those over tiles the party sees). The others still run out on time, unseen, so none plays
 * late once its tile comes into sight. A large creature's float rises from its center (between tiles).
 */
export function MapFloats({ board, floats, onComplete, shown }: { board: BoardLayout; floats: FloatingText[]; onComplete: (id: number) => void; shown?: (ft: FloatingText) => boolean }) {
  return (
    <>
      {floats.map((ft) => (
        <FloatingCombatText key={ft.id} ft={ft} at={board.toScreen(ft.gridX + 0.5, ft.gridY + 0.5, 0.5)} onComplete={onComplete}
          hidden={!!shown && !shown(ft)} />
      ))}
    </>
  );
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
