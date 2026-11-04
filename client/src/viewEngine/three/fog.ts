// Fog of war, drawn by the map renderer: one fog function in a shader, applied to everything 3D by where it
// stands. Each pixel is fogged by the tile under it (its world x/z), so a model is fogged with its own tile and
// a visible model is never cut off by fog over the tile behind it. The HTML floor under the 3D canvas (and a
// map's 3D floor beneath it) is covered by a ground-level fog sheet using the same function; its 3D walls take
// it directly, like the models.
//
// The fog state is a small texture, one texel per tile: R = unseen, G = seen before but not now (explored).
// Read smoothly and shaped so each tile's fog starts at its edge with the visible tile (visible tiles stay
// clear to their edges), warped and textured by drifting cloud noise.
import * as THREE from 'three';
import { haloShader, makeGlass, makeHalo, makeLit, makeUnlit, partialGlowShader, sharedMaterials } from './toThree';

/** The fog of a zone (the game's: hooks/useFogOfWar FogState): its size, and the tiles seen now and before ('x,y'). */
export interface FogInput {
  cols: number;
  rows: number;
  visible: ReadonlySet<string>;
  explored: ReadonlySet<string>;
  /** It never changes (the Sanctum's: only darkening the map's edges): its clouds don't drift. */
  still?: boolean;
}

/** How much a tile seen before (but not now) is fogged: dimmed, still readable. */
const EXPLORED_FOG = 0.55;
/** How far a hit's flash washes a model toward white (0..1). */
const FLASH_WHITE = 0.7;
/** How long a tile takes to clear or fog over (ms). */
const FADE_MS = 300;
/** The most the clouds move between two drawn frames (ms of drift): after the map sat idle, they carry on, not jump. */
const MAX_DRIFT_STEP_MS = 50;

// The fog function (GLSL): fog amount and color at a world position, shared by every fogged material
const FOG_GLSL = /* glsl */ `
uniform sampler2D fogTex;
uniform vec2 fogSize;
uniform float fogTime;
uniform vec3 fogColor;
uniform float fogOn;
varying vec3 vFogWorld;

float fogHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fogNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fogHash(i), fogHash(i + vec2(1.0, 0.0)), u.x), mix(fogHash(i + vec2(0.0, 1.0)), fogHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Cloud texture: two octaves, drifting slowly
float fogClouds(vec2 p) {
  vec2 drift = fogTime * vec2(0.05, 0.03);
  return 0.65 * fogNoise(p * 0.7 + drift) + 0.35 * fogNoise(p * 1.6 - drift * 1.4);
}
// The fog at world x/z before its patches (fogAmount): 0 = clear .. 1 = unseen, its edge warped by the clouds
float fogBase(vec2 xz, float clouds) {
  // Warp where the fog is read a little, so its edge is cloudy rather than following the tile grid
  vec2 uv = (xz + (clouds - 0.5) * 0.7) / fogSize;
  vec4 t = texture2D(fogTex, uv);
  // Where there is fog at all (unseen or explored): its edge only against tiles in sight, starting at their
  // border so they stay clear to it. How dark it is blends from dim (explored) to black (unseen), with no
  // gap where the two meet.
  float fogged = t.r + t.g;
  float coverage = smoothstep(0.5, 1.0, fogged);
  float darkness = mix(${EXPLORED_FOG.toFixed(2)}, 1.0, t.r / max(fogged, 0.001));
  return coverage * darkness;
}
// 0 = clear .. 1 = unseen black, at world x/z: the fog, thicker and thinner in patches
float fogAmount(vec2 xz) {
  if (fogOn < 0.5) return 0.0;
  float clouds = fogClouds(xz);
  return clamp(fogBase(xz, clouds) * (0.88 + 0.24 * clouds), 0.0, 1.0);
}
// Unseen through and through (not just in a dark patch): nothing there is drawn at all
bool fogHides(vec2 xz) {
  return fogOn > 0.5 && fogBase(xz, fogClouds(xz)) > 0.97;
}
`;

