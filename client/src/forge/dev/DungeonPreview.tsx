// DEV ONLY: the forge page's Dungeons view. One generated zone of a dungeon drawn exactly as the game draws it (the
// Board, its 3D floor and walls from the dungeon's TerrainStyle, its doors, rift and enemies), to judge a dungeon's look:
// try layouts and zones, and check that the grid's highlights and the fog still read over it.
import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { DUNGEONS, type DungeonKey } from '../../data/world/dungeons';
import { buildDungeon } from '../../data/world/dungeonGen';
import { hasDecorDesign, type DecorObjectData } from '../../data/world/decorObjects';
import { designs as approvedDesigns } from '../registry.vite';
import { drafts } from './draftRegistry';
import { sceneryObjects, zoneGround, type DecorLink } from '../../components/zoneScenery';
import { interactiveObjectModel } from '../../data/world/interactiveObjects';
import { RIFT_MODELS, SANCTUM_RIFT_COLOR } from '../../data/world/rifts';
import { posKey, type Pos } from '../../data/world/grid';
import { mulberry32 } from '../core/rng';
import { facingOpenSide } from '../core/facing';
import { buildTerrain } from '../terrain/build';
import { Board, FloorGrid, FloorTile, TILE_BORDER_COLOR, TileHighlight, useBoard, useHoveredTile, useStableHandler } from '../../components/mapParts';
import ModelLayer, { type MapObject } from '../../components/ModelLayer';
import type { FogInput } from '../../viewEngine/three/fog';
import { BTN, INPUT, Toggle } from './ui';

/** A decorative object's draft design, if it has one (by its source: the entry it is the model for). */
const draftOf = (o: DecorObjectData) => Object.values(drafts).find((d) => d.source.table === 'decorObjects' && d.source.key === o.id);
/** With drafts: an object is drawn with its draft, else its own model. */
const draftLink: DecorLink = (o) => draftOf(o)?.id ?? o.model;
/** Every design, a draft over its approved version. */
const withDrafts = { ...approvedDesigns, ...drafts };

/**
 * A dungeon as the game would generate it with Math.random seeded by `seed` (the same seed, the same layout).
 * `useDrafts`: objects whose design is still a draft are placed too.
 */
function seededDungeon(key: DungeonKey, seed: number, useDrafts: boolean) {
  const random = Math.random;
  Math.random = mulberry32(seed);
  try {
    return buildDungeon(DUNGEONS[key], 1, { placeable: useDrafts ? (o) => hasDecorDesign(o) || !!draftOf(o) : hasDecorDesign });
  } finally {
    Math.random = random;
  }
}

/** Highlights laid on a few floor tiles near `at`, one of each kind the game shows most. */
const SAMPLE_HIGHLIGHTS = ['ally', 'enemy', 'areaHarm', 'areaHarm', 'areaHelp', 'mover'] as const;

