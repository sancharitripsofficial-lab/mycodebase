import * as THREE from "three";
import { applyFocus, fitFov, type BannerFocus, type BannerScene, type SceneContext } from "../engine";
import { clamp01, lerp, makeBin, makeGlowTexture, makePeriodicNoise, makeSkyEnvironment, smooth } from "./shared";

/**
 * Policies banner: a relief model of Karnataka and its coast, like the terrain table in a
 * visitor centre. The Arabian Sea is glossy, the Western Ghats rise behind the coast and the
 * Deccan plateau rolls away east. Routes draw themselves from Bengaluru to the four trip
 * regions, cloud shadows drift across and the light slowly swings round.
 */

const SCALE = 2; // world units per degree
const LON0 = 76.2;
const LAT0 = 13.75;
const HEIGHT = 0.36; // world units per kilometre of altitude (strongly exaggerated, as relief models are)

const toWorldX = (lon: number) => (lon - LON0) * SCALE;
const toWorldZ = (lat: number) => -(lat - LAT0) * SCALE;

const noise = makePeriodicNoise(1312);
const U = (lon: number) => (lon - 68) / 16;
const V = (lat: number) => (lat - 6) / 16;

/** Longitude of the shoreline at a latitude (runs north-north-west, as the real coast does). */
function coastLon(lat: number): number {
  return 74.95 - (lat - 12.5) * 0.33 + (noise.fbm(0.3, V(lat), 2, 40, 3) - 0.5) * 0.16;
}

interface Ground {
  /** Altitude in km; below zero is sea bed. */
  h: number;
  /** Degrees east of the shoreline. */
  inland: number;
  /** 0..1 how much this spot belongs to the Ghats. */
  ghat: number;
}

function ground(lon: number, lat: number): Ground {
  const u = U(lon);
  const v = V(lat);
  const inland = lon - coastLon(lat);
  if (inland < 0) return { h: Math.max(-0.5, inland * 0.9), inland, ghat: 0 };

  const south = smooth(16.5, 11.8, lat);
  // The escarpment: a wall close to the coast, taller and wider towards the south.
  const centre = 0.5 + south * 0.22;
  const width = 0.26 + south * 0.16;
  const wall = Math.exp(-Math.pow((inland - centre) / width, 2));
  const crests = noise.ridged(u, v, 22, 26, 4);
  const ghat = wall * (0.45 + 0.75 * crests);
  // The plateau behind it, higher in the south (Mysuru, Bengaluru) than in the north.
  const table = smooth(0.2, 0.95, inland) * (0.48 + 0.4 * south);
  const swells = (noise.fbm(u, v, 9, 9, 4) - 0.5) * 0.32 * smooth(0.5, 1.6, inland);
  const knolls = Math.pow(noise.ridged(u + 0.4, v + 0.2, 60, 60, 3), 2.2) * 0.08 * smooth(0.6, 1.4, inland);
  // The Nilgiri / Biligiri block in the far south.
  const massif = Math.exp(-(Math.pow((lon - 76.75) / 0.42, 2) + Math.pow((lat - 11.45) / 0.3, 2))) * (0.9 + crests * 0.6);
  const plain = 0.015 + smooth(0, 0.25, inland) * 0.05;
  const h = plain + table + swells + knolls + ghat * (0.95 + south * 0.45) + massif;
  return { h: Math.max(0.008, h), inland, ghat: clamp01(wall * (0.4 + crests)) };
}

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const RIVERS: [number, number][][] = [
  // Tungabhadra, past Hampi
  [[75.35, 13.55], [75.62, 13.95], [75.82, 14.45], [76.05, 14.95], [76.33, 15.26], [76.6, 15.36], [77.1, 15.62], [77.8, 15.88], [78.6, 15.9]],
  // Kaveri, down from Kodagu
  [[75.52, 12.42], [75.95, 12.5], [76.35, 12.5], [76.6, 12.42], [76.95, 12.27], [77.25, 12.22], [77.6, 12.1], [77.95, 11.9], [78.4, 11.5]],
  // Sharavathi to the coast
  [[75.25, 14.05], [74.95, 14.18], [74.7, 14.22], [74.46, 14.28]],
];

