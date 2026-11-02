// Shared by the pale spiders (Pale Creeper, Pale Broodmother): their bone-white palette, their front end (stout
// chelicerae in dark, curved fangs with a faint venom glow, a pedipalp beside each) and their cluster of black eyes.
// Each spider builds its own body and legs. The pieces are drawn at the Pale Creeper's size, then placed (`place`)
// and scaled (`k`) for a bigger spider.
// Files starting with "_" are NOT registered as designs.
import type { BuildCtx } from '../core/ctx';
import type { ColorFn, Mesh } from '../core/mesh';
import { bipyr, frustum, jointedLimb } from '../core/primitives';
import { add, hslRGB, lerp3, mul, mulC, norm, type RGB, type Vec3 } from '../core/vec';

/** Glossy black eyes, unlit (they catch only a little light on their facets). */
export const SPIDER_EYE: RGB = [14, 12, 14];
/** The faint venom glow about each fang: small and subtle, a poison green. */
const VENOM_HALO: RGB = [150, 236, 112];
const VENOM_HALO_R = 0.022;
/** The fangs: dark, so they read against the pale body. */
const FANG: RGB = [46, 34, 30], FANG_TIP: RGB = [22, 16, 14];

/** A pale spider's colors: ivory to bone white, lighter on top, its undersides and joints a warmer, duller bone. */
export interface SpiderPalette {
  TOP: RGB;
  SIDE: RGB;
  UNDER: RGB;
  JOINT: RGB;
  /** By the face's normal: TOP on top, UNDER below, SIDE between. */
  byLight: ColorFn;
}

/** A pale spider's palette, drawn from the seed (a narrow range of ivory). */
export function spiderPalette(c: BuildCtx): SpiderPalette {
  const { rf } = c;
  const hue = rf(36, 48), sat = rf(16, 28);
  const TOP = hslRGB(hue, sat, rf(80, 86)), SIDE = hslRGB(hue, sat, rf(66, 72)), UNDER = hslRGB(hue - 8, sat * 0.8, rf(46, 52));
  const JOINT = hslRGB(hue - 6, sat, rf(56, 62));
  return { TOP, SIDE, UNDER, JOINT, byLight: (_, n) => (n[1] > 0.4 ? TOP : n[1] < -0.3 ? UNDER : SIDE) };
}

/** A leg or pedipalp through its joints (jointedLimb), tapering from `w` at its root; each segment its own color. */
export function spiderJointed(m: Mesh, joints: Vec3[], w: number, cols: RGB[], sides = 4): void {
  const r = joints.map((_, i) => w * (1 - (i / joints.length) * 0.75));
  jointedLimb(m, joints, r, cols, { sides, j: 0.12 });
}

/**
 * One side's (`s`: 1 left, -1 right) front end, at the Pale Creeper's size, then placed and scaled `k`: a stout
 * chelicera hanging down and forward from under the cephalothorax's front edge, a long dark fang curving down and in
 * from it to a sharp black tip, with a venom glow; and a short pedipalp beside it, reaching forward and down.
 * `venom`: the glow's strength and size, relative to a creeper's faint one (a strength over 1 lays a second halo over
 * the first, the halo's green being near full already).
 */
export function spiderMouthparts(
  m: Mesh, s: number, p: SpiderPalette, place: (q: Vec3) => Vec3 = (q) => q, k = 1,
  venom: { strength: number; size: number } = { strength: 1, size: 1 },
): void {
  const base: Vec3 = [s * 0.028, 0.13, 0.115], mid: Vec3 = [s * 0.034, 0.078, 0.158];
  frustum(m, place(base), place(mid), 0.024 * k, 0.018 * k, 6, p.byLight, { j: 0.1 });
  const bend: Vec3 = [s * 0.03, 0.042, 0.18], tip: Vec3 = [s * 0.012, 0.018, 0.17];
  frustum(m, place(mid), place(bend), 0.012 * k, 0.008 * k, 5, FANG, { caps: false, j: 0.08 });
  frustum(m, place(bend), place(tip), 0.008 * k, 0.001 * k, 5, FANG_TIP, { j: 0.05 });
  const glowAt = place(lerp3(bend, tip, 0.4)), glowR = VENOM_HALO_R * k * venom.size;
  m.halo(glowAt, glowR, VENOM_HALO);
  if (venom.strength > 1) m.halo(glowAt, glowR, mulC(VENOM_HALO, venom.strength - 1));
  const palpDir = norm([s * 0.5, 0, 1]);
  const p0: Vec3 = [s * 0.05, 0.135, 0.1];
  const palp = [p0, add(add(p0, mul(palpDir, 0.06)), [0, 0.03, 0]), add(add(p0, mul(palpDir, 0.11)), [0, -0.05, 0])];
  spiderJointed(m, palp.map(place), 0.011 * k, [p.SIDE, p.JOINT]);
}

/**
 * The eyes, at the Pale Creeper's size, then placed and scaled `k`: two big ones in front, a row of small ones over
 * them, on the brow. Returns where each is (placed) and its radius, for anything drawn around them.
 */
export function spiderEyes(m: Mesh, place: (q: Vec3) => Vec3 = (q) => q, k = 1): { at: Vec3; r: number }[] {
  const eyes: { at: Vec3; r: number }[] = [];
  for (const s of [1, -1]) {
    const big: Vec3 = [s * 0.017, 0.193, 0.118];
    bipyr(m, place(big), 0.0085 * k, 0.008 * k, 4, SPIDER_EYE, { j: 0.2 });
    eyes.push({ at: place(big), r: 0.0085 * k });
    for (const e of [0.034, 0.052]) {
      const small: Vec3 = [s * e, 0.2, 0.098 - e * 0.4];
      bipyr(m, place(small), 0.0055 * k, 0.005 * k, 3, SPIDER_EYE, { j: 0.2 });
      eyes.push({ at: place(small), r: 0.0055 * k });
    }
  }
  return eyes;
}
