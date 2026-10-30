// Model for Weapon Rack (data/world/decorObjects.ts › weapon-rack): a stand-alone rack of dark iron, two uprights on
// splayed feet with a top rail, a middle rail and a low rail, and finials on top. In it stand the game's own weapon
// models at the size a character holds them: the Plain Bastard Sword and Plain Gladius hilt up, the Plain Battleaxe
// and Plain Hatchet head up; a Plain Shortbow hangs on the outside of each upright. A small open barrel of arrows
// stands at its front right.
// Built facing +z (the rack's front), on one tile.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { box, frustum } from '../../core/primitives';
import { add, mul, mulC, rotY, rotZ, type RGB, type Vec3 } from '../../core/vec';
import { buildModel } from '../../core/build';
import { embed } from '../../core/embed';
import { extentAlong } from '../../core/hold';
import { ITEM_SEED } from '../../core/link';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { HELD_LENGTH } from '../../equip';
import { WEAPON_ROLL } from '../_weapon';
import { DARK_WOOD, barrel, decorEntry } from '../_decor';
import bastardSword from '../weapons/plain-bastard-sword';
import gladius from '../weapons/plain-gladius';
import battleaxe from '../weapons/plain-battleaxe';
import hatchet from '../weapons/plain-hatchet';
import shortbow from '../weapons/plain-shortbow';
import type { WeaponType } from '../../../data/gear/types';

const IRON: RGB = [38, 40, 46];
/** The rails' tops and the finials, catching light. */
const IRON_TOP: RGB = [56, 58, 66];
/** The arrows: shafts and their fletching (one of these per arrow). */
const SHAFT: RGB = [96, 74, 50];
const FLETCH: RGB[] = [[150, 140, 120], [122, 44, 38], [64, 62, 60]];
/** Inside the open barrel. */
const HOLLOW: RGB = [14, 11, 9];

/** The rack: its uprights' x, the z of its frame, its height, and the rails' heights. */
const UX = 0.38, RZ = -0.14, RH = 0.78;
const RAILS = [0.1, 0.44, 0.74];
/** How far off the floor the weapons stand. */
const LIFT = 0.02;

/** Each weapon in the rack: its design, its type (its held length), where it stands along the rack, and which end is up. */
const RACKED: { design: Design; type: WeaponType; x: number; hiltUp: boolean }[] = [
  { design: bastardSword, type: '2h Swords', x: -0.24, hiltUp: true },
  { design: gladius, type: '1h Swords', x: -0.09, hiltUp: true },
  { design: battleaxe, type: '2h Axes', x: 0.07, hiltUp: false },
  { design: hatchet, type: '1h Axes', x: 0.23, hiltUp: false },
];

/**
 * How a weapon design stands upright at its held length: its scale, and its extent along its length (built along
 * +y, then rolled by WEAPON_ROLL; measured on its finished item model, as embed builds it).
 */
function upright(design: Design, type: WeaponType): { s: number; lo: number; hi: number } {
  const [lo, hi] = extentAlong(buildModel(design, ITEM_SEED).mesh, rotZ([0, 1, 0], WEAPON_ROLL));
  return { s: ((HELD_LENGTH[type] ?? 0.5) * CHARACTER_HEIGHT) / (hi - lo), lo, hi };
}

/** The tallest racked weapon's top: the model's top (it is built at its true size). */
const TOP = Math.max(...RACKED.map((r) => { const u = upright(r.design, r.type); return LIFT + (u.hi - u.lo) * u.s; }));

/** A weapon standing in the rack at x, its lower end LIFT off the floor, its flat side to the front. */
function rackWeapon(m: Mesh, design: Design, type: WeaponType, x: number, hiltUp: boolean): void {
  const { s, lo, hi } = upright(design, type);
  embed(m, design, ITEM_SEED, (p) => {
    const q = rotZ(p, -WEAPON_ROLL); // its length up y
    const r = hiltUp ? rotZ(q, Math.PI) : q;
    return add(r, [x, LIFT - (hiltUp ? -hi * s : lo * s), RZ + 0.07]);
  }, s);
}

