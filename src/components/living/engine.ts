/**
 * Living photo engine. Loaded lazily (dynamic import) by LivingPhoto, never on the server.
 *
 * ONE WebGL context for the whole site: every living photo is drawn into a corner of a single
 * hidden WebGL canvas and then copied (drawImage) onto that photo's own small 2D canvas.
 * So a grid of 30 trip cards still uses one context, each canvas scrolls natively with its
 * card, and rounded corners / hover zoom keep working through plain CSS.
 */
import * as THREE from "three";
import type { Ellipse, ResolvedScene, RGB } from "./scenes";
import {
  BIRD_FRAG,
  BIRD_VERT,
  FLAG_FRAG,
  FLAG_VERT,
  LEAF_FRAG,
  LEAF_VERT,
  MOTE_FRAG,
  MOTE_VERT,
  PHOTO_FRAG,
  PHOTO_VERT,
  POLE_FRAG,
  POLE_VERT,
} from "./shaders";
import type { LiveWeather } from "./weather";

export type LivingVariant = "card" | "hero";

export type LivingOptions = {
  canvas: HTMLCanvasElement;
  /** The URL the <img> actually loaded (so the browser cache is reused). */
  src: string;
  scene: ResolvedScene;
  variant: LivingVariant;
  weather: LiveWeather;
  /** Called when a frame is on the canvas (fade it in) and when WebGL is lost (hide it). */
  onShow: (show: boolean) => void;
};

export type LivingHandle = {
  setVisible: (visible: boolean) => void;
  setWeather: (weather: LiveWeather) => void;
  dispose: () => void;
};

type Mix = {
  rain: number;
  cloud: number;
  night: number;
  clear: number;
  storm: number;
  fog: number;
  wind: number;
  dirX: number;
};

type PhotoAsset = {
  texture: THREE.Texture;
  mask: THREE.DataTexture;
  aspect: number;
  skyFraction: number;
  refs: number;
};

type Instance = {
  opts: LivingOptions;
  ctx: CanvasRenderingContext2D;
  asset: PhotoAsset;
  w: number;
  h: number;
  visible: boolean;
  shown: boolean;
  dirty: boolean;
  seed: number;
  /** Time of this photo's first frame (the camera eases in from the still picture). */
  t0: number;
  index: number;
  cur: Mix;
  target: Mix;
  observer: ResizeObserver;
};

const MAX_LEAVES = 16;
const MAX_BIRDS = 7;
const MAX_MOTES = 70;

// ----------------------------------------------------------------------------------------
// Device tier
// ----------------------------------------------------------------------------------------
function readTier() {
  const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
  const cores = navigator.hardwareConcurrency ?? 8;
  const low = cores <= 4;
  return {
    mobile,
    dprHero: mobile ? 1.5 : 2,
    dprCard: mobile ? 1.25 : 1.5,
    maxLive: mobile ? (low ? 3 : 4) : 8,
    octaves: mobile ? 3 : 4,
    leavesHero: mobile ? 8 : 13,
    leavesCard: mobile ? 3 : 4,
    cardHalfRate: mobile,
  };
}

function debugMode(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("living");
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------------------
// Weather → scene mix
// ----------------------------------------------------------------------------------------
function toMix(wIn: LiveWeather): Mix {
  let w = wIn;
  const dbg = debugMode();
  if (dbg === "rain") w = { ...w, condition: "rain", label: "rain", cloudCover: 95, humidity: 95, windKmh: 16 };
  else if (dbg === "storm") w = { ...w, condition: "storm", label: "thunderstorm", cloudCover: 100, windKmh: 28 };
  else if (dbg === "mist") w = { ...w, condition: "mist", label: "misty", cloudCover: 80, humidity: 96 };
  else if (dbg === "clear") w = { ...w, condition: "clear", label: "clear", cloudCover: 5, isDay: true };
  else if (dbg === "night") w = { ...w, isDay: false };
  else if (dbg === "windy") w = { ...w, windKmh: 30 };

  const storm = w.condition === "storm" ? 1 : 0;
  let rain = 0;
  if (storm) rain = 1;
  else if (w.condition === "rain") rain = w.label === "drizzle" ? 0.45 : w.label === "light rain" ? 0.6 : w.label === "heavy rain" ? 1 : 0.8;
  let cloud = Math.min(1, Math.max(0, w.cloudCover / 100));
  if (rain > 0) cloud = Math.max(cloud, 0.8);
  if (w.condition === "clear") cloud = Math.min(cloud, 0.3);
  const fog = w.condition === "mist" ? 0.55 : rain > 0 ? 0.2 : w.humidity >= 88 ? 0.14 : 0;
  const toRad = (((w.windFromDeg + 180) % 360) * Math.PI) / 180;
  const x = Math.sin(toRad);
  // The camera heading is unknown, so only the east-west part decides left / right on screen.
  const dirX = (x >= 0 ? 1 : -1) * Math.max(0.45, Math.abs(x));
  return {
    rain,
    cloud,
    night: w.isDay ? 0 : 1,
    clear: 1 - cloud,
    storm,
    fog,
    wind: Math.min(1.6, Math.max(0.25, w.windKmh / 20)),
    dirX,
  };
}

// ----------------------------------------------------------------------------------------
// Photo → mask (R foliage, G sky, B water), built once per photo on the CPU
// ----------------------------------------------------------------------------------------
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ellipse = (u: number, v: number, e: Ellipse) => {
  const dx = (u - e.x) / e.rx;
  const dy = (v - e.y) / e.ry;
  return 1 - sstep(0.3, 1, dx * dx + dy * dy);
};

function blur(src: Float32Array, w: number, h: number, passes: number): Float32Array {
  let a = src;
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            s += a[yy * w + xx];
            n++;
          }
        }
        b[y * w + x] = s / n;
      }
    }
    a = b;
  }
  return a;
}

