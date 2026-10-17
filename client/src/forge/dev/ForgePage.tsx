// DEV ONLY: the /dev/forge builder page. Lazy-loaded from main.tsx behind import.meta.env.DEV,
// so it (and drafts/) never reach the production bundle. Spec: docs/forge (builder page).
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildModel, describeParams } from '../core/build';
import { instanceSeed } from '../core/link';
import { smoothYaw } from '../core/facing';
import type { Category, Design, Model, ModelLink, ParamDef, Params } from '../core/types';
import { designs } from '../registry.vite';
import { drafts } from './draftRegistry';
import { ENEMY_CLASSES, BOSS_CLASSES } from '../../data/enemies';
import { ARMOR_SLOTS } from '../../data/gear';
import { WEAPON_TYPE_DATA } from '../../data/gear/weapons';
import { DUNGEON_PRESETS } from '../../data/dungeonPresets';
import { TILE_SIZE } from '../../data/constants';
import { TILE_BORDER_CLASS } from '../../components/mapParts';
import { ForgeView, GAME_VIEW_ANCHOR, type CameraPreset, type Cell } from './forgeView';

// Cell size follows the game's tile size (TILE_SIZE, the one constant the maps use), so the game view
// always frames the same 3x3 tiles: if tiles get bigger, models and cells grow with them.
const CELL = TILE_SIZE * 3.6;
const LABEL_H = 0; // no per-cell text strip; a cell's name and seed show on hover
const COLS = 6;
// Left-panel sections, in order. Every Category must be listed (Record keeps that checked).
const CATEGORY_LABEL: Record<Category, string> = {
  creature: 'Creatures', character: 'Characters', weapon: 'Weapons', armor: 'Armor', prop: 'Props',
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
const WALK_DIRS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i * Math.PI) / 4);

type Entry = { id: string; approved?: Design; draft?: Design };
/** A row of cells in the grid: one design, one set of seeds. */
type Block = { label: string; sub: string; design: Design; cells: SeedCell[]; applyPins: boolean };

const ENEMY_LIST = [...ENEMY_CLASSES, ...BOSS_CLASSES];
const stemOf = (id: string) => id.slice(id.indexOf('.') + 1);

// ─── URL state ────────────────────────────────────────────────────────────────

function readUrl() {
  const q = new URLSearchParams(location.search);
  const pins: Params = {};
  for (const [k, v] of q) {
    if (!k.startsWith('p.')) continue;
    pins[k.slice(2)] = v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v);
  }
  return {
    design: q.get('design') ?? '',
    seed: Number(q.get('seed') ?? 1),
    count: Number(q.get('count') ?? 12),
    camera: (q.get('cam') as CameraPreset) ?? 'game',
    pins,
  };
}