const CITY = {
  bengaluru: [77.59, 12.97],
  coorg: [75.74, 12.42],
  chikmagalur: [75.77, 13.32],
  gokarna: [74.34, 14.55],
  hampi: [76.46, 15.33],
} as const;

const ROUTES: { to: keyof typeof CITY; via: [number, number][] }[] = [
  { to: "coorg", via: [[77.25, 12.72], [76.9, 12.52], [76.65, 12.31], [76.2, 12.33]] },
  { to: "chikmagalur", via: [[77.03, 13.02], [76.6, 12.98], [76.1, 13.0], [75.86, 13.16]] },
  { to: "hampi", via: [[77.1, 13.34], [76.62, 13.95], [76.4, 14.23], [76.38, 14.85]] },
  { to: "gokarna", via: [[77.1, 13.34], [76.3, 13.52], [75.57, 13.93], [75.03, 14.17], [74.52, 14.3]] },
];

interface Baked {
  color: THREE.DataTexture;
  detail: THREE.DataTexture;
  rough: THREE.DataTexture;
}

function bake(size: number, lonMin: number, lonMax: number, latMin: number, latMax: number): Baked {
  const color = new Uint8Array(size * size * 4);
  const detail = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const dLon = (lonMax - lonMin) / size;
  const dLat = (latMax - latMin) / size;
  const srgb = (c: number) => Math.round(255 * Math.pow(clamp01(c), 1 / 2.2));

  for (let j = 0; j < size; j++) {
    const lat = latMin + (j + 0.5) * dLat;
    for (let i = 0; i < size; i++) {
      const lon = lonMin + (i + 0.5) * dLon;
      const g = ground(lon, lat);
      heights[j * size + i] = g.h;
      const u = U(lon);
      const v = V(lat);
      const k = (j * size + i) * 4;
      let r: number;
      let gg: number;
      let b: number;
      let rg = 0.92;
      if (g.inland < 0) {
        // Sea: turquoise shallows over sand, deepening to ocean blue.
        const depth = smooth(0, -0.42, g.inland);
        r = lerp(0.1, 0.012, depth);
        gg = lerp(0.42, 0.13, depth);
        b = lerp(0.46, 0.3, depth);
        const foam = smooth(-0.02, 0, g.inland);
        r = lerp(r, 0.75, foam * 0.7);
        gg = lerp(gg, 0.82, foam * 0.7);
        b = lerp(b, 0.8, foam * 0.7);
        rg = lerp(0.2, 0.1, depth);
      } else {
        const patch = noise.fbm(u, v, 30, 30, 3);
        const broad = noise.fbm(u + 0.2, v + 0.6, 6, 6, 3);
        const wet = smooth(1.25, 0.25, g.inland); // the monsoon side is green, the rain shadow is dry
        // Dry plateau: tan soil, olive scrub, red earth, a patchwork of fields.
        const cell = hash(Math.floor(lon * 60 + patch * 9), Math.floor(lat * 60 + broad * 9));
        let pr = lerp(0.27, 0.4, patch) * (0.9 + cell * 0.16);
        let pg = lerp(0.25, 0.3, patch) * (0.9 + cell * 0.16);
        let pb = lerp(0.1, 0.13, patch) * (0.9 + cell * 0.14);
        if (cell > 0.62) {
          pr *= 0.82;
          pg *= 0.99;
          pb *= 0.8;
        }
        const red = smooth(0.55, 0.8, broad) * 0.5;
        pr = lerp(pr, 0.42, red);
        pg = lerp(pg, 0.2, red);
        pb = lerp(pb, 0.09, red);
        // Rainforest and plantations on the Ghats and the coastal strip.
        const fr = lerp(0.02, 0.06, patch);
        const fg = lerp(0.1, 0.19, patch);
        const fb = lerp(0.03, 0.05, patch);
        const green = clamp01(wet * 0.95 + g.ghat * 0.5);
        r = lerp(pr, fr, green);
        gg = lerp(pg, fg, green);
        b = lerp(pb, fb, green);
        // Open grass on the highest crests, pale sand on the beach.
        const high = smooth(1.25, 1.75, g.h);
        r = lerp(r, 0.36, high * 0.6);
        gg = lerp(gg, 0.4, high * 0.6);
        b = lerp(b, 0.2, high * 0.6);
        const beach = smooth(0.03, 0.0, g.inland);
        r = lerp(r, 0.78, beach);
        gg = lerp(gg, 0.7, beach);
        b = lerp(b, 0.5, beach);
      }
      color[k] = srgb(r);
      color[k + 1] = srgb(gg);
      color[k + 2] = srgb(b);
      color[k + 3] = 255;
      rough[k] = rough[k + 1] = rough[k + 2] = Math.round(rg * 255);
      rough[k + 3] = 255;
    }
  }

  // Rivers and their reservoirs.
  const stamp = (lon: number, lat: number, radius: number) => {
    const ci = (lon - lonMin) / dLon;
    const cj = (lat - latMin) / dLat;
    const reach = Math.ceil(radius);
    for (let y = -reach; y <= reach; y++) {
      for (let x = -reach; x <= reach; x++) {
        const i = Math.round(ci) + x;
        const j = Math.round(cj) + y;
        if (i < 0 || j < 0 || i >= size || j >= size) continue;
        const d = Math.hypot(i - ci, j - cj);
        const a = clamp01(radius + 0.5 - d);
        if (a <= 0) continue;
        const k = (j * size + i) * 4;
        color[k] = lerp(color[k], 52, a);
        color[k + 1] = lerp(color[k + 1], 128, a);
        color[k + 2] = lerp(color[k + 2], 150, a);
        rough[k] = rough[k + 1] = rough[k + 2] = lerp(rough[k], 40, a);
      }
    }
  };
  const perDegree = size / (lonMax - lonMin);
  for (const river of RIVERS) {
    const curve = new THREE.CatmullRomCurve3(river.map(([lo, la]) => new THREE.Vector3(lo, la, 0)));
    const samples = Math.round(curve.getLength() * perDegree * 2);
    for (let s = 0; s <= samples; s++) {
      const p = curve.getPoint(s / samples);
      const wiggle = (noise.noise(s * 0.06, 2.2, 256, 8) - 0.5) * 0.05;
      stamp(p.x + wiggle, p.y + wiggle * 0.6, 0.35 + (s / samples) * 0.55);
    }
  }
  stamp(76.57, 12.43, 2.2); // Krishnaraja Sagara
  stamp(76.33, 15.27, 2.6); // Tungabhadra reservoir
  stamp(75.05, 14.12, 2.0); // Linganamakki

  // Fine relief for lighting, straight from the height field.
  const at = (i: number, j: number) => heights[Math.min(size - 1, Math.max(0, j)) * size + Math.min(size - 1, Math.max(0, i))];
  const cellWorld = dLon * SCALE;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const sea = heights[j * size + i] <= 0.0081 && rough[(j * size + i) * 4] < 60;
      let dx = ((at(i + 1, j) - at(i - 1, j)) * HEIGHT) / (2 * cellWorld);
      let dy = ((at(i, j + 1) - at(i, j - 1)) * HEIGHT) / (2 * cellWorld);
      if (sea) {
        // Small ripples so the water catches the light unevenly.
        dx = (hash(i * 0.37, j * 0.91) - 0.5) * 0.05;
        dy = (hash(i * 0.73, j * 0.29) - 0.5) * 0.05;
      }
      const len = Math.hypot(dx, dy, 1);
      const k = (j * size + i) * 4;
      detail[k] = 127.5 - (dx / len) * 127.5;
      detail[k + 1] = 127.5 - (dy / len) * 127.5;
      detail[k + 2] = 127.5 + (1 / len) * 127.5;
      detail[k + 3] = 255;
    }
  }

  const make = (data: Uint8Array, srgbSpace: boolean) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.colorSpace = srgbSpace ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  return { color: make(color, true), detail: make(detail, false), rough: make(rough, false) };
}

