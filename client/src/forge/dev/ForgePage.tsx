// DEV ONLY: the /dev/forge builder page. Lazy-loaded from main.tsx behind import.meta.env.DEV,
// so it (and drafts/) never reach the production bundle. Spec: docs/forge (builder page).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ITEM_SEED, oneLook } from '../core/link';
import { smoothYaw } from '../core/facing';
import type { Category, Design, Model } from '../core/types';
import { designs } from '../registry.vite';
import { drafts } from './draftRegistry';
import { dataEntry } from '../dataRefs';
import { buildPreview, classHolds, classOf } from '../equip';
import { HOLD_LABEL } from '../designs/_character';
import type { WeaponType } from '../../data/gear/types';
import { DUNGEON_PRESETS } from '../../data/dungeonPresets';
import { TILE_BORDER_CLASS } from '../../components/mapParts';
import { ForgeView, GAME_VIEW_ANCHOR, type CameraPreset, type Cell } from './forgeView';
import { floorMatrix } from '../../viewEngine/camera';
import { TILE_SIZE } from '../../viewEngine/board';

// Cell size follows the game's tile size (TILE_SIZE, the one constant the maps use), so the game view
// always frames the same 3x3 tiles: if tiles get bigger, models and cells grow with them.
const CELL = TILE_SIZE * 3.6;
const LABEL_H = 0; // no per-cell text strip; a cell's name and seed show on hover
const COLS = 6;
// Left-panel sections, in order. Every Category must be listed (Record keeps that checked).
const CATEGORY_LABEL: Record<Category, string> = {
  creature: 'Creatures', character: 'Classes', weapon: 'Weapons', armor: 'Armor', offhand: 'Offhands', object: 'Game Objects',
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
const WALK_DIRS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i * Math.PI) / 4);

type Entry = { id: string; approved?: Design; draft?: Design };
/** A row of cells in the grid: one design, one set of seeds. */
type Block = { label: string; sub: string; design: Design; cells: SeedCell[] };

const stemOf = (id: string) => id.slice(id.indexOf('.') + 1);

// ─── URL state ────────────────────────────────────────────────────────────────

function readUrl() {
  const q = new URLSearchParams(location.search);
  return {
    design: q.get('design') ?? '',
    seed: Number(q.get('seed') ?? 1),
    count: Number(q.get('count') ?? 12),
    camera: (q.get('cam') as CameraPreset) ?? 'game',
  };
}

