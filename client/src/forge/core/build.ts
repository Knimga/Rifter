import { BuildCtx } from './ctx';
import { finalize } from './finalize';
import { bake } from './mesh';
import type { Design, Model, ParamDef, Params } from './types';

/** Seed + optional pinned params in, finished renderer-agnostic model out. Pure and deterministic. */
export function buildModel(design: Design, seed: number, overrides: Params = {}): Model {
  const c = new BuildCtx(seed >>> 0, overrides);
  const name = design.build(c);
  finalize(c.mesh, design.fit);
  return {
    designId: design.id,
    version: design.version,
    seed: seed >>> 0,
    name,
    params: c.resolved,
    mesh: bake(c.mesh),
  };
}

/** Parameter schema, discovered by running one build. The builder page uses it to draw controls. */
export function describeParams(design: Design): Record<string, ParamDef> {
  const c = new BuildCtx(1, {});
  design.build(c);
  return c.schema;
}
