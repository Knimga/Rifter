// Tinted models: one model drawn in many colors (forge category "Rifts & Keys": the rift and the keystone, each
// painted in a dungeon's riftColor). A design marks the faces and halos that take the tint (FaceOpts.tint,
// Mesh.halo's tint) with a Tone: how much of the tint, and of its deep shade, they add to their own color. The
// model itself never depends on the tint (it builds, caches and lints like any other); the color is applied when
// it is drawn: tintModel, by the game's renderer and the forge's views. Pure TS.
import type { Model, Tone } from './types';
import type { RGB } from './vec';

/** The tint itself, and its deep shade (tintDeep). */
export const TINT: Tone = [1, 0];
export const TINT_DEEP: Tone = [0, 1];

/**
 * A tint's deep shade: darker and more saturated, pushed toward its strongest channel (each channel squared,
 * then scaled), so a fiery orange deepens to ember red and a pale green to moss. Fits the shades the rifts were
 * hand-tuned with.
 */
export const tintDeep = (c: RGB): RGB => c.map((v) => 0.69 * 255 * (v / 255) ** 2) as RGB;

/** True if the model has anything tinted (it looks right only drawn with tintModel). */
export const isTinted = (model: Model): boolean => !!model.mesh.tint || model.mesh.halos.some((h) => h.t);

/**
 * The model painted in `color` (0..255): its tinted faces and halos take the tint (TINT) and its deep shade. Only
 * those of `parts` (part names), if given: a model holding two tinted things paints each in its own color with one
 * call per color (the active Rifter's keystone in the new key's color while its rift, closing, keeps the old one).
 */
export function tintModel(model: Model, color: RGB, parts?: readonly string[]): Model {
  const { mesh } = model;
  if (!isTinted(model)) return model;
  const bright = color.map((v) => v / 255), deep = tintDeep(color).map((v) => v / 255);
  const only = parts && new Set(parts.map((p) => mesh.partNames.indexOf(p)));
  const takes = (part: number) => !only || only.has(part);
  /** `base` (colors, or a fade's start colors) with the tint added where the mesh takes it. */
  const paint = (base: Float32Array): Float32Array => {
    if (!mesh.tint) return base;
    const w = mesh.tint, out = new Float32Array(base);
    for (let t = 0; t < mesh.triCount; t++) {
      if (!takes(mesh.part[t])) continue;
      for (let v = t * 3; v < t * 3 + 3; v++)
        for (let k = 0; k < 3; k++) out[v * 3 + k] = Math.min(1, base[v * 3 + k] + w[v * 2] * bright[k] + w[v * 2 + 1] * deep[k]);
    }
    return out;
  };
  const colors = paint(mesh.colors);
  const fromColors = mesh.fromColors && paint(mesh.fromColors);
  const halos = mesh.halos.map((h) => (h.t && takes(h.part)
    ? { ...h, c: h.c.map((c, k) => Math.min(1, c + h.t![0] * bright[k] + h.t![1] * deep[k])) as [number, number, number] }
    : h));
  return { ...model, mesh: { ...mesh, colors, ...(fromColors && { fromColors }), halos } };
}