function writeUrl(s: { design: string; seed: number; count: number; camera: CameraPreset }) {
  const q = new URLSearchParams({ design: s.design, seed: String(s.seed), count: String(s.count), cam: s.camera });
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ForgePage() {
  const initial = useMemo(readUrl, []);
  // Design registries live in state so "Refresh designs" can swap in freshly loaded code without a
  // page reload (selection, seed page and focus all survive).
  const [registry, setRegistry] = useState({ designs, drafts });
  // Hot reload re-runs this module with fresh `designs`/`drafts` objects, but React keeps state across a
  // hot reload, so sync them in; otherwise edited designs would only show after "Refresh designs".
  useEffect(() => setRegistry({ designs, drafts }), [designs, drafts]); // eslint-disable-line react-hooks/exhaustive-deps
  const entries = useMemo(() => {
    const map = new Map<string, Entry>();
    for (const d of Object.values(registry.designs)) map.set(d.id, { id: d.id, approved: d });
    for (const d of Object.values(registry.drafts)) map.set(d.id, { ...(map.get(d.id) ?? { id: d.id }), draft: d });
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [registry]);

  const [selectedId, setSelectedId] = useState(initial.design || entries[0]?.id || '');
  const [seedStart, setSeedStart] = useState(initial.seed);
  const [count, setCount] = useState(initial.count);
  const [camera, setCamera] = useState<CameraPreset>(initial.camera);
  const [focusSeed, setFocusSeed] = useState<number | null>(null);
  const [yawDeg, setYawDeg] = useState(0);
  const [motion, setMotion] = useState<'none' | 'turntable' | 'walk'>('none');
  const [wireframe, setWireframe] = useState(false);
  const [ground, setGround] = useState(true);
  const [status, setStatus] = useState('');

  const entry = entries.find((e) => e.id === selectedId) ?? entries[0];
  const shownDesign = entry ? (entry.approved ?? entry.draft)! : null;
  // The exact game data entry this design is the model for (lint guarantees it exists and the names match)
  const source = shownDesign ? dataEntry(shownDesign.source) : undefined;
  // Items have one look (every item of a name is identical: ITEM_SEED); creatures and characters get a
  // page of seeds, each one a possible game instance.
  const single = shownDesign ? oneLook(shownDesign) : false;
  const pageCells: SeedCell[] = single ? [{ seed: ITEM_SEED }] : Array.from({ length: count }, (_, i) => ({ seed: seedStart + i }));

  // Blocks (rows of cells): the approved design and/or its draft.
  // Class (character) designs: instead of a seed page, one row per hold the class can use, each cell
  // holding one weapon type it is proficient with (posed for that hold). Holds are reviewed here.
  const cls = shownDesign ? classOf(shownDesign) : null;
  const holdBlocks = (design: Design, label: string): Block[] =>
    cls
      ? classHolds(cls).map(({ hold, weaponTypes }) => ({
          label: `${label} · ${HOLD_LABEL[hold]}`,
          sub: design.id,
          design,
          cells: weaponTypes.map((t) => ({ seed: seedStart, tag: t, weaponType: t })),
        }))
      : [{ label, sub: design.id, design, cells: pageCells }];
  const blocks: Block[] = !entry
    ? []
    : [
        ...(entry.approved ? holdBlocks(entry.approved, 'Current') : []),
        ...(entry.draft ? holdBlocks(entry.draft, entry.approved ? 'Draft' : 'Draft (new)') : []),
      ];
  const shown = focusSeed === null
    ? blocks
    : blocks.map((b) => ({ ...b, cells: b.cells.filter((c) => c.seed === focusSeed).slice(0, 1) })).filter((b) => b.cells.length);

  useEffect(() => writeUrl({ design: entry?.id ?? '', seed: seedStart, count, camera }), [entry, seedStart, count, camera]);

  // Browser tab title (index.html's "Rifter" is the game's)
  useEffect(() => {
    document.title = 'Rifter Forge';
  }, []);

  // Build every model shown (blocks x cells). Pure and deterministic, so memo on inputs.
  // Character (class) designs are shown holding the class's starting gear, built from the approved item designs.
  const built = useMemo(
    () => shown.map((b) => b.cells.map((cell) => ({
      ...cell,
      model: safeBuild(b.design, cell.seed, registry.designs, cell.weaponType),
    }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, registry, shown.map((b) => `${b.label}:${b.cells.map((c) => c.seed).join(',')}`).join('|')],
  );

  // Layout: each block is a titled row of cells, COLS per line.
  const cellSize = focusSeed !== null ? CELL * 2 : CELL;
  const cols = focusSeed !== null ? 1 : COLS;
  const blockLines = built.map((cells) => Math.ceil(cells.length / cols));
  const blockTop = (b: number) => blockLines.slice(0, b).reduce((s, n) => s + n * (cellSize + LABEL_H) + 28, 0);
  const width = cols * cellSize;
  const height = blockTop(blockLines.length);
  const rectOf = (b: number, i: number) => ({
    x: (i % cols) * cellSize,
    y: blockTop(b) + 28 + Math.floor(i / cols) * (cellSize + LABEL_H) + LABEL_H,
    w: cellSize,
    h: cellSize,
  });

  // ─── three.js view ──────────────────────────────────────────────────────────
  const viewRef = useRef<ForgeView | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const yawRef = useRef(0);
  useEffect(() => {
    const view = new ForgeView();
    viewRef.current = view;
    Object.assign(view.canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
    hostRef.current!.appendChild(view.canvas);
    return () => {
      view.dispose();
      view.canvas.remove();
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.canvas.style.width = `${width}px`;
    view.canvas.style.height = `${height}px`;
    const draw = (yaw: number) => {
      const cells: Cell[] = [];
      built.forEach((block, b) =>
        block.forEach(({ model }, i) => {
          if (model) cells.push({ model, yaw, rect: rectOf(b, i) });
        }),
      );
      view.render(cells, { camera, wireframe, ground }, { w: width, h: height }, performance.now() / 1000);
    };
    // Models with moving parts (a portal's swirl) animate even when the view is static
    const hasMovingParts = built.some((block) => block.some(({ model }) => !!model?.motion?.length));
    if (motion === 'none' && !hasMovingParts) {
      yawRef.current = (yawDeg * Math.PI) / 180;
      draw(yawRef.current);
      return;
    }
    // Animate only while a motion test runs (turntable, or the 8-direction walk test) or parts move.
    let raf = 0, last = performance.now(), walkIdx = 0, nextStep = last;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (motion === 'none') yawRef.current = (yawDeg * Math.PI) / 180;
      else if (motion === 'turntable') yawRef.current += dt * 0.0012;
      else {
        if (now >= nextStep) { walkIdx = (walkIdx + 1) % WALK_DIRS.length; nextStep = now + 700; }
        yawRef.current = smoothYaw(yawRef.current, WALK_DIRS[walkIdx], dt);
      }
      draw(yawRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  // ─── Actions ────────────────────────────────────────────────────────────────
  const post = async (path: string, body: object) => {
    const res = await fetch(`/__forge/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? res.statusText);
    return json;
  };
  const run = (label: string, fn: () => Promise<string>) =>
    fn().then((msg) => setStatus(`${label}: ${msg}`), (e) => setStatus(`${label} failed: ${e.message}`));

  const approve = () => run('Approve', async () => (await post('approve', { stem: stemOf(entry!.id) }), 'draft moved to designs/'));
  const discard = () => run('Discard', async () => (await post('discard', { stem: stemOf(entry!.id) }), 'draft deleted'));
  // Re-fetch both registries with a cache-busting query. Vite re-transforms them (picking up added or
  // removed files) and stamps each changed design's import with its latest update, so edited design
  // code is loaded fresh too. Everything else on the page stays as it is.
  const refreshDesigns = () =>
    run('Refresh', async () => {
      const t = Date.now();
      const [approvedMod, draftMod] = await Promise.all([
        import(/* @vite-ignore */ `/src/forge/registry.vite.ts?t=${t}`) as Promise<{ designs: Record<string, Design> }>,
        import(/* @vite-ignore */ `/src/forge/dev/draftRegistry.ts?t=${t}`) as Promise<{ drafts: Record<string, Design> }>,
      ]);
      setRegistry({ designs: approvedMod.designs, drafts: draftMod.drafts });
      return `designs reloaded at ${new Date(t).toLocaleTimeString()}`;
    });
  const floorRects = camera === 'game' && ground ? built.flatMap((block, b) => block.map((_, i) => rectOf(b, i))) : [];
  const snapshot = () =>
    run('Snapshot', async () => {
      const png = composeSnapshot(viewRef.current!.canvas, { w: width, h: height }, floorRects);
      return (await post('snapshot', { name: `${stemOf(entry!.id)}-${Date.now()}`, pngBase64: png })).path;
    });
  const focusModel = focusSeed !== null ? built[built.length - 1]?.[0]?.model : null;

  // Link status of an approved design: does its data entry's `model` point at it?
  const linkBadge = (e: (typeof entries)[number]): { text: string; color: string; title: string } | null => {
    if (!e.approved) return null;
    return dataEntry(e.approved.source)?.link === e.approved.id
      ? { text: 'linked', color: 'bg-green-800', title: 'In game: its data entry links this design' }
      : { text: 'not linked', color: 'bg-gray-600', title: 'Approved, but its data entry links a different design' };
  };

  return (
    <div className="h-screen flex bg-gray-900 text-gray-100 text-sm">
      {/* ── Left: designs ── */}
      <aside className="w-60 shrink-0 bg-gray-800 border-r border-gray-700 p-3 overflow-y-auto space-y-4">
        <h1 className="text-lg font-bold text-red-400">Forge</h1>
        {CATEGORIES.map((cat) => {
          const list = entries.filter((e) => (e.approved ?? e.draft)!.category === cat);
          if (!list.length) return null;
          return (
            <div key={cat}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">{CATEGORY_LABEL[cat]}</h2>
              {list.map((e) => {
                const lb = linkBadge(e);
                return (
                <button
                  key={e.id}
                  title={dataEntry((e.approved ?? e.draft)!.source)?.path}
                  onClick={() => { setSelectedId(e.id); setFocusSeed(null); }}
                  className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between gap-2 ${e.id === entry?.id ? 'bg-gray-700' : 'hover:bg-gray-700/50'}`}
                >
                  <span className="truncate">{(e.draft ?? e.approved)!.label}</span>
                  <span className="flex gap-1 shrink-0">
                    {lb && <Badge color={lb.color} title={lb.title}>{lb.text}</Badge>}
                    {e.draft && <Badge color={e.approved ? 'bg-yellow-700' : 'bg-blue-700'}>{e.approved ? 'draft' : 'new'}</Badge>}
                  </span>
                </button>
                );
              })}
            </div>
          );
        })}
      </aside>

      {/* ── Center: seed grid ── */}
      <main className="flex-1 overflow-auto p-4">
        {entry && (
          <div className="mb-3">
            <h1 className="text-lg font-bold">{(entry.approved ?? entry.draft)!.label}</h1>
            <p className="text-xs text-gray-400">
              Model for <span className="font-mono text-gray-300">{source?.path ?? 'an unknown data entry (run forge:lint)'}</span>
              <span className="text-gray-500"> · design {entry.id}</span>
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 mb-4 bg-gray-800 rounded-lg px-3 py-2">
          {single ? (
            <span className="text-gray-400" title="Every item of this name looks exactly like this">one look (seed {ITEM_SEED})</span>
          ) : (
            <>
              <div className="flex items-center gap-1" title="Each seed is one possible game instance. Page through them to judge the design's variety.">
                <button className={BTN} disabled={seedStart <= 1} onClick={() => setSeedStart(Math.max(1, seedStart - count))}>◀</button>
                <span className="text-gray-400 w-28 text-center">{cls ? `seed ${seedStart}` : `seeds ${seedStart}–${seedStart + count - 1}`}</span>
                <button className={BTN} onClick={() => setSeedStart(seedStart + count)}>▶</button>
              </div>
              {!cls && (
                <select className={INPUT + ' w-20'} value={count} onChange={(e) => setCount(Number(e.target.value))} title="Seeds per page">
                  {[6, 12, 24].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </>
          )}
          <select className={INPUT + ' w-24'} value={camera} onChange={(e) => setCamera(e.target.value as CameraPreset)}>
            {(['game', 'icon', 'top', 'side'] as const).map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className={INPUT + ' w-28'} value={motion} onChange={(e) => setMotion(e.target.value as typeof motion)}>
            <option value="none">static</option><option value="turntable">turntable</option><option value="walk">walk test</option>
          </select>
          <label className="flex items-center gap-1">Yaw <input type="range" min={-180} max={180} value={yawDeg} disabled={motion !== 'none'} onChange={(e) => setYawDeg(Number(e.target.value))} /> {yawDeg}°</label>
          <Toggle on={wireframe} onClick={() => setWireframe(!wireframe)}>Wireframe</Toggle>
          <Toggle on={ground} onClick={() => setGround(!ground)}>Tile</Toggle>
          <button className={BTN + ' bg-blue-800 hover:bg-blue-700'} onClick={refreshDesigns} title="Load the latest design code without reloading the page">↻ Refresh designs</button>
          <button className={BTN} onClick={snapshot}>Snapshot</button>
          {focusSeed !== null && <button className={BTN} onClick={() => setFocusSeed(null)}>Back to grid</button>}
        </div>

        <div ref={hostRef} className="relative" style={{ width, height }}>
          {floorRects.map((r) => <FloorCell key={`${r.x},${r.y}`} rect={r} />)}
          {built.map((block, b) => (
            <div key={b}>
              <div className="absolute left-0 font-bold text-gray-300" style={{ top: blockTop(b) + 4 }}>
                <span>{shown[b].label}</span> <span className="text-gray-500 font-normal">{shown[b].sub}</span>
              </div>
              {block.map(({ seed, tag, model }, i) => {
                const r = rectOf(b, i);
                return (
                  <button
                    key={`${tag ?? ''}${seed}`}
                    onClick={() => setFocusSeed(focusSeed === null ? seed : null)}
                    className={`absolute z-10 flex items-start text-left text-[11px] truncate px-1 text-amber-300 rounded-sm outline-1 ${focusSeed === seed ? 'outline outline-amber-400' : 'hover:outline hover:outline-gray-400'}`}
                    style={{ left: r.x, top: r.y - LABEL_H, width: r.w, height: LABEL_H + r.h }}
                    title={`${tag ? `${tag}\n` : ''}#${seed} · ${model ? `${model.name} · ${model.mesh.triCount} tris` : 'build failed'}`}
                  >
                    {tag}
                    {!model && <span className="text-red-400">build failed</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </main>

      {/* ── Right: approve / discard, selected model ── */}
      <aside className="w-72 shrink-0 bg-gray-800 border-l border-gray-700 p-3 overflow-y-auto space-y-3">
        {entry?.draft && (
          <div className="bg-gray-900/60 rounded-lg p-2 space-y-2">
            <p className="text-xs text-gray-400">{entry.approved ? 'Draft pending: compare Current vs Draft.' : 'New design: no approved version yet.'}</p>
            <div className="flex gap-2">
              <button className={BTN + ' bg-green-700 hover:bg-green-600'} onClick={approve}>Approve</button>
              <button className={BTN + ' bg-red-800 hover:bg-red-700'} onClick={discard}>Discard</button>
            </div>
          </div>
        )}

        {/* Optional: inspect one model up close (click a model in the grid; click again to go back) */}
        {focusModel && (
          <div className="bg-gray-900/60 rounded-lg p-2 space-y-1">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Selected model</h2>
            <p className="font-semibold">{focusModel.name}</p>
            <p className="text-xs text-gray-400">seed #{focusModel.seed} · {focusModel.mesh.triCount} tris</p>
          </div>
        )}
        {status && <p className="text-xs text-blue-300 break-all">{status}</p>}
      </aside>
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

const INPUT = 'bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 w-16';
const BTN = 'px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100';

// ─── Game-view floor ──────────────────────────────────────────────────────────
// In the game, models draw on a transparent canvas over the DOM tile grid. The game view does the
// same: real floor tiles (same size, color and border as DungeonMap) behind the transparent canvas.

const FLOOR = DUNGEON_PRESETS.crypt.floorColor;
const PAGE_BG = '#111827'; // Tailwind gray-900, the page background
const TILE_BORDER_RGBA = 'rgba(55, 65, 81, 0.3)'; // TILE_BORDER_CLASS as a color, for snapshots

type Rect = { x: number; y: number; w: number; h: number };

/**
 * The floor around the model's tile, as the game draws it: flat tiles in floor px (the model's tile
 * spans -TILE_SIZE/2..+TILE_SIZE/2 around its center), laid on the floor by the game view's transform
 * (floorMatrix) with the tile center at GAME_VIEW_ANCHOR. Enough tiles to cover the cell (it clips them);
 * a block per cell, so neighbouring cells' grids never meet out of step.
 */
function floorTiles(r: Rect): { left: number; top: number }[] {
  const half = Math.ceil(Math.max(r.w, r.h) / TILE_SIZE);
  const tiles: { left: number; top: number }[] = [];
  for (let i = -half; i <= half; i++) for (let j = -half; j <= half; j++) tiles.push({ left: i * TILE_SIZE - TILE_SIZE / 2, top: j * TILE_SIZE - TILE_SIZE / 2 });
  return tiles;
}
/** The floor transform for a cell: floorMatrix, translated to the cell's anchor (cell-relative px). */
const cellFloor = (r: Rect): [number, number, number, number, number, number] => [...floorMatrix(), r.w * GAME_VIEW_ANCHOR.x, r.h * GAME_VIEW_ANCHOR.y];

function FloorCell({ rect }: { rect: Rect }) {
  return (
    <div className="absolute overflow-hidden" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      <div className="absolute left-0 top-0" style={{ transform: `matrix(${cellFloor(rect).join(', ')})`, transformOrigin: '0 0' }}>
        {floorTiles(rect).map((t) => (
          <div
            key={`${t.left},${t.top}`}
            className={`absolute border ${TILE_BORDER_CLASS}`}
            style={{ left: t.left, top: t.top, width: TILE_SIZE, height: TILE_SIZE, backgroundColor: FLOOR }}
          />
        ))}
      </div>
    </div>
  );
}

/** Snapshot of the view as it looks on screen: page background, game-view floors, then the WebGL canvas on top. */
function composeSnapshot(gl: HTMLCanvasElement, size: { w: number; h: number }, floorRects: Rect[]): string {
  const out = document.createElement('canvas');
  out.width = gl.width;
  out.height = gl.height;
  const ctx = out.getContext('2d')!;
  ctx.scale(gl.width / size.w, gl.height / size.h);
  ctx.fillStyle = PAGE_BG;
  ctx.fillRect(0, 0, size.w, size.h);
  for (const r of floorRects) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    const [a, b, c, d, tx, ty] = cellFloor(r);
    ctx.transform(a, b, c, d, r.x + tx, r.y + ty);
    for (const t of floorTiles(r)) {
      ctx.fillStyle = FLOOR;
      ctx.fillRect(t.left, t.top, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = TILE_BORDER_RGBA;
      ctx.strokeRect(t.left + 0.5, t.top + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
    ctx.restore();
  }
  ctx.drawImage(gl, 0, 0, size.w, size.h);
  return out.toDataURL('image/png');
}

/** Build one cell's model: class designs are posed for and hold `weaponType` (default: starting gear). */
function safeBuild(design: Design, seed: number, designs: Record<string, Design>, weaponType?: WeaponType): Model | null {
  try {
    return buildPreview(design, seed, designs, weaponType);
  } catch (e) {
    console.error(`[forge] ${design.id} seed ${seed}`, e);
    return null;
  }
}

function Badge({ color, title, children }: { color: string; title?: string; children: string }) {
  return <span title={title} className={`${color} text-[10px] leading-none px-1.5 py-0.5 rounded`}>{children}</span>;
}

/** Large-hit-area on/off button (used instead of native checkboxes). */
function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  const active = on ? 'bg-blue-700 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-700';
  return (
    <button type="button" onClick={onClick} className={`px-2.5 py-1 rounded border border-gray-700 text-xs ${active}`}>
      {children}
    </button>
  );
}

interface SeedCell {
  seed: number;
  /** Short label shown on the cell (class designs: the weapon type held). */
  tag?: string;
  /** Class designs: the weapon type this cell's character holds (and is posed for). */
  weaponType?: WeaponType;
}
