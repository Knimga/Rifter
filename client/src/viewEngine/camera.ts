// How the game is viewed: the one camera setting the whole display follows, and its projection.
// Pure TS (no three.js, no React). The game's maps, its 3D model layer and the forge all read from here;
// viewEngine imports from neither the game data nor the forge. Game logic never depends on it.

export type Vec3 = [number, number, number];

/** An orthographic view direction: how far above the ground it looks down, and how far it is turned. */
export interface ViewAngles {
  /** Degrees above the ground plane. 90 = straight down. */
  elevationDeg: number;
  /**
   * Degrees the view is turned about the vertical. 0 = the grid's north (-y) is straight up the screen;
   * 45 = isometric, north up-left (the grid's top-left corner is the diamond's left point).
   */
  yawDeg: number;
}

/**
 * Game view: ISOMETRIC orthographic projection, the one setting the whole display follows: the game's
 * three.js camera, the DOM board (its floor layer is this projection as a CSS transform, see
 * boardLayout), every DOM overlay placed on the board, the forge's game view and forge:sheet.
 * Change a number, save, and everything follows (sensible elevations: about 30-75°).
 */
export const GAME_CAMERA: ViewAngles = {
  elevationDeg: 45,
  yawDeg: 45,
};

export const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * World point -> screen space of an orthographic view, in TILES: [right, down, depth toward the camera].
 * World x = grid x, world z = grid y, world y = height. With yaw θ and elevation e, screen right is the
 * ground direction (cosθ, sinθ) and up the screen is (sinθ, -cosθ) foreshortened by sin e; height rises
 * by cos e. The three.js game camera produces exactly this mapping (fitViewCamera in forge/three/stage.ts).
 */
export function viewProject(p: Vec3, view: ViewAngles = GAME_CAMERA): Vec3 {
  const e = rad(view.elevationDeg), t = rad(view.yawDeg);
  const ahead = p[0] * Math.sin(t) - p[2] * Math.cos(t); // ground distance up the screen
  return [
    p[0] * Math.cos(t) + p[2] * Math.sin(t),
    -(ahead * Math.sin(e) + p[1] * Math.cos(e)),
    -ahead * Math.cos(e) + p[1] * Math.sin(e),
  ];
}

/**
 * The view's ground plane as a CSS matrix(a, b, c, d) for flat px coordinates (x right, y down = grid y):
 * a flat tile grid transformed by it lies exactly where the three.js camera draws the floor.
 */
export function floorMatrix(view: ViewAngles = GAME_CAMERA): [number, number, number, number] {
  const e = rad(view.elevationDeg), t = rad(view.yawDeg);
  return [Math.cos(t), -Math.sin(t) * Math.sin(e), Math.sin(t), Math.cos(t) * Math.sin(e)];
}

/** A direction given for an unturned view (x = screen right, -z = up the screen), turned with the view's yaw. */
export function turnWithView(v: Vec3, view: ViewAngles = GAME_CAMERA): Vec3 {
  const t = rad(view.yawDeg);
  // Rotation about y by -yaw: +x (screen right) -> (cosθ, 0, sinθ), -z (up) -> (sinθ, 0, -cosθ)
  return [v[0] * Math.cos(t) - v[2] * Math.sin(t), v[1], v[0] * Math.sin(t) + v[2] * Math.cos(t)];
}
