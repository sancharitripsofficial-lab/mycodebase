"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildErtiga } from "./ertigaModel";
import {
  MILESTONE,
  ROAD_TILE_LENGTH,
  ROAD_WIDTH,
  applyWind,
  buildGrassTuft,
  buildMilestone,
  buildRock,
  buildTree,
  createAsphaltMaps,
  createGrassTexture,
  createGroundMaps,
  createLeafTexture,
  createMilestoneTexture,
  createMistTexture,
  createParapetTexture,
  createSignTexture,
  createSoftDotTexture,
  makeTileNoise,
  mulberry32,
  smoothstep,
} from "./roadTripAssets";

export type RoadTrip3DStatus = "ready" | "lost" | "slow" | "failed";

export interface RoadTrip3DProps {
  /** Stop names, first to last, e.g. ["Bengaluru", "Kodagu (Coorg)"]. A pin floats over each one. */
  labels?: string[];
  /** Must position the element (e.g. "relative aspect-square w-full" or "absolute inset-0"): the canvas and labels fill it. */
  className?: string;
  /** "scene" (default) is the large visual with floating labels and soft edges; "minimap" is a small, cheap, more top-down HUD view with no labels. */
  variant?: "scene" | "minimap";
  /** "auto" picks the cheaper tier on phones and weak machines. */
  quality?: "auto" | "high" | "low";
  /** "ready" after the first frame; "lost" on WebGL context loss; "slow" if it cannot hold a usable frame rate; "failed" if WebGL is unavailable. */
  onStatus?: (status: RoadTrip3DStatus) => void;
}

/* ------------------------------------------------------------------ route (same "S" as RoadTripRoute) */

const VIEW_W = 360;
const VIEW_H = 420;
const SEGMENTS: number[][] = [
  [70, 372, 190, 372, 300, 350, 300, 280],
  [300, 280, 300, 200, 60, 220, 60, 140],
  [60, 140, 60, 70, 170, 48, 290, 48],
];
const UNIT = 0.11; // metres per SVG unit: the S is about 26 m wide, a tight ghat-road switchback
const PRE = 9; // road before the first pin
const POST = 12; // road after the last pin
const DS = 0.25;
const HALF_ROAD = ROAD_WIDTH / 2;
const LANE = 1.6; // the car keeps to the left lane, as on Indian roads
const RISE = 2.4; // the road climbs gently towards the destination

interface RoutePoint {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  k: number;
}

interface Route {
  n: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  tx: Float32Array;
  tz: Float32Array;
  /** Signed curvature, positive = turning left. */
  k: Float32Array;
  sStart: number;
  sEnd: number;
  total: number;
  sample(s: number, out: RoutePoint): RoutePoint;
}

function buildRoute(): Route {
  const raw: [number, number][] = [];
  const toWorld = (sx: number, sy: number): [number, number] => [(sx - VIEW_W / 2) * UNIT, (sy - VIEW_H / 2) * UNIT];
  SEGMENTS.forEach((s, si) => {
    for (let i = si === 0 ? 0 : 1; i <= 160; i++) {
      const t = i / 160;
      const m = 1 - t;
      const x = m * m * m * s[0] + 3 * m * m * t * s[2] + 3 * m * t * t * s[4] + t * t * t * s[6];
      const y = m * m * m * s[1] + 3 * m * m * t * s[3] + 3 * m * t * t * s[5] + t * t * t * s[7];
      raw.push(toWorld(x, y));
    }
  });
  raw.unshift([raw[0][0] - PRE, raw[0][1]]);
  raw.push([raw[raw.length - 1][0] + POST, raw[raw.length - 1][1]]);
  const cum: number[] = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const total = cum[cum.length - 1];
  const sStart = cum[1];
  const sEnd = cum[cum.length - 2];
  const n = Math.floor(total / DS) + 1;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const tx = new Float32Array(n);
  const tz = new Float32Array(n);
  const k = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * DS;
    while (j < raw.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    x[i] = raw[j][0] + (raw[j + 1][0] - raw[j][0]) * f;
    z[i] = raw[j][1] + (raw[j + 1][1] - raw[j][1]) * f;
    y[i] = RISE * smoothstep(0, 1, (s - sStart) / (sEnd - sStart));
  }
  const theta = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = x[b] - x[a];
    const dz = z[b] - z[a];
    const len = Math.hypot(dx, dz) || 1;
    tx[i] = dx / len;
    tz[i] = dz / len;
    theta[i] = Math.atan2(-tz[i], tx[i]);
  }
  const rawK = new Float32Array(n);
  for (let i = 1; i < n - 1; i++) {
    let d = theta[i + 1] - theta[i - 1];
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    rawK[i] = d / (2 * DS);
  }
  // two box-filter passes: curvature eases in and out like a real road's transition curves
  let src = rawK;
  for (let pass = 0; pass < 2; pass++) {
    const dst = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let c = 0;
      for (let o = -7; o <= 7; o++) {
        const q = i + o;
        if (q >= 0 && q < n) {
          sum += src[q];
          c++;
        }
      }
      dst[i] = sum / c;
    }
    src = dst;
  }
  k.set(src);
  const sample = (s: number, out: RoutePoint): RoutePoint => {
    const u = Math.min(n - 1.001, Math.max(0, s / DS));
    const i = Math.floor(u);
    const f = u - i;
    out.x = x[i] + (x[i + 1] - x[i]) * f;
    out.y = y[i] + (y[i + 1] - y[i]) * f;
    out.z = z[i] + (z[i + 1] - z[i]) * f;
    out.tx = tx[i] + (tx[i + 1] - tx[i]) * f;
    out.tz = tz[i] + (tz[i + 1] - tz[i]) * f;
    out.k = k[i] + (k[i + 1] - k[i]) * f;
    return out;
  };
  return { n, x, y, z, tx, tz, k, sStart, sEnd, total, sample };
}

const newPoint = (): RoutePoint => ({ x: 0, y: 0, z: 0, tx: 1, tz: 0, k: 0 });

/* ------------------------------------------------------------------ look */

const SUN_DIR = new THREE.Vector3(0.72, 0.5, 0.46).normalize();
const CAM_FOV = 27;
const CAM_PITCH = THREE.MathUtils.degToRad(39);

