import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* Procedural textures and scenery geometry for the 3D road-trip hero. Everything is generated in the
   browser, so the scene ships no image or model files. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return smooth(t);
};

/** Value noise on a wrapping lattice, so textures built from it tile. */
export function makeTileNoise(seed: number) {
  const SIZE = 256;
  const rnd = mulberry32(seed);
  const g = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const noise = (x: number, y: number, period: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const a = g[y0 * SIZE + x0];
    const b = g[y0 * SIZE + x1];
    const c = g[y1 * SIZE + x0];
    const d = g[y1 * SIZE + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  /** u, v in 0..1; tiles at 1. */
  const fbm = (u: number, v: number, basePeriod: number, octaves: number): number => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let p = basePeriod;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(u * p, v * p, p);
      norm += amp;
      amp *= 0.5;
      p *= 2;
    }
    return sum / norm;
  };
  return { noise, fbm };
}

function dataTexture(data: Uint8Array, w: number, h: number, srgb: boolean, repeat: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Tangent-space normal map from a height field (wraps in both directions). */
function normalFromHeight(height: Float32Array, w: number, h: number, strength: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const yu = ((y + 1) % h) * w;
    const yd = ((y - 1 + h) % h) * w;
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w;
      const xr = (x + 1) % w;
      const dx = (height[y * w + xr] - height[y * w + xl]) * strength;
      const dy = (height[yu + x] - height[yd + x]) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

function make2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D];
}

/* ------------------------------------------------------------------ asphalt */

export const ROAD_TILE_LENGTH = 12.8; // metres of road covered by one texture tile
export const ROAD_WIDTH = 6.4;

export interface AsphaltMaps {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
}