function writeUrl(s: { design: string; seed: number; count: number; camera: CameraPreset; pins: Params }) {
  const q = new URLSearchParams({ design: s.design, seed: String(s.seed), count: String(s.count), cam: s.camera });
  for (const [k, v] of Object.entries(s.pins)) q.set(`p.${k}`, String(v));
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ForgePage() {
  const initial = useMemo(readUrl, []);
  // Design registries live in state so "Refresh designs" can swap in freshly loaded code without a
  // page reload (selection, seed page, fixed params and focus all survive).
  const [registry, setRegistry] = useState({ designs, drafts });
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
  const [pins, setPins] = useState<Params>(initial.pins);
  const [focusSeed, setFocusSeed] = useState<number | null>(null);
  const [yawDeg, setYawDeg] = useState(0);
  const [motion, setMotion] = useState<'none' | 'turntable' | 'walk'>('none');
  const [wireframe, setWireframe] = useState(false);
  const [ground, setGround] = useState(true);
  const [status, setStatus] = useState('');

  const entry = entries.find((e) => e.id === selectedId) ?? entries[0];
  const paramDesign = entry?.draft ?? entry?.approved;
  const schema: Record<string, ParamDef> = useMemo(() => (paramDesign ? describeParams(paramDesign) : {}), [paramDesign]);
  // In-game samples: game objects linked to this design, built exactly as the game builds them. A link
  // with a fixed seed is one exact look; without one each enemy seeds from its own id, so show a few
  // sample enemies (same id scheme as dungeon spawning) to show the spread the game produces.
  const gameCells: SeedCell[] = entry
    ? ENEMY_LIST.filter((c) => c.model?.design === entry.id).flatMap((c) => {
        const link = c.model!;
        const ids = link.seed !== undefined ? [c.id] : [0, 1, 2].map((n) => `${c.id}-${n}`);
        return ids.map((id) => ({ seed: instanceSeed(link, id), tag: id, params: link.params }));
      })
    : [];
  const pageCells: SeedCell[] = Array.from({ length: count }, (_, i) => ({ seed: seedStart + i, params: {} }));

  // Blocks (rows of cells): "In game" first, on its own row so the seed grid keeps its page size, then
  // the seed page for the approved design and/or its draft. Forge param settings never apply to the
  // In game row: it shows what the game data says, nothing else.
  const blocks: Block[] = !entry
    ? []
    : [
        ...(entry.approved && gameCells.length
          ? [{ label: '★ In game', sub: `sample enemies as linked in the game data · v${entry.approved.version}`, design: entry.approved, cells: gameCells, applyPins: false }]
          : []),
        ...(entry.approved ? [{ label: 'Current', sub: `${entry.approved.id} v${entry.approved.version}`, design: entry.approved, cells: pageCells, applyPins: true }] : []),
        ...(entry.draft
          ? [{ label: entry.approved ? 'Draft' : 'Draft (new)', sub: `${entry.draft.id} v${entry.draft.version}`, design: entry.draft, cells: pageCells, applyPins: true }]
          : []),
      ];
  const shown = focusSeed === null
    ? blocks
    : blocks.map((b) => ({ ...b, cells: b.cells.filter((c) => c.seed === focusSeed).slice(0, 1) })).filter((b) => b.cells.length);

  useEffect(() => writeUrl({ design: entry?.id ?? '', seed: seedStart, count, camera, pins }), [entry, seedStart, count, camera, pins]);

  // Browser tab title (index.html's "Rifter" is the game's)
  useEffect(() => {
    document.title = 'Rifter Forge';
  }, []);

  // Build every model shown (blocks x cells). Pure and deterministic, so memo on inputs.
  const built = useMemo(
    () => shown.map((b) => b.cells.map((cell) => ({ ...cell, model: safeBuild(b.design, cell.seed, b.applyPins ? { ...cell.params, ...pins } : cell.params) }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, shown.map((b) => `${b.label}:${b.cells.map((c) => c.seed).join(',')}`).join('|'), JSON.stringify(pins)],
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
      view.render(cells, { camera, wireframe, ground }, { w: width, h: height });
    };
    if (motion === 'none') {
      yawRef.current = (yawDeg * Math.PI) / 180;
      draw(yawRef.current);
      return;
    }
    // Animate only while a motion test runs (turntable, or the 8-direction walk test).
    let raf = 0, last = performance.now(), walkIdx = 0, nextStep = last;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (motion === 'turntable') yawRef.current += dt * 0.0012;
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
  // Data-entry snippets: paste them to Claude Code with the game object to link ("link zombie: ...").
  const copyLink = (link: ModelLink, what: string) => {
    navigator.clipboard.writeText(`model: ${JSON.stringify(link)},`);
    setStatus(`Copied (${what}). Paste it to Claude Code with the game object to link.`);
  };
  // The normal case: the design plus the FIXED params only. Everything set to Varies differs per enemy.
  const copyForGame = () => {
    const approved = entry?.approved;
    if (!approved) return setStatus('Approve the design before linking it to the game.');
    const fixed = Object.keys(pins).length;
    copyLink({ design: approved.id, version: approved.version, params: pins }, fixed ? `${fixed} fixed param${fixed > 1 ? 's' : ''}, the rest vary per enemy` : 'everything varies per enemy');
  };
  // Rare case: every enemy identical to the selected model (all params + its seed).
  const copyExact = () =>
    focusModel && copyLink({ design: focusModel.designId, version: focusModel.version, seed: focusModel.seed, params: focusModel.params }, 'this exact model for every enemy');

  // Link status of every game object that should have a model
  const approvedVersion = (id: string) => registry.designs[id]?.version;
  const enemyLinks = ENEMY_LIST.map((c) => {
    const link = c.model;
    const status = !link ? 'not linked'
      : approvedVersion(link.design) === undefined ? `${link.design} is not approved`
      : approvedVersion(link.design) !== link.version ? `linked to v${link.version}, design is v${approvedVersion(link.design)}`
      : `${link.design} v${link.version}`;
    return { id: c.id, ok: !!link && approvedVersion(link.design) === link.version, status };
  });
  const itemBases = [...Object.keys(WEAPON_TYPE_DATA), ...ARMOR_SLOTS.map((s) => `armor:${s}`), 'shield'];

  const pin = (key: string, value: string | number | boolean | undefined) =>
    setPins((p) => {
      const next = { ...p };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });

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
              {list.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setSelectedId(e.id); setPins({}); setFocusSeed(null); }}
                  className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between gap-2 ${e.id === entry?.id ? 'bg-gray-700' : 'hover:bg-gray-700/50'}`}
                >
                  <span className="truncate">{(e.draft ?? e.approved)!.label}</span>
                  <span className="flex gap-1 shrink-0">
                    {e.approved && <Badge color="bg-green-800">approved</Badge>}
                    {e.draft && <Badge color={e.approved ? 'bg-yellow-700' : 'bg-blue-700'}>{e.approved ? 'draft' : 'new'}</Badge>}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
        <div className="bg-gray-900/60 rounded-lg p-2 space-y-1">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Game links</h2>
          {enemyLinks.map((l) => (
            <p key={l.id} className="text-xs">
              <span className="text-gray-300">{l.id}</span> <span className={l.ok ? 'text-green-400' : 'text-yellow-300'}>{l.status}</span>
            </p>
          ))}
          <p className="text-xs text-gray-500 pt-1">Items (linked in M3): {itemBases.join(', ')}</p>
        </div>
      </aside>

      {/* ── Center: seed grid ── */}
      <main className="flex-1 overflow-auto p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4 bg-gray-800 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1" title="Each seed is one fixed random variant. Page through them to judge the design's variety.">
            <button className={BTN} disabled={seedStart <= 1} onClick={() => setSeedStart(Math.max(1, seedStart - count))}>◀</button>
            <span className="text-gray-400 w-28 text-center">seeds {seedStart}–{seedStart + count - 1}</span>
            <button className={BTN} onClick={() => setSeedStart(seedStart + count)}>▶</button>
          </div>
          <select className={INPUT + ' w-20'} value={count} onChange={(e) => setCount(Number(e.target.value))} title="Seeds per page">
            {[6, 12, 24].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
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
                <span className={shown[b].applyPins ? '' : 'text-amber-300'}>{shown[b].label}</span> <span className="text-gray-500 font-normal">{shown[b].sub}</span>
              </div>
              {block.map(({ seed, tag, model }, i) => {
                const r = rectOf(b, i);
                return (
                  <button
                    key={`${tag ?? ''}${seed}`}
                    onClick={() => setFocusSeed(focusSeed === null ? seed : null)}
                    className={`absolute z-10 flex items-start text-left text-[11px] truncate px-1 text-amber-300 rounded-sm outline-1 ${focusSeed === seed ? 'outline outline-amber-400' : 'hover:outline hover:outline-gray-400'}`}
                    style={{ left: r.x, top: r.y - LABEL_H, width: r.w, height: LABEL_H + r.h }}
                    title={`${tag ? `How the game renders "${tag}" (its data entry's model link)\n` : ''}#${seed} · ${model ? `${model.name} · ${model.mesh.triCount} tris` : 'build failed'}`}
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

      {/* ── Right: params, compare actions, repro ── */}
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

        {/* Link to game: the design + its Fixed params. No model selection needed: Varies params differ per enemy. */}
        <div className="bg-gray-900/60 rounded-lg p-2 space-y-1.5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Link to game</h2>
          <p className="text-xs">
            <span className="text-amber-300 font-semibold">Fixed for every enemy: </span>
            {Object.keys(pins).length ? Object.entries(pins).map(([k, v]) => `${k} = ${typeof v === 'number' ? +v.toFixed(2) : v}`).join(', ') : <span className="text-gray-500">nothing</span>}
          </p>
          <p className="text-xs">
            <span className="text-gray-300 font-semibold">Varies per enemy: </span>
            {Object.keys(schema).filter((k) => !(k in pins)).join(', ') || <span className="text-gray-500">nothing</span>}
          </p>
          <button
            className={BTN + ' w-full disabled:opacity-40 disabled:cursor-not-allowed'}
            disabled={!entry?.approved}
            onClick={copyForGame}
            title={entry?.approved ? 'Copies a model link (design + fixed params) for a game data entry' : 'Approve the design first'}
          >
            Copy for game
          </button>
          {!entry?.approved && <p className="text-[11px] text-gray-500">Approve the design before linking it.</p>}
        </div>

        <div className="bg-gray-900/60 rounded-lg p-2 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Parameters</h2>
            {Object.keys(pins).length > 0 && <button className="text-xs text-gray-400 hover:text-gray-100" onClick={() => setPins({})}>Set all to varies</button>}
          </div>
          <p className="text-[11px] text-gray-500">
            <span className="text-amber-300 font-semibold">Fixed</span>: same on every enemy. <span className="text-gray-300 font-semibold">Varies</span>: each enemy rolls its own (each cell in the grid is one possible enemy). Changing a value fixes it.
          </p>
          {Object.entries(schema).map(([key, def]) => (
            <ParamControl key={key} name={key} def={def} value={pins[key]} fallback={focusModel?.params[key] ?? built[shown.findIndex((b) => b.applyPins)]?.[0]?.model?.params[key]} onChange={(v) => pin(key, v)} />
          ))}
          {!Object.keys(schema).length && <p className="text-xs text-gray-500">No parameters.</p>}
        </div>

        {/* Optional: inspect one model up close (click a model in the grid; click again to go back) */}
        {focusModel && (
          <div className="bg-gray-900/60 rounded-lg p-2 space-y-1">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Selected model</h2>
            <p className="font-semibold">{focusModel.name}</p>
            <p className="text-xs text-gray-400">seed #{focusModel.seed} · {focusModel.mesh.triCount} tris</p>
            {Object.entries(focusModel.params).map(([k, v]) => (
              <p key={k} className="text-xs"><span className="text-gray-500">{k}:</span> {typeof v === 'number' ? +v.toFixed(3) : String(v)}</p>
            ))}
            <button className="text-xs text-gray-400 hover:text-gray-100 underline" onClick={copyExact} title="Every enemy will look exactly like this one (all params and its seed fixed)">
              Copy this exact model instead
            </button>
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
 * An N×N block of tiles (N odd, as many as fit) centered on the model's tile, in cell-relative px.
 * A block per cell rather than a full fill, so neighbouring cells' grids never meet out of step.
 */
function floorTiles(r: Rect): { left: number; top: number }[] {
  let n = Math.floor((Math.min(r.w, r.h) - 20) / TILE_SIZE);
  if (n % 2 === 0) n -= 1;
  const cx = r.w * GAME_VIEW_ANCHOR.x - TILE_SIZE / 2;
  const cy = r.h * GAME_VIEW_ANCHOR.y - TILE_SIZE / 2;
  const half = (n - 1) / 2;
  const tiles: { left: number; top: number }[] = [];
  for (let i = -half; i <= half; i++) for (let j = -half; j <= half; j++) tiles.push({ left: cx + i * TILE_SIZE, top: cy + j * TILE_SIZE });
  return tiles;
}

function FloorCell({ rect }: { rect: Rect }) {
  return (
    <div className="absolute overflow-hidden" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      {floorTiles(rect).map((t) => (
        <div
          key={`${t.left},${t.top}`}
          className={`absolute border ${TILE_BORDER_CLASS}`}
          style={{ left: t.left, top: t.top, width: TILE_SIZE, height: TILE_SIZE, backgroundColor: FLOOR }}
        />
      ))}
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
    for (const t of floorTiles(r)) {
      ctx.fillStyle = FLOOR;
      ctx.fillRect(r.x + t.left, r.y + t.top, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = TILE_BORDER_RGBA;
      ctx.strokeRect(r.x + t.left + 0.5, r.y + t.top + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
    ctx.restore();
  }
  ctx.drawImage(gl, 0, 0, size.w, size.h);
  return out.toDataURL('image/png');
}

function safeBuild(design: Design, seed: number, pins: Params): Model | null {
  try {
    return buildModel(design, seed, pins);
  } catch (e) {
    console.error(`[forge] ${design.id} seed ${seed}`, e);
    return null;
  }
}

function Badge({ color, children }: { color: string; children: string }) {
  return <span className={`${color} text-[10px] leading-none px-1.5 py-0.5 rounded`}>{children}</span>;
}

/**
 * One parameter, in one of two clearly marked states:
 *  - Fixed: the value applies to every seed (amber outline, "Fixed" switch on).
 *  - Varies: each seed picks its own value; the control is dimmed and shows the focused/first seed's value.
 * Changing the control fixes it; the switch toggles between the two.
 */
function ParamControl({ name, def, value, fallback, onChange }: {
  name: string;
  def: ParamDef;
  value: string | number | boolean | undefined;
  fallback: string | number | boolean | undefined;
  onChange: (v: string | number | boolean | undefined) => void;
}) {
  const fixed = value !== undefined;
  const shown = fixed ? value : fallback;
  return (
    <div className={`rounded-md p-2 space-y-1.5 border ${fixed ? 'border-amber-500 bg-amber-900/25' : 'border-gray-700'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${fixed ? 'text-amber-200' : 'text-gray-300'}`}>{name}</span>
        <div className="flex rounded overflow-hidden border border-gray-600 text-[10px] font-semibold shrink-0">
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className={`px-1.5 py-0.5 ${!fixed ? 'bg-gray-500 text-white' : 'bg-gray-900 text-gray-500 hover:text-gray-300'}`}
            title="Each seed picks its own value"
          >
            Varies
          </button>
          <button
            type="button"
            onClick={() => !fixed && onChange(shown ?? defaultFor(def))}
            className={`px-1.5 py-0.5 ${fixed ? 'bg-amber-500 text-gray-900' : 'bg-gray-900 text-gray-500 hover:text-gray-300'}`}
            title="Use this value for every seed"
          >
            Fixed
          </button>
        </div>
      </div>
      <div className={fixed ? '' : 'opacity-60'}>
        {def.type === 'choice' && (
          <select className={`${INPUT} w-full`} value={String(shown ?? '')} onChange={(e) => onChange(e.target.value)}>
            {[...new Set(def.options)].map((o) => <option key={o}>{o}</option>)}
          </select>
        )}
        {def.type === 'number' && (
          <div className="flex items-center gap-2">
            <input
              type="range" className="flex-1"
              min={def.min} max={def.max} step={def.int ? 1 : (def.max - def.min) / 100}
              value={Number(shown ?? def.min)} onChange={(e) => onChange(Number(e.target.value))}
            />
            <span className="text-xs w-10 text-right">{shown === undefined ? '' : def.int ? shown : (+Number(shown).toFixed(2))}</span>
          </div>
        )}
        {def.type === 'bool' && (
          <div className="flex gap-1">
            {[true, false].map((b) => (
              <Toggle key={String(b)} on={Boolean(shown) === b} pinned={fixed} onClick={() => onChange(b)}>{b ? 'yes' : 'no'}</Toggle>
            ))}
          </div>
        )}
        {!fixed && <p className="text-[10px] text-gray-500 mt-0.5">varies by seed (showing one seed's value)</p>}
      </div>
    </div>
  );
}

const defaultFor = (def: ParamDef): string | number | boolean =>
  def.type === 'choice' ? def.options[0] : def.type === 'number' ? def.min : false;

/** Large-hit-area on/off button (used instead of native checkboxes). */
function Toggle({ on, pinned = true, onClick, children }: { on: boolean; pinned?: boolean; onClick: () => void; children: string }) {
  const active = on ? (pinned ? 'bg-blue-700 text-white' : 'bg-gray-600 text-gray-100') : 'bg-gray-900 text-gray-400 hover:bg-gray-700';
  return (
    <button type="button" onClick={onClick} className={`px-2.5 py-1 rounded border border-gray-700 text-xs ${active}`}>
      {children}
    </button>
  );
}

interface SeedCell {
  seed: number;
  /** Game object linked to this design that renders with this cell's seed + params (e.g. 'skeleton'). */
  tag?: string;
  /** Params from the game object's model link. */
  params: Params;
}