export default function DungeonPreview({ dungeonKey }: { dungeonKey: DungeonKey }) {
  const config = DUNGEONS[dungeonKey];
  const [seed, setSeed] = useState(1);
  const [zoneIdx, setZoneIdx] = useState(0);
  const [grid, setGrid] = useState(false);
  const [fogOn, setFogOn] = useState(false);
  const [highlights, setHighlights] = useState(false);
  const [useDrafts, setUseDrafts] = useState(true);
  const [zoom, setZoom] = useState(0.5);
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

  const { dungeon, enemies: allEnemies } = useMemo(() => seededDungeon(dungeonKey, seed, useDrafts), [dungeonKey, seed, useDrafts]);
  const zone = dungeon.zones[Math.min(zoneIdx, dungeon.zones.length - 1)];
  const enemies = useMemo(() => allEnemies.filter((e) => e.zoneId === zone.id), [allEnemies, zone.id]);
  const { width, height, floors, doors } = zone;
  const board = useBoard(width, height);
  const terrain = useMemo(
    () => buildTerrain({ cols: width, rows: height, floors: zoneGround(zone), doors: doors.map((d) => d.pos), style: config.terrain, seed: zone.id }),
    [width, height, doors, config, zone],
  );
  const isFloor = (p: Pos) => floors.has(posKey(p));
  const objects: MapObject[] = useMemo(() => [
    ...doors.map((d) => ({ id: d.id, link: interactiveObjectModel(config.doorObject), pos: d.pos, facing: facingOpenSide(d.pos, isFloor) })),
    ...dungeon.rifts.filter((r) => r.zoneId === zone.id)
      .map((r) => ({ id: `rift-${r.zoneId}`, link: RIFT_MODELS.rift.model, pos: r.pos, facing: facingOpenSide(r.pos, isFloor), tint: SANCTUM_RIFT_COLOR })),
    // Its obstacles and clutter, as the game draws them (drafts too, with the Drafts toggle)
    ...sceneryObjects(zone, config.clutter, [...dungeon.rifts, ...dungeon.chests].filter((o) => o.zoneId === zone.id).map((o) => o.pos), useDrafts ? draftLink : undefined),
  ], [dungeon, zone, useDrafts]); // eslint-disable-line react-hooks/exhaustive-deps -- isFloor reads `floors`, which changes with `zone`

  // Where the party would stand: the zone's start (the first zone) or its first room's center; the fog clears
  // around it, and the sample highlights lie beside it
  const center: Pos = zone.id === dungeon.startZoneId ? dungeon.playerStart : { x: zone.rooms[0].x + (zone.rooms[0].w >> 1), y: zone.rooms[0].y + (zone.rooms[0].h >> 1) };
  const near = (p: Pos, r: number) => Math.hypot(p.x - center.x, p.y - center.y) <= r;
  const fog: FogInput | null = useMemo(() => {
    if (!fogOn) return null;
    const visible = new Set<string>(), explored = new Set<string>();
    for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
      if (near({ x, y }, 6)) visible.add(posKey({ x, y }));
      else if (near({ x, y }, 13)) explored.add(posKey({ x, y }));
    }
    return { cols: width, rows: height, visible, explored };
  }, [fogOn, zone, center.x, center.y]); // eslint-disable-line react-hooks/exhaustive-deps -- near reads `center`
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
    <FloorGrid cols={width} rows={height} tile={(p) => {
      const key = posKey(p), kind = highlights ? sampleTiles.get(key) : undefined;
      return (
        <FloorTile key={key} p={p} hover={hover} onClick={onTileClick} brighten={isFloor(p) && hover.isHovered(p)}>
          {grid && <div className="absolute inset-0 border pointer-events-none" style={{ borderColor: TILE_BORDER_COLOR }} />}
          {kind && <TileHighlight kind={kind} />}
        </FloorTile>
      );
    }} />
  );

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-lg font-bold">{config.name}</h1>
        <p className="text-xs text-gray-400">
          Its look is <span className="font-mono text-gray-300">terrain</span> in <span className="font-mono text-gray-300">data/world/dungeons.ts</span>
          <span className="text-gray-500"> · zone {zone.id} · {width}×{height} · floor {terrain.floor.mesh.triCount} + walls {terrain.walls.mesh.triCount} tris</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-gray-800 rounded-lg px-3 py-2">
        <div className="flex items-center gap-1" title="Each layout is one generated run of the dungeon">
          <button className={BTN} disabled={seed <= 1} onClick={() => setSeed(seed - 1)}>◀</button>
          <span className="text-gray-400 w-20 text-center">layout {seed}</span>
          <button className={BTN} onClick={() => setSeed(seed + 1)}>▶</button>
        </div>
        <select className={INPUT + ' w-28'} value={zoneIdx} onChange={(e) => setZoneIdx(Number(e.target.value))}>
          {dungeon.zones.map((z, i) => <option key={z.id} value={i}>{z.id === dungeon.endZoneId ? 'boss zone' : `zone ${z.id}`}</option>)}
        </select>
        <select className={INPUT + ' w-20'} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} title="Zoom">
          {[0.35, 0.5, 0.75, 1].map((z) => <option key={z} value={z}>{z * 100}%</option>)}
        </select>
        <Toggle on={grid} onClick={() => setGrid(!grid)}>Grid</Toggle>
        <Toggle on={fogOn} onClick={() => setFogOn(!fogOn)}>Fog</Toggle>
        <Toggle on={highlights} onClick={() => setHighlights(!highlights)}>Highlights</Toggle>
        <Toggle on={useDrafts} onClick={() => setUseDrafts(!useDrafts)}>Drafts</Toggle>
        <button className={BTN} onClick={() => setPan({ x: 0, y: 0 })} title="Pan: drag with the right mouse button">Recenter</button>
      </div>
      {/* The viewport: the map pans inside it (right-drag) */}
      <div className="relative overflow-hidden rounded-lg bg-gray-950 h-[calc(100vh-11rem)] touch-none"
        onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}
        onContextMenu={(e) => e.preventDefault()}>
        <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          <Board board={board} floor={floor} under={<div ref={setTerrainHost} className="absolute inset-0 pointer-events-none" />}>
            {/* Keyed by zone, as in the game: a new zone's models are placed fresh */}
            <ModelLayer key={`${dungeonKey}:${seed}:${zone.id}:${useDrafts}`} designs={useDrafts ? withDrafts : approvedDesigns} board={board} objects={objects} enemies={enemies} fog={fog} terrain={terrain} terrainHost={terrainHost} />
          </Board>
        </div>
      </div>
    </div>
  );
}
