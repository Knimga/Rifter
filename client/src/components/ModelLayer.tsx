// Draws party members, enemies and loot as 3D models over a map's tile grid (DungeonMap, SanctumMap).
// Lazy-loaded (it pulls in three.js), so the menu and builder screens never download it.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { EnemyInstance } from '../data/units/enemies';
import { CLASSES, type ClassKey } from '../data/units/classes';
import type { Design, Model, ModelLink } from '../forge/core/types';
import { buildInstance, instanceSeed, linkedDesign } from '../forge/core/link';
import { tintModel } from '../forge/core/tint';
import type { RGB } from '../forge/core/vec';
import { TILE_SIZE, type BoardLayout } from '../viewEngine/board';
import { buildCharacter, classInstanceId, type HeldWeapon } from '../forge/equip';
import { designs } from '../forge/registry.vite';
import { MapModelRenderer, type MapUnit } from '../viewEngine/three/mapRenderer';
import type { FogInput } from '../viewEngine/three/fog';
import { useLatest } from '../hooks/useLatest';
import { ActiveGlow } from './mapParts';

type Pos = { x: number; y: number };

export interface MapLoot {
  id: string;
  link: ModelLink;
  pos: Pos;
  /** The color a tinted model (a rift key) is drawn in: its dungeon's riftColor (core/tint.ts). */
  tint?: RGB;
}

/** A game object on the map (a door, a rift): it stands on its tile, facing `facing` (yaw, radians), and never moves. */
export interface MapObject {
  /** Stable for the map's lifetime (e.g. the door's id); also seeds its look. */
  id: string;
  link: ModelLink;
  pos: Pos;
  facing: number;
  /** Its model's animations its state calls for, e.g. ['open'] for a looted chest (see MapUnit.played). */
  played?: string[];
  /** The color a tinted model (a rift) is drawn in: its dungeon's riftColor (core/tint.ts). */
  tint?: RGB;
  /**
   * A tinted model holding two tinted things, each in its own color: a color per list of parts (tintModel's
   * `parts`), e.g. the active Rifter's keystone and its rift while the rift swaps keys. Instead of `tint`.
   */
  partTints?: { color: RGB; parts: readonly string[] }[];
}

/** A party member drawn as their class model, holding their equipped weapon and offhand. */
export interface MapPartyMember {
  /** Stable per member (e.g. 'party-0'). The body's look is seeded by its class (classInstanceId). */
  id: string;
  classKey: ClassKey;
  pos: Pos;
  weapon?: HeldWeapon;
  offhand?: ModelLink;
  /** DOM drawn just above the model's head (HP/MP bars, effect dots). */
  overlay: ReactNode;
  /** The active member stands on a floor glow (it follows the model as it moves). */
  active?: boolean;
}

interface Props {
  /** The board's layout (boardLayout): the canvas covers its box; overlays use its projection. */
  board: BoardLayout;
  party?: MapPartyMember[];
  /** Living enemies. */
  enemies?: EnemyInstance[];
  /** Loot, one model per tile. Every item of a design looks the same. */
  loot?: MapLoot[];
  /** Game objects (doors, rifts): fixed, each facing its own way. Keep the array stable while unchanged. */
  objects?: MapObject[];
  /** DOM drawn just above each enemy model's head (HP bar, effect dots). */
  renderEnemyOverlay?: (enemy: EnemyInstance) => ReactNode;
  /** Unit id ('party-0', an enemy id) → the tile it last aimed an ability at; a new `seq` turns it to face it. */
  aims?: Record<string, UnitAim>;
  /** Fog of war over the map (null or omitted: none). Drawn by the renderer over the floor and every model. */
  fog?: FogInput | null;
  /** Its first frame is drawn (models, fog): the map behind it can be shown. Once per mount. */
  onReady?: () => void;
}

/** The tile a unit last aimed an ability at; `seq` increases with every new aim. */
export interface UnitAim {
  x: number;
  y: number;
  seq: number;
}

