// DEV ONLY: the forge page's map viewer (its Maps views: the Sanctum and the dungeons). A map drawn exactly as the game
// draws it (the Board, its 3D floor and walls, its objects and units), in a viewport that pans (right-drag) and zooms,
// with toggles to check how the grid, the fog and the tile highlights read over it.
import { useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { posKey, type Pos } from '../../data/world/grid';
import { Board, FloorGrid, FloorTile, TILE_BORDER_COLOR, TileHighlight, useBoard, useHoveredTile, useStableHandler } from '../../components/mapParts';
import ModelLayer, { type MapObject } from '../../components/ModelLayer';
import type { EnemyInstance } from '../../data/units/enemies';
import type { FogInput } from '../../viewEngine/three/fog';
import type { Terrain } from '../terrain/types';
import type { Design } from '../core/types';
import { designs as approvedDesigns } from '../registry.vite';
import { drafts } from './draftRegistry';
import { BTN, INPUT, Toggle } from './ui';

/** Every design, a draft over its approved version. */
const withDrafts = { ...approvedDesigns, ...drafts };

/** Highlights laid on a few floor tiles near the map's center, one of each kind the game shows most. */
const SAMPLE_HIGHLIGHTS = ['ally', 'enemy', 'areaHarm', 'areaHarm', 'areaHelp', 'mover'] as const;

/** The zoom levels offered; maps open at full size. */
const ZOOMS = [0.35, 0.5, 0.75, 1];

export interface MapViewProps {
  title: string;
  /** Under the title: where its look is set, and its size. */
  subtitle: ReactNode;
  /** The map's own controls, before the shared ones (a dungeon's layout and zone). */
  controls?: ReactNode;
  cols: number;
  rows: number;
  /** Its floor tiles (keys): hovered tiles brighten, and the sample highlights lie on them. */
  floors: ReadonlySet<string>;
  terrain: Terrain;
  objects: MapObject[];
  enemies?: EnemyInstance[];
  /** Where the party would stand: the sample highlights lie beside it. */
  center: Pos;
  /** The fog the Fog toggle shows. */
  fog: FogInput;
  /** Draws drafts over their approved designs (the Drafts toggle), and how to switch it. */
  drafts: boolean;
  onDrafts: (on: boolean) => void;
  /** Changes when a fresh set of models should be placed (a new zone), as the game keys its layer. */
  modelKey: string;
}

export default function MapView({ title, subtitle, controls, cols, rows, floors, terrain, objects, enemies, center, fog, drafts: useDrafts, onDrafts, modelKey }: MapViewProps) {
  const [grid, setGrid] = useState(false);
  const [fogOn, setFogOn] = useState(false);
  const [highlights, setHighlights] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [terrainHost, setTerrainHost] = useState<HTMLDivElement | null>(null);
  // Panning: the map's offset in the viewport (px), dragged with the right mouse button
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);
  const startPan = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, from: pan };
  };
  const movePan = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setPan({ x: d.from.x + e.clientX - d.x, y: d.from.y + e.clientY - d.y });
  };
  const endPan = () => { drag.current = null; };

  const board = useBoard(cols, rows);
  const sampleTiles = useMemo(() => {
    const out = new Map<string, (typeof SAMPLE_HIGHLIGHTS)[number]>();
    const tiles = [...floors].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; })
      .sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y));
    tiles.slice(1, 1 + SAMPLE_HIGHLIGHTS.length).forEach((p, i) => out.set(posKey(p), SAMPLE_HIGHLIGHTS[i]));
    return out;
  }, [floors, center.x, center.y]);

  const hover = useHoveredTile();
  const onTileClick = useStableHandler(() => {});
  const floor = (
    <FloorGrid cols={cols} rows={rows} tile={(p) => {
      const key = posKey(p), kind = highlights ? sampleTiles.get(key) : undefined;
      return (
        <FloorTile key={key} p={p} hover={hover} onClick={onTileClick} brighten={floors.has(key) && hover.isHovered(p)}>
          {grid && <div className="absolute inset-0 border pointer-events-none" style={{ borderColor: TILE_BORDER_COLOR }} />}
          {kind && <TileHighlight kind={kind} />}
        </FloorTile>
      );
    }} />
  );
  const designs: Record<string, Design> = useDrafts ? withDrafts : approvedDesigns;

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="text-xs text-gray-400">
          {subtitle}
          <span className="text-gray-500"> · {cols}×{rows} · floor {terrain.floor.mesh.triCount} + walls {terrain.walls.mesh.triCount} tris</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-gray-800 rounded-lg px-3 py-2">
        {controls}
        <select className={INPUT + ' w-20'} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} title="Zoom">
          {ZOOMS.map((z) => <option key={z} value={z}>{z * 100}%</option>)}
        </select>
        <Toggle on={grid} onClick={() => setGrid(!grid)}>Grid</Toggle>
        <Toggle on={fogOn} onClick={() => setFogOn(!fogOn)}>Fog</Toggle>
        <Toggle on={highlights} onClick={() => setHighlights(!highlights)}>Highlights</Toggle>
        <Toggle on={useDrafts} onClick={() => onDrafts(!useDrafts)}>Drafts</Toggle>
        <button className={BTN} onClick={() => setPan({ x: 0, y: 0 })} title="Pan: drag with the right mouse button">Recenter</button>
      </div>
      {/* The viewport: the map pans inside it (right-drag) */}
      <div className="relative overflow-hidden rounded-lg bg-gray-950 h-[calc(100vh-11rem)] touch-none"
        onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}
        onContextMenu={(e) => e.preventDefault()}>
        <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          <Board board={board} floor={floor} under={<div ref={setTerrainHost} className="absolute inset-0 pointer-events-none" />}>
            {/* Keyed as the game keys it: a new zone's models are placed fresh */}
            <ModelLayer key={`${modelKey}:${useDrafts}`} designs={designs} board={board} objects={objects} enemies={enemies} fog={fogOn ? fog : null} terrain={terrain} terrainHost={terrainHost} />
          </Board>
        </div>
      </div>
    </div>
  );
}