/** Add the fog to a material's shader: world position out of the vertex shader, the fog blended in last. */
function fogShader(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: Record<string, THREE.IUniform>): void {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFogWorld;')
    .replace('#include <project_vertex>', '#include <project_vertex>\n\tvFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FOG_GLSL}`)
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>
\tfloat fogA = fogAmount(vFogWorld.xz);
\tif (fogA > 0.985 || fogHides(vFogWorld.xz)) discard; // unseen: nothing there at all (no dark silhouette over visible tiles or past the map's edge)
\tgl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogA);`);
}

export class FogOfWar {
  /** The fog sheet over the HTML floor; add to the scene. */
  readonly sheet: THREE.Mesh;
  /** Fogged copies of the shared model materials (toThree's sharedMaterials), for models on the map. */
  private materials: Map<THREE.Material, THREE.Material>;
  /** Each fogged material's flash (flash): the same, washed toward white. */
  private flashed: Map<THREE.Material, THREE.Material>;
  private uniforms: Record<string, THREE.IUniform>;
  private texture: THREE.DataTexture | null = null;
  private data = new Uint8Array(4);
  /** Each tile's fog now (R, G per tile, 0..1): fading from `from` to `target` over FADE_MS from `fadeStart`. */
  private current = new Float32Array(0);
  private from = new Float32Array(0);
  private target = new Float32Array(0);
  private fadeStart = 0;
  /** The clouds' clock: advances only while the map is drawing (see step). */
  private driftMs = 0;
  /** The fog never changes (FogInput.still): no drift. */
  private still = false;
  /** A fade is running (set changed some tile): step blends toward the targets until it ends. */
  private fading = false;
  private lastStep = 0;
  private cols = 0;
  private rows = 0;

  constructor(color: THREE.ColorRepresentation) {
    this.uniforms = {
      fogTex: { value: null },
      fogSize: { value: new THREE.Vector2(1, 1) },
      fogTime: { value: 0 },
      fogColor: { value: new THREE.Color(color) },
      fogOn: { value: 0 },
    };
    const u = this.uniforms;
    // Each fogged material: its own shader changes (partial glow, halo), then the fog
    type Own = (shader: THREE.WebGLProgramParametersWithUniforms) => void;
    const withFog = <T extends THREE.Material>(m: T, own?: Own, key = own?.name ?? 'plain'): T => {
      m.onBeforeCompile = (shader) => { own?.(shader); fogShader(shader, u); };
      // three.js caches programs by onBeforeCompile's source, the same for every fogged material: key each by its own shader
      m.customProgramCacheKey = () => `fog:${key}`;
      return m;
    };
    // A hit's flash: the color washed toward white before the fog, so a fogged model flashes no brighter than its fog allows
    const flash = (own?: Own): Own => (shader) => {
      own?.(shader);
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>',
        `gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), ${FLASH_WHITE.toFixed(2)});\n#include <dithering_fragment>`);
    };
    this.materials = new Map<THREE.Material, THREE.Material>([
      [sharedMaterials.lit, withFog(makeLit(), partialGlowShader)],
      [sharedMaterials.unlit, withFog(makeUnlit())],
      [sharedMaterials.glass, withFog(makeGlass(), partialGlowShader)],
      [sharedMaterials.halo, withFog(makeHalo(), haloShader)],
    ]);
    // Halos keep their glow through a flash
    this.flashed = new Map<THREE.Material, THREE.Material>([
      [this.materials.get(sharedMaterials.lit)!, withFog(makeLit(), flash(partialGlowShader), 'flash-lit')],
      [this.materials.get(sharedMaterials.unlit)!, withFog(makeUnlit(), flash(), 'flash-unlit')],
      [this.materials.get(sharedMaterials.glass)!, withFog(makeGlass(), flash(partialGlowShader), 'flash-glass')],
    ]);
    // The sheet: fog color, its alpha the fog amount (drawn after the opaque models, so they hide it where in front)
    const sheetMat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    sheetMat.onBeforeCompile = (shader) => {
      fogShader(shader, u);
      // The sheet is the fog itself: alpha = amount, no discard, no tinting of its own color
      shader.fragmentShader = shader.fragmentShader
        .replace('if (fogA > 0.985 || fogHides(vFogWorld.xz)) discard;', '')
        .replace('gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogA);', 'gl_FragColor = vec4(fogColor, fogA);');
    };
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sheetMat);
    this.sheet.rotation.x = -Math.PI / 2;
    this.sheet.renderOrder = -1;
    this.sheet.visible = false;
  }

  /** Give a model's meshes the fogged materials (once, when it is added to the map). */
  apply(obj: THREE.Object3D): void {
    obj.traverse((c) => {
      if (c instanceof THREE.Mesh) c.material = this.materials.get(c.material as THREE.Material) ?? c.material;
    });
  }

  /** Wash a model (its meshes fogged by apply) toward white for a hit's flash (`on`), or back to its own colors. */
  flash(obj: THREE.Object3D, on: boolean): void {
    obj.traverse((c) => {
      if (!(c instanceof THREE.Mesh)) return;
      if (on) {
        const f = this.flashed.get(c.material as THREE.Material);
        if (f) { c.userData.unflashed = c.material; c.material = f; }
      } else if (c.userData.unflashed) {
        c.material = c.userData.unflashed;
        delete c.userData.unflashed;
      }
    });
  }

  /**
   * Draw a model (its meshes fogged by apply) see-through, at `opacity` (0..1; fading it in), or (1) solid again. While
   * faded, its meshes draw with their own copies of their materials (dropped once it is solid).
   */
  fade(obj: THREE.Object3D, opacity: number): void {
    obj.traverse((c) => {
      if (!(c instanceof THREE.Mesh)) return;
      const own = c.userData.unfaded as THREE.Material | undefined;
      if (opacity >= 1) {
        if (own) { (c.material as THREE.Material).dispose(); c.material = own; delete c.userData.unfaded; }
        return;
      }
      if (!own) {
        const base = c.material as THREE.Material, copy = base.clone();
        // Its shader changes (fog, glow, halo) and their program key carry over: clone() copies neither
        copy.onBeforeCompile = base.onBeforeCompile;
        copy.customProgramCacheKey = base.customProgramCacheKey;
        copy.transparent = true;
        c.userData.unfaded = base;
        c.material = copy;
      }
      (c.material as THREE.Material).opacity = opacity;
    });
  }

  /** Whether there is fog to draw. */
  get active(): boolean {
    return this.uniforms.fogOn.value > 0.5;
  }

  /** New fog (null: none). Changed tiles fade toward their new state (see step). */
  set(fog: FogInput | null): void {
    if (!fog) {
      this.uniforms.fogOn.value = 0;
      this.sheet.visible = false;
      this.fading = false;
      return;
    }
    this.still = !!fog.still;
    if (fog.cols !== this.cols || fog.rows !== this.rows) this.resize(fog.cols, fog.rows);
    for (let y = 0; y < fog.rows; y++) {
      for (let x = 0; x < fog.cols; x++) {
        const key = `${x},${y}`, i = (y * fog.cols + x) * 2;
        const visible = fog.visible.has(key);
        this.target[i] = visible || fog.explored.has(key) ? 0 : 1;
        this.target[i + 1] = !visible && fog.explored.has(key) ? 1 : 0;
      }
    }
    // Arriving (fog was off): no fade from nothing, the zone starts as it is. Otherwise every tile fades from
    // where it is now to its new state, over FADE_MS of clock time (so any frame shows the right state).
    if (!this.active) this.current.set(this.target);
    this.from.set(this.current);
    this.fadeStart = performance.now();
    this.fading = this.target.some((v, i) => v !== this.current[i]);
    this.uniforms.fogOn.value = 1;
    this.sheet.visible = true;
    this.upload();
  }

  /**
   * Bring the fog up to `now` (ms): any fade, and its drift while `drifting` (a party member moving); true while
   * a fade is still running (keep drawing). The clouds' clock runs only over drifting frames, so a pause between
   * moves (or frames drawn for anything else) doesn't make them jump.
   */
  step(now: number, drifting: boolean): boolean {
    const gap = this.lastStep ? now - this.lastStep : 0;
    this.lastStep = now;
    if (drifting && !this.still) {
      this.driftMs += Math.min(gap, MAX_DRIFT_STEP_MS);
      this.uniforms.fogTime.value = this.driftMs / 1000;
    }
    // Only while a fade runs: blend every tile toward its target (nothing to do once it has ended)
    if (!this.active || !this.fading) return false;
    const t = Math.min(1, (now - this.fadeStart) / FADE_MS);
    let changing = false;
    for (let i = 0; i < this.current.length; i++) {
      const v = this.from[i] + (this.target[i] - this.from[i]) * t;
      if (v !== this.current[i]) { this.current[i] = v; changing = true; }
    }
    if (changing) this.upload();
    if (t >= 1) this.fading = false;
    return t < 1;
  }

  private resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.current = new Float32Array(cols * rows * 2).fill(1);
    this.from = new Float32Array(cols * rows * 2);
    this.target = new Float32Array(cols * rows * 2);
    this.data = new Uint8Array(cols * rows * 4);
    this.texture?.dispose();
    this.texture = new THREE.DataTexture(this.data, cols, rows, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.uniforms.fogTex.value = this.texture;
    this.uniforms.fogSize.value.set(cols, rows);
    // The sheet covers the zone: tile (x, y) is world x..x+1, z y..y+1, at floor height (a hair above)
    this.sheet.scale.set(cols, rows, 1);
    this.sheet.position.set(cols / 2, 0.002, rows / 2);
  }

  private upload(): void {
    if (!this.texture) return;
    for (let t = 0; t < this.cols * this.rows; t++) {
      this.data[t * 4] = Math.round(this.current[t * 2] * 255);
      this.data[t * 4 + 1] = Math.round(this.current[t * 2 + 1] * 255);
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture?.dispose();
    this.sheet.geometry.dispose();
    (this.sheet.material as THREE.Material).dispose();
    for (const m of [...this.materials.values(), ...this.flashed.values()]) m.dispose();
  }
}
