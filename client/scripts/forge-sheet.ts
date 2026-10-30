// Headless contact sheet: renders models to a PNG with a tiny software rasterizer (no GPU, no browser).
// This is an APPROXIMATION of the in-game three.js look (same camera angle, same light direction, flat shading),
// meant so Claude Code can SEE what it just built. Final look is judged in /dev/forge.
//
//   npm run forge:sheet -- --design golem --seeds 8 --yaws 0,90,180,270 --out sheet.png
//   --design <substr>   filter by design id            --seeds <n | a,b,c>   seed count or explicit list (default 6);
//                                                       items have one look (ITEM_SEED) and ignore it
//   --yaws <deg,deg>    facings (default 0)
//   --drafts            include src/forge/drafts       --only-drafts         draft designs only
//   --elev <deg>        camera elevation (default GAME_CAMERA)   --cols <n> (default 6)   --cell <px> (default 200)
//   --weapon "<type>"   class designs: hold this weapon type (posed for its hold), e.g. "Crossbows";
//                       default = the class's starting gear
//   --anim <name>       designs with that one-time animation (PartAnimation): drawn at its end pose
//   --tint <dungeon>    tinted models (Rifts & Keys, the active Rifter): paint them in this dungeon's riftColor (default: the first
//                       dungeon), or a color given as #rrggbb
import { writeFileSync } from 'node:fs';
import { ITEM_GROUND_PITCH, SHEET_SHADING, itemRestLift, keyLightDir, layItem, lootYaw } from '../src/forge/core/stage-config';
import { GAME_CAMERA, viewProject, type ViewAngles } from '../src/viewEngine/camera';
import { rotY } from '../src/forge/core/vec';
import type { Design, Model } from '../src/forge/core/types';
import { ITEM_SEED, oneLook } from '../src/forge/core/link';
import { loadDesigns } from './load-designs';
import { buildPreview } from '../src/forge/equip';
import type { WeaponType } from '../src/data/gear/types';
import { encodePNG } from './png';
import { posedHalos, posedPositions } from '../src/forge/core/animate';
import { isTinted, tintModel } from '../src/forge/core/tint';
import type { RGB } from '../src/forge/core/vec';
import { DUNGEONS } from '../src/data/world/dungeons';
import { designTiles } from '../src/forge/dataRefs';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);

const only = opt('design', '');
// Rifts & Keys are drawn in a dungeon's color (or one given as #rrggbb), as the game draws them
const tintArg = opt('tint', Object.keys(DUNGEONS)[0]);
const tint: RGB = tintArg.startsWith('#')
  ? ([1, 3, 5].map((i) => parseInt(tintArg.slice(i, i + 2), 16)) as RGB)
  : (DUNGEONS[tintArg] ?? (() => { throw new Error(`--tint: no dungeon '${tintArg}' (${Object.keys(DUNGEONS).join(', ')})`); })()).riftColor;
const seedArg = opt('seeds', '6');
const seeds = seedArg.includes(',') ? seedArg.split(',').map(Number) : Array.from({ length: Number(seedArg) }, (_, i) => i + 1);
const yaws = opt('yaws', '0').split(',').map((d) => (Number(d) * Math.PI) / 180);
// The game view (GAME_CAMERA), optionally at another elevation
const VIEW: ViewAngles = { ...GAME_CAMERA, elevationDeg: Number(opt('elev', String(GAME_CAMERA.elevationDeg))) };
const elev = (VIEW.elevationDeg * Math.PI) / 180, viewYaw = (VIEW.yawDeg * Math.PI) / 180;
const cols = Number(opt('cols', '6'));
const CELL = Number(opt('cell', '200'));
const out = opt('out', 'forge-sheet.png');

const SS = 2; // supersampling
const BG = [30, 28, 40], GROUND = [58, 56, 70], GROUND_EDGE = [110, 108, 128];

