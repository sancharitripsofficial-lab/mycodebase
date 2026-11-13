import * as THREE from "three";

/* Helpers shared by the banner scenes: seeded noise, a few procedural textures, sky lighting. */

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Value noise on a lattice that repeats every `px` × `py` cells, so textures built from it tile. */
export function makePeriodicNoise(seed: number) {
  const SIZE = 256;
  const table = new Float32Array(SIZE * SIZE);
  const random = rng(seed);
  for (let i = 0; i < table.length; i++) table[i] = random();
  const at = (x: number, y: number) => table[(y & 255) * SIZE + (x & 255)];
  const mod = (n: number, m: number) => ((n % m) + m) % m;

  const noise = (x: number, y: number, px: number, py: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const xa = mod(x0, px);
    const xb = mod(x0 + 1, px);
    const ya = mod(y0, py);
    const yb = mod(y0 + 1, py);
    const a = at(xa, ya);
    const b = at(xb, ya);
    const c = at(xa, yb);
    const d = at(xb, yb);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  /** u, v in 0..1 across one tile; `fx`, `fy` are whole cycles per tile for the first octave. */
  const fbm = (u: number, v: number, fx: number, fy: number, octaves: number, gain = 0.5) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const px = fx << o;
      const py = fy << o;
      sum += amp * noise(u * px + o * 17.3, v * py + o * 9.1, px, py);
      norm += amp;
      amp *= gain;
    }
    return sum / norm;
  };

  /** Sharp-crested ridges: 0 in the valleys, 1 on the crest lines. */
  const ridged = (u: number, v: number, fx: number, fy: number, octaves: number) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let weight = 1;
    for (let o = 0; o < octaves; o++) {
      const px = fx << o;
      const py = fy << o;
      let n = 1 - Math.abs(2 * noise(u * px + o * 31.7, v * py + o * 13.9, px, py) - 1);
      n *= n * weight;
      weight = clamp01(n * 1.6);
      sum += amp * n;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };

  return { noise, fbm, ridged };
}

/** Tiling RGBA noise for shaders: four unrelated fbm fields, one per channel. */
export function makeNoiseTexture(size: number, seed: number): THREE.DataTexture {
  const n = makePeriodicNoise(seed);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      data[i] = 255 * n.fbm(u, v, 4, 4, 5);
      data[i + 1] = 255 * n.fbm(u + 0.37, v + 0.11, 8, 8, 4);
      data[i + 2] = 255 * n.fbm(u + 0.71, v + 0.53, 16, 16, 3);
      data[i + 3] = 255 * n.fbm(u + 0.19, v + 0.83, 3, 3, 6, 0.55);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Soft round glow, brightest in the middle; used for lamps, haze puffs and out-of-focus lights. */
export function makeGlowTexture(size = 128, hardness = 0): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(Math.max(0.05, hardness), "rgba(255,255,255,0.9)");
  gradient.addColorStop(Math.max(0.3, hardness + 0.12), `rgba(255,255,255,${hardness > 0 ? 0.5 : 0.28})`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface SkySpec {
  zenith: THREE.ColorRepresentation;
  horizon: THREE.ColorRepresentation;
  ground: THREE.ColorRepresentation;
  /** Direction towards the sun (or the brightest part of the sky). */
  sunDir: THREE.Vector3;
  sunColor: THREE.ColorRepresentation;
  /** Brightness of the wide glow around the sun. */
  glow: number;
  /** Brightness of the sun disc itself (0 = sun below the horizon). */
  disc: number;
}

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround;
  uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uGlow; uniform float uDisc;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float up = d.y;
    vec3 col = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.45));
    col = mix(col, uGround, smoothstep(0.0, -0.25, up));
    float s = max(dot(d, uSunDir), 0.0);
    col += uSunColor * uGlow * (pow(s, 6.0) * 0.35 + pow(s, 48.0) * 0.9);
    col += uSunColor * uDisc * smoothstep(0.9992, 0.9997, s);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Image-based lighting from a procedural sky: gives paint, glass and wet surfaces something
 * real to reflect. Returns the prefiltered environment map; dispose the returned target.
 */
export function makeSkyEnvironment(renderer: THREE.WebGLRenderer, spec: SkySpec): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(10, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(spec.zenith) },
      uHorizon: { value: new THREE.Color(spec.horizon) },
      uGround: { value: new THREE.Color(spec.ground) },
      uSunDir: { value: spec.sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(spec.sunColor) },
      uGlow: { value: spec.glow },
      uDisc: { value: spec.disc },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
  });
  scene.add(new THREE.Mesh(geometry, material));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  geometry.dispose();
  material.dispose();
  return target;
}

/** Collects everything a scene creates so one call frees it all. */
export function makeBin() {
  const items: { dispose(): void }[] = [];
  return {
    add<T extends { dispose(): void }>(item: T): T {
      items.push(item);
      return item;
    },
    dispose() {
      for (const item of items) {
        try {
          item.dispose();
        } catch {
          /* already gone */
        }
      }
      items.length = 0;
    },
  };
}

/** Breaks up colour banding in smooth skies and haze. Paste into a fragment shader. */
export const DITHER_GLSL = /* glsl */ `
  float ditherNoise(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }
`;

/** Tone mapping + output colour space, for hand-written shaders. */
export const OUTPUT_GLSL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (ditherNoise(gl_FragCoord.xy) - 0.5) / 255.0;
`;