function erode(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = src[y * w + x];
      if (x > 0) m = Math.min(m, src[y * w + x - 1]);
      if (x < w - 1) m = Math.min(m, src[y * w + x + 1]);
      if (y > 0) m = Math.min(m, src[(y - 1) * w + x]);
      if (y < h - 1) m = Math.min(m, src[(y + 1) * w + x]);
      out[y * w + x] = m;
    }
  }
  return out;
}

function buildMask(img: HTMLImageElement, scene: ResolvedScene): { data: Uint8Array; w: number; h: number; skyFraction: number } | null {
  const w = 192;
  const h = Math.max(16, Math.round((w * img.naturalHeight) / img.naturalWidth));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  let px: Uint8ClampedArray;
  try {
    px = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null; // cross-origin photo without CORS: leave the static photo alone
  }
  const n = w * h;
  const lum = new Float32Array(n);
  let fol: Float32Array = new Float32Array(n);
  const skyCand = new Uint8Array(n);
  let sky: Float32Array = new Float32Array(n);
  let wat: Float32Array = new Float32Array(n);
  const solid = new Float32Array(n);
  const still = new Float32Array(n);
  const horizon = scene.horizon ?? 0.55;
  const useWater = scene.effects.includes("water") && scene.water;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = px[i * 4] / 255;
      const g = px[i * 4 + 1] / 255;
      const b = px[i * 4 + 2] / 255;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[i] = l;
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      let st = 0;
      for (const e of scene.still ?? []) st = Math.max(st, ellipse(u, v, e));
      still[i] = st;

      const green = sstep(0, 0.045, g - Math.max(r * 1.04, b * 1.12)) * sstep(0.05, 0.14, l);
      let golden = 0;
      if (scene.golden) {
        // Low sun turns leaves olive: little blue, green still close to red, and not bright.
        golden = sstep(0.64, 0.5, b / (g + 1e-3)) * sstep(0.66, 0.76, g / (r + 1e-3)) * sstep(0.07, 0.14, l) * sstep(0.7, 0.52, l);
      }
      fol[i] = Math.max(green, golden);

      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = (mx - mn) / (mx + 1e-3);
      if (v < horizon && l > 0.34 && fol[i] < 0.2 && sat < 0.62) skyCand[i] = 1;

      if (useWater && scene.water) {
        let reg = 0;
        for (const e of scene.water.regions) reg = Math.max(reg, ellipse(u, v, e));
        if (reg > 0) {
          const ok =
            scene.water.mode === "sea"
              ? sstep(0.34, 0.44, l) * (g >= r * 0.93 ? 1 : 0)
              : sstep(0.46, 0.56, l);
          wat[i] = reg * ok * (1 - Math.min(1, fol[i] * 3));
        }
      }
    }
  }

  // Sky = bright, smooth pixels connected to the top edge (so a pale wall or river is never "sky").
  // Neighbouring sky pixels look alike; a hazy ridge line or a roof edge stops the fill.
  const smooth = (i: number, j: number) =>
    Math.abs(lum[i] - lum[j]) < 0.06 &&
    Math.abs(px[i * 4] - px[j * 4]) + Math.abs(px[i * 4 + 1] - px[j * 4 + 1]) + Math.abs(px[i * 4 + 2] - px[j * 4 + 2]) < 36;
  const stack: number[] = [];
  const seen = new Uint8Array(n);
  for (let x = 0; x < w; x++) {
    if (skyCand[x]) {
      stack.push(x);
      seen[x] = 1;
    }
  }
  while (stack.length) {
    const i = stack.pop() as number;
    sky[i] = 1;
    const x = i % w;
    const y = (i - x) / w;
    const tryPush = (j: number) => {
      if (!seen[j] && skyCand[j] && smooth(i, j)) {
        seen[j] = 1;
        stack.push(j);
      }
    };
    if (x > 0) tryPush(i - 1);
    if (x < w - 1) tryPush(i + 1);
    if (y > 0) tryPush(i - w);
    if (y < h - 1) tryPush(i + w);
  }
  let skyCount = 0;
  for (let i = 0; i < n; i++) {
    skyCount += sky[i];
    if (sky[i]) wat[i] = 0;
    solid[i] = lum[i] >= 0.22 && fol[i] < 0.25 && !sky[i] && wat[i] < 0.2 ? 1 : 0;
  }

  // Keep motion off anything solid: pull the foliage mask back from stone, soil, roofs, people.
  const solidBlur = blur(solid, w, h, 1);
  fol = blur(fol, w, h, 1);
  for (let i = 0; i < n; i++) fol[i] *= (1 - sstep(0.22, 0.62, solidBlur[i])) * (1 - still[i]);
  fol = blur(fol, w, h, 1);
  sky = blur(erode(erode(sky, w, h), w, h), w, h, 2);
  wat = blur(erode(wat, w, h), w, h, 2);

  const data = new Uint8Array(n * 4);
  for (let y = 0; y < h; y++) {
    const row = h - 1 - y; // texture rows start at the bottom
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = (row * w + x) * 4;
      data[o] = Math.round(Math.min(1, fol[i] * 1.15) * 255);
      data[o + 1] = Math.round(sky[i] * 255);
      data[o + 2] = Math.round(wat[i] * (1 - still[i]) * 255);
      data[o + 3] = 255;
    }
  }
  return { data, w, h, skyFraction: skyCount / n };
}

