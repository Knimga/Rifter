// DEV ONLY: the forge page's view of a dungeon (Maps). One generated zone of it drawn exactly as the game draws it (the
// Board, its 3D floor and walls from the dungeon's TerrainStyle, its doors, rift, scenery and enemies), in the map
// viewer (MapView), to judge a dungeon's look: try layouts and zones.
import { useMemo, useState } from 'react';
import { DUNGEONS, type DungeonKey } from '../../data/world/dungeons';
import { buildDungeon } from '../../data/world/dungeonGen';
import { hasDecorDesign, type DecorObjectData } from '../../data/world/decorObjects';
import { drafts } from './draftRegistry';
import { doorObjects, riftObject, sceneryObjects, zoneGround, type DecorLink } from '../../components/zoneScenery';
import { posKey, type Pos } from '../../data/world/grid';
import { mulberry32 } from '../core/rng';
import { buildTerrain } from '../terrain/build';
import type { MapObject } from '../../components/ModelLayer';
import type { FogInput } from '../../viewEngine/three/fog';
import MapView from './MapView';
import { BTN, INPUT } from './ui';

/** A decorative object's draft design, if it has one (by its source: the entry it is the model for). */
const draftOf = (o: DecorObjectData) => Object.values(drafts).find((d) => d.source.table === 'decorObjects' && d.source.key === o.id);
/** With drafts: an object is drawn with its draft, else its own model. */
const draftLink: DecorLink = (o) => draftOf(o)?.id ?? o.model;

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

export default function DungeonPreview({ dungeonKey }: { dungeonKey: DungeonKey }) {
  const config = DUNGEONS[dungeonKey];
  const [seed, setSeed] = useState(1);
  const [zoneIdx, setZoneIdx] = useState(0);
  const [useDrafts, setUseDrafts] = useState(true);

  const { dungeon, enemies: allEnemies } = useMemo(() => seededDungeon(dungeonKey, seed, useDrafts), [dungeonKey, seed, useDrafts]);
  const zone = dungeon.zones[Math.min(zoneIdx, dungeon.zones.length - 1)];
  const enemies = useMemo(() => allEnemies.filter((e) => e.zoneId === zone.id), [allEnemies, zone.id]);
  const { width, height, floors, doors } = zone;
  const terrain = useMemo(
    () => buildTerrain({ cols: width, rows: height, floors: zoneGround(zone), doors: doors.map((d) => d.pos), style: config.terrain, seed: zone.id }),
    [width, height, doors, config, zone],
  );
  const objects: MapObject[] = useMemo(() => [
    ...doorObjects(zone, config.doorObject),
    ...dungeon.rifts.filter((r) => r.zoneId === zone.id).map((r) => riftObject(zone, r.pos, `rift-${r.zoneId}`)),
    // Its obstacles and clutter, as the game draws them (drafts too, with the Drafts toggle)
    ...sceneryObjects(zone, config.clutter, [...dungeon.rifts, ...dungeon.chests].filter((o) => o.zoneId === zone.id).map((o) => o.pos), useDrafts ? draftLink : undefined),
  ], [dungeon, zone, useDrafts]); // eslint-disable-line react-hooks/exhaustive-deps -- config changes with dungeonKey, so with dungeon

  // Where the party would stand: the zone's start (the first zone) or its first room's center; the Fog toggle clears
  // the fog around it
  const center: Pos = zone.id === dungeon.startZoneId ? dungeon.playerStart : { x: zone.rooms[0].x + (zone.rooms[0].w >> 1), y: zone.rooms[0].y + (zone.rooms[0].h >> 1) };
  const fog: FogInput = useMemo(() => {
    const near = (p: Pos, r: number) => Math.hypot(p.x - center.x, p.y - center.y) <= r;
    const visible = new Set<string>(), explored = new Set<string>();
    for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
      if (near({ x, y }, 6)) visible.add(posKey({ x, y }));
      else if (near({ x, y }, 13)) explored.add(posKey({ x, y }));
    }
    return { cols: width, rows: height, visible, explored };
  }, [width, height, center.x, center.y]);

  return (
    <MapView
      title={config.name}
      subtitle={<>Its look is <span className="font-mono text-gray-300">terrain</span> in <span className="font-mono text-gray-300">data/world/dungeons.ts</span><span className="text-gray-500"> · zone {zone.id}</span></>}
      controls={<>
        <div className="flex items-center gap-1" title="Each layout is one generated run of the dungeon">
          <button className={BTN} disabled={seed <= 1} onClick={() => setSeed(seed - 1)}>◀</button>
          <span className="text-gray-400 w-20 text-center">layout {seed}</span>
          <button className={BTN} onClick={() => setSeed(seed + 1)}>▶</button>
        </div>
        <select className={INPUT + ' w-28'} value={zoneIdx} onChange={(e) => setZoneIdx(Number(e.target.value))}>
          {dungeon.zones.map((z, i) => <option key={z.id} value={i}>{z.id === dungeon.endZoneId ? 'boss zone' : `zone ${z.id}`}</option>)}
        </select>
      </>}
      cols={width} rows={height} floors={floors} terrain={terrain} objects={objects} enemies={enemies}
      center={center} fog={fog} drafts={useDrafts} onDrafts={setUseDrafts} modelKey={`${dungeonKey}:${seed}:${zone.id}`}
    />
  );
}
