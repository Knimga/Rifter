// A map's board as drawn on screen in the game view (camera.ts): its pixel box, the CSS transform that
// lays the flat DOM tile grid on the floor, and where world points land. Pure TS; used by the maps
// (components/mapParts.tsx Board), the 3D model layer and the forge's game view.
import { GAME_CAMERA, floorMatrix, rad, viewProject, type ViewAngles } from './camera';

/** Edge length of one tile, px (before the view's foreshortening). The one size the maps and the forge's game view use. */
export const TILE_SIZE = 60;

/**
 * How far above the floor (in world tiles) the board leaves room for: the tallest model plus the bars
 * over its head, for units standing on the board's top edge.
 */
const BOARD_HEADROOM = 2.2;

/** A grid of cols x rows tiles as drawn on screen: its pixel box, and where world points land in it. */
export interface BoardLayout {
  cols: number;
  rows: number;
  tilePx: number;
  view: ViewAngles;
  /** Size of the board's box, px. Everything (floor, model canvas, overlays) is placed inside it. */
  width: number;
  height: number;
  /** Where the world origin (the grid's top-left corner) lands in the box, px. */
  originX: number;
  originY: number;
  /** CSS transform (with transform-origin 0 0) that lays a flat tile grid (tile (x, y) at x·tilePx, y·tilePx) on the floor. */
  floorTransform: string;
  /** Box px of a point at grid (x, y) (fractional: a tile's center is +0.5), `height` world tiles above the floor. */
  toScreen(x: number, y: number, height?: number): { left: number; top: number };
}

export function boardLayout(cols: number, rows: number, tilePx = TILE_SIZE, view: ViewAngles = GAME_CAMERA): BoardLayout {
  const corners = [[0, 0], [cols, 0], [0, rows], [cols, rows]].map(([x, z]) => viewProject([x, 0, z], view));
  const minR = Math.min(...corners.map((c) => c[0])), maxR = Math.max(...corners.map((c) => c[0]));
  const minD = Math.min(...corners.map((c) => c[1])), maxD = Math.max(...corners.map((c) => c[1]));
  const headroom = BOARD_HEADROOM * Math.cos(rad(view.elevationDeg)) * tilePx;
  const originX = -minR * tilePx, originY = -minD * tilePx + headroom;
  const [a, b, c, d] = floorMatrix(view);
  return {
    cols, rows, tilePx, view,
    width: Math.ceil((maxR - minR) * tilePx),
    height: Math.ceil((maxD - minD) * tilePx + headroom),
    originX, originY,
    floorTransform: `matrix(${a}, ${b}, ${c}, ${d}, ${originX}, ${originY})`,
    toScreen(x, y, height = 0) {
      const [r, dn] = viewProject([x, height, y], view);
      return { left: originX + r * tilePx, top: originY + dn * tilePx };
    },
  };
}