/** A bow hanging on the outside of an upright (side -1 left, 1 right), its limbs up and down, its face to the side. */
function hangBow(m: Mesh, side: number): void {
  const { s, lo, hi } = upright(shortbow, 'Bows');
  const mid = (lo + hi) / 2;
  embed(m, shortbow, ITEM_SEED, (p) => {
    const q = rotZ(p, -WEAPON_ROLL);
    return add(rotY(add(q, [0, -mid * s, 0]), (side * Math.PI) / 2), [side * (UX + 0.05), 0.46, RZ]);
  }, s);
}

/** The arrow barrel at p: small and open, a sheaf of arrows standing in it, fanned a little sideways. */
function arrowBarrel(m: Mesh, p: Vec3, rf: (a: number, b: number) => number, pick: <T>(xs: readonly T[]) => T): void {
  const h = 0.24, r = 0.1;
  barrel(m, p, h, r, mulC(DARK_WOOD, rf(0.94, 1.06)), { lid: HOLLOW });
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rf(-0.3, 0.3), d = k === 0 ? 0 : 0.045;
    const base = add(p, [Math.cos(a) * d, h - 0.06, Math.sin(a) * d]);
    // Fanned outward, mostly to the sides (never toward or away from the camera)
    const tip = add(base, [Math.cos(a) * 0.06 + rf(-0.02, 0.02), 0.3 + rf(-0.03, 0.03), Math.sin(a) * 0.025]);
    const dir = add(tip, mul(base, -1));
    frustum(m, base, tip, 0.007, 0.007, 3, SHAFT, { j: 0.08, caps: false });
    // Fletching near the top (arrows stand point down, their heads in the barrel)
    frustum(m, add(base, mul(dir, 0.74)), add(base, mul(dir, 0.95)), 0.018, 0.014, 3, pick(FLETCH), { j: 0.1 });
  }
}

const design: Design = {
  ...decorEntry('weapon-rack'),
  category: 'decor',
  fit: { kind: 'standing', height: TOP, maxRadius: 0.9 },
  budget: 2450,
  build(c) {
    const m = c.mesh;
    const { rf, pick } = c;
    m.anchor('feet', [0, 0, 0]);

    // The frame: two uprights on splayed feet, finials on top, three rails between them
    m.part('rack');
    for (const sx of [-1, 1]) {
      const x = sx * UX;
      box(m, [x, RH / 2, RZ], [0.04, RH, 0.04], IRON, 0.01, { j: 0.1 });
      box(m, [x, 0.02, RZ], [0.05, 0.04, 0.36], IRON, 0.01, { j: 0.1 });
      for (const sz of [-1, 1]) frustum(m, [x, 0.12, RZ], [x, 0.03, RZ + sz * 0.16], 0.012, 0.012, 4, IRON, { j: 0.08, caps: false });
      frustum(m, [x, RH, RZ], [x, RH + 0.06, RZ], 0.03, 0.002, 4, IRON_TOP, { j: 0.08 });
      box(m, [x, RH + 0.005, RZ], [0.06, 0.012, 0.06], IRON_TOP, 0.01);
    }
    for (const y of RAILS) {
      box(m, [0, y, RZ], [2 * UX, 0.03, 0.035], IRON, 0.008, { j: 0.1 });
      box(m, [0, y + 0.017, RZ], [2 * UX, 0.006, 0.037], IRON_TOP, 0);
    }
    // The low rail's front bar, the weapons' ends standing between the two
    box(m, [0, RAILS[0], RZ + 0.14], [2 * UX, 0.03, 0.03], IRON, 0.008, { j: 0.1 });
    for (const sx of [-1, 1]) box(m, [sx * UX, RAILS[0], RZ + 0.07], [0.03, 0.03, 0.14], IRON, 0.008);

    // The weapons in it, and a bow on each side
    for (const r of RACKED) rackWeapon(m, r.design, r.type, r.x, r.hiltUp);
    for (const side of [-1, 1]) hangBow(m, side);

    // The arrow barrel at its front right
    arrowBarrel(m, [0.3 + rf(-0.02, 0.02), 0, 0.27 + rf(-0.02, 0.02)], rf, pick);

    return 'Weapon Rack';
  },
};
export default design;