function renderCell(model: Model, design: Design, yaw: number): Uint8Array {
  const S = CELL * SS;
  const color = new Uint8Array(S * S * 3);
  const zbuf = new Float32Array(S * S).fill(-Infinity);
  for (let i = 0; i < S * S; i++) color.set(BG, i * 3);

  const ce = Math.cos(elev), se = Math.sin(elev), cy = Math.cos(yaw), sy = Math.sin(yaw);
  // world-ish space: rotate model by yaw about Y (matches rotY in vec.ts)
  // Items lie on the floor as loot (flat and face up unless the design sets its own pitch, turned like
  // loot in the game: lootYaw), then everything turns by yaw.
  const isItem = design.fit.kind === 'item';
  const pitch = model.groundPitch ?? ITEM_GROUND_PITCH;
  const roll = model.groundRoll ?? 0;
  const lift = isItem ? itemRestLift(model.mesh.positions, pitch, roll) : 0;
  const place = (p: number[]): number[] => (isItem ? rotY(layItem([p[0], p[1], p[2]], pitch, lift, roll), lootYaw(VIEW)) : p);
  const rot = (q: number[]): [number, number, number] => { const p = place(q); return [p[0] * cy + p[2] * sy, p[1], -p[0] * sy + p[2] * cy]; };
  // The game's projection (viewProject). Returns [x, up, depth].
  const view = (p: number[]): [number, number, number] => {
    const [x, down, depth] = viewProject([p[0], p[1], p[2]], VIEW);
    return [x, -down, depth];
  };

  const standing = design.fit.kind === 'standing';
  // The square it stands on in game: 1 tile, or a large creature's 2×2 (designTiles)
  const square = designTiles(design);
  const tilesAcross = standing ? 2.5 * square : 1.7; // how many tiles fit across one cell
  const k = S / tilesAcross;
  const cxp = S / 2;
  const cyp = standing ? S * 0.68 : S * 0.5;
  const toScreen = (v: [number, number, number]) => [cxp + v[0] * k, cyp - v[1] * k, v[2]] as const;
  const groundY = 0; // standing models' feet and flat-laid items both rest on y = 0

  /** `rgb`: one color, or one per corner (a, b, c) blended across the triangle. */
  const fillTri = (a: readonly number[], b: readonly number[], c: readonly number[], rgb: number[] | number[][], alpha: number, writeZ: boolean) => {
    const corners = Array.isArray(rgb[0]) ? (rgb as number[][]) : null;
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(S - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(S - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-9) return;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d;
        const w1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const i = y * S + x;
        if (z <= zbuf[i]) continue;
        if (writeZ) zbuf[i] = z;
        for (let ch = 0; ch < 3; ch++) {
          const v = corners ? w0 * corners[0][ch] + w1 * corners[1][ch] + w2 * corners[2][ch] : (rgb as number[])[ch];
          color[i * 3 + ch] = color[i * 3 + ch] * (1 - alpha) + v * alpha;
        }
      }
  };

  // The ground tiles it stands on (1x1, or a large creature's 2x2) as a scale reference (and a hint of where the
  // shadow/footprint sits), centered on its feet
  for (let ti = 0; ti < square; ti++) {
    for (let tj = 0; tj < square; tj++) {
      const ox = ti - square / 2, oz = tj - square / 2;
      const gq = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, z]) => toScreen(view([ox + x, groundY, oz + z])));
      fillTri(gq[0], gq[1], gq[2], GROUND, 1, false);
      fillTri(gq[0], gq[2], gq[3], GROUND, 1, false);
      for (let i = 0; i < 4; i++) {
        const p = gq[i], q = gq[(i + 1) % 4];
        for (let t = 0; t <= 60; t++) {
          const x = Math.round(p[0] + ((q[0] - p[0]) * t) / 60), y = Math.round(p[1] + ((q[1] - p[1]) * t) / 60);
          if (x >= 0 && y >= 0 && x < S && y < S) color.set(GROUND_EDGE, (y * S + x) * 3);
        }
      }
    }
  }

  const L = keyLightDir(VIEW);
  const Ln = Math.hypot(...L);
  const { colors, emissive, alpha, triCount } = model.mesh;
  // --anim: its animated parts at the end pose
  const anim = opt('anim', '');
  const positions = anim ? posedPositions(model, { [anim]: 1 }) : model.mesh.positions;
  const opaque: number[] = [], clear: number[] = [];
  for (let t = 0; t < triCount; t++) (alpha[t] < 0.99 ? clear : opaque).push(t);

  const draw = (t: number, writeZ: boolean) => {
    const P = [0, 1, 2].map((v) => {
      const o = t * 9 + v * 3;
      return rot([positions[o], positions[o + 1], positions[o + 2]]);
    });
    const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]];
    const e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    n = n.map((v) => v / nl);
    // back-face cull (view direction toward camera in world space)
    const toCam = [-Math.sin(viewYaw) * ce, se, Math.cos(viewYaw) * ce];
    if (n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2] <= 0 && alpha[t] >= 0.99) return;
    const diff = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / Ln);
    const sh = SHEET_SHADING.ambient + SHEET_SHADING.key * diff;
    const e = emissive[t];
    // Each corner's color, shaded (usually all three are the same; a blended face differs per corner)
    const rgb = [0, 1, 2].map((v) => [0, 1, 2].map((ch) => {
      const base = colors[t * 9 + v * 3 + ch] * 255;
      return Math.min(255, base * sh * (1 - e) + Math.min(255, base * 1.12) * e);
    }));
    const [a, b, c] = P.map((p) => toScreen(view(p)));
    fillTri(a, b, c, rgb, alpha[t], writeZ);
  };
  for (const t of opaque) draw(t, true);
  for (const t of clear) draw(t, false);

  // Halos (MeshData.halos), like the game's halo shader: a round glow at each, brought forward by its radius,
  // hidden where a nearer surface is, faded from its center (0.5, 0.16 at 40%, 0 at the edge) and added on
  for (const h of anim ? posedHalos(model, { [anim]: 1 }) : model.mesh.halos) {
    const [hx, hy, hz] = toScreen(view(rot([h.p[0], h.p[1], h.p[2]])));
    const R = h.r * k, z = hz + h.r;
    for (let y = Math.max(0, Math.floor(hy - R)); y <= Math.min(S - 1, Math.ceil(hy + R)); y++)
      for (let x = Math.max(0, Math.floor(hx - R)); x <= Math.min(S - 1, Math.ceil(hx + R)); x++) {
        const d = Math.hypot(x + 0.5 - hx, y + 0.5 - hy) / R, i = y * S + x;
        if (d > 1 || zbuf[i] > z) continue;
        const a = d < 0.4 ? 0.5 + (0.16 - 0.5) * (d / 0.4) : 0.16 * (1 - (d - 0.4) / 0.6);
        for (let ch = 0; ch < 3; ch++) color[i * 3 + ch] = Math.min(255, color[i * 3 + ch] + h.c[ch] * 255 * a);
      }
  }

  // downsample
  const outc = new Uint8Array(CELL * CELL * 3);
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++)
      for (let ch = 0; ch < 3; ch++) {
        let s = 0;
        for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) s += color[((y * SS + dy) * S + x * SS + dx) * 3 + ch];
        outc[(y * CELL + x) * 3 + ch] = s / (SS * SS);
      }
  return outc;
}