// ----------------------------------------------------------------------------------------
// The engine (singleton)
// ----------------------------------------------------------------------------------------
class Engine {
  readonly tier = readTier();
  private renderer: THREE.WebGLRenderer;
  private gl: HTMLCanvasElement;
  private glW = 0;
  private glH = 0;
  private instances = new Set<Instance>();
  private assets = new Map<string, Promise<PhotoAsset | null>>();
  private raf = 0;
  private lost = false;
  private frameNo = 0;
  private counter = 0;
  private lastNow = 0;
  private intervalEma = 16.7;
  private cpuEma = 0;
  private slowFrames = 0;
  private quality = 1;
  private pointer = { x: 0, y: 0 };
  private disposeTimer: ReturnType<typeof setTimeout> | null = null;
  private debug = debugMode();

  private bgScene = new THREE.Scene();
  private bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bgMat: THREE.ShaderMaterial;
  private fxScene = new THREE.Scene();
  private fxCam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  private leafMat: THREE.ShaderMaterial;
  private leafGeo: THREE.InstancedBufferGeometry;
  private leafMesh: THREE.Mesh;
  private birdMat: THREE.ShaderMaterial;
  private birdGeo: THREE.InstancedBufferGeometry;
  private birdMesh: THREE.Mesh;
  private moteMat: THREE.ShaderMaterial;
  private motes: THREE.Points;
  private flagMats: THREE.ShaderMaterial[] = [];
  private poleMats: THREE.ShaderMaterial[] = [];
  private flagMeshes: THREE.Mesh[] = [];
  private poleMeshes: THREE.Mesh[] = [];
  private disposables: { dispose: () => void }[] = [];

  private warmed: Promise<void> | null = null;

  /** Compiles every shader without blocking the page; resolves when they are ready (or on failure). */
  warm(): Promise<void> {
    if (!this.warmed) {
      this.warmed = Promise.all([
        this.renderer.compileAsync(this.bgScene, this.bgCam),
        this.renderer.compileAsync(this.fxScene, this.fxCam),
      ]).then(
        () => undefined,
        () => undefined
      );
    }
    return this.warmed;
  }

