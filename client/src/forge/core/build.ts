import { BuildCtx } from './ctx';
import { finalize } from './finalize';
import { bake } from './mesh';
import { itemGroundPitch } from './stage-config';
import type { Design, Model } from './types';

/**
 * Seed in, finished renderer-agnostic model out. Pure and deterministic.
 * `hold` (character designs only): how the arms hold the equipped weapon; see BuildCtx.hold.
 */
export function buildModel(design: Design, seed: number, hold?: string): Model {
  const c = new BuildCtx(seed >>> 0, hold);
  const name = design.build(c);
  finalize(c.mesh, design.fit);
  return {
    designId: design.id,
    seed: seed >>> 0,
    name,
    mesh: bake(c.mesh),
    groundPitch: design.fit.kind === 'item' ? itemGroundPitch(design.fit) : undefined,
    motion: design.motion,
  };
}
