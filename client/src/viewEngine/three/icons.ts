import * as THREE from 'three';
import type { Design, Model } from '../../forge/core/types';
import { buildModel } from '../../forge/core/build';
import { ITEM_SEED } from '../../forge/core/link';
import { tintModel } from '../../forge/core/tint';
import type { RGB } from '../../forge/core/vec';
import { iconCameraFor } from '../../forge/core/stage-config';
import { addForgeLights, fitIconCamera, poseIcon } from './stage';
import { disposeObject, toThree } from './toThree';

/**
 * One shared WebGL context renders every inventory icon to a data URL. Callers cache the URLs.
 * Do NOT create one canvas per inventory slot: browsers cap live WebGL contexts at ~16.
 */
export class IconRenderer {
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera();

  constructor(size = 128) {
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.r.setPixelRatio(1);
    this.r.setSize(size, size);
    this.r.setClearColor(0x000000, 0);
    addForgeLights(this.scene);
  }

  /** Render `model` to a PNG data URL: framed whole (item icons), or by `frame` (it may also pose the object). */
  render(model: Model, frame?: (cam: THREE.PerspectiveCamera, obj: THREE.Object3D) => void): string {
    const obj = toThree(model);
    this.scene.add(obj);
    if (frame) frame(this.cam, obj);
    else {
      const { min, max, view } = poseIcon(obj, model);
      fitIconCamera(this.cam, min, max, 1, view);
    }
    this.r.render(this.scene, this.cam);
    const url = this.r.domElement.toDataURL('image/png');
    this.scene.remove(obj);
    disposeObject(obj);
    return url;
  }

  dispose(): void {
    this.r.dispose();
  }
}

let shared: IconRenderer | null = null;

/** A turn in 3D as a quaternion [x, y, z, w]: an icon drawn with its model turned (renderItemIcon). */
export type IconTurn = readonly [number, number, number, number];

/**
 * Icon (PNG data URL) of an item design. Every item of a design looks the same, so one icon serves them all (one
 * per color, for a tinted model such as a rift key: `tint`; and per turn, for a model shown at different angles, such
 * as the shards' list: `turn`). Drawn without its halos: on the icon's transparent canvas a halo wider than the model
 * fills the frame with a dark square (an icon gets its glow from CSS instead).
 */
export function renderItemIcon(design: Design, tint?: RGB, turn?: IconTurn): string {
  shared ??= new IconRenderer();
  const built = buildModel(design, ITEM_SEED);
  const model = tint ? tintModel(built, tint) : built;
  const bare = { ...model, mesh: { ...model.mesh, halos: [] } };
  if (!turn) return shared.render(bare);
  // Turned: about the middle of the model's bounds (the hub of a shard), and framed by the sphere that holds the whole
  // model about it, so every turn of one model shows at the same size, whichever way it faces
  const { min, max } = bare.mesh.bounds;
  const hub = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const P = bare.mesh.positions;
  let r = 0;
  for (let i = 0; i < P.length; i += 3) r = Math.max(r, Math.hypot(P[i] - hub.x, P[i + 1] - hub.y, P[i + 2] - hub.z));
  return shared.render(bare, (cam, obj) => {
    const q = new THREE.Quaternion(...turn);
    obj.quaternion.copy(q);
    obj.position.copy(hub).negate().applyQuaternion(q);
    const view = iconCameraFor(bare.designId);
    fitIconCamera(cam, [-r, -r, -r], [r, r, r], 1, { ...view, zoom: view.zoom * TURNED_ICON_ZOOM });
  });
}

/**
 * How much closer in a turned icon is framed than its holding sphere asks: no single view fills that sphere (a
 * four-pointed shard's longest, tip to tip, spans about 78% of it), so the icon zooms in to fill its box, and still
 * never clips whichever way it is turned.
 */
const TURNED_ICON_ZOOM = 1.3;

/** How a portrait frames a standing character: turned slightly to the viewer's right, head and shoulders. */
const PORTRAIT = { yaw: 0.45, fovDeg: 22, top: 0.05, bottom: 0.32 };

/**
 * A character's portrait (PNG data URL): head and shoulders, turned slightly to the viewer's right.
 * Framed from the body's height (its overhead anchor), so held gear doesn't change the framing.
 */
export function renderPortrait(model: Model): string {
  shared ??= new IconRenderer();
  return shared.render(model, (cam, obj) => {
    obj.rotation.y = PORTRAIT.yaw;
    const head = model.mesh.anchors.overhead[1] - 0.12; // top of the head (finalize puts overhead 0.12 above it)
    const top = head + PORTRAIT.top * head, bottom = head - PORTRAIT.bottom * head;
    const cy = (top + bottom) / 2, span = top - bottom;
    const fov = (PORTRAIT.fovDeg * Math.PI) / 180;
    const dist = span / 2 / Math.tan(fov / 2);
    cam.fov = PORTRAIT.fovDeg;
    cam.aspect = 1;
    cam.near = dist * 0.1;
    cam.far = dist * 4;
    cam.position.set(0, cy + dist * 0.08, dist);
    cam.lookAt(0, cy, 0);
    cam.updateProjectionMatrix();
  });
}