  constructor() {
    this.gl = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.gl,
      antialias: true,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: true, // software GL would stutter: keep the plain photo instead
    });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0xdce8ee, 1);
    this.resizeGl(640, 448);

    this.gl.addEventListener("webglcontextlost", this.onLost, false);
    this.gl.addEventListener("webglcontextrestored", this.onRestored, false);
    document.addEventListener("visibilitychange", this.onVisibility);
    if (!this.tier.mobile) window.addEventListener("pointermove", this.onPointer, { passive: true });

    // ---- photo quad ----
    const v4 = () => new THREE.Vector4(0, 0, 0.001, 0.001);
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: PHOTO_VERT,
      fragmentShader: PHOTO_FRAG,
      defines: { OCT: this.tier.octaves },
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPhoto: { value: null },
        uMask: { value: null },
        uCover: { value: new THREE.Vector2(1, 1) },
        uPan: { value: new THREE.Vector2() },
        uZoom: { value: 1 },
        uTime: { value: 0 },
        uAspect: { value: 1.33 },
        uScreenAsp: { value: 1.33 },
        uWindDir: { value: new THREE.Vector2(1, 0.1) },
        uWind: { value: 0.5 },
        uSway: { value: 0.003 },
        uSun: { value: new THREE.Vector4() },
        uSunCol: { value: new THREE.Vector3(1, 0.8, 0.6) },
        uMist: { value: [v4(), v4(), v4()] },
        uMistCol: { value: new THREE.Vector3(0.9, 0.92, 0.92) },
        uMistAmt: { value: 0 },
        uFog: { value: 0 },
        uPlume: { value: [v4(), v4()] },
        uPlumeCol: { value: [new THREE.Vector4(), new THREE.Vector4()] },
        uGlit: { value: v4() },
        uWater: { value: 0 },
        uRain: { value: 0 },
        uCloud: { value: 0 },
        uNight: { value: 0 },
        uClear: { value: 1 },
        uStorm: { value: 0 },
        uFx: { value: 1 },
        uSkyFlow: { value: 1 },
        uDebug: { value: this.debug === "mask" ? 1 : 0 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    quad.frustumCulled = false;
    this.bgScene.add(quad);
    this.disposables.push(quad.geometry, this.bgMat);

    const rnd = (count: number) => {
      const a = new Float32Array(count * 4);
      for (let i = 0; i < a.length; i++) a[i] = Math.random();
      return a;
    };

    // ---- leaves ----
    const leafPlane = new THREE.PlaneGeometry(1, 1, 6, 4);
    this.leafGeo = new THREE.InstancedBufferGeometry();
    this.leafGeo.index = leafPlane.index;
    this.leafGeo.setAttribute("position", leafPlane.getAttribute("position"));
    this.leafGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(rnd(MAX_LEAVES), 4));
    this.leafGeo.instanceCount = MAX_LEAVES;
    this.leafMat = new THREE.ShaderMaterial({
      vertexShader: LEAF_VERT,
      fragmentShader: LEAF_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uWindDir: { value: new THREE.Vector2(1, 0.1) },
        uWind: { value: 0.5 },
        uTan: { value: Math.tan((20 * Math.PI) / 180) },
        uScreenAsp: { value: 1.33 },
        uFall: { value: 1 },
        uSize: { value: 1 },
        uCam: { value: new THREE.Vector2() },
        uLeafA: { value: new THREE.Vector3() },
        uLeafB: { value: new THREE.Vector3() },
        uSunCol: { value: new THREE.Vector3() },
        uAmb: { value: new THREE.Vector3() },
        uLight: { value: new THREE.Vector3(0, 0.6, -0.8) },
        uAlpha: { value: 1 },
      },
    });
    this.leafMesh = new THREE.Mesh(this.leafGeo, this.leafMat);
    this.leafMesh.frustumCulled = false;
    this.leafMesh.renderOrder = 5;
    this.fxScene.add(this.leafMesh);
    this.disposables.push(leafPlane, this.leafGeo, this.leafMat);

    // ---- birds ----
    // x = along the wingspan (-1..1), y = along the body.
    const bp: number[] = [];
    for (const s of [-1, 1]) {
      const rf = [0, 0.13], rb = [0, -0.15], mf = [s * 0.5, 0.1], mb = [s * 0.5, -0.07], tip = [s, -0.06];
      for (const tri of [[rf, rb, mf], [rb, mb, mf], [mf, mb, tip]]) for (const p of tri) bp.push(p[0], p[1], 0);
    }
    for (const tri of [[[0, 0.3], [0.07, 0], [-0.07, 0]], [[0.07, 0], [0, -0.3], [-0.07, 0]]]) for (const p of tri) bp.push(p[0], p[1], 0);
    this.birdGeo = new THREE.InstancedBufferGeometry();
    this.birdGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bp), 3));
    this.birdGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(rnd(MAX_BIRDS), 4));
    this.birdGeo.instanceCount = MAX_BIRDS;
    this.birdMat = new THREE.ShaderMaterial({
      vertexShader: BIRD_VERT,
      fragmentShader: BIRD_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uBird: { value: new THREE.Vector4(0.8, 36, 17, 0.05) },
        uScreenAsp: { value: 1.33 },
        uSeed: { value: 0 },
        uColor: { value: new THREE.Vector3(0.15, 0.13, 0.13) },
        uAlpha: { value: 0.8 },
      },
    });
    this.birdMesh = new THREE.Mesh(this.birdGeo, this.birdMat);
    this.birdMesh.frustumCulled = false;
    this.birdMesh.renderOrder = 2;
    this.fxScene.add(this.birdMesh);
    this.disposables.push(this.birdGeo, this.birdMat);

    // ---- dust motes ----
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_MOTES * 3), 3));
    moteGeo.setAttribute("aSeed", new THREE.BufferAttribute(rnd(MAX_MOTES), 4));
    this.moteMat = new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uWindDir: { value: new THREE.Vector2(1, 0.1) },
        uPx: { value: 1 },
        uSunScreen: { value: new THREE.Vector2() },
        uScreenAsp: { value: 1.33 },
        uColor: { value: new THREE.Vector3(1, 0.8, 0.55) },
        uAlpha: { value: 0.5 },
      },
    });
    this.motes = new THREE.Points(moteGeo, this.moteMat);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 1;
    this.fxScene.add(this.motes);
    this.disposables.push(moteGeo, this.moteMat);

    // ---- temple flags (up to two per photo) ----
    const flagGeo = new THREE.PlaneGeometry(1, 1, 30, 8);
    flagGeo.translate(0.5, 0.5, 0);
    const poleGeo = new THREE.PlaneGeometry(2, 1, 1, 1);
    poleGeo.translate(0, 0.5, 0);
    this.disposables.push(flagGeo, poleGeo);
    for (let i = 0; i < 2; i++) {
      const shared = () => ({
        uFlag: { value: new THREE.Vector4() },
        uCover: { value: new THREE.Vector2(1, 1) },
        uPan: { value: new THREE.Vector2() },
        uZoom: { value: 1 },
        uAspect: { value: 1.33 },
        uSunCol: { value: new THREE.Vector3() },
        uDim: { value: 1 },
        uHaze: { value: new THREE.Vector4(0.86, 0.7, 0.56, 0) },
      });
      const fm = new THREE.ShaderMaterial({
        vertexShader: FLAG_VERT,
        fragmentShader: FLAG_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          ...shared(),
          uTime: { value: 0 },
          uWindDir: { value: new THREE.Vector2(1, 0.1) },
          uWind: { value: 0.5 },
          uSeed: { value: i * 2.7 + 0.6 },
          uCloth: { value: new THREE.Vector3(1, 0.43, 0.07) },
          uAmb: { value: new THREE.Vector3() },
        },
      });
      const pm = new THREE.ShaderMaterial({
        vertexShader: POLE_VERT,
        fragmentShader: POLE_FRAG,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: shared(),
      });
      const pole = new THREE.Mesh(poleGeo, pm);
      pole.frustumCulled = false;
      pole.renderOrder = 3;
      const flag = new THREE.Mesh(flagGeo, fm);
      flag.frustumCulled = false;
      flag.renderOrder = 4;
      this.fxScene.add(pole, flag);
      this.flagMats.push(fm);
      this.poleMats.push(pm);
      this.flagMeshes.push(flag);
      this.poleMeshes.push(pole);
      this.disposables.push(fm, pm);
    }
  }

  // ---- lifecycle ----
  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    for (const i of this.instances) {
      i.shown = false;
      i.opts.onShow(false);
    }
  };

  private onRestored = () => {
    this.lost = false;
    for (const i of this.instances) {
      i.asset.texture.needsUpdate = true;
      i.asset.mask.needsUpdate = true;
      i.dirty = true;
    }
    this.kick();
  };

  private onVisibility = () => {
    if (!document.hidden) this.kick();
  };

  private onPointer = (e: PointerEvent) => {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };

  private resizeGl(w: number, h: number) {
    const nw = Math.min(2560, Math.max(this.glW, Math.ceil(w / 64) * 64));
    const nh = Math.min(2560, Math.max(this.glH, Math.ceil(h / 64) * 64));
    if (nw !== this.glW || nh !== this.glH) {
      this.glW = nw;
      this.glH = nh;
      this.renderer.setSize(nw, nh, false);
      for (const i of this.instances) i.dirty = true;
    }
  }

  private loadAsset(src: string, scene: ResolvedScene): Promise<PhotoAsset | null> {
    let p = this.assets.get(src);
    if (!p) {
      p = (async () => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.src = src;
        try {
          await img.decode();
        } catch {
          return null;
        }
        if (!img.naturalWidth || !img.naturalHeight) return null;
        const built = buildMask(img, scene);
        if (!built) return null;
        const texture = new THREE.Texture(img);
        texture.colorSpace = THREE.NoColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        texture.needsUpdate = true;
        const mask = new THREE.DataTexture(built.data, built.w, built.h, THREE.RGBAFormat, THREE.UnsignedByteType);
        mask.colorSpace = THREE.NoColorSpace;
        mask.minFilter = THREE.LinearFilter;
        mask.magFilter = THREE.LinearFilter;
        mask.needsUpdate = true;
        return { texture, mask, aspect: img.naturalWidth / img.naturalHeight, skyFraction: built.skyFraction, refs: 0 };
      })();
      this.assets.set(src, p);
    }
    return p;
  }

  async mount(opts: LivingOptions): Promise<LivingHandle | null> {
    if (this.disposeTimer) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = null;
    }
    const ctx = opts.canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    const asset = await this.loadAsset(opts.src, opts.scene);
    if (!asset) {
      this.assets.delete(opts.src);
      this.maybeShutdown();
      return null;
    }
    asset.refs++;
    const mix = toMix(opts.weather);
    const inst: Instance = {
      opts,
      ctx,
      asset,
      w: 0,
      h: 0,
      visible: false,
      shown: false,
      dirty: true,
      seed: Math.random(),
      t0: -1,
      index: this.counter++,
      cur: { ...mix },
      target: mix,
      observer: new ResizeObserver(() => this.measure(inst)),
    };
    inst.observer.observe(opts.canvas);
    this.measure(inst);
    this.instances.add(inst);
    this.kick();

    let disposed = false;
    return {
      setVisible: (v) => {
        inst.visible = v;
        if (v) this.kick();
      },
      setWeather: (w) => {
        inst.target = toMix(w);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        inst.observer.disconnect();
        this.instances.delete(inst);
        asset.refs--;
        if (asset.refs <= 0) {
          asset.texture.dispose();
          asset.mask.dispose();
          this.assets.delete(opts.src);
        }
        this.maybeShutdown();
      },
    };
  }

  private maybeShutdown() {
    if (this.instances.size > 0 || this.disposeTimer) return;
    // Keep the context across quick page changes, release it if nothing comes back.
    this.disposeTimer = setTimeout(() => {
      this.disposeTimer = null;
      if (this.instances.size === 0) this.shutdown();
    }, 8000);
  }

  private shutdown() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.gl.removeEventListener("webglcontextlost", this.onLost);
    this.gl.removeEventListener("webglcontextrestored", this.onRestored);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pointermove", this.onPointer);
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (engine === this) engine = null;
  }

  private measure(inst: Instance) {
    const r = inst.opts.canvas.getBoundingClientRect();
    // offsetWidth ignores CSS transforms (the card hover zoom), which is what we want.
    const cw = inst.opts.canvas.offsetWidth || r.width;
    const ch = inst.opts.canvas.offsetHeight || r.height;
    if (cw < 8 || ch < 8) return;
    const cap = inst.opts.variant === "hero" ? this.tier.dprHero : this.tier.dprCard;
    const dpr = Math.min(window.devicePixelRatio || 1, cap) * this.quality;
    const w = Math.max(16, Math.round(cw * dpr));
    const h = Math.max(16, Math.round(ch * dpr));
    if (w !== inst.w || h !== inst.h) {
      inst.w = w;
      inst.h = h;
      inst.opts.canvas.width = w;
      inst.opts.canvas.height = h;
      inst.dirty = true;
      this.kick();
    }
  }

  private kick() {
    if (!this.raf && !this.lost && !document.hidden) {
      this.lastNow = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private pickLive(): Instance[] {
    const vis: Instance[] = [];
    for (const i of this.instances) if (i.visible && i.w > 0) vis.push(i);
    if (vis.length > this.tier.maxLive) {
      vis.sort((a, b) => (b.opts.variant === "hero" ? 1e9 : b.w * b.h) - (a.opts.variant === "hero" ? 1e9 : a.w * a.h));
      // Photos over the limit keep their last frame (drawn at least once so they are not blank).
      for (const i of vis.slice(this.tier.maxLive)) if (i.dirty) this.render(i, performance.now() / 1000, 0.016);
      vis.length = this.tier.maxLive;
    }
    return vis;
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.lost || document.hidden) return;
    const live = this.pickLive();
    if (live.length === 0) return; // nothing on screen: stop the loop until something scrolls in
    this.raf = requestAnimationFrame(this.frame);

    const dtMs = this.lastNow ? now - this.lastNow : 16.7;
    this.lastNow = now;
    if (dtMs < 250) this.intervalEma += (dtMs - this.intervalEma) * 0.05;
    this.frameNo++;

    const t0 = performance.now();
    const t = now / 1000;
    const dt = Math.min(0.1, dtMs / 1000);
    for (const i of live) {
      const half = (this.tier.cardHalfRate || this.quality < 1) && i.opts.variant === "card";
      if (half && !i.dirty && (this.frameNo + i.index) % 2 === 1) continue;
      this.render(i, t, dt);
    }
    this.cpuEma += (performance.now() - t0 - this.cpuEma) * 0.05;

    // If the device cannot keep up for several seconds in a row, drop resolution a step rather
    // than stutter. One-off stalls (page loads, route changes, tab switches) are ignored.
    if (dtMs > 26 && dtMs < 120) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > (this.quality === 1 ? 150 : 300) && this.quality > 0.7) {
      this.quality = this.quality === 1 ? 0.8 : 0.65;
      this.slowFrames = 0;
      for (const i of this.instances) this.measure(i);
    }
  };

  private render(inst: Instance, tGlobal: number, dt: number) {
    const { opts, asset } = inst;
    const s = opts.scene;
    const hero = opts.variant === "hero";
    const w = inst.w;
    const h = inst.h;
    if (w > this.glW || h > this.glH) this.resizeGl(w, h);
    const fits = w <= this.glW && h <= this.glH;
    if (!fits) return;

    // ease weather so a change never pops
    const k = 1 - Math.exp(-dt * 0.8);
    const c = inst.cur;
    const g = inst.target;
    c.rain += (g.rain - c.rain) * k;
    c.cloud += (g.cloud - c.cloud) * k;
    c.night += (g.night - c.night) * k;
    c.clear += (g.clear - c.clear) * k;
    c.storm += (g.storm - c.storm) * k;
    c.fog += (g.fog - c.fog) * k;
    c.wind += (g.wind - c.wind) * k;
    c.dirX += (g.dirX - c.dirX) * k;

    const t = tGlobal + inst.seed * 300;
    const has = (e: string) => s.effects.includes(e as (typeof s.effects)[number]);

    // ---- camera: slow breathing zoom + drift; straight lines stay straight (pure scale + shift) ----
    const screenAsp = w / h;
    const coverX = screenAsp > asset.aspect ? 1 : screenAsp / asset.aspect;
    const coverY = screenAsp > asset.aspect ? asset.aspect / screenAsp : 1;
    if (inst.t0 < 0) inst.t0 = tGlobal;
    const ease = Math.min(1, Math.max(0, (tGlobal - inst.t0) / 5));
    // ?living=nocam (and the mask view) hold the camera still, for checking what moves.
    const e2 = this.debug === "nocam" || this.debug === "mask" ? 0 : ease * ease * (3 - 2 * ease);
    const zoom = 1 + e2 * ((hero ? 0.024 : 0.014) + (hero ? 0.012 : 0.006) * Math.sin(t * 0.13));
    let panX = e2 * Math.sin(t * 0.09) * 0.0035;
    let panY = e2 * Math.cos(t * 0.07) * 0.0025;
    if (hero && !this.tier.mobile) {
      panX += e2 * -this.pointer.x * 0.004;
      panY += e2 * this.pointer.y * 0.003;
    }
    const mx = ((1 - 1 / zoom) / 2) * coverX;
    const my = ((1 - 1 / zoom) / 2) * coverY;
    panX = Math.max(-mx, Math.min(mx, panX));
    panY = Math.max(-my, Math.min(my, panY));

    const dirLen = Math.hypot(c.dirX, 0.12);
    const wdx = c.dirX / dirLen;
    const wdy = 0.12 / dirLen;

    const sunOn = has("rays") && s.sun ? 1 : 0;
    const sunCol: RGB = s.sun ? s.sun.color : [0.9, 0.92, 0.95];
    const sunStrength = s.sun ? s.sun.strength : 0;

    // ---- photo pass ----
    const u = this.bgMat.uniforms;
    u.uPhoto.value = asset.texture;
    u.uMask.value = asset.mask;
    (u.uCover.value as THREE.Vector2).set(coverX, coverY);
    (u.uPan.value as THREE.Vector2).set(panX, panY);
    u.uZoom.value = zoom;
    u.uTime.value = t;
    u.uAspect.value = asset.aspect;
    u.uScreenAsp.value = screenAsp;
    (u.uWindDir.value as THREE.Vector2).set(wdx, wdy);
    u.uWind.value = c.wind;
    u.uSway.value = has("foliage") ? (hero ? 0.0034 : 0.003) * (0.55 + 0.75 * c.wind) : 0;
    (u.uSun.value as THREE.Vector4).set(s.sun?.x ?? 0.5, 1 - (s.sun?.y ?? 0.2), sunStrength, sunOn);
    (u.uSunCol.value as THREE.Vector3).set(sunCol[0], sunCol[1], sunCol[2]);
    const mist = has("mist") ? s.mist ?? [] : [];
    const mistU = u.uMist.value as THREE.Vector4[];
    for (let i = 0; i < 3; i++) {
      const m = mist[i];
      if (m) mistU[i].set(m.x, 1 - m.y, m.rx, m.ry);
      else mistU[i].set(-9, -9, 0.001, 0.001);
    }
    const mc = s.mistColor ?? [0.9, 0.92, 0.93];
    (u.uMistCol.value as THREE.Vector3).set(mc[0], mc[1], mc[2]);
    u.uMistAmt.value = mist.length ? (s.mistAmount ?? 0.6) * (hero ? 1 : 0.7) : 0;
    u.uFog.value = c.fog;
    const plumes = has("plumes") ? s.plumes ?? [] : [];
    const plumeU = u.uPlume.value as THREE.Vector4[];
    const plumeC = u.uPlumeCol.value as THREE.Vector4[];
    for (let i = 0; i < 2; i++) {
      const p = plumes[i];
      if (p) {
        plumeU[i].set(p.x, 1 - p.y, p.w, p.h);
        plumeC[i].set(p.color[0], p.color[1], p.color[2], p.strength);
      } else {
        plumeC[i].set(0, 0, 0, 0);
      }
    }
    const gl = has("water") ? s.glitter : undefined;
    if (gl) (u.uGlit.value as THREE.Vector4).set(gl.x, 1 - gl.y, gl.rx, gl.ry);
    else (u.uGlit.value as THREE.Vector4).set(-9, -9, 0.001, 0.001);
    u.uWater.value = has("water") && s.water ? (s.water.mode === "sea" ? 1 : 2) : 0;
    u.uRain.value = c.rain;
    u.uCloud.value = c.cloud;
    u.uNight.value = c.night;
    u.uClear.value = c.clear;
    u.uStorm.value = c.storm;
    u.uFx.value = hero ? 1 : 0.75;
    u.uSkyFlow.value = has("sky") ? (s.known ? 1 : 0.6) : 0;

    const r = this.renderer;
    r.setViewport(0, 0, w, h);
    r.setScissor(0, 0, w, h);
    r.setScissorTest(true);
    r.clear();
    r.render(this.bgScene, this.bgCam);

    // ---- 3D layer ----
    const lightLen = Math.hypot(((s.sun?.x ?? 0.5) - 0.5) * 2 * asset.aspect, (0.5 - (s.sun?.y ?? 0.1)) * 2 + 0.6, 1.2);
    const light: RGB = s.sun
      ? [(((s.sun.x - 0.5) * 2 * asset.aspect) / lightLen), ((0.5 - s.sun.y) * 2 + 0.6) / lightLen, -1.2 / lightLen]
      : [0.15, 0.95, -0.27];
    const dim = (1 - 0.1 * c.cloud - 0.14 * c.rain) * (1 - 0.3 * c.night);
    const sunK = sunStrength * (1 - 0.7 * c.cloud) * (1 - 0.6 * c.night);
    const sc: RGB = s.sun ? [sunCol[0] * sunK, sunCol[1] * sunK, sunCol[2] * sunK] : [0.34 * dim, 0.35 * dim, 0.36 * dim];
    const amb: RGB = s.sun ? [(0.4 + 0.2 * c.cloud) * dim, (0.38 + 0.21 * c.cloud) * dim, (0.38 + 0.23 * c.cloud) * dim] : [0.7 * dim, 0.72 * dim, 0.72 * dim];

    const leavesOn = has("leaves");
    this.leafMesh.visible = leavesOn;
    if (leavesOn) {
      const lu = this.leafMat.uniforms;
      this.leafGeo.instanceCount = hero ? this.tier.leavesHero : this.tier.leavesCard;
      lu.uTime.value = t;
      (lu.uWindDir.value as THREE.Vector2).set(wdx, wdy);
      lu.uWind.value = c.wind;
      lu.uScreenAsp.value = screenAsp;
      lu.uFall.value = 0.8 + 0.25 * c.wind + 0.5 * c.rain;
      lu.uSize.value = hero ? 1 : 1.25;
      (lu.uCam.value as THREE.Vector2).set(panX * asset.aspect * 8, panY * 8);
      (lu.uLeafA.value as THREE.Vector3).set(s.leaves[0][0], s.leaves[0][1], s.leaves[0][2]);
      (lu.uLeafB.value as THREE.Vector3).set(s.leaves[1][0], s.leaves[1][1], s.leaves[1][2]);
      (lu.uSunCol.value as THREE.Vector3).set(sc[0], sc[1], sc[2]);
      (lu.uAmb.value as THREE.Vector3).set(amb[0], amb[1], amb[2]);
      (lu.uLight.value as THREE.Vector3).set(light[0], light[1], light[2]);
      lu.uAlpha.value = 0.95;
    }

    const toScreenY = (yTop: number) => ((1 - yTop - 0.5 - panY) * zoom) / coverY + 0.5;
    const toScreenX = (x: number) => ((x - 0.5 - panX) * zoom) / coverX + 0.5;

    const birdsOn = hero && has("birds") && (s.birdsY !== undefined || asset.skyFraction > 0.1) && c.rain < 0.5;
    this.birdMesh.visible = birdsOn;
    if (birdsOn) {
      const bu = this.birdMat.uniforms;
      bu.uTime.value = tGlobal - inst.t0;
      (bu.uBird.value as THREE.Vector4).set(Math.min(0.94, toScreenY(s.birdsY ?? 0.12)), 34, 17, 0.052);
      bu.uScreenAsp.value = screenAsp;
      bu.uSeed.value = Math.floor(inst.seed * 50);
      (bu.uColor.value as THREE.Vector3).set(s.birds[0] * dim, s.birds[1] * dim, s.birds[2] * dim);
      bu.uAlpha.value = 0.82;
    }

    const motesOn = hero && has("motes") && Boolean(s.sun) && c.rain < 0.3;
    this.motes.visible = motesOn;
    if (motesOn && s.sun) {
      const mu = this.moteMat.uniforms;
      this.motes.geometry.setDrawRange(0, this.tier.mobile ? 36 : MAX_MOTES);
      mu.uTime.value = t;
      (mu.uWindDir.value as THREE.Vector2).set(wdx, wdy);
      mu.uPx.value = h / 300;
      (mu.uSunScreen.value as THREE.Vector2).set(toScreenX(s.sun.x) * 2 - 1, toScreenY(s.sun.y) * 2 - 1);
      mu.uScreenAsp.value = screenAsp;
      (mu.uColor.value as THREE.Vector3).set(sunCol[0], sunCol[1], sunCol[2]);
      mu.uAlpha.value = 0.55 * (1 - 0.8 * c.cloud) * (1 - c.night);
    }

    const flags = has("flags") ? s.flags ?? [] : [];
    for (let i = 0; i < 2; i++) {
      const f = flags[i];
      this.flagMeshes[i].visible = Boolean(f);
      this.poleMeshes[i].visible = Boolean(f);
      if (!f) continue;
      const far = f.size < 0.02; // the distant gopuram flag sits in haze
      for (const mat of [this.flagMats[i], this.poleMats[i]]) {
        const fu = mat.uniforms;
        (fu.uFlag.value as THREE.Vector4).set(f.x, 1 - f.y, f.pole, f.size);
        (fu.uCover.value as THREE.Vector2).set(coverX, coverY);
        (fu.uPan.value as THREE.Vector2).set(panX, panY);
        fu.uZoom.value = zoom;
        fu.uAspect.value = asset.aspect;
        (fu.uSunCol.value as THREE.Vector3).set(sc[0], sc[1], sc[2]);
        fu.uDim.value = dim;
        (fu.uHaze.value as THREE.Vector4).set(mc[0] * 0.86, mc[1] * 0.8, mc[2] * 0.76, far ? 0.5 : 0.06);
      }
      const fu = this.flagMats[i].uniforms;
      fu.uTime.value = t;
      (fu.uWindDir.value as THREE.Vector2).set(wdx, wdy);
      fu.uWind.value = c.wind;
      (fu.uAmb.value as THREE.Vector3).set(amb[0], amb[1], amb[2]);
    }

    if (leavesOn || birdsOn || motesOn || flags.length) {
      this.fxCam.aspect = screenAsp;
      this.fxCam.updateProjectionMatrix();
      r.render(this.fxScene, this.fxCam);
    }

    // ---- copy onto the photo's own canvas ----
    inst.ctx.drawImage(this.gl, 0, this.glH - h, w, h, 0, 0, w, h);
    inst.dirty = false;
    if (!inst.shown) {
      inst.shown = true;
      opts.onShow(true);
    }
  }

  /** For the browser console / verification: how the engine is doing right now. */
  stats() {
    let visible = 0;
    for (const i of this.instances) if (i.visible) visible++;
    return {
      webglContexts: 1,
      instances: this.instances.size,
      visible,
      live: Math.min(visible, this.tier.maxLive),
      frameIntervalMs: Math.round(this.intervalEma * 10) / 10,
      cpuMsPerFrame: Math.round(this.cpuEma * 100) / 100,
      glCanvas: `${this.glW}x${this.glH}`,
      quality: this.quality,
      mobileTier: this.tier.mobile,
    };
  }

  /** Renders every live photo N times and waits for the GPU, to get a true cost per frame. */
  bench(frames = 30) {
    const live = this.pickLive();
    const gl = this.renderer.getContext();
    const t0 = performance.now();
    for (let n = 0; n < frames; n++) {
      for (const i of live) this.render(i, performance.now() / 1000, 0.016);
      gl.finish();
    }
    return { photos: live.length, msPerFrame: Math.round(((performance.now() - t0) / frames) * 100) / 100 };
  }

  /** Verification only: drop the WebGL context and bring it back after `ms`. */
  loseContext(ms = 1500) {
    const ext = this.renderer.getContext().getExtension("WEBGL_lose_context");
    if (!ext) return false;
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), ms);
    return true;
  }
}

let engine: Engine | null = null;
let unsupported = false;

export async function mountLiving(opts: LivingOptions): Promise<LivingHandle | null> {
  if (unsupported) return null;
  if (!engine) {
    try {
      engine = new Engine();
    } catch {
      unsupported = true; // no WebGL (or software only): photos simply stay as photos
      return null;
    }
    // Debug hook for local checks only; not shipped to visitors.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __living?: unknown }).__living = {
        stats: () => engine?.stats() ?? null,
        bench: (n?: number) => engine?.bench(n) ?? null,
        loseContext: (ms?: number) => engine?.loseContext(ms) ?? false,
      };
    }
  }
  // Compile the photo and effect shaders in the background first (parallel where the GPU driver
  // allows), so the first living photo does not freeze the page.
  await engine.warm();
  if (!engine) return null;
  return engine.mount(opts);
}
