/**
 * Facing. Model space: a model at yaw 0 faces +z. World space: x = grid x, z = grid y,
 * tile (gx, gy) is centered at (gx + 0.5, gy + 0.5). Grid +y is "down the screen", toward the camera,
 * so yaw 0 faces the camera/south.
 *
 * Facing is VIEW state. It lives next to the entity's renderer object, never in the game simulation.
 */
export const TAU = Math.PI * 2;

/** Yaw for a step on the grid. (dx, dy) is the movement delta in grid cells. */
export function yawFromGridMove(dx: number, dy: number): number {
  return Math.atan2(dx, dy);
}

/** Signed shortest rotation from `from` to `to`, in (-PI, PI]. */
export function shortestAngle(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export function turnToward(current: number, target: number, maxStep: number): number {
  const d = shortestAngle(current, target);
  return Math.abs(d) <= maxStep ? target : current + Math.sign(d) * maxStep;
}

/** Call once per frame. turnMsPer180 = how long a half-turn takes (150-200 feels right). */
export function smoothYaw(current: number, target: number, dtMs: number, turnMsPer180 = 170): number {
  return turnToward(current, target, (Math.PI * dtMs) / turnMsPer180);
}