function makeLabel(text: string, strong: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  g.font = `${strong ? 700 : 600} 58px system-ui, "Segoe UI", Roboto, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 12;
  g.strokeStyle = "rgba(11, 86, 131, 0.9)";
  g.strokeText(text, 256, 66);
  g.fillStyle = "#fffefc";
  g.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeCloudShadowTexture(size: number): THREE.DataTexture {
  const n = makePeriodicNoise(77);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = smooth(0.52, 0.74, n.fbm(x / size, y / size, 3, 3, 5));
      const i = (y * size + x) * 4;
      // Multiplied over the land: white leaves it alone, blue-grey is shade.
      data[i] = 255 - c * 120;
      data[i + 1] = 255 - c * 100;
      data[i + 2] = 255 - c * 70;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function createPoliciesScene(ctx: SceneContext): BannerScene {
  const low = ctx.quality === "low";
  const bin = makeBin();
  const { renderer } = ctx;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 2, 0.1, 80);

  const air = new THREE.Color(0.42, 0.63, 0.78);
  scene.background = air;
  scene.fog = new THREE.Fog(air, 13, 34);

  const sunDir = new THREE.Vector3(-0.55, 0.62, -0.35).normalize();
  const env = bin.add(
    makeSkyEnvironment(renderer, {
      zenith: new THREE.Color(0.16, 0.4, 0.75),
      horizon: new THREE.Color(0.75, 0.85, 0.92),
      ground: new THREE.Color(0.25, 0.3, 0.3),
      sunDir,
      sunColor: new THREE.Color(1.0, 0.9, 0.75),
      glow: 2.0,
      disc: 40,
    }),
  );
  scene.environment = env.texture;
  scene.environmentIntensity = 0.55;

  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.92, 0.8), 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(low ? 1024 : 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  /* ---- the land ---- */
  const lonMin = 71.2;
  const lonMax = 81.6;
  const latMin = 9.4;
  const latMax = 18.6;
  const width = (lonMax - lonMin) * SCALE;
  const depth = (latMax - latMin) * SCALE;
  const sx = low ? 210 : 380;
  const sz = low ? 190 : 340;
  const landGeometry = bin.add(new THREE.PlaneGeometry(width, depth, sx, sz));
  landGeometry.rotateX(-Math.PI / 2);
  landGeometry.translate(toWorldX((lonMin + lonMax) / 2), 0, toWorldZ((latMin + latMax) / 2));
  const heightAt = (lon: number, lat: number) => Math.max(0, ground(lon, lat).h) * HEIGHT;
  {
    const pos = landGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lon = LON0 + pos.getX(i) / SCALE;
      const lat = LAT0 - pos.getZ(i) / SCALE;
      pos.setY(i, heightAt(lon, lat));
    }
    landGeometry.computeVertexNormals();
  }
  const baked = bake(low ? 768 : 1536, lonMin, lonMax, latMin, latMax);
  bin.add(baked.color);
  bin.add(baked.detail);
  bin.add(baked.rough);
  baked.color.anisotropy = ctx.maxAnisotropy;
  baked.detail.anisotropy = ctx.maxAnisotropy;
  const landMaterial = bin.add(
    new THREE.MeshStandardMaterial({
      map: baked.color,
      normalMap: baked.detail,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: baked.rough,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 1,
    }),
  );
  const land = new THREE.Mesh(landGeometry, landMaterial);
  land.castShadow = true;
  land.receiveShadow = true;
  scene.add(land);

  /* ---- cloud shadows sliding over the land ---- */
  const cloudTexture = bin.add(makeCloudShadowTexture(256));
  cloudTexture.repeat.set(1.6, 1.6);
  const cloudMaterial = bin.add(
    new THREE.MeshBasicMaterial({ map: cloudTexture, blending: THREE.MultiplyBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false, premultipliedAlpha: true }),
  );
  const cloudGeometry = bin.add(new THREE.PlaneGeometry(width, depth));
  cloudGeometry.rotateX(-Math.PI / 2);
  const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
  clouds.position.set(toWorldX((lonMin + lonMax) / 2), 1.0, toWorldZ((latMin + latMax) / 2));
  clouds.renderOrder = 2;
  scene.add(clouds);

  /* ---- pins ---- */
  const needleGeometry = bin.add(new THREE.CylinderGeometry(0.007, 0.003, 0.34, 10));
  needleGeometry.translate(0, 0.17, 0);
  const headGeometry = bin.add(new THREE.SphereGeometry(1, 32, 20));
  const steel = bin.add(new THREE.MeshStandardMaterial({ color: 0xd8dde0, metalness: 1, roughness: 0.25 }));
  const orange = bin.add(
    new THREE.MeshPhysicalMaterial({ color: 0xe8600f, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.4 }),
  );
  const blue = bin.add(
    new THREE.MeshPhysicalMaterial({ color: 0x0e6fa8, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.5 }),
  );
  const pinAt = (lon: number, lat: number, big: boolean, name: string) => {
    const pin = new THREE.Group();
    const needle = new THREE.Mesh(needleGeometry, steel);
    needle.castShadow = true;
    const head = new THREE.Mesh(headGeometry, big ? blue : orange);
    head.scale.setScalar(big ? 0.075 : 0.055);
    head.position.y = 0.34 + (big ? 0.05 : 0.035);
    head.castShadow = true;
    pin.add(needle, head);
    pin.position.set(toWorldX(lon), heightAt(lon, lat) - 0.02, toWorldZ(lat));
    pin.rotation.z = big ? 0 : 0.06;
    scene.add(pin);

    const texture = bin.add(makeLabel(name, big));
    const material = bin.add(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    const label = new THREE.Sprite(material);
    const grow = low ? 1.5 : 1;
    label.scale.set((big ? 1.3 : 1.05) * grow, (big ? 0.325 : 0.2625) * grow, 1);
    label.position.set(pin.position.x, pin.position.y + (big ? 0.68 : 0.58), pin.position.z);
    label.renderOrder = 10;
    scene.add(label);
    return pin;
  };
  pinAt(CITY.bengaluru[0], CITY.bengaluru[1], true, "Bengaluru");
  pinAt(CITY.coorg[0], CITY.coorg[1], false, "Coorg");
  pinAt(CITY.chikmagalur[0], CITY.chikmagalur[1], false, "Chikmagalur");
  pinAt(CITY.gokarna[0], CITY.gokarna[1], false, "Gokarna");
  pinAt(CITY.hampi[0], CITY.hampi[1], false, "Hampi");

  // Soft teal pulse on the ground under the home pin.
  const glow = bin.add(makeGlowTexture(128, 0.35));
  const pulseMaterial = bin.add(
    new THREE.MeshBasicMaterial({ map: glow, color: new THREE.Color(0.2, 0.95, 1.0), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  const pulseGeometry = bin.add(new THREE.PlaneGeometry(1, 1));
  pulseGeometry.rotateX(-Math.PI / 2);
  const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
  pulse.position.set(toWorldX(CITY.bengaluru[0]), heightAt(CITY.bengaluru[0], CITY.bengaluru[1]) + 0.03, toWorldZ(CITY.bengaluru[1]));
  scene.add(pulse);

  /* ---- routes ---- */
  const TUBE = 220;
  const RADIAL = 6;
  const routeMaterial = bin.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 0.36, 0.03), transparent: true, fog: false }));
  const casingMaterial = bin.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.95, 0.97), transparent: true, opacity: 0.9, fog: false }));
  const dotMaterial = bin.add(
    new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1.6, 1.1, 0.6), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }),
  );
  const routes = ROUTES.map((route) => {
    const stops: [number, number][] = [[CITY.bengaluru[0], CITY.bengaluru[1]], ...route.via, [CITY[route.to][0], CITY[route.to][1]]];
    const flat = new THREE.CatmullRomCurve3(stops.map(([lo, la]) => new THREE.Vector3(lo, la, 0)), false, "centripetal");
    // Drape the road over the relief.
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const p = flat.getPoint(i / 160);
      points.push(new THREE.Vector3(toWorldX(p.x), heightAt(p.x, p.y) + 0.022, toWorldZ(p.y)));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = bin.add(new THREE.TubeGeometry(curve, TUBE, 0.011, RADIAL, false));
    const casingGeometry = bin.add(new THREE.TubeGeometry(curve, TUBE, 0.017, RADIAL, false));
    const line = new THREE.Mesh(geometry, routeMaterial);
    const casing = new THREE.Mesh(casingGeometry, casingMaterial);
    casing.position.y = -0.008;
    line.renderOrder = 4;
    casing.renderOrder = 3;
    const dot = new THREE.Sprite(dotMaterial);
    dot.scale.setScalar(0.13);
    dot.renderOrder = 6;
    scene.add(casing, line, dot);
    return { curve, geometry, casingGeometry, dot };
  });

  renderer.toneMappingExposure = 1.05;

  const centre = new THREE.Vector3(-0.1, 0.1, -0.3);
  let radius = 9.2;
  const DRAW = 3.4; // seconds to draw one route
  const HOLD = 9;
  const CYCLE = ROUTES.length * DRAW + HOLD + 2;

  return {
    scene,
    camera,
    update(time) {
      // Camera: slow sway over the southern edge of the table.
      const a = Math.PI / 2 + 0.16 + Math.sin(time * 0.06) * 0.13;
      const r = radius + Math.sin(time * 0.045 + 2) * 0.4;
      camera.position.set(centre.x + Math.cos(a) * r * 0.8, r * 0.58 + Math.sin(time * 0.05) * 0.25, centre.z + Math.sin(a) * r * 0.8);
      camera.lookAt(centre);

      // The light swings slowly, so the shadows of the Ghats lengthen and shorten.
      const swing = Math.sin(time * 0.08) * 0.55;
      sun.position.set(centre.x + (-0.6 + swing) * 20, 12 + Math.cos(time * 0.08) * 2.5, centre.z + (-0.42 - swing * 0.3) * 20);
      sun.target.position.copy(centre);

      cloudTexture.offset.set(time * 0.0045, time * 0.0016);

      const t = time % CYCLE;
      const fade = clamp01((CYCLE - t) / 1.6);
      routeMaterial.opacity = fade;
      casingMaterial.opacity = 0.9 * fade;
      routes.forEach((route, i) => {
        const progress = clamp01((t - i * DRAW) / DRAW);
        const eased = progress * progress * (3 - 2 * progress);
        const count = Math.floor(eased * TUBE) * RADIAL * 6;
        route.geometry.setDrawRange(0, count);
        route.casingGeometry.setDrawRange(0, count);
        // A light runs at the head of the line, then keeps travelling the finished road.
        const done = t - (i + 1) * DRAW;
        const along = progress < 1 ? eased : (done * 0.09 + i * 0.23) % 1;
        route.dot.visible = progress > 0.001;
        route.dot.position.copy(route.curve.getPoint(along));
        route.dot.position.y += 0.02;
        (route.dot.material as THREE.SpriteMaterial).opacity = fade;
      });

      const beat = (time * 0.45) % 1;
      pulse.scale.setScalar(0.3 + beat * 1.5);
      pulseMaterial.opacity = (1 - beat) * 0.55;
    },
    resize(w, h, focus: BannerFocus) {
      const aspect = w / h;
      camera.fov = fitFov(aspect, 36, 72);
      radius = focus.wide ? 12.5 : 10.5;
      applyFocus(camera, w, h, { x: focus.x, y: focus.wide ? 0.52 : focus.y + 0.04, wide: focus.wide });
    },
    dispose() {
      bin.dispose();
    },
  };
}