/** Worn two-lane asphalt: aggregate grain, wheel-path polish, cracks, a repair patch, painted edge lines and centre dashes, ragged edges. */
export function createAsphaltMaps(size: number): AsphaltMaps {
  const W = size;
  const H = size;
  const rnd = mulberry32(7411);
  const n1 = makeTileNoise(11);
  const n2 = makeTileNoise(29);

  // Feature mask: R paint, G cracks, B patches
  const [, f] = make2d(W, H);
  f.fillStyle = "#000";
  f.fillRect(0, 0, W, H);
  f.globalCompositeOperation = "lighter";
  const mPerPxU = ROAD_WIDTH / W;
  const lineW = 0.13 / mPerPxU;
  f.fillStyle = "#f00";
  for (const edge of [0.34, ROAD_WIDTH - 0.34]) f.fillRect(edge / mPerPxU - lineW / 2, 0, lineW, H);
  for (const [v0, v1] of [
    [0.05, 0.27],
    [0.55, 0.77],
  ]) {
    f.fillRect(W / 2 - lineW / 2, v0 * H, lineW, (v1 - v0) * H);
  }
  f.strokeStyle = "#0f0";
  f.lineCap = "round";
  for (let k = 0; k < 9; k++) {
    let x = rnd() * W;
    let y = rnd() * H;
    let ang = rnd() * Math.PI * 2;
    const steps = 14 + Math.floor(rnd() * 30);
    const pts: [number, number][] = [[x, y]];
    for (let s = 0; s < steps; s++) {
      ang += (rnd() - 0.5) * 1.1;
      x += Math.cos(ang) * (W / 90);
      y += Math.sin(ang) * (H / 90);
      pts.push([x, y]);
    }
    f.lineWidth = Math.max(1, (W / 1024) * (1 + rnd() * 1.4));
    for (const oy of [-H, 0, H]) {
      f.beginPath();
      pts.forEach(([px, py], i) => (i ? f.lineTo(px, py + oy) : f.moveTo(px, py + oy)));
      f.stroke();
    }
  }
  const feat = f.getImageData(0, 0, W, H).data;

  const albedo = new Uint8Array(W * H * 4);
  const rough = new Uint8Array(W * H * 4);
  const height = new Float32Array(W * H);
  const tracks = [0.25 - 0.115, 0.25 + 0.115, 0.75 - 0.115, 0.75 + 0.115];
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const i = (y * W + x) * 4;
      const grain = rnd();
      const fine = n1.noise(u * 128, v * 128, 128);
      const blot = n1.fbm(u, v, 4, 4);
      const stain = n2.fbm(u, v, 8, 3);
      let wear = 0;
      for (const tc of tracks) {
        const d = (u - tc) / 0.034;
        wear += Math.exp(-d * d);
      }
      wear *= 0.6 + 0.4 * stain;
      const oil = Math.exp(-Math.pow((u - 0.25) / 0.03, 2)) + Math.exp(-Math.pow((u - 0.75) / 0.03, 2));
      const paint = feat[i] / 255;
      const crack = feat[i + 1] / 255;
      const patch = feat[i + 2] / 255;

      let L = 0.4 + 0.1 * (blot - 0.5) + 0.085 * (grain - 0.5) + 0.06 * (fine - 0.5);
      L -= 0.045 * wear + 0.03 * oil * stain + 0.075 * patch;
      L *= 1 - 0.55 * crack;
      let r = 0.94 - 0.13 * wear - 0.1 * patch;
      let hgt = grain * 0.55 + fine * 0.45;
      hgt *= 1 - 0.45 * Math.min(1, wear) - 0.4 * patch;
      hgt -= crack * 1.4;

      // Road paint, worn through in places
      const pm = paint * smoothstep(0.3, 0.52, n2.fbm(u * 2, v, 16, 3) + 0.22 - 0.12 * grain);
      const pr = 0.9;
      const pg = 0.89;
      const pb = 0.84;
      let cr = L * 1.0;
      let cg = L * 0.99;
      let cb = L * 0.97;
      cr += (pr - cr) * pm;
      cg += (pg - cg) * pm;
      cb += (pb - cb) * pm;
      r += (0.55 - r) * pm;
      hgt += 0.35 * pm;

      // Ragged, crumbling edges
      const edge = Math.min(u, 1 - u) * ROAD_WIDTH;
      const a = smoothstep(0.02, 0.16, edge + (n2.fbm(u * 4, v, 32, 3) - 0.5) * 0.2);

      albedo[i] = Math.min(255, cr * 255);
      albedo[i + 1] = Math.min(255, cg * 255);
      albedo[i + 2] = Math.min(255, cb * 255);
      albedo[i + 3] = a * 255;
      const rv = Math.min(255, Math.max(0, r * 255));
      rough[i] = rv;
      rough[i + 1] = rv;
      rough[i + 2] = 0;
      rough[i + 3] = 255;
      height[y * W + x] = hgt;
    }
  }
  const map = dataTexture(albedo, W, H, true, false);
  const normalMap = dataTexture(normalFromHeight(height, W, H, 1.6), W, H, false, false);
  const roughnessMap = dataTexture(rough, W, H, false, false);
  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return { map, normalMap, roughnessMap };
}

/* ------------------------------------------------------------------ ground */

/** Neutral soil / gravel detail (tinted per vertex in the scene) and its normal map. */
export function createGroundMaps(size: number): { map: THREE.DataTexture; normalMap: THREE.DataTexture } {
  const n = makeTileNoise(53);
  const rnd = mulberry32(977);
  const data = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const big = n.fbm(u, v, 4, 5);
      const fine = n.noise(u * 96, v * 96, 96);
      const pebble = rnd() > 0.985 ? 0.35 : 0;
      const grit = rnd();
      const blade = n.noise(u * 200, v * 40, 40) * n.noise(u * 40 + 7, v * 200, 40);
      const L = 0.7 + 0.34 * (big - 0.5) + 0.3 * (fine - 0.5) + 0.2 * (grit - 0.5) + 0.5 * (blade - 0.25) + pebble * 0.4;
      const i = (y * size + x) * 4;
      const c = Math.min(255, Math.max(0, L * 255));
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
      height[y * size + x] = big * 1.2 + fine * 0.5 + grit * 0.25 + pebble;
    }
  }
  return {
    map: dataTexture(data, size, size, true, true),
    normalMap: dataTexture(normalFromHeight(height, size, size, 2.2), size, size, false, true),
  };
}

/* ------------------------------------------------------------------ foliage */

