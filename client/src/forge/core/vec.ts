export type Vec3 = [number, number, number];
export type RGB = [number, number, number]; // sRGB, 0..255

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** The point `t` of the way from a to b. */
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * The rotation that turns +y onto the unit vector `d` (Rodrigues): build a piece upright along +y, then stand it
 * along any direction (a leaf, a horn, a strand).
 */
export function alignY(d: Vec3): (p: Vec3) => Vec3 {
  const a = cross([0, 1, 0], d), s = len(a), co = d[1];
  if (s < 1e-6) return (p) => (co > 0 ? p : [p[0], -p[1], -p[2]]);
  const k = norm(a);
  return (p) => {
    const kp = cross(k, p), kd = dot(k, p);
    return [p[0] * co + kp[0] * s + k[0] * kd * (1 - co), p[1] * co + kp[1] * s + k[1] * kd * (1 - co), p[2] * co + kp[2] * s + k[2] * kd * (1 - co)];
  };
}

/** Rotation about Y. Positive angle turns +z toward +x (same as three.js rotation.y). */
export const rotY = (p: Vec3, a: number): Vec3 => [
  p[0] * Math.cos(a) + p[2] * Math.sin(a),
  p[1],
  -p[0] * Math.sin(a) + p[2] * Math.cos(a),
];
/** Rotation about X. Positive angle turns +y toward +z (same as three.js rotation.x). */
export const rotX = (p: Vec3, a: number): Vec3 => [
  p[0],
  p[1] * Math.cos(a) - p[2] * Math.sin(a),
  p[1] * Math.sin(a) + p[2] * Math.cos(a),
];
export const rotZ = (p: Vec3, a: number): Vec3 => [
  p[0] * Math.cos(a) - p[1] * Math.sin(a),
  p[0] * Math.sin(a) + p[1] * Math.cos(a),
  p[2],
];

export const hslRGB = (h: number, s: number, l: number): RGB => {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
};
export const mulC = (c: RGB, s: number): RGB => [Math.min(255, c[0] * s), Math.min(255, c[1] * s), Math.min(255, c[2] * s)];
export const mixC = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
