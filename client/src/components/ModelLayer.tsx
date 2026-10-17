// Draws linked enemies and loot as 3D models over the DungeonMap tile grid. Lazy-loaded (it pulls in three.js),
// so the menu and builder screens never download it.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { EnemyInstance } from '../data/enemies';
import { TILE_SIZE } from '../data/constants';
import type { Design, Model, ModelLink } from '../forge/core/types';
import { buildLinkedModel, linkedDesign } from '../forge/core/link';
import { obliqueLift } from '../forge/core/stage-config';
import { designs } from '../forge/registry.vite';
import { MapModelRenderer, type MapUnit } from '../forge/three/mapRenderer';

export interface MapLoot {
  id: string;
  link: ModelLink;
  pos: { x: number; y: number };
}

interface Props {
  cols: number;
  rows: number;
  /** Living enemies whose class links to an approved design (see isRenderable in forge/registry.vite). */
  enemies: EnemyInstance[];
  /** Loot drawn as models, one per tile: `id` is the item id (it seeds the model). */
  loot: MapLoot[];
  /** DOM drawn just above each model's head (HP bar, effect dots). */
  renderOverlay: (enemy: EnemyInstance) => ReactNode;
}

export default function ModelLayer({ cols, rows, enemies, loot, renderOverlay }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapModelRenderer | null>(null);
  // Built once per enemy / item (rebuilt only if its design object changes, e.g. a design update in dev)
  const cache = useRef(new Map<string, { design: Design; model: Model }>());
  const modelFor = (id: string, link: ModelLink | undefined): Model | null => {
    const design = linkedDesign(designs, link);
    if (!link || !design) return null;
    let hit = cache.current.get(id);
    if (!hit || hit.design !== design) {
      hit = { design, model: buildLinkedModel(design, link, id) };
      cache.current.set(id, hit);
    }
    return hit.model;
  };

  // Recompute only when ids or positions change, not on every parent render (hover re-renders the map)
  const enemyKey = enemies.map((e) => `${e.id}:${e.pos.x},${e.pos.y}`).join('|');
  const enemyUnits: MapUnit[] = useMemo(() => {
    const out: MapUnit[] = [];
    for (const e of enemies) {
      const model = modelFor(e.id, e.classData.model);
      if (model) out.push({ id: e.id, model, pos: e.pos });
    }
    return out;
  }, [enemyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const lootKey = loot.map((l) => `${l.id}:${l.pos.x},${l.pos.y}`).join('|');
  const units: MapUnit[] = useMemo(() => {
    const out = [...enemyUnits];
    for (const l of loot) {
      const model = modelFor(l.id, l.link);
      if (model) out.push({ id: l.id, model, pos: l.pos, lying: true });
    }
    return out;
  }, [enemyUnits, lootKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const r = new MapModelRenderer();
    rendererRef.current = r;
    hostRef.current!.appendChild(r.canvas);
    return () => {
      r.dispose();
      r.canvas.remove();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => rendererRef.current?.setGrid(cols, rows, TILE_SIZE), [cols, rows]);
  useEffect(() => rendererRef.current?.setUnits(units), [units]);

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <div ref={hostRef} className="absolute left-0 top-0" />
      {enemyUnits.map((u) => {
        const enemy = enemies.find((e) => e.id === u.id)!;
        // Head height on screen: the model's overhead anchor, lifted by the oblique projection
        const headPx = obliqueLift(u.model.mesh.anchors.overhead[1]) * TILE_SIZE;
        return (
          <div
            key={u.id}
            className="absolute flex flex-col items-center gap-px"
            style={{ left: u.pos.x * TILE_SIZE, top: (u.pos.y + 0.5) * TILE_SIZE - headPx, width: TILE_SIZE, transform: 'translateY(-100%)' }}
          >
            {renderOverlay(enemy)}
          </div>
        );
      })}
    </div>
  );
}