/** Fills the colour of fully transparent pixels with a neutral foliage tone so filtered edges do not go dark. */
function bleed(ctx: CanvasRenderingContext2D, w: number, h: number, fill: [number, number, number]): Uint8Array {
  const img = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(img.length);
  for (let i = 0; i < img.length; i += 4) {
    const a = img[i + 3];
    if (a < 8) {
      out[i] = fill[0];
      out[i + 1] = fill[1];
      out[i + 2] = fill[2];
      out[i + 3] = 0;
    } else {
      out[i] = img[i];
      out[i + 1] = img[i + 1];
      out[i + 2] = img[i + 2];
      out[i + 3] = a;
    }
  }
  return out;
}

/** A clump of broad leaves with a ragged outline, used on the tree canopy cards. */
export function createLeafTexture(size: number): THREE.DataTexture {
  const [, ctx] = make2d(size, size);
  const rnd = mulberry32(4242);
  const leaves: { x: number; y: number; len: number; rot: number; hue: number; sat: number; lit: number }[] = [];
  const count = 1500;
  for (let i = 0; i < count; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = Math.pow(rnd(), 0.62) * 0.43 * size;
    const edge = rad / (0.43 * size);
    leaves.push({
      x: size / 2 + Math.cos(ang) * rad,
      y: size / 2 + Math.sin(ang) * rad * 0.94,
      len: size * (0.032 + rnd() * 0.03),
      rot: ang + (rnd() - 0.5) * 2.4,
      hue: 82 + rnd() * 40,
      sat: 30 + rnd() * 22,
      lit: 8 + rnd() * 13 + edge * 8,
    });
  }
  leaves.sort((a, b) => a.lit - b.lit);
  for (const l of leaves) {
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.rot);
    const w = l.len * 0.36;
    ctx.beginPath();
    ctx.moveTo(-l.len / 2, 0);
    ctx.quadraticCurveTo(-l.len * 0.05, -w, l.len / 2, 0);
    ctx.quadraticCurveTo(-l.len * 0.05, w, -l.len / 2, 0);
    ctx.fillStyle = `hsl(${l.hue} ${l.sat}% ${l.lit}%)`;
    ctx.fill();
    ctx.strokeStyle = `hsla(${l.hue + 8} ${l.sat}% ${l.lit + 12}% / 0.55)`;
    ctx.lineWidth = Math.max(1, size / 512);
    ctx.beginPath();
    ctx.moveTo(-l.len / 2, 0);
    ctx.lineTo(l.len / 2, 0);
    ctx.stroke();
    ctx.restore();
  }
  return dataTexture(bleed(ctx, size, size, [30, 48, 20]), size, size, true, false);
}

/** A tuft of grass blades. */
export function createGrassTexture(size: number): THREE.DataTexture {
  const [, ctx] = make2d(size, size);
  const rnd = mulberry32(90210);
  for (let i = 0; i < 54; i++) {
    const bx = size * (0.5 + (rnd() - 0.5) * 0.5);
    const tipX = bx + (rnd() - 0.5) * size * 0.75;
    const tipY = size * (0.04 + rnd() * 0.5);
    const w = size * (0.012 + rnd() * 0.016);
    const midX = bx + (tipX - bx) * 0.35;
    ctx.beginPath();
    ctx.moveTo(bx - w, size);
    ctx.quadraticCurveTo(midX - w * 0.6, size * 0.55, tipX, tipY);
    ctx.quadraticCurveTo(midX + w * 0.6, size * 0.55, bx + w, size);
    ctx.closePath();
    ctx.fillStyle = `hsl(${70 + rnd() * 40} ${32 + rnd() * 22}% ${14 + rnd() * 18}%)`;
    ctx.fill();
  }
  return dataTexture(bleed(ctx, size, size, [48, 66, 26]), size, size, true, false);
}

/** Soft, wispy blob for drifting mist. */
export function createMistTexture(size: number): THREE.DataTexture {
  const n = makeTileNoise(311);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const dx = (u - 0.5) * 2;
      const dy = (v - 0.5) * 2;
      const r = Math.hypot(dx, dy * 1.5);
      const fall = Math.pow(Math.max(0, 1 - r), 1.6);
      const wisp = 0.35 + 0.65 * n.fbm(u, v, 3, 4);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.min(255, fall * wisp * 255 * 1.25);
    }
  }
  const t = dataTexture(data, size, size, true, false);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

