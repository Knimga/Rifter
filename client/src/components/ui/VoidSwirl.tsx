// The opening's background (screens/OpeningScreen.tsx): see-through violet and blue light whirling over black, like
// sinking through the void. A fragment shader on its own canvas (plain WebGL, no three.js): flowing noise twisted
// into a slow whirlpool (tighter toward the middle), its arms in the palette's swirl colors (--rift-swirl-violet,
// --rift-swirl-blue), fading out toward the screen's edges. Drawn at half resolution: it is all soft light.
import { useEffect, useRef } from 'react';

const VERTEX = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

const FRAGMENT = `
precision mediump float;
uniform vec2 res;
uniform float t;
uniform vec3 violet;
uniform vec3 blue;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
  float r = length(uv);
  // The whirl: each ring turned by more the nearer the middle it is, and all of it turning slowly
  float a = atan(uv.y, uv.x) + 1.8 / (r + 0.3) - t * 0.22;
  vec2 p = vec2(cos(a), sin(a)) * r * 2.4;
  // Flowing noise, warped by itself: wisps rather than blobs
  vec2 q = vec2(fbm(p + t * 0.06), fbm(p + vec2(5.2, 1.3) - t * 0.05));
  float n = fbm(p + 2.6 * q + t * 0.04);
  float arms = smoothstep(0.42, 0.86, n);
  vec3 color = mix(violet, blue, clamp(q.x * 1.6 - 0.35, 0.0, 1.0));
  float fade = smoothstep(1.2, 0.1, r);
  // Faint, like light seen through dark water: the black shows through it
  gl_FragColor = vec4(color * (arms * 0.4 + 0.04) * fade, 1.0);
}`;

/** A CSS color variable (a palette hex color) as 0..1 RGB. */
function cssColor(name: string): [number, number, number] {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace('#', '');
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export default function VoidSwirl({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext('webgl', { antialias: false, alpha: false });
    if (!canvas || !gl) return;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    // One triangle covering the screen
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(gl.getUniformLocation(prog, 'violet'), cssColor('--rift-swirl-violet'));
    gl.uniform3fv(gl.getUniformLocation(prog, 'blue'), cssColor('--rift-swirl-blue'));
    const res = gl.getUniformLocation(prog, 'res'), time = gl.getUniformLocation(prog, 't');

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      // Half the screen's pixels, stretched to fill it (soft light loses nothing)
      const w = Math.ceil(canvas.clientWidth / 2), h = Math.ceil(canvas.clientHeight / 2);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(res, w, h);
      gl.uniform1f(time, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // (Its context is kept: a canvas gives the same one back, so losing it would leave a remount, as Strict Mode's
    // second run, drawing nothing. It goes with the canvas.)
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden="true" className={`block w-full h-full ${className}`} />;
}
