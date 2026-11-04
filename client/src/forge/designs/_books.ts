// Books and reading things lying on a table (the Enchanter's Table, the Round Reading Table): books, a stack of them,
// an open tome, and a candle. Built at true size (tile units), on a surface at `c[1]`.
// Files starting with "_" are NOT registered as designs.
import type { Mesh } from '../core/mesh';
import { bipyr, box, frustum } from '../core/primitives';
import { add, mulC, rotY, rotZ, type RGB, type Vec3 } from '../core/vec';

/** Pages' color (a book's page block, an open tome's pages). */
export const PAGE: RGB = [176, 160, 124];
/** A scroll's parchment. */
export const PARCHMENT: RGB = [150, 134, 102];
/** Leather covers, a few to vary books by. */
export const LEATHER: RGB[] = [[74, 30, 34], [32, 56, 46], [36, 42, 70], [66, 48, 30]];
/** A candle's wax and its flame. */
const WAX: RGB = [190, 178, 150];
const FLAME: RGB = [255, 196, 110];

/** A book lying flat: its cover, and its page block showing along its front and sides. Centered on `c` (its bottom). */
export function book(m: Mesh, c: Vec3, size: Vec3, yaw: number, cover: RGB): void {
  const from = m.faces.length;
  box(m, [0, size[1] / 2, 0], size, cover, 0.1);
  box(m, [0.008, size[1] / 2, 0.006], [size[0] - 0.012, size[1] * 0.72, size[2] - 0.004], PAGE, 0.06);
  m.xf(from, (p) => add(rotY(p, yaw), c));
}

/**
 * A book standing upright on `c` (its bottom's middle), its spine to the front (+z): `size` its thickness (x), height
 * and depth; `lean` tips it sideways about its bottom (radians, + toward -x), as a book resting against its neighbour.
 * A darker band runs across its spine near the top and the bottom.
 */
export function uprightBook(m: Mesh, c: Vec3, size: Vec3, lean: number, cover: RGB): void {
  const from = m.faces.length;
  const [t, h, d] = size;
  box(m, [0, h / 2, 0], size, cover, 0.08);
  for (const y of [h * 0.14, h * 0.86]) box(m, [0, y, d / 2 + 0.002], [t * 1.02, h * 0.05, 0.004], mulC(cover, 0.6), 0);
  m.xf(from, (p) => add(rotZ(p, lean), c));
}

/** A bookend standing on `c`: a foot under the books and an upright plate holding them up, the plate toward -x. */
export function bookend(m: Mesh, c: Vec3, h: number, d: number, metal: RGB): void {
  box(m, add(c, [0.025, 0.003, 0]), [0.05, 0.006, d], metal, 0.05);
  box(m, add(c, [0, h / 2, 0]), [0.008, h, d], metal, 0.05);
}

/** A rolled scroll lying along `yaw` on `c`: parchment with darker rolled ends. */
export function scroll(m: Mesh, c: Vec3, len: number, r: number, yaw: number): void {
  const from = m.faces.length;
  frustum(m, [-len / 2, r, 0], [len / 2, r, 0], r, r, 6, PARCHMENT, { j: 0.1 });
  for (const s of [-1, 1]) frustum(m, [s * (len / 2), r, 0], [s * (len / 2 + 0.012), r, 0], r * 0.55, r * 0.55, 6, LEATHER[3], { j: 0.06 });
  m.xf(from, (p) => add(rotY(p, yaw), c));
}

/** A stack of books on `c`, each turned a little its own way. */
export function bookStack(m: Mesh, c: Vec3, books: { size: Vec3; yaw: number; cover: RGB }[]): void {
  let y = 0;
  for (const b of books) {
    book(m, add(c, [0, y, 0]), b.size, b.yaw, b.cover);
    y += b.size[1];
  }
}

/**
 * An open tome lying on `at`, turned `yaw` (its reader at +z before the turn): its leather cover, two page blocks rising
 * a little from the spine, the gutter between them; `glyph`, a glowing glyph on its right-hand page with a halo.
 * `k` scales it (1: 0.32 x 0.23 open).
 */
export function openTome(m: Mesh, at: Vec3, yaw: number, cover: RGB, glyph?: { color: RGB; halo: RGB }, k = 1): void {
  const from = m.faces.length;
  box(m, [0, 0.008 * k, 0], [0.32 * k, 0.016 * k, 0.23 * k], cover, 0.06);
  for (const s of [-1, 1]) {
    const p0 = m.faces.length;
    box(m, [s * 0.075 * k, 0.018 * k, 0], [0.145 * k, 0.022 * k, 0.21 * k], PAGE, 0.05);
    m.xf(p0, (p) => rotZ(p, -s * 0.07));
  }
  box(m, [0, 0.03 * k, 0], [0.012 * k, 0.012 * k, 0.21 * k], mulC(PAGE, 0.6), 0); // the gutter
  if (glyph) box(m, [0.075 * k, 0.034 * k, 0.01 * k], [0.06 * k, 0.003 * k, 0.06 * k], glyph.color, 0, { e: 0.8 });
  m.xf(from, (p) => add(rotY(p, yaw), at));
  if (glyph) m.halo(add(at, [0, 0.05 * k, 0]), 0.1 * k, glyph.halo);
}

/** A candle standing on `c`, `h` tall, its flame lit, with a warm halo of radius `glow`. */
export function candle(m: Mesh, c: Vec3, h = 0.11, glow = 0.1): void {
  frustum(m, c, add(c, [0, h, 0]), 0.022, 0.02, 6, WAX, { j: 0.08 });
  bipyr(m, add(c, [0, h + 0.025, 0]), 0.012, 0.022, 4, FLAME, { e: 1 });
  m.halo(add(c, [0, h + 0.03, 0]), glow, FLAME);
}