export function createSoftDotTexture(size = 64): THREE.CanvasTexture {
  const [c, ctx] = make2d(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ wind */

export interface WindUniforms {
  uTime: { value: number };
}

/** Adds trunk bend and leaf flutter to a material's vertex shader (works for instanced meshes and depth materials). */
export function applyWind(material: THREE.Material, uniforms: WindUniforms, bend: number, flutter: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 wp = instanceMatrix[3].xyz;
          #else
            vec3 wp = vec3(0.0);
          #endif
          float ph = wp.x * 0.37 + wp.z * 0.29;
          float hh = max(position.y, 0.0);
          float bendAmt = hh * hh * ${bend.toFixed(5)};
          transformed.x += (sin(uTime * 0.9 + ph) + 0.4 * sin(uTime * 2.1 + ph * 1.7)) * bendAmt;
          transformed.z += cos(uTime * 0.7 + ph * 1.3) * bendAmt * 0.7;
          float fl = ${flutter.toFixed(5)};
          transformed.x += sin(uTime * 3.1 + position.y * 2.7 + position.z * 3.3 + ph) * fl;
          transformed.y += sin(uTime * 2.6 + position.x * 3.1 + ph) * fl * 0.6;
        }`,
      );
  };
  material.customProgramCacheKey = () => `wind-${bend}-${flutter}`;
}

/* ------------------------------------------------------------------ trees */

export interface TreeGeometry {
  trunk: THREE.BufferGeometry;
  foliage: THREE.BufferGeometry;
  height: number;
  radius: number;
}

function nonIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.index ? g.toNonIndexed() : g;
}

/**
 * A broadleaf tree: bent, tapering trunk with a few limbs, and a canopy made of many leaf-clump cards.
 * Canopy normals are bent outwards from the crown centre, so the crown shades as one soft volume
 * instead of as flat cards.
 */
export function buildTree(seed: number, height: number, crownRadius: number, cards: number): TreeGeometry {
  const rnd = mulberry32(seed);
  const trunkH = height * 0.56;
  const parts: THREE.BufferGeometry[] = [];

  const trunk = new THREE.CylinderGeometry(0.09, 0.23, trunkH, 7, 6, true);
  trunk.translate(0, trunkH / 2, 0);
  const tp = trunk.attributes.position as THREE.BufferAttribute;
  const bendX = (rnd() - 0.5) * 0.5;
  const bendZ = (rnd() - 0.5) * 0.5;
  for (let i = 0; i < tp.count; i++) {
    const t = tp.getY(i) / trunkH;
    tp.setX(i, tp.getX(i) + Math.sin(t * 2.2) * bendX);
    tp.setZ(i, tp.getZ(i) + Math.sin(t * 1.7) * bendZ);
  }
  parts.push(nonIndexed(trunk));

  const crownY = height * 0.66;
  const crownRy = height * 0.34;
  const clusters: THREE.Vector3[] = [];
  const clusterCount = Math.max(6, Math.round(cards / 3));
  for (let i = 0; i < clusterCount; i++) {
    const a = rnd() * Math.PI * 2;
    const elev = Math.asin(Math.min(1, rnd() * 1.5 - 0.5));
    const rr = 0.3 + rnd() * 0.62;
    clusters.push(
      new THREE.Vector3(
        Math.cos(a) * Math.cos(elev) * crownRadius * rr,
        crownY + Math.sin(elev) * crownRy * rr,
        Math.sin(a) * Math.cos(elev) * crownRadius * rr,
      ),
    );
  }
  // Limbs reaching into the canopy
  for (let i = 0; i < Math.min(4, clusters.length); i++) {
    const from = new THREE.Vector3(Math.sin((0.55 + i * 0.1) * 2.2) * bendX, trunkH * (0.55 + i * 0.1), Math.sin((0.55 + i * 0.1) * 1.7) * bendZ);
    const to = clusters[i];
    const len = from.distanceTo(to);
    const limb = new THREE.CylinderGeometry(0.03, 0.075, len, 5, 1, true);
    limb.translate(0, len / 2, 0);
    limb.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
    limb.translate(from.x, from.y, from.z);
    parts.push(nonIndexed(limb));
  }
  const trunkGeo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  trunkGeo.computeVertexNormals();

  // Canopy cards
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const centre = new THREE.Vector3(0, crownY - crownRy * 0.15, 0);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const corners = [
    [-0.5, -0.5, 0, 0],
    [0.5, -0.5, 1, 0],
    [0.5, 0.5, 1, 1],
    [-0.5, 0.5, 0, 1],
  ];
  const v = new THREE.Vector3();
  const nv = new THREE.Vector3();
  const quad: { p: THREE.Vector3; n: THREE.Vector3; u: number; w: number; c: number }[] = [];
  for (let i = 0; i < cards; i++) {
    const c = clusters[i % clusters.length];
    const size = crownRadius * (0.62 + rnd() * 0.42);
    e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
    q.setFromEuler(e);
    const ox = (rnd() - 0.5) * crownRadius * 0.35;
    const oy = (rnd() - 0.5) * crownRy * 0.3;
    const oz = (rnd() - 0.5) * crownRadius * 0.35;
    const rot = Math.floor(rnd() * 4);
    quad.length = 0;
    for (let k = 0; k < 4; k++) {
      const cr = corners[k];
      const uvSrc = corners[(k + rot) % 4];
      v.set(cr[0] * size, cr[1] * size, 0).applyQuaternion(q);
      v.x += c.x + ox;
      v.y += c.y + oy;
      v.z += c.z + oz;
      nv.copy(v).sub(centre);
      nv.y *= crownRadius / crownRy;
      const dist = nv.length() / crownRadius;
      nv.normalize();
      nv.y = nv.y * 0.75 + 0.25;
      nv.normalize();
      const shade = 0.5 + 0.5 * Math.min(1, dist) * (0.7 + 0.3 * smoothstep(crownY - crownRy, crownY + crownRy, v.y));
      quad.push({ p: v.clone(), n: nv.clone(), u: uvSrc[2], w: uvSrc[3], c: shade });
    }
    // two windings, so each card shows from both sides with the same soft normal
    for (const order of [
      [0, 1, 2, 0, 2, 3],
      [0, 2, 1, 0, 3, 2],
    ]) {
      for (const k of order) {
        const s = quad[k];
        pos.push(s.p.x, s.p.y, s.p.z);
        nrm.push(s.n.x, s.n.y, s.n.z);
        uv.push(s.u, s.w);
        col.push(s.c, s.c, s.c);
      }
    }
  }
  const foliage = new THREE.BufferGeometry();
  foliage.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  foliage.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  foliage.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  foliage.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  foliage.computeBoundingSphere();
  return { trunk: trunkGeo, foliage, height, radius: crownRadius };
}

/** Three crossed, upright cards for a grass tuft (unit size, base at y = 0). Both windings, normals up. */
export function buildGrassTuft(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const cx = Math.cos(a) * 0.5;
    const cz = Math.sin(a) * 0.5;
    // the grass texture is stored with its tip row first, so v = 0 is the tip
    // each card leans away from the middle, so a tuft reads as a clump from above, not as a star
    const lx = -Math.sin(a) * 0.32;
    const lz = Math.cos(a) * 0.32;
    const q = [
      [-cx, 0, -cz, 0, 1],
      [cx, 0, cz, 1, 1],
      [cx * 1.25 + lx, 0.85, cz * 1.25 + lz, 1, 0],
      [-cx * 1.25 + lx, 0.85, -cz * 1.25 + lz, 0, 0],
    ];
    for (const order of [
      [0, 1, 2, 0, 2, 3],
      [0, 2, 1, 0, 3, 2],
    ]) {
      for (const k of order) {
        pos.push(q[k][0], q[k][1], q[k][2]);
        nrm.push(0, 1, 0);
        uv.push(q[k][3], q[k][4]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** A lumpy boulder. */
export function buildRock(seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = makeTileNoise(seed + 5);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.72 + 0.5 * n.noise(x * 1.7 + 8, y * 1.7 + z * 1.3 + 8, 64);
    p.setXYZ(i, x * k * (0.9 + rnd() * 0.02), Math.max(-0.25, y * k * 0.62), z * k);
  }
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ signage */

/** Indian kilometre stone: white with a yellow cap. `place` is the town, `km` the distance. */
export function createMilestoneTexture(place: string, km: string): THREE.CanvasTexture {
  const w = 256;
  const h = 448;
  const [c, ctx] = make2d(w, h);
  ctx.fillStyle = "#efeee6";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#f0b90c";
  ctx.fillRect(0, 0, w, h * 0.32);
  ctx.fillStyle = "#17181a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 46;
  ctx.font = `800 ${size}px Arial, Helvetica, sans-serif`;
  while (ctx.measureText(place).width > w - 36 && size > 16) {
    size -= 2;
    ctx.font = `800 ${size}px Arial, Helvetica, sans-serif`;
  }
  ctx.fillText(place, w / 2, h * 0.46);
  ctx.font = "800 104px Arial, Helvetica, sans-serif";
  ctx.fillText(km, w / 2, h * 0.67);
  ctx.font = "700 34px Arial, Helvetica, sans-serif";
  ctx.fillText("km", w / 2, h * 0.84);
  // weathering
  const rnd = mulberry32(31);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(90,80,60,${0.03 + rnd() * 0.07})`;
    ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 9, 1 + rnd() * 5);
  }
  const g = ctx.createLinearGradient(0, h * 0.8, 0, h);
  g.addColorStop(0, "rgba(96,78,52,0)");
  g.addColorStop(1, "rgba(96,78,52,0.5)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.8, w, h * 0.2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Black-and-white banded texture for the parapet blocks that line ghat-road bends. */
export function createParapetTexture(): THREE.CanvasTexture {
  const [c, ctx] = make2d(128, 64);
  ctx.fillStyle = "#e9e7df";
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = "#22262a";
  ctx.fillRect(0, 0, 32, 64);
  ctx.fillRect(64, 0, 32, 64);
  const rnd = mulberry32(88);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(110,96,74,${0.04 + rnd() * 0.1})`;
    ctx.fillRect(rnd() * 128, rnd() * 64, 1 + rnd() * 6, 1 + rnd() * 4);
  }
  const g = ctx.createLinearGradient(0, 40, 0, 64);
  g.addColorStop(0, "rgba(110,84,56,0)");
  g.addColorStop(1, "rgba(110,84,56,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 40, 128, 24);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const MILESTONE = { width: 0.62, height: 1.08, depth: 0.2 };

/** Milestone body: a slab with a rounded top. Group 0 = faces (textured), group 1 = sides. */
export function buildMilestone(): THREE.ExtrudeGeometry {
  const { width, height, depth } = MILESTONE;
  const r = width / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, height - r);
  s.absarc(0, height - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Green highway direction board. */
export function createSignTexture(place: string, km: string): THREE.CanvasTexture {
  const w = 768;
  const h = 384;
  const [c, ctx] = make2d(w, h);
  ctx.fillStyle = "#0d6b3c";
  ctx.fillRect(0, 0, w, h);
  const sheen = ctx.createLinearGradient(0, 0, 0, h);
  sheen.addColorStop(0, "rgba(255,255,255,0.1)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(0,0,0,0.1)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#f6f7f4";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.roundRect(16, 16, w - 32, h - 32, 34);
  ctx.stroke();
  ctx.fillStyle = "#f6f7f4";
  // straight-ahead arrow
  ctx.beginPath();
  ctx.moveTo(118, 70);
  ctx.lineTo(190, 170);
  ctx.lineTo(142, 170);
  ctx.lineTo(142, 310);
  ctx.lineTo(94, 310);
  ctx.lineTo(94, 170);
  ctx.lineTo(46, 170);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let size = 120;
  ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
  while (ctx.measureText(place).width > w - 270 && size > 40) {
    size -= 4;
    ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
  }
  ctx.fillText(place, 222, 150);
  ctx.font = "700 76px Arial, Helvetica, sans-serif";
  ctx.fillText(`${km} km`, 222, 272);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