export default function ModelLayer({ board, party = [], enemies = [], loot = [], objects = [], renderEnemyOverlay, aims = {}, fog = null, onReady }: Props) {
  const onReadyRef = useLatest(onReady);
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
  const partyKey = party.map((m) => `${m.id}:${m.classKey}:${m.weapon?.link ?? '-'}:${m.offhand ?? '-'}:${m.pos.x},${m.pos.y}`).join('|');
  const partyUnits: MapUnit[] = useMemo(() => {
    const out: MapUnit[] = [];
    for (const m of party) {
      const body = linkedDesign(designs, CLASSES[m.classKey].model);
      if (!body) continue;
      const used = [body, m.weapon ? linkedDesign(designs, m.weapon.link) : null, m.offhand ? linkedDesign(designs, m.offhand) : null];
      const look = `${m.classKey}:${m.weapon?.link ?? '-'}:${m.offhand ?? '-'}`;
      // Seeded by class (classInstanceId), so the member looks as it did on character select
      const model = cached(m.id, look, used, () => buildCharacter(designs, body, instanceSeed(body, classInstanceId(m.classKey)), m.weapon, m.offhand));
      out.push({ id: m.id, model, pos: m.pos, viewer: true });
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

  const lootKey = loot.map((l) => `${l.id}:${l.pos.x},${l.pos.y}:${l.tint?.join(',') ?? ''}`).join('|');
  /** Loot models are shared by every item of a design (in one color, for tinted ones). */
  const lootCacheId = (l: MapLoot) => `item:${l.link}:${l.tint?.join(',') ?? ''}`;
  /** An object's colors, as text (its cache key and change key). */
  const tintKey = (o: MapObject) => `${o.tint?.join(',') ?? ''}${o.partTints?.map((t) => `${t.parts.join('+')}=${t.color.join(',')}`).join(';') ?? ''}`;
  const objectKey = objects.map((o) => `${o.id}:${o.link}:${o.pos.x},${o.pos.y}:${o.facing}:${o.played?.join('+') ?? ''}:${tintKey(o)}`).join('|');
  const aimKey = Object.entries(aims).map(([id, a]) => `${id}:${a.seq}`).join('|');
  const units: MapUnit[] = useMemo(() => {
    const out = [...partyUnits, ...enemyUnits].map((u) => (aims[u.id] ? { ...u, aim: aims[u.id] } : u));
    for (const o of objects) {
      const design = linkedDesign(designs, o.link);
      if (!design) continue;
      const model = cached(o.id, `${o.link}:${tintKey(o)}`, [design], () => {
        const built = buildInstance(design, o.id);
        if (o.partTints) return o.partTints.reduce((m, t) => tintModel(m, t.color, t.parts), built);
        return o.tint ? tintModel(built, o.tint) : built;
      });
      out.push({ id: o.id, model, pos: o.pos, facing: o.facing, played: o.played });
    }
    for (const l of loot) {
      const design = linkedDesign(designs, l.link);
      if (!design) continue;
      const model = cached(lootCacheId(l), '', [design], () => {
        const built = buildInstance(design, l.id);
        return l.tint ? tintModel(built, l.tint) : built;
      });
      out.push({ id: l.id, model, pos: l.pos, lying: true });
    }
    // Forget models no longer on the map (dead enemies, picked-up loot)
    const live = new Set([...partyUnits, ...enemyUnits, ...objects].map((u) => u.id).concat(loot.map(lootCacheId)));
    for (const id of cache.current.keys()) if (!live.has(id)) cache.current.delete(id);
    return out;
  }, [partyUnits, enemyUnits, lootKey, objectKey, aimKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // DOM that follows each unit's drawn position (models glide between tiles): the overlay above its head
  // and the active member's floor glow. The renderer reports every change (onPlace); a newly mounted
  // element is placed where the model is drawn now.
  const overlayEls = useRef(new Map<string, { head?: HTMLDivElement | null; glow?: HTMLDivElement | null }>());
  const headHeight = useRef(new Map<string, number>()); // each unit's overhead anchor height (world tiles)
  for (const u of [...partyUnits, ...enemyUnits]) headHeight.current.set(u.id, u.model.mesh.anchors.overhead[1]);
  const boardRef = useRef(board);
  boardRef.current = board;
  const placeOverlays = (id: string, at: Pos) => {
    const els = overlayEls.current.get(id);
    if (els?.head) {
      // Centered over the tile, its bottom at the projected overhead anchor
      const p = boardRef.current.toScreen(at.x + 0.5, at.y + 0.5, headHeight.current.get(id) ?? 0);
      els.head.style.left = `${p.left - TILE_SIZE / 2}px`;
      els.head.style.top = `${p.top}px`;
    }
    if (els?.glow) {
      // On the flat floor plane (transformed with the floor), in flat tile px
      els.glow.style.left = `${at.x * TILE_SIZE}px`;
      els.glow.style.top = `${at.y * TILE_SIZE}px`;
    }
  };
  const placeRef = useRef(placeOverlays);
  placeRef.current = placeOverlays;
  const overlayRef = (u: MapUnit, kind: 'head' | 'glow') => (el: HTMLDivElement | null) => {
    const els = overlayEls.current.get(u.id) ?? {};
    els[kind] = el;
    overlayEls.current.set(u.id, els);
    if (el) placeOverlays(u.id, rendererRef.current?.drawnAt(u.id) ?? u.pos);
  };

  useEffect(() => {
    const r = new MapModelRenderer((id, at) => placeRef.current(id, at), () => onReadyRef.current?.());
    rendererRef.current = r;
    hostRef.current!.appendChild(r.canvas);
    return () => {
      r.dispose();
      r.canvas.remove();
      rendererRef.current = null;
    };
  }, [onReadyRef]); // a stable ref (useLatest): created once

  useEffect(() => rendererRef.current?.setBoard(board), [board]);
  useEffect(() => rendererRef.current?.setUnits(units), [units]);
  useEffect(() => rendererRef.current?.setFog(fog), [fog]);

  /** DOM placed just above a model's head (its projected overhead anchor). Positioned by placeOverlays. */
  const overHead = (u: MapUnit, node: ReactNode) => (
    <div
      key={u.id}
      ref={overlayRef(u, 'head')}
      className="absolute flex flex-col items-center gap-px"
      style={{ width: TILE_SIZE, transform: 'translateY(-100%)' }}
    >
      {node}
    </div>
  );

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Floor glow under the active member: on the floor plane, beneath the model canvas */}
      <div className="absolute left-0 top-0" style={{ transform: board.floorTransform, transformOrigin: '0 0' }}>
        {partyUnits.filter((u) => party.find((m) => m.id === u.id)?.active).map((u) => (
          <div key={`glow-${u.id}`} ref={overlayRef(u, 'glow')} className="absolute" style={{ width: TILE_SIZE, height: TILE_SIZE }}>
            <ActiveGlow />
          </div>
        ))}
      </div>
      <div ref={hostRef} className="absolute left-0 top-0" />
      {partyUnits.map((u) => overHead(u, party.find((m) => m.id === u.id)!.overlay))}
      {renderEnemyOverlay && enemyUnits.map((u) => overHead(u, renderEnemyOverlay(enemies.find((e) => e.id === u.id)!)))}
    </div>
  );
}
