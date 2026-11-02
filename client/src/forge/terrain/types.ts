// A dungeon's terrain: the 3D floor and walls drawn over its tile grid (build.ts). Pure data, like a design.
import type { RGB } from '../core/vec';
import type { Model } from '../core/types';

/** How a dungeon's floor and walls look (DungeonConfig.terrain). Colors are sRGB 0..255, like a design's. */
export interface TerrainStyle {
  floor: {
    color: RGB;
    /** The joints between flagstones, and the darker patches of a rough floor. */
    seam: RGB;
    /**
     * Laid stone (each tile 1 to 4 flagstones), huge irregular stones of many sizes fitted together across the tiles
     * (`cyclopean`, like the walls'), a rough, uneven cave floor, or the same in smaller facets (`rough-fine`).
     */
    pattern: 'flagstones' | 'cyclopean' | 'rough' | 'rough-fine';
    /** 0..1: how uneven the stones lie. Small at any value (units stand on it). */
    bumpiness: number;
  };
  walls: {
    /** Its faces. Its top is derived from it (build.ts WALL_TOP_SHADE): almost black, in the same hue, never veined. */
    color: RGB;
    /**
     * Courses of cut blocks (`masonry`), huge irregular stones of many sizes fitted together across the tiles
     * (`cyclopean`), or a lumpy mass of rock (`rough`).
     */
    finish: 'masonry' | 'cyclopean' | 'rough';
    /** How tall its full walls stand (build.ts WALL_HEIGHTS): 'low' (1.5 tiles) or 'high' (half again). Stubs stay low. */
    height: 'low' | 'high';
    /** 0..1: how much a rough wall bulges, a cyclopean wall's stones swell and a masonry wall's blocks vary. */
    bumpiness: number;
  };
  /**
   * Another color running through the floor and walls: lava (`glow`: lit from within), moss. `share` (0..1) of the
   * surface, as thin winding `cracks` or connected `patches`; a flagstone floor shows them in its joints.
   */
  veins?: { color: RGB; share: number; pattern: 'cracks' | 'patches'; glow?: boolean };
}

/** What a zone's terrain is built from: its grid, its walkable tiles ('x,y') and its doors (wall tiles). */
export interface TerrainInput {
  cols: number;
  rows: number;
  floors: ReadonlySet<string>;
  doors: readonly { x: number; y: number }[];
  style: TerrainStyle;
  /** Seeds the look: the same zone always looks the same. */
  seed: number;
}

/**
 * A zone's terrain as two models in world tiles (tile (x, y) spans x..x+1, z y..y+1): the floor, drawn under the
 * map's HTML floor, and the walls, drawn with the units (they hide what stands behind them).
 */
export interface Terrain {
  floor: Model;
  walls: Model;
}