const ENV_FRAGMENT = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uSun;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec3 d = normalize(vDir);
    float az = atan(d.z, d.x);
    vec3 zenith = vec3(0.30, 0.50, 0.86) * 1.5;
    vec3 horizon = vec3(1.0, 0.90, 0.77) * 2.3;
    vec3 col = mix(horizon, zenith, pow(clamp(d.y, 0.0, 1.0), 0.45));
    float cloud = 0.55 * vnoise(vec2(az * 1.6, d.y * 5.0)) + 0.3 * vnoise(vec2(az * 3.7 + 3.0, d.y * 11.0)) + 0.15 * vnoise(vec2(az * 8.0, d.y * 23.0));
    col += vec3(1.0, 0.96, 0.9) * smoothstep(0.42, 0.85, cloud) * 0.7 * smoothstep(0.08, 0.5, d.y);
    float sd = max(dot(d, normalize(uSun)), 0.0);
    col += vec3(1.0, 0.82, 0.58) * (pow(sd, 700.0) * 70.0 + pow(sd, 40.0) * 2.0 + pow(sd, 6.0) * 0.5);
    float ridge = 0.05 + 0.06 * vnoise(vec2(az * 3.0, 1.0)) + 0.025 * vnoise(vec2(az * 11.0, 4.0));
    if (d.y < ridge) {
      vec3 hill = mix(vec3(0.10, 0.17, 0.08), vec3(0.40, 0.50, 0.46), smoothstep(0.0, ridge, d.y) * 0.65);
      vec3 ground = mix(vec3(0.24, 0.26, 0.18), vec3(0.17, 0.17, 0.16), smoothstep(0.0, -0.4, d.y));
      col = d.y > 0.0 ? hill : ground;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const LABEL_CLASS =
  "pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-full border border-white/35 bg-[#0B5683]/80 px-2.5 py-1 text-[11px] font-bold leading-none tracking-wide text-white shadow-[0_6px_18px_-6px_rgba(8,62,96,0.7)] backdrop-blur-sm will-change-transform sm:text-xs";

/** Real-time 3D hero: a car drives the Sanchari "S" road through a misty ghat landscape. Transparent background. */
export function RoadTrip3D({ labels, className, variant = "scene", quality = "auto", onStatus }: RoadTrip3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const statusRef = useRef(onStatus);
  useEffect(() => {
    statusRef.current = onStatus;
  }, [onStatus]);

  const stops = labels && labels.length > 0 ? labels : ["Bengaluru", "Chikmagalur"];
  const stopsKey = stops.join("|");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stopNames = stopsKey.split("|");
    const emit = (s: RoadTrip3DStatus) => statusRef.current?.(s);

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const cores = navigator.hardwareConcurrency ?? 8;
    // dev-only inspection views: ?car3d=closeup orbits the car, ?car3d=scene&z=2&ox=0.5&oy=1 magnifies part of the hero view
    const debugParams = process.env.NODE_ENV !== "production" ? new URLSearchParams(window.location.search) : null;
    const debugMode = debugParams?.get("car3d") ?? null;
    const debugOverlay = debugMode === "closeup" || debugMode === "scene";
    const debug = { closeup: debugMode === "closeup", zoom: 1, ox: 0.5, oy: 0.5, orbit: -1, frozen: false };
    const mini = variant === "minimap";
    const tier = debugParams?.get("q") ?? quality;
    const low = mini || tier === "low" || (tier !== "high" && (coarse || window.innerWidth < 768 || cores <= 4));
    const camPitch = mini ? THREE.MathUtils.degToRad(60) : CAM_PITCH;

    /* ---------- renderer ---------- */
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;opacity:0;transition:opacity 900ms ease-out;" +
      "-webkit-mask-image:linear-gradient(to right,transparent,#000 10%,#000 90%,transparent),linear-gradient(to bottom,transparent,#000 13%,#000 90%,transparent);" +
      "-webkit-mask-composite:source-in;" +
      "mask-image:linear-gradient(to right,transparent,#000 10%,#000 90%,transparent),linear-gradient(to bottom,transparent,#000 13%,#000 90%,transparent);" +
      "mask-composite:intersect;";
    if (mini) {
      canvas.style.maskImage = "none";
      canvas.style.webkitMaskImage = "none";
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !low || mini, powerPreference: mini ? "default" : "high-performance" });
    } catch {
      emit("failed");
      return;
    }
    const box: HTMLElement = debugOverlay ? canvas : host;
    if (debugOverlay) {
      canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:9999;background:#5b8496;transition:none;";
      document.body.appendChild(canvas);
    } else {
      host.prepend(canvas);
    }
    let dpr = Math.min(window.devicePixelRatio || 1, low && !mini ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = !low;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const trash: { dispose(): void }[] = [];
    const keep = <T extends { dispose(): void }>(d: T): T => {
      trash.push(d);
      return d;
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 2, 400);

    /* ---------- sky light: a painted morning sky, prefiltered for reflections ---------- */
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(50, 48, 24);
    const envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uSun: { value: SUN_DIR } },
      vertexShader: "varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: ENV_FRAGMENT,
    });
    envScene.add(new THREE.Mesh(envGeo, envMat));
    const envTarget = pmrem.fromScene(envScene, 0.02);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.95;
    envGeo.dispose();
    envMat.dispose();
    pmrem.dispose();
    keep(envTarget);

    /* ---------- route + terrain helpers ---------- */
    const route = buildRoute();
    const terrainNoise = makeTileNoise(77);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < route.n; i++) {
      minX = Math.min(minX, route.x[i]);
      maxX = Math.max(maxX, route.x[i]);
      minZ = Math.min(minZ, route.z[i]);
      maxZ = Math.max(maxZ, route.z[i]);
    }
    const centre = new THREE.Vector3((minX + maxX) / 2, RISE / 2, (minZ + maxZ) / 2);

    const info = { d: 0, s: 0, h: 0 };
    const probe = (px: number, pz: number) => {
      let best = Infinity;
      let bi = 0;
      let wsum = 0;
      let hsum = 0;
      for (let i = 0; i < route.n; i += 2) {
        const dx = px - route.x[i];
        const dz = pz - route.z[i];
        const d2 = dx * dx + dz * dz;
        if (d2 < best) {
          best = d2;
          bi = i;
        }
        const w = 1 / ((d2 + 0.6) * (d2 + 0.6));
        wsum += w;
        hsum += w * route.y[i];
      }
      info.d = Math.sqrt(best);
      info.s = bi * DS;
      info.h = hsum / wsum;
      return info;
    };
    const endFade = (s: number) => smoothstep(0, 5, s) * (1 - smoothstep(route.total - 6, route.total - 0.5, s));
    /** Ground height at a point already probed. */
    const groundY = (px: number, pz: number, d: number, h: number) => {
      const und = terrainNoise.fbm((px + 60) / 40, (pz + 60) / 40, 4, 3) - 0.5;
      return h - 0.04 - 0.55 * smoothstep(3.6, 10.5, d) + und * 0.9 * smoothstep(4, 9, d);
    };
    const groundAlpha = (px: number, pz: number, d: number, s: number) => {
      const nz = terrainNoise.fbm((px + 90) / 26, (pz + 90) / 26, 4, 3) - 0.5;
      return (1 - smoothstep(8, 13, d + nz * 3.4)) * endFade(s);
    };

    /* ---------- lights ---------- */
    const sun = new THREE.DirectionalLight(0xffdcae, 3.2);
    sun.position.copy(centre).addScaledVector(SUN_DIR, 70);
    sun.target.position.copy(centre);
    sun.castShadow = !low;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
    sun.shadow.autoUpdate = false; // refreshed every other frame in the loop
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(0xd6e8f6, 0x6c7a4c, 0.45));

    /* ---------- ground ---------- */
    const groundMaps = createGroundMaps(low ? 256 : 512);
    keep(groundMaps.map);
    keep(groundMaps.normalMap);
    groundMaps.map.anisotropy = anisotropy;
    {
      const cell = low ? 1.05 : 0.8;
      const x0 = minX - 15;
      const z0 = minZ - 15;
      const nx = Math.ceil((maxX - minX + 30) / cell);
      const nz = Math.ceil((maxZ - minZ + 30) / cell);
      const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
      const col = new Float32Array((nx + 1) * (nz + 1) * 4);
      const uv = new Float32Array((nx + 1) * (nz + 1) * 2);
      const gravel = [0.44, 0.33, 0.23]; // laterite shoulder
      const grass = [0.17, 0.27, 0.08];
      const dry = [0.34, 0.33, 0.14];
      const moss = [0.09, 0.17, 0.06];
      let p = 0;
      for (let iz = 0; iz <= nz; iz++) {
        for (let ix = 0; ix <= nx; ix++) {
          const px = x0 + ix * cell;
          const pz = z0 + iz * cell;
          const g = probe(px, pz);
          pos[p * 3] = px;
          pos[p * 3 + 1] = groundY(px, pz, g.d, g.h);
          pos[p * 3 + 2] = pz;
          uv[p * 2] = px / 5;
          uv[p * 2 + 1] = pz / 5;
          const n1 = terrainNoise.fbm((px + 50) / 12, (pz + 50) / 12, 8, 3);
          const n2 = terrainNoise.fbm((px + 20) / 18, (pz + 70) / 18, 8, 3);
          const t = smoothstep(3.35, 4.7, g.d + (n1 - 0.5) * 1.1);
          const dryT = smoothstep(0.45, 0.75, n2) * 0.7;
          const mossT = smoothstep(0.55, 0.3, n1) * 0.6;
          for (let c = 0; c < 3; c++) {
            let gc = grass[c] + (dry[c] - grass[c]) * dryT;
            gc += (moss[c] - gc) * mossT;
            col[p * 4 + c] = gravel[c] + (gc - gravel[c]) * t;
          }
          col[p * 4 + 3] = groundAlpha(px, pz, g.d, g.s);
          p++;
        }
      }
      const idx: number[] = [];
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          const a = iz * (nx + 1) + ix;
          const b = a + 1;
          const c = a + nx + 1;
          const d = c + 1;
          if (col[a * 4 + 3] + col[b * 4 + 3] + col[c * 4 + 3] + col[d * 4 + 3] <= 0.001) continue;
          idx.push(a, c, b, b, c, d);
        }
      }
      const geo = keep(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = keep(
        new THREE.MeshStandardMaterial({
          map: groundMaps.map,
          normalMap: groundMaps.normalMap,
          normalScale: new THREE.Vector2(0.8, 0.8),
          vertexColors: true,
          transparent: true,
          roughness: 1,
          metalness: 0,
          envMapIntensity: 0.5,
        }),
      );
      const ground = new THREE.Mesh(geo, mat);
      ground.receiveShadow = true;
      ground.renderOrder = -10;
      scene.add(ground);
    }

    /* ---------- road ---------- */
    const asphalt = createAsphaltMaps(low ? 512 : 1024);
    keep(asphalt.map);
    keep(asphalt.normalMap);
    keep(asphalt.roughnessMap);
    asphalt.map.anisotropy = anisotropy;
    asphalt.normalMap.anisotropy = anisotropy;
    {
      const pos = new Float32Array(route.n * 2 * 3);
      const col = new Float32Array(route.n * 2 * 4);
      const uv = new Float32Array(route.n * 2 * 2);
      const idx: number[] = [];
      for (let i = 0; i < route.n; i++) {
        const lx = route.tz[i];
        const lz = -route.tx[i];
        const a = endFade(i * DS);
        for (let side = 0; side < 2; side++) {
          const o = side === 0 ? HALF_ROAD : -HALF_ROAD;
          const q = i * 2 + side;
          pos[q * 3] = route.x[i] + lx * o;
          pos[q * 3 + 1] = route.y[i] + 0.03;
          pos[q * 3 + 2] = route.z[i] + lz * o;
          col[q * 4] = col[q * 4 + 1] = col[q * 4 + 2] = 1;
          col[q * 4 + 3] = a;
          uv[q * 2] = side;
          uv[q * 2 + 1] = (i * DS) / ROAD_TILE_LENGTH;
        }
        if (i < route.n - 1) {
          const k = i * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const geo = keep(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = keep(
        new THREE.MeshStandardMaterial({
          map: asphalt.map,
          normalMap: asphalt.normalMap,
          normalScale: new THREE.Vector2(0.9, 0.9),
          roughnessMap: asphalt.roughnessMap,
          roughness: 1,
          metalness: 0,
          vertexColors: true,
          transparent: true,
          envMapIntensity: 0.9,
        }),
      );
      const road = new THREE.Mesh(geo, mat);
      road.receiveShadow = true;
      road.renderOrder = -9;
      scene.add(road);
    }

    /* ---------- vegetation ---------- */
    const wind = { uTime: { value: 0 } };
    const rnd = mulberry32(2026);
    const leafTex = keep(createLeafTexture(low ? 256 : 512));
    leafTex.anisotropy = Math.min(4, anisotropy);
    const foliageMat = keep(
      // Lambert, not PBR: canopies overlap many layers deep, so their shader has to be cheap
      new THREE.MeshLambertMaterial({ map: leafTex, alphaTest: 0.36, vertexColors: true, color: 0xdfe6d2 }),
    );
    foliageMat.alphaToCoverage = !low;
    applyWind(foliageMat, wind, 0.003, 0.03);
    const foliageDepth = keep(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.36 }));
    applyWind(foliageDepth, wind, 0.003, 0.03);
    const trunkMat = keep(new THREE.MeshLambertMaterial({ color: 0x6a5846, map: groundMaps.map }));
    applyWind(trunkMat, wind, 0.003, 0);

    const cards = low ? 34 : 52;
    const treeDefs = [buildTree(11, 7.6, 3.3, cards), buildTree(23, 9.6, 2.9, cards), buildTree(37, 6.2, 3.0, cards)];
    treeDefs.forEach((t) => {
      keep(t.trunk);
      keep(t.foliage);
    });

    const occludesRoad = (px: number, pz: number, h: number, r: number) => {
      for (let k = 0; k <= h * 1.2 + r; k += 0.9) {
        for (const ox of [-r, 0, r]) {
          if (probe(px + ox, pz - k).d < HALF_ROAD + 1) return true;
        }
      }
      return false;
    };

    interface Placement {
      x: number;
      y: number;
      z: number;
      scale: number;
      rot: number;
      variant: number;
    }
    const trees: Placement[] = [];
    const wantedTrees = mini ? 18 : low ? 24 : 64;
    for (let attempt = 0; attempt < 9000 && trees.length < wantedTrees; attempt++) {
      const px = minX - 13.5 + rnd() * (maxX - minX + 27);
      const pz = minZ - 13.5 + rnd() * (maxZ - minZ + 27);
      const g = probe(px, pz);
      const d = g.d;
      const h = g.h;
      if (d < 4.9 || d > 12.4) continue;
      if (groundAlpha(px, pz, d, g.s) < 0.4) continue;
      const variant = Math.floor(rnd() * treeDefs.length);
      const scale = 0.72 + rnd() * 0.6;
      const def = treeDefs[variant];
      if (occludesRoad(px, pz, def.height * scale, def.radius * scale)) continue;
      if (trees.some((t) => Math.hypot(t.x - px, t.z - pz) < 2.4)) continue;
      trees.push({ x: px, y: groundY(px, pz, d, h) - 0.1, z: pz, scale, rot: rnd() * Math.PI * 2, variant });
    }
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    treeDefs.forEach((def, variant) => {
      const list = trees.filter((t) => t.variant === variant);
      if (list.length === 0) return;
      const trunks = new THREE.InstancedMesh(def.trunk, trunkMat, list.length);
      const crowns = new THREE.InstancedMesh(def.foliage, foliageMat, list.length);
      list.forEach((t, i) => {
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
        crowns.setMatrixAt(i, dummy.matrix);
        tint.setHSL(0.2 + rnd() * 0.1, 0.18 + rnd() * 0.22, 0.62 + rnd() * 0.3);
        crowns.setColorAt(i, tint);
      });
      crowns.customDepthMaterial = foliageDepth;
      trunks.name = "trees";
      crowns.name = "trees";
      trunks.castShadow = crowns.castShadow = !low;
      trunks.receiveShadow = true;
      scene.add(trunks, crowns);
      keep(trunks);
      keep(crowns);
    });

    // Shrubs: small canopies sitting on the verge
    {
      const def = treeDefs[2];
      const count = low ? 12 : 34;
      const shrubs = new THREE.InstancedMesh(def.foliage, foliageMat, count);
      let placed = 0;
      for (let attempt = 0; attempt < 3000 && placed < count; attempt++) {
        const px = minX - 9 + rnd() * (maxX - minX + 18);
        const pz = minZ - 9 + rnd() * (maxZ - minZ + 18);
        const g = probe(px, pz);
        const d = g.d;
        const h = g.h;
        if (d < 4.3 || d > 11 || groundAlpha(px, pz, d, g.s) < 0.5) continue;
        const scale = 0.16 + rnd() * 0.16;
        if (occludesRoad(px, pz, 1.6, 0.8)) continue;
        dummy.position.set(px, groundY(px, pz, d, h) - def.height * 0.52 * scale, pz);
        dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
        dummy.scale.set(scale * 1.25, scale, scale * 1.25);
        dummy.updateMatrix();
        shrubs.setMatrixAt(placed, dummy.matrix);
        tint.setHSL(0.2 + rnd() * 0.1, 0.2 + rnd() * 0.2, 0.6 + rnd() * 0.3);
        shrubs.setColorAt(placed, tint);
        placed++;
      }
      shrubs.count = placed;
      shrubs.customDepthMaterial = foliageDepth;
      shrubs.castShadow = !low;
      scene.add(shrubs);
      keep(shrubs);
    }

    // Grass tufts
    {
      const grassTex = keep(createGrassTexture(128));
      const grassGeo = keep(buildGrassTuft());
      const grassMat = keep(new THREE.MeshLambertMaterial({ map: grassTex, alphaTest: 0.4 }));
      grassMat.alphaToCoverage = !low;
      applyWind(grassMat, wind, 0.05, 0);
      const count = mini ? 320 : low ? 700 : 2400;
      const tufts = new THREE.InstancedMesh(grassGeo, grassMat, count);
      let placed = 0;
      for (let attempt = 0; attempt < count * 8 && placed < count; attempt++) {
        const px = minX - 10 + rnd() * (maxX - minX + 20);
        const pz = minZ - 10 + rnd() * (maxZ - minZ + 20);
        const g = probe(px, pz);
        const d = g.d;
        const h = g.h;
        if (d < 3.7 || d > 11.5 || groundAlpha(px, pz, d, g.s) < 0.45) continue;
        const sc = 0.22 + rnd() * 0.3;
        dummy.position.set(px, groundY(px, pz, d, h) - 0.03, pz);
        dummy.rotation.set(0, rnd() * Math.PI, 0);
        dummy.scale.set(sc * (1.3 + rnd() * 0.9), sc, sc * (1.3 + rnd() * 0.9));
        dummy.updateMatrix();
        tufts.setMatrixAt(placed, dummy.matrix);
        tint.setHSL(0.19 + rnd() * 0.1, 0.15 + rnd() * 0.25, 0.5 + rnd() * 0.3);
        tufts.setColorAt(placed, tint);
        placed++;
      }
      tufts.count = placed;
      tufts.name = "grass";
      tufts.receiveShadow = true;
      scene.add(tufts);
      keep(tufts);
    }

    // Boulders
    {
      const rockGeo = keep(buildRock(5));
      const rockMat = keep(
        new THREE.MeshStandardMaterial({ color: 0x9a968b, map: groundMaps.map, normalMap: groundMaps.normalMap, roughness: 0.95, metalness: 0 }),
      );
      const count = low ? 6 : 12;
      const rocks = new THREE.InstancedMesh(rockGeo, rockMat, count);
      let placed = 0;
      for (let attempt = 0; attempt < 2000 && placed < count; attempt++) {
        const px = minX - 8 + rnd() * (maxX - minX + 16);
        const pz = minZ - 8 + rnd() * (maxZ - minZ + 16);
        const g = probe(px, pz);
        const d = g.d;
        const h = g.h;
        if (d < 3.9 || d > 8 || groundAlpha(px, pz, d, g.s) < 0.6) continue;
        const sc = 0.28 + rnd() * 0.42;
        dummy.position.set(px, groundY(px, pz, d, h) + sc * 0.1, pz);
        dummy.rotation.set(rnd() * 0.4, rnd() * Math.PI * 2, rnd() * 0.4);
        dummy.scale.set(sc * (0.9 + rnd() * 0.6), sc, sc * (0.9 + rnd() * 0.5));
        dummy.updateMatrix();
        rocks.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
      rocks.count = placed;
      rocks.castShadow = !low;
      rocks.receiveShadow = true;
      scene.add(rocks);
      keep(rocks);
    }

    /* ---------- parapet blocks on the outside of the bends ---------- */
    {
      const tex = keep(createParapetTexture());
      const geo = keep(new THREE.BoxGeometry(1.1, 0.5, 0.32));
      const mat = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      const spots: [number, number, number, number][] = [];
      let lastS = -10;
      for (let i = 0; i < route.n; i++) {
        const s = i * DS;
        if (Math.abs(route.k[i]) < 0.07 || s - lastS < 1.9) continue;
        lastS = s;
        const side = route.k[i] > 0 ? -1 : 1; // outside of the bend
        const o = side * (HALF_ROAD + 0.62);
        spots.push([route.x[i] + route.tz[i] * o, route.y[i], route.z[i] - route.tx[i] * o, Math.atan2(-route.tz[i], route.tx[i])]);
      }
      const blocks = new THREE.InstancedMesh(geo, mat, spots.length);
      spots.forEach(([bx, by, bz, yaw], i) => {
        dummy.position.set(bx, by + 0.2, bz);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        blocks.setMatrixAt(i, dummy.matrix);
      });
      blocks.castShadow = !low;
      blocks.receiveShadow = true;
      scene.add(blocks);
      keep(blocks);
    }

    /* ---------- milestones + direction sign ---------- */
    const destination = (stopNames[stopNames.length - 1] ?? "Chikmagalur").replace(/\(.*?\)/g, "").trim().toUpperCase();
    const origin = (stopNames[0] ?? "Bengaluru").replace(/\(.*?\)/g, "").trim().toUpperCase();
    const rp = newPoint();
    {
      const stoneGeo = keep(buildMilestone());
      const sideMat = keep(new THREE.MeshStandardMaterial({ color: 0xe6e3d8, roughness: 0.9 }));
      const span = route.sEnd - route.sStart;
      const stones: [number, number, string, string][] = [
        [route.sStart + span * 0.14, 1, destination, "12"],
        [route.sStart + span * 0.5, -1, origin, "246"],
        [route.sStart + span * 0.8, 1, destination, "4"],
      ];
      for (const [s, side, place, km] of stones) {
        route.sample(s, rp);
        const lx = rp.tz * side;
        const lz = -rp.tx * side;
        const px = rp.x + lx * (HALF_ROAD + 1.05);
        const pz = rp.z + lz * (HALF_ROAD + 1.05);
        const g = probe(px, pz);
        const tex = keep(createMilestoneTexture(place, km));
        tex.repeat.set(1 / MILESTONE.width, 1 / MILESTONE.height);
        tex.offset.set(0.5, 0);
        const faceMat = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
        const stone = new THREE.Mesh(stoneGeo, [faceMat, sideMat]);
        stone.position.set(px, groundY(px, pz, g.d, g.h) - 0.06, pz);
        stone.rotation.y = Math.atan2(-lx, -lz) + (side > 0 ? -0.35 : 0.35);
        stone.rotation.z = (rnd() - 0.5) * 0.06;
        stone.castShadow = !low;
        stone.receiveShadow = true;
        scene.add(stone);
      }
    }
    const signPos = new THREE.Vector3();
    {
      const px = (8 - VIEW_W / 2) * UNIT;
      const pz = (152 - VIEW_H / 2) * UNIT;
      const g = probe(px, pz);
      signPos.set(px, groundY(px, pz, g.d, g.h), pz);
      const sign = new THREE.Group();
      sign.position.copy(signPos);
      sign.rotation.y = 0.3;
      const boardTex = keep(createSignTexture(destination, "6"));
      const frontMat = keep(new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.55, metalness: 0.1 }));
      const backMat = keep(new THREE.MeshStandardMaterial({ color: 0x8e959a, roughness: 0.5, metalness: 0.7 }));
      const boardGeo = keep(new THREE.BoxGeometry(3.4, 1.7, 0.06));
      const board = new THREE.Mesh(boardGeo, [backMat, backMat, backMat, backMat, frontMat, backMat]);
      board.position.y = 3.15;
      board.castShadow = !low;
      const postGeo = keep(new THREE.CylinderGeometry(0.065, 0.065, 4.1, 10));
      for (const ox of [-1.15, 1.15]) {
        const post = new THREE.Mesh(postGeo, backMat);
        post.position.set(ox, 1.95, -0.09);
        post.castShadow = !low;
        sign.add(post);
      }
      sign.add(board);
      scene.add(sign);
    }

    /* ---------- pins ---------- */
    const pinProfile: THREE.Vector2[] = [new THREE.Vector2(0.001, 0)];
    {
      const R = 0.8;
      const cy = 1.9;
      const th = Math.acos(R / cy);
      pinProfile.push(new THREE.Vector2(R * Math.sin(th) * 0.5, (cy - R * Math.cos(th)) * 0.5));
      for (let i = 0; i <= 18; i++) {
        const a = th + ((Math.PI - th) * i) / 18;
        pinProfile.push(new THREE.Vector2(Math.max(0.001, R * Math.sin(a)), cy - R * Math.cos(a)));
      }
    }
    const pinGeo = keep(new THREE.LatheGeometry(pinProfile, 36));
    const dotGeo = keep(new THREE.SphereGeometry(0.36, 20, 14));
    const ringGeo = keep(new THREE.RingGeometry(0.82, 1, 48));
    ringGeo.rotateX(-Math.PI / 2);
    interface Pin {
      group: THREE.Group;
      ring: THREE.Mesh;
      ringMat: THREE.MeshBasicMaterial;
      baseY: number;
      head: THREE.Vector3;
      labelRight: boolean;
      last: boolean;
      phase: number;
    }
    const pins: Pin[] = stopNames.map((_, i) => {
      const count = stopNames.length;
      const frac = count === 1 ? 1 : i / (count - 1);
      const s = route.sStart + (route.sEnd - route.sStart) * frac;
      route.sample(s, rp);
      const first = i === 0;
      const last = i === count - 1 && count > 1;
      const colour = last ? 0xff7a26 : first ? 0xfffefc : 0x1ba3b3;
      const dotColour = last ? 0xfffefc : first ? 0x0e5e8f : 0xfffefc;
      const mat = keep(
        new THREE.MeshPhysicalMaterial({
          color: colour,
          roughness: 0.32,
          clearcoat: 0.8,
          clearcoatRoughness: 0.1,
          emissive: colour,
          emissiveIntensity: last ? 0.22 : 0.06,
        }),
      );
      const dotMat = keep(new THREE.MeshStandardMaterial({ color: dotColour, roughness: 0.35 }));
      const group = new THREE.Group();
      const pin = new THREE.Mesh(pinGeo, mat);
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(0, 1.9 + 0.42, 0.5);
      dot.scale.set(1, 1, 0.55);
      dot.rotation.x = -0.7;
      group.add(pin, dot);
      const scale = (first || last ? 1.12 : 0.85) * (mini ? 1.75 : 1);
      group.scale.setScalar(scale);
      const baseY = rp.y + 2.15;
      group.position.set(rp.x, baseY, rp.z);
      pin.castShadow = !low;
      scene.add(group);
      const ringMat = keep(
        new THREE.MeshBasicMaterial({ color: last ? 0xff8a3d : 0xdff3f4, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }),
      );
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(rp.x, rp.y + 0.07, rp.z);
      ring.renderOrder = -6;
      scene.add(ring);
      return { group, ring, ringMat, baseY, head: new THREE.Vector3(rp.x, baseY + 1.9 * scale, rp.z), labelRight: rp.x < centre.x, last, phase: i * 1.7 };
    });

    // Minimap only: a soft "you are here" ring that travels with the car, so it reads at thumbnail size
    let marker: THREE.Mesh | null = null;
    let markerMat: THREE.MeshBasicMaterial | null = null;
    if (mini) {
      const g = keep(new THREE.RingGeometry(2.7, 3.5, 40));
      g.rotateX(-Math.PI / 2);
      markerMat = keep(new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false, toneMapped: false }));
      marker = new THREE.Mesh(g, markerMat);
      marker.renderOrder = 15;
      scene.add(marker);
    }

    /* ---------- mist + dust ---------- */
    const mistTex = keep(createMistTexture(low ? 128 : 256));
    const mists: { sprite: THREE.Sprite; speed: number; baseOpacity: number; phase: number }[] = [];
    for (let i = 0; i < (mini ? 2 : low ? 3 : 5); i++) {
      const baseOpacity = 0.16 + rnd() * 0.16;
      const m = keep(new THREE.SpriteMaterial({ map: mistTex, color: 0xfff5e8, transparent: true, opacity: baseOpacity, depthTest: false, depthWrite: false }));
      const sprite = new THREE.Sprite(m);
      const w = 17 + rnd() * 12;
      sprite.scale.set(w, w * (0.42 + rnd() * 0.2), 1);
      sprite.position.set(minX - 8 + rnd() * (maxX - minX + 16), 1.5 + rnd() * 4, minZ - 6 + rnd() * (maxZ - minZ + 12));
      sprite.renderOrder = 20;
      scene.add(sprite);
      mists.push({ sprite, speed: 0.25 + rnd() * 0.45, baseOpacity, phase: rnd() * 6 });
    }
    const dotTex = keep(createSoftDotTexture());
    const dust: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; life: number; vx: number; vz: number }[] = [];
    for (let i = 0; i < (low ? 12 : 26); i++) {
      const mat = keep(new THREE.SpriteMaterial({ map: dotTex, color: 0xd8c8ac, transparent: true, opacity: 0, depthWrite: false }));
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 5;
      scene.add(sprite);
      dust.push({ sprite, mat, life: 0, vx: 0, vz: 0 });
    }
    let dustCursor = 0;
    let dustClock = 0;

    /* ---------- car ---------- */
    const car = buildErtiga({ detail: low ? "low" : "high", anisotropy, castShadow: !low });
    scene.add(car.group);

    // Speed plan: slow into bends, accelerate out, stop at the destination
    const stopS = route.sEnd - 3.2;
    const entryS = 1.7;
    const exitEndS = route.sEnd + 9.8;
    const vPlan = new Float32Array(route.n);
    {
      const A_LAT = 3.1;
      const V_MAX = 12.5;
      const V_MIN = 4;
      for (let i = 0; i < route.n; i++) {
        const kk = Math.abs(route.k[Math.min(route.n - 1, i + 5)]);
        vPlan[i] = Math.min(V_MAX, Math.max(V_MIN, Math.sqrt(A_LAT / Math.max(kk, 1e-4))));
      }
      const iStop = Math.round(stopS / DS);
      const iEntry = Math.round(entryS / DS);
      vPlan[iEntry] = Math.min(vPlan[iEntry], 4.5);
      for (let i = iEntry + 1; i <= iStop; i++) vPlan[i] = Math.min(vPlan[i], Math.sqrt(vPlan[i - 1] * vPlan[i - 1] + 2 * 1.7 * DS));
      vPlan[iStop] = 0;
      for (let i = iStop - 1; i >= iEntry; i--) vPlan[i] = Math.min(vPlan[i], Math.sqrt(vPlan[i + 1] * vPlan[i + 1] + 2 * 2.5 * DS));
    }
    const planAt = (s: number) => {
      const u = Math.min(route.n - 1.001, Math.max(0, s / DS));
      const i = Math.floor(u);
      return vPlan[i] + (vPlan[i + 1] - vPlan[i]) * (u - i);
    };
    const drive = { s: entryS, v: 4.5, phase: "drive" as "drive" | "pause" | "exit", timer: 0, accel: 0, steer: 0, roll: 0, pitch: 0, brake: 0, bump: 0 };
    const pf = newPoint();
    const pr = newPoint();
    const pc = newPoint();
    const lanePoint = (s: number, out: RoutePoint) => {
      route.sample(s, out);
      out.x += out.tz * LANE;
      out.z += -out.tx * LANE;
      return out;
    };
    const rearWorld = new THREE.Vector3();

    const stepCar = (dt: number, time: number) => {
      const prevV = drive.v;
      if (drive.phase === "drive") {
        drive.v = Math.max(planAt(drive.s), 0.45);
        drive.s += drive.v * dt;
        if (drive.s >= stopS - 0.03) {
          drive.s = stopS;
          drive.v = 0;
          drive.phase = "pause";
          drive.timer = 1.5;
        }
      } else if (drive.phase === "pause") {
        drive.v = 0;
        drive.timer -= dt;
        if (drive.timer <= 0) drive.phase = "exit";
      } else {
        drive.v = Math.min(9, drive.v + 1.9 * dt);
        drive.s += drive.v * dt;
        if (drive.s >= exitEndS) {
          drive.s = entryS;
          drive.v = 4.5;
          drive.phase = "drive";
        }
      }
      const accelNow = dt > 0 ? (drive.v - prevV) / dt : 0;
      const ease = 1 - Math.exp(-dt * 7);
      drive.accel += (THREE.MathUtils.clamp(accelNow, -4, 4) - drive.accel) * ease;

      lanePoint(drive.s + car.frontAxleX, pf);
      lanePoint(drive.s + car.rearAxleX, pr);
      route.sample(drive.s, pc);
      const dx = pf.x - pr.x;
      const dz = pf.z - pr.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      car.group.position.set(pr.x - ux * car.rearAxleX, (pf.y * -car.rearAxleX + pr.y * car.frontAxleX) / car.wheelBase + 0.03, pr.z - uz * car.rearAxleX);
      car.group.rotation.set(0, Math.atan2(-uz, ux), Math.atan2(pf.y - pr.y, len));

      const kFront = route.k[Math.min(route.n - 1, Math.round((drive.s + car.frontAxleX + 0.6) / DS))];
      const steerTarget = THREE.MathUtils.clamp(Math.atan(car.wheelBase * kFront) * 1.15, -0.6, 0.6);
      drive.steer += (steerTarget - drive.steer) * (1 - Math.exp(-dt * 9));
      car.setSteer(drive.steer);
      car.roll(drive.v * dt);

      const lat = drive.v * drive.v * pc.k;
      const rollTarget = THREE.MathUtils.clamp(lat * 0.016, -0.075, 0.075);
      const pitchTarget = THREE.MathUtils.clamp(drive.accel * 0.011, -0.04, 0.035);
      const spring = 1 - Math.exp(-dt * 5.5);
      drive.roll += (rollTarget - drive.roll) * spring;
      drive.pitch += (pitchTarget - drive.pitch) * spring;
      const speedK = Math.min(1, drive.v / 6);
      const bumpTarget =
        (terrainNoise.noise(drive.s * 0.9, 3.3, 256) - 0.5) * 0.02 * speedK + Math.sin(time * 31) * 0.0012 + Math.sin(time * 2.1) * 0.002 * (1 - speedK);
      drive.bump += (bumpTarget - drive.bump) * (1 - Math.exp(-dt * 14));
      car.body.rotation.x = drive.roll + (terrainNoise.noise(drive.s * 0.6, 9.1, 256) - 0.5) * 0.008 * speedK;
      car.body.rotation.z = drive.pitch;
      car.body.position.y = drive.bump - Math.abs(drive.roll) * 0.12;

      const braking = drive.phase === "pause" || drive.accel < -0.55 ? 1 : 0;
      drive.brake += (braking - drive.brake) * (1 - Math.exp(-dt * 16));
      car.setBrake(drive.brake);

      const fadeIn = smoothstep(entryS, entryS + 4.6, drive.s);
      const fadeOut = 1 - smoothstep(route.sEnd + 4.4, exitEndS - 0.2, drive.s);
      car.setOpacity(Math.min(fadeIn, fadeOut));
      if (marker && markerMat) {
        marker.position.set(car.group.position.x, car.group.position.y + 0.25, car.group.position.z);
        marker.scale.setScalar(1 + 0.12 * Math.sin(time * 3));
        markerMat.opacity = 0.85 * Math.min(fadeIn, fadeOut);
      }

      // Dust curling off the rear tyres
      dustClock -= dt;
      if (drive.v > 2.5 && dustClock <= 0 && fadeIn * fadeOut > 0.5) {
        dustClock = 0.055 + (1 - Math.min(1, drive.v / 12)) * 0.08;
        const p = dust[dustCursor++ % dust.length];
        const sideZ = dustCursor % 2 === 0 ? 0.72 : -0.72;
        rearWorld.set(car.rearAxleX - 0.25, 0.12, sideZ);
        car.group.localToWorld(rearWorld);
        p.sprite.position.copy(rearWorld);
        p.sprite.visible = true;
        p.life = 1;
        p.vx = -ux * drive.v * 0.12 + (rnd() - 0.5) * 0.5;
        p.vz = -uz * drive.v * 0.12 + (rnd() - 0.5) * 0.5;
      }
      for (const p of dust) {
        if (p.life <= 0) continue;
        p.life -= dt / 1.25;
        if (p.life <= 0) {
          p.sprite.visible = false;
          continue;
        }
        const age = 1 - p.life;
        p.sprite.position.x += p.vx * dt;
        p.sprite.position.z += p.vz * dt;
        p.sprite.position.y += 0.35 * dt;
        p.sprite.scale.setScalar(0.5 + age * 2);
        p.mat.opacity = 0.17 * Math.sin(Math.PI * Math.min(1, age * 1.15)) * Math.min(1, drive.v / 7 + 0.35);
      }
    };

    /* ---------- camera ---------- */
    const target = centre.clone();
    let baseDist = 70;
    const fitPts: THREE.Vector3[] = [];
    for (let i = 0; i < route.n; i += 6) {
      // frame the S itself; the lead-in and lead-out stubs may run into the soft edge
      if (i * DS < route.sStart - 2 || i * DS > route.sEnd + 3) continue;
      const lx = route.tz[i];
      const lz = -route.tx[i];
      for (const o of [-HALF_ROAD - 2.2, HALF_ROAD + 2.2]) fitPts.push(new THREE.Vector3(route.x[i] + lx * o, route.y[i], route.z[i] + lz * o));
    }
    for (const p of pins) fitPts.push(p.head.clone().setY(p.head.y + 1.6));
    fitPts.push(new THREE.Vector3(signPos.x, signPos.y + 4.2, signPos.z));
    const proj = new THREE.Vector3();
    const look = new THREE.Vector3();
    const placeCamera = (az: number, pitch: number, dist: number, aim: THREE.Vector3 = target) => {
      camera.position.set(aim.x + dist * Math.sin(az) * Math.cos(pitch), aim.y + dist * Math.sin(pitch), aim.z + dist * Math.cos(az) * Math.cos(pitch));
      camera.lookAt(aim);
      camera.updateMatrixWorld();
    };
    const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    const measure = () => {
      bounds.minX = bounds.minY = Infinity;
      bounds.maxX = bounds.maxY = -Infinity;
      for (const p of fitPts) {
        proj.copy(p).project(camera);
        bounds.minX = Math.min(bounds.minX, proj.x);
        bounds.maxX = Math.max(bounds.maxX, proj.x);
        bounds.minY = Math.min(bounds.minY, proj.y);
        bounds.maxY = Math.max(bounds.maxY, proj.y);
      }
    };
    const LIMIT_X = mini ? 0.92 : 0.88;
    const LIMIT_Y = mini ? 0.9 : 0.86;
    const fitCamera = () => {
      const w = Math.max(1, box.clientWidth);
      const h = Math.max(1, box.clientHeight);
      camera.clearViewOffset();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      target.copy(centre);
      for (let iter = 0; iter < 5; iter++) {
        let lo = 12;
        let hi = 320;
        for (let b = 0; b < 22; b++) {
          const mid = (lo + hi) / 2;
          placeCamera(0, camPitch, mid);
          measure();
          if (bounds.minX >= -LIMIT_X && bounds.maxX <= LIMIT_X && bounds.minY >= -LIMIT_Y && bounds.maxY <= LIMIT_Y) hi = mid;
          else lo = mid;
        }
        baseDist = hi;
        placeCamera(0, camPitch, baseDist);
        measure();
        const halfH = baseDist * Math.tan(THREE.MathUtils.degToRad(CAM_FOV / 2));
        const halfW = halfH * camera.aspect;
        target.x += ((bounds.minX + bounds.maxX) / 2) * halfW * 0.85;
        target.z -= (((bounds.minY + bounds.maxY) / 2) * halfH * 0.85) / Math.sin(camPitch);
      }
      if (debug.zoom > 1) camera.setViewOffset(w * debug.zoom, h * debug.zoom, debug.ox * w * (debug.zoom - 1), debug.oy * h * (debug.zoom - 1), w, h);
      else camera.clearViewOffset();
    };

    const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const onPointerMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    if (finePointer && !mini) window.addEventListener("pointermove", onPointerMove, { passive: true });

    const carWorld = new THREE.Vector3();
    const follow = { x: 0, z: 0 };
    const updateCamera = (time: number, dt: number) => {
      if (debug.closeup) {
        car.group.getWorldPosition(carWorld);
        const a = debug.orbit >= 0 ? debug.orbit : time * 0.35;
        camera.position.set(carWorld.x + Math.cos(a) * 7.2, carWorld.y + 2.1 + Math.sin(time * 0.2) * 0.8, carWorld.z + Math.sin(a) * 7.2);
        camera.lookAt(carWorld.x, carWorld.y + 0.75, carWorld.z);
        camera.updateMatrixWorld();
        return;
      }
      const e = 1 - Math.exp(-dt * 2.2);
      pointer.sx += (pointer.x - pointer.sx) * e;
      pointer.sy += (pointer.y - pointer.sy) * e;
      if (mini) {
        placeCamera(Math.sin(time * 0.17) * 0.012, camPitch, baseDist);
        return;
      }
      const az = Math.sin(time * 0.17) * 0.022 + Math.sin(time * 0.071 + 1.3) * 0.012 + pointer.sx * 0.05;
      const pitch = camPitch + Math.sin(time * 0.13 + 0.6) * 0.008 - pointer.sy * 0.02;
      // lean a little towards the car, like an operator keeping the subject in frame
      car.group.getWorldPosition(carWorld);
      const followE = 1 - Math.exp(-dt * 0.9);
      follow.x += ((carWorld.x - target.x) * 0.13 - follow.x) * followE;
      follow.z += ((carWorld.z - target.z) * 0.13 - follow.z) * followE;
      look.set(target.x + follow.x, target.y, target.z + follow.z);
      const dist = baseDist * (0.965 + Math.sin(time * 0.11) * 0.008);
      placeCamera(az, pitch, dist, look);
    };

    /* ---------- labels ---------- */
    const placeLabels = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      pins.forEach((p, i) => {
        const el = labelRefs.current[i];
        if (!el) return;
        proj.set(p.head.x, p.group.position.y + (p.head.y - p.baseY), p.head.z).project(camera);
        const x = (proj.x * 0.5 + 0.5) * w;
        const y = (1 - (proj.y * 0.5 + 0.5)) * h;
        const reach = Math.max(12, h * 0.036);
        el.style.transform = p.labelRight
          ? `translate3d(${(x + reach).toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(0, -50%)`
          : `translate3d(${(x - reach).toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-100%, -50%)`;
      });
    };

    /* ---------- loop ---------- */
    let raf = 0;
    let running = false;
    let last = 0;
    let time = 0;
    let frames = 0;
    let ready = false;
    let lost = false;
    let inView = true;
    let slowLevel = 0;
    let acc = 0;
    let accN = 0;
    let slowWindows = 0;
    const prof = { on: false, sim: 0, render: 0, gpu: 0, n: 0 };

    const resize = () => {
      const w = Math.max(1, box.clientWidth);
      const h = Math.max(1, box.clientHeight);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      fitCamera();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const now0 = prof.on ? performance.now() : 0;
      const rawDt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      const dt = Math.min(0.05, rawDt);
      time += dt;
      wind.uTime.value = time;

      stepCar(debug.frozen ? 0 : dt, time);
      for (const p of pins) {
        p.group.position.y = p.baseY + Math.sin(time * 1.4 + p.phase) * 0.16;
        p.group.rotation.y = Math.sin(time * 0.6 + p.phase) * 0.25;
        if (p.last) {
          const u = (time * 0.42) % 1;
          p.ring.scale.setScalar(1 + u * 2);
          p.ringMat.opacity = 0.75 * (1 - u);
        } else {
          p.ringMat.opacity = 0.4 + Math.sin(time * 1.6) * 0.12;
        }
      }
      for (const m of mists) {
        m.sprite.position.x += m.speed * dt;
        if (m.sprite.position.x > maxX + 16) m.sprite.position.x = minX - 16;
        const edge = smoothstep(minX - 16, minX - 4, m.sprite.position.x) * (1 - smoothstep(maxX + 4, maxX + 16, m.sprite.position.x));
        m.sprite.material.opacity = m.baseOpacity * edge * (0.75 + 0.25 * Math.sin(time * 0.3 + m.phase));
      }
      updateCamera(time, dt);
      car.updateGlow(camera);
      if (frames % 2 === 0) sun.shadow.needsUpdate = true;
      const t1 = prof.on ? performance.now() : 0;
      renderer.render(scene, camera);
      if (prof.on) {
        const t2 = performance.now();
        renderer.getContext().finish();
        const t3 = performance.now();
        prof.sim += t1 - now0;
        prof.render += t2 - t1;
        prof.gpu += t3 - t2;
        prof.n++;
      }
      placeLabels();

      frames++;
      if (!ready && frames >= 2) {
        ready = true;
        canvas.style.opacity = "1";
        labelRefs.current.forEach((el) => {
          if (el) el.style.opacity = "1";
        });
        emit("ready");
      }
      // Frame-rate governor: step quality down rather than stutter. Frames longer than 100 ms are
      // ignored (a throttled or stalled tab, not our steady state) and a step needs three slow windows in a row.
      if (frames > 45 && rawDt < 0.1 && document.hasFocus()) {
        acc += rawDt;
        accN++;
        if (accN >= 60) {
          const avg = acc / accN;
          acc = 0;
          accN = 0;
          slowWindows = avg > 0.03 ? slowWindows + 1 : 0;
          if (slowWindows >= 3) {
            slowWindows = 0;
            slowLevel++;
            if (slowLevel === 1) {
              dpr = Math.max(1, dpr * 0.75);
              resize();
            } else if (slowLevel === 2) {
              dpr = 1;
              sun.castShadow = false;
              resize();
            } else if (slowLevel >= 3 && avg > 0.045) {
              emit("slow");
            }
          }
        }
      }
    };
    const start = () => {
      if (running || lost || !inView || document.hidden) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    resize();
    if (debugParams) {
      // dev console helper: __rt3d.view(2, 0.5, 1) magnifies; __rt3d.car(40) parks the car at 40 m; __rt3d.orbit(1.2) fixes the close-up angle
      (window as unknown as Record<string, unknown>).__rt3d = {
        info: () => ({ ...renderer.info.render, dpr, low, slowLevel, programs: renderer.info.programs?.length }),
        shadows(on: boolean) {
          sun.castShadow = on;
        },
        prof(on: boolean) {
          const r = { sim: prof.sim / (prof.n || 1), render: prof.render / (prof.n || 1), gpu: prof.gpu / (prof.n || 1), n: prof.n };
          prof.on = on;
          prof.sim = prof.render = prof.gpu = prof.n = 0;
          return r;
        },
        pause(on: boolean) {
          if (on) stop();
          else start();
        },
        dpr(v: number) {
          dpr = v;
          resize();
        },
        hide(name: string, hidden = true) {
          scene.traverse((o) => {
            if (o.name === name) o.visible = !hidden;
          });
        },
        view(z: number, ox = 0.5, oy = 0.5) {
          debug.zoom = z;
          debug.ox = ox;
          debug.oy = oy;
          resize();
        },
        mode(m: string) {
          debug.closeup = m === "closeup";
          resize();
        },
        orbit(a: number) {
          debug.orbit = a;
        },
        car(s: number, freeze = true) {
          drive.s = s;
          drive.phase = "drive";
          debug.frozen = freeze;
        },
      };
    }
    const ro = new ResizeObserver(() => resize());
    ro.observe(box);
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = !!entry && entry.isIntersecting;
        if (inView) start();
        else stop();
      },
      { rootMargin: "80px" },
    );
    io.observe(box);
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      stop();
      emit("lost");
    };
    const onRestored = () => {
      lost = false;
      start();
      emit("ready");
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      car.dispose();
      for (const d of trash) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [stopsKey, quality, variant]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={`Road trip route: ${stops.join(" to ")}`}
      className={className ? `pointer-events-none ${className}` : "pointer-events-none relative"}
    >
      {variant === "scene" && stops.map((name, i) => (
        <span
          key={`${i}-${name}`}
          ref={(el) => {
            labelRefs.current[i] = el;
          }}
          className={LABEL_CLASS}
          style={{ opacity: 0, transition: "opacity 700ms ease-out 400ms" }}
        >
          {name}
        </span>
      ))}
    </div>
  );
}
