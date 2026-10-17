// Renderer-agnostic public API. Nothing exported from here imports three.js.
export { buildModel, describeParams } from './core/build';
export { hashSeed, mulberry32 } from './core/rng';
export { instanceSeed, linkedDesign, buildLinkedModel } from './core/link';
export { yawFromGridMove, smoothYaw, turnToward, shortestAngle } from './core/facing';
export { GAME_CAMERA, ICON_CAMERA, LIGHT, obliqueProject, obliqueLift } from './core/stage-config';
export type { Design, Model, ModelLink, MeshData, FitSpec, ParamDef, Params, Category } from './core/types';