const loaded = (await loadDesigns({ drafts: flag('drafts') || flag('only-drafts') })).filter(
  (d) => (!only || d.design.id.includes(only)) && (!flag('only-drafts') || d.source === 'draft'),
);
if (!loaded.length) {
  console.error('no designs matched');
  process.exit(1);
}

type Cell = { label: string; pix: Uint8Array };
const blocks: Cell[][] = [];
// Character (class) designs are drawn holding their class's starting gear, built from the approved item designs
const approvedById = Object.fromEntries((await loadDesigns()).map((l) => [l.design.id, l.design]));
const manifest: string[] = [];
for (const { design, source } of loaded) {
  const cells: Cell[] = [];
  for (const seed of oneLook(design) ? [ITEM_SEED] : seeds)
    for (const yaw of yaws) {
      const built = buildPreview(design, seed, approvedById, (opt('weapon', '') || undefined) as WeaponType | undefined);
      const model = isTinted(built) ? tintModel(built, tint) : built;
      cells.push({ label: '', pix: renderCell(model, design, yaw) });
      manifest.push(`${design.id}${source === 'draft' ? '[draft]' : ''} seed=${seed} yaw=${Math.round((yaw * 180) / Math.PI)} tris=${model.mesh.triCount} "${model.name}"`);
    }
  blocks.push(cells);
}
const rowsPer = blocks.map((b) => Math.ceil(b.length / cols));
const rows = rowsPer.reduce((a, b) => a + b, 0);
const W = cols * CELL, H = rows * CELL;
const img = new Uint8Array(W * H * 3);
let row0 = 0;
blocks.forEach((cells, bi) => {
  cells.forEach((c, i) => {
    const gx = (i % cols) * CELL, gy = (row0 + Math.floor(i / cols)) * CELL;
    for (let y = 0; y < CELL; y++) img.set(c.pix.subarray(y * CELL * 3, (y + 1) * CELL * 3), ((gy + y) * W + gx) * 3);
  });
  row0 += rowsPer[bi];
});
// thin cell separators
for (let x = 0; x < W; x += CELL) for (let y = 0; y < H; y++) img.set([20, 18, 28], (y * W + x) * 3);
for (let y = 0; y < H; y += CELL) for (let x = 0; x < W; x++) img.set([20, 18, 28], (y * W + x) * 3);

writeFileSync(out, encodePNG(W, H, img));
console.log(`wrote ${out} (${W}x${H}); cells are listed left-to-right, top-to-bottom, one block of rows per design:`);
manifest.forEach((m, i) => console.log(String(i).padStart(3), m));
