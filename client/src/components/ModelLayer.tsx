// Draws party members, enemies and loot as 3D models over a map's tile grid (DungeonMap, SanctumMap).
// Lazy-loaded (it pulls in three.js), so the menu and builder screens never download it.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { EnemyInstance } from '../data/enemies';
import { CLASSES, type ClassKey } from '../data/classes';
import { TILE_SIZE } from '../data/constants';
import type { Design, Model, ModelLink } from '../forge/core/types';
import { buildInstance, instanceSeed, linkedDesign } from '../forge/core/link';
import { obliqueLift } from '../forge/core/stage-config';
import { buildCharacter, type HeldWeapon } from '../forge/equip';
import { designs } from '../forge/registry.vite';
import { MapModelRenderer, type MapUnit } from '../forge/three/mapRenderer';

type Pos = { x: number; y: number };

export interface MapLoot {
  id: string;
  link: ModelLink;
  pos: Pos;
}

/** A party member drawn as their class model, holding their equipped weapon and shield. */
export interface MapPartyMember {
  /** Stable per member (e.g. 'party-0'); also seeds the body's look. */
  id: string;
  classKey: ClassKey;
  pos: Pos;
  weapon?: HeldWeapon;
  shield?: ModelLink;
  /** DOM drawn just above the model's head (HP/MP bars, effect dots). */
  overlay: ReactNode;
}

interface Props {
  cols: number;
  rows: number;
  party?: MapPartyMember[];
  /** Living enemies. */
  enemies?: EnemyInstance[];
  /** Loot, one model per tile. Every item of a design looks the same. */
  loot?: MapLoot[];
  /** DOM drawn just above each enemy model's head (HP bar, effect dots). */
  renderEnemyOverlay?: (enemy: EnemyInstance) => ReactNode;
  /** Unit id ('party-0', an enemy id) → the tile it last aimed an ability at; a new `seq` turns it to face it. */
  aims?: Record<string, UnitAim>;
}

/** The tile a unit last aimed an ability at; `seq` increases with every new aim. */
export interface UnitAim {
  x: number;
  y: number;
  seq: number;
}

export default function ModelLayer({ cols, rows, party = [], enemies = [], loot = [], renderEnemyOverlay, aims = {} }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapModelRenderer | null>(null);
  // Built models by cache key (a unit id, or 'item:<design>' for loot, which every item of a design shares).
  // An entry is rebuilt when its look key or any design object it used changes (e.g. a design update in dev).
  const cache = useRef(new Map<string, { key: string; designs: Design[]; model: Model }>());
  const cached = (id: string, key: string, used: (Design | null)[], build: () => Model): Model => {
    const ds = used.filter((d): d is Design => !!d);
    const hit = cache.current.get(id);
    if (hit && hit.key === key && hit.designs.length === ds.length && hit.designs.every((d, i) => d === ds[i])) return hit.model;
    const model = build();
    cache.current.set(id, { key, designs: ds, model });
    return model;
  };

  // Party members: rebuilt when their class or held items change (the body's pose follows the weapon)
  const partyKey = party.map((m) => `${m.id}:${m.classKey}:${m.weapon?.link ?? '-'}:${m.shield ?? '-'}:${m.pos.x},${m.pos.y}`).join('|');
  const partyUnits: MapUnit[] = useMemo(() => {
    const out: MapUnit[] = [];
    for (const m of party) {
      const body = linkedDesign(designs, CLASSES[m.classKey].model);
      if (!body) continue;
      const used = [body, m.weapon ? linkedDesign(designs, m.weapon.link) : null, m.shield ? linkedDesign(designs, m.shield) : null];
      const look = `${m.classKey}:${m.weapon?.link ?? '-'}:${m.shield ?? '-'}`;
      const model = cached(m.id, look, used, () => buildCharacter(designs, body, instanceSeed(body, m.id), m.weapon, m.shield));
      out.push({ id: m.id, model, pos: m.pos });
    }
    return out;
  }, [partyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute only when ids or positions change, not on every parent render (hover re-renders the map)
  const enemyKey = enemies.map((e) => `${e.id}:${e.pos.x},${e.pos.y}`).join('|');
  const enemyUnits: MapUnit[] = useMemo(() => {
    const out: MapUnit[] = [];
    for (const e of enemies) {
      const design = linkedDesign(designs, e.classData.model);
      if (design) out.push({ id: e.id, model: cached(e.id, '', [design], () => buildInstance(design, e.id)), pos: e.pos });
    }
    return out;
  }, [enemyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const lootKey = loot.map((l) => `${l.id}:${l.pos.x},${l.pos.y}`).join('|');
  const aimKey = Object.entries(aims).map(([id, a]) => `${id}:${a.seq}`).join('|');
  const units: MapUnit[] = useMemo(() => {
    const out = [...partyUnits, ...enemyUnits].map((u) => (aims[u.id] ? { ...u, aim: aims[u.id] } : u));
    for (const l of loot) {
      const design = linkedDesign(designs, l.link);
      if (design) out.push({ id: l.id, model: cached(`item:${design.id}`, '', [design], () => buildInstance(design, l.id)), pos: l.pos, lying: true });
    }
    // Forget models no longer on the map (dead enemies, picked-up loot)
    const live = new Set([...partyUnits, ...enemyUnits].map((u) => u.id).concat(loot.map((l) => `item:${l.link}`)));
    for (const id of cache.current.keys()) if (!live.has(id)) cache.current.delete(id);
    return out;
  }, [partyUnits, enemyUnits, lootKey, aimKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /** DOM placed just above a model's head: its overhead anchor, lifted by the oblique projection. */
  const overHead = (u: MapUnit, node: ReactNode) => {
    const headPx = obliqueLift(u.model.mesh.anchors.overhead[1]) * TILE_SIZE;
    return (
      <div
        key={u.id}
        className="absolute flex flex-col items-center gap-px"
        style={{ left: u.pos.x * TILE_SIZE, top: (u.pos.y + 0.5) * TILE_SIZE - headPx, width: TILE_SIZE, transform: 'translateY(-100%)' }}
      >
        {node}
      </div>
    );
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <div ref={hostRef} className="absolute left-0 top-0" />
      {partyUnits.map((u) => overHead(u, party.find((m) => m.id === u.id)!.overlay))}
      {renderEnemyOverlay && enemyUnits.map((u) => overHead(u, renderEnemyOverlay(enemies.find((e) => e.id === u.id)!)))}
    </div>
  );
}
