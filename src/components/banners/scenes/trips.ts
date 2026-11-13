import * as THREE from "three";
import { applyFocus, fitFov, type BannerFocus, type BannerScene, type SceneContext } from "../engine";
import { DITHER_GLSL, OUTPUT_GLSL, makeBin, makeGlowTexture, makeNoiseTexture, makePeriodicNoise, rng, smooth } from "./shared";

/**
 * Trips banner: a dawn flight up a Western Ghats valley.
 *
 * The camera follows a car along a winding valley road, flying into a low sun. Ridges fade
 * into warm haze layer by layer, mist rolls through the side valleys, a flock crosses ahead.
 * The terrain is one repeating height tile baked on the CPU (height, slope, sun shadow), so
 * the flight never ends and the shader stays cheap enough for phones.
 */

const TILE = 16000; // metres covered by one terrain tile
const K = (Math.PI * 2) / TILE;
const ROAD_Z0 = TILE / 2;
const ROAD = { a1: 420, p1: 0.6, a2: 110, p2: 2.1, a3: 45, p3: 4.0 };
const SPEED = 21; // m/s, about 75 km/h

const roadZ = (x: number) =>
  ROAD_Z0 + ROAD.a1 * Math.sin(K * x + ROAD.p1) + ROAD.a2 * Math.sin(3 * K * x + ROAD.p2) + ROAD.a3 * Math.sin(9 * K * x + ROAD.p3);
const roadSlope = (x: number) =>
  ROAD.a1 * K * Math.cos(K * x + ROAD.p1) +
  ROAD.a2 * 3 * K * Math.cos(3 * K * x + ROAD.p2) +
  ROAD.a3 * 9 * K * Math.cos(9 * K * x + ROAD.p3);
/** The road without its tight bends: the line the camera follows, so the flight stays smooth. */
const valleyZ = (x: number) => ROAD_Z0 + ROAD.a1 * Math.sin(K * x + ROAD.p1) + ROAD.a2 * Math.sin(3 * K * x + ROAD.p2);
const roadLevel = (x: number) => 130 + 34 * Math.sin(2 * K * x + 1.3) + 14 * Math.sin(5 * K * x + 0.4);

const ROAD_GLSL = /* glsl */ `
  const float TILE = ${TILE.toFixed(1)};
  const float KK = ${K.toFixed(9)};
  float roadZ(float x) {
    return ${ROAD_Z0.toFixed(1)} + ${ROAD.a1.toFixed(1)} * sin(KK * x + ${ROAD.p1.toFixed(2)})
      + ${ROAD.a2.toFixed(1)} * sin(3.0 * KK * x + ${ROAD.p2.toFixed(2)})
      + ${ROAD.a3.toFixed(1)} * sin(9.0 * KK * x + ${ROAD.p3.toFixed(2)});
  }
  float roadSlope(float x) {
    return ${ROAD.a1.toFixed(1)} * KK * cos(KK * x + ${ROAD.p1.toFixed(2)})
      + ${ROAD.a2.toFixed(1)} * 3.0 * KK * cos(3.0 * KK * x + ${ROAD.p2.toFixed(2)})
      + ${ROAD.a3.toFixed(1)} * 9.0 * KK * cos(9.0 * KK * x + ${ROAD.p3.toFixed(2)});
  }
`;

/** Colour of the air in a given direction: cool blue away from the sun, glowing peach towards it. */
const HAZE_GLSL = /* glsl */ `
  uniform vec3 uSunDir;
  vec3 hazeColor(vec3 dir) {
    float s = max(dot(normalize(vec3(dir.x, max(dir.y, 0.0) * 0.6, dir.z)), uSunDir), 0.0);
    vec3 cool = vec3(0.17, 0.33, 0.52);
    vec3 warm = vec3(0.80, 0.42, 0.21);
    vec3 c = mix(cool, warm, pow(s, 10.0) * 0.75);
    c += warm * pow(s, 30.0) * 0.35 + vec3(1.0, 0.75, 0.5) * pow(s, 160.0) * 0.5;
    return c;
  }
`;

interface Terrain {
  texture: THREE.DataTexture;
  /** How open each spot is to the sky (gullies dark, crests bright). */
  shade: THREE.DataTexture;
  heightAt(x: number, z: number): number;
}

function bakeTerrain(size: number, sun: THREE.Vector3): Terrain {
  const n = makePeriodicNoise(4711);
  const H = new Float32Array(size * size);
  const cell = TILE / size;

  for (let iz = 0; iz < size; iz++) {
    const z = iz * cell;
    const v = iz / size;
    for (let ix = 0; ix < size; ix++) {
      const x = ix * cell;
      const u = ix / size;
      // Long ridges with sharp crests, plus broad swells so no two ridges are the same height.
      // A slow sideways wobble first, so crests meander like eroded spurs instead of straight lines.
      const wu = u + (n.fbm(u, v, 3, 3, 3) - 0.5) * 0.05;
      const wv = v + (n.fbm(u + 0.5, v + 0.2, 3, 3, 3) - 0.5) * 0.05;
      const ridge = n.ridged(wu, wv, 5, 4, 5);
      const swell = n.fbm(u + 0.31, v + 0.57, 2, 2, 3);
      // Spurs and gullies cut into the big ridges, strongest high up.
      const spurs = n.ridged(wu + 0.2, wv + 0.4, 17, 14, 4) * 170 * (0.25 + 0.75 * ridge);
      const mountains = ridge * 560 + swell * 340 + spurs + n.fbm(u, v, 40, 40, 2) * 18;
      // Distance to the road, wrapped so the valley repeats with the tile.
      let d = Math.abs(z - roadZ(x));
      d = Math.min(d, TILE - d);
      const open = smooth(100, 2600, d);
      let h = 120 + mountains * (0.06 + 0.94 * open);
      const level = roadLevel(x);
      h = h + (level - h) * smooth(300, 26, d);
      H[iz * size + ix] = h;
    }
  }

  const at = (ix: number, iz: number) => H[((iz + size) % size) * size + ((ix + size) % size)];
  const sample = (x: number, z: number) => {
    const fx = x / cell;
    const fz = z / cell;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const a = at(x0, z0);
    const b = at(x0 + 1, z0);
    const c = at(x0, z0 + 1);
    const d = at(x0 + 1, z0 + 1);
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };

  // Soft sun shadow: walk from every texel towards the sun and see how close the ground comes.
  const flat = Math.hypot(sun.x, sun.z);
  const sx = sun.x / flat;
  const sz = sun.z / flat;
  const rise = sun.y / flat;
  const data = new Uint16Array(size * size * 4);
  const steps = 44;
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const h = at(ix, iz);
      let lit = 1;
      let dist = cell * 1.2;
      for (let s = 0; s < steps; s++) {
        const ground = sample(ix * cell + sx * dist, iz * cell + sz * dist);
        const ray = h + rise * dist + 6;
        const clear = (ray - ground) / dist;
        // Penumbra widens with distance from the ridge that casts it.
        const k = clear * 26 + 0.5;
        if (k < lit) lit = k;
        if (lit <= 0) break;
        dist *= 1.11;
      }
      const i = (iz * size + ix) * 4;
      data[i] = THREE.DataUtils.toHalfFloat(h);
      data[i + 1] = THREE.DataUtils.toHalfFloat(lit < 0 ? 0 : lit);
      data[i + 2] = THREE.DataUtils.toHalfFloat((at(ix + 1, iz) - at(ix - 1, iz)) / (2 * cell));
      data[i + 3] = THREE.DataUtils.toHalfFloat((at(ix, iz + 1) - at(ix, iz - 1)) / (2 * cell));
    }
  }

  // Sky openness: ground lower than its surroundings sees less sky.
  const shadeData = new Uint8Array(size * size * 4);
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const h = at(ix, iz);
      let around = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        around += at(ix + Math.round(Math.cos(a) * 4), iz + Math.round(Math.sin(a) * 4));
        around += at(ix + Math.round(Math.cos(a) * 10), iz + Math.round(Math.sin(a) * 10)) * 0.6;
      }
      const open = 0.5 + (h - around / 12.8) / (cell * 2.6);
      const i = (iz * size + ix) * 4;
      shadeData[i] = shadeData[i + 1] = shadeData[i + 2] = Math.max(0, Math.min(255, open * 255));
      shadeData[i + 3] = 255;
    }
  }
  const shade = new THREE.DataTexture(shadeData, size, size, THREE.RGBAFormat);
  shade.wrapS = shade.wrapT = THREE.RepeatWrapping;
  shade.minFilter = THREE.LinearFilter;
  shade.magFilter = THREE.LinearFilter;
  shade.needsUpdate = true;

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, shade, heightAt: sample };
}

const TERRAIN_VERTEX = /* glsl */ `
  uniform sampler2D uTerrain;
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    wp.y = texture2D(uTerrain, wp.xz / ${TILE.toFixed(1)}).r;
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const TERRAIN_FRAGMENT = /* glsl */ `
  uniform sampler2D uTerrain;
  uniform sampler2D uShade;
  uniform sampler2D uNoise;
  uniform vec3 uCam;
  uniform float uTime;
  uniform vec3 uCar;
  uniform vec2 uCarDir;
  uniform float uFar;
  varying vec3 vWorld;
  ${ROAD_GLSL}
  ${HAZE_GLSL}
  ${DITHER_GLSL}

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec4 t = texture2D(uTerrain, vWorld.xz / TILE);
    float h = t.r;
    float shadow = t.g;
    vec3 n = normalize(vec3(-t.b, 1.0, -t.a));

    vec3 toPoint = vWorld - uCam;
    float dist = length(toPoint);
    vec3 view = toPoint / dist;

    // Tree canopy: clumpy relief that fades out before it can shimmer in the distance.
    vec2 skew = vWorld.xz + vWorld.y * vec2(0.55, 0.8); // stops the pattern stretching down steep slopes
    vec4 fine = texture2D(uNoise, skew / (TILE / 60.0));
    vec4 mid = texture2D(uNoise, vWorld.xz / (TILE / 15.0));
    vec4 broad = texture2D(uNoise, vWorld.xz / (TILE / 4.0));
    float near = 1.0 - smoothstep(1500.0, 6000.0, dist);
    n = normalize(n + vec3(fine.g - 0.5, 0.0, fine.b - 0.5) * 1.6 * near + vec3(mid.g - 0.5, 0.0, mid.b - 0.5) * 0.8);
    float slope = 1.0 - n.y;

    float rd = abs(vWorld.z - roadZ(vWorld.x));
    rd = min(rd, TILE - rd);
    float rs = roadSlope(vWorld.x);
    float roadDist = rd / sqrt(1.0 + rs * rs);

    // Ground cover: rainforest on the slopes, shola grass on high crests, bare rock where steep.
    vec4 leaf = texture2D(uNoise, skew / (TILE / 420.0));
    float canopy = mix(0.5, smoothstep(0.25, 0.75, leaf.g * 0.6 + fine.r * 0.4), near);
    vec3 forest = mix(vec3(0.012, 0.036, 0.016), vec3(0.05, 0.09, 0.026), broad.r);
    forest *= 0.3 + 1.5 * canopy * (0.6 + 0.8 * mid.a);
    vec3 grass = mix(vec3(0.15, 0.16, 0.055), vec3(0.22, 0.19, 0.07), mid.r);
    vec3 rock = vec3(0.10, 0.092, 0.085);
    float crest = smoothstep(470.0, 700.0, h + (broad.g - 0.5) * 260.0) * (1.0 - smoothstep(0.2, 0.42, slope));
    vec3 albedo = mix(forest, grass, crest * 0.85);
    albedo = mix(albedo, rock, smoothstep(0.4, 0.62, slope) * 0.65);

    // Valley floor: paddy and plantation plots beside the road.
    vec2 plot = floor((vWorld.xz + (mid.gb - 0.5) * 60.0) / (TILE / vec2(145.0, 216.0)));
    plot = mod(plot, vec2(145.0, 216.0));
    float pk = hash(plot);
    vec3 field = mix(vec3(0.06, 0.12, 0.035), vec3(0.17, 0.19, 0.06), pk);
    field = mix(field, vec3(0.03, 0.07, 0.03), step(0.72, hash(plot + 7.0)));
    float valley = (1.0 - smoothstep(170.0, 420.0 + broad.b * 260.0, rd)) * (1.0 - smoothstep(0.08, 0.2, slope));
    albedo = mix(albedo, field * (0.8 + 0.4 * fine.r), valley * 0.85);

    float aa = fwidth(roadDist) + 0.4;
    float verge = 1.0 - smoothstep(7.0 - aa, 10.0 + aa, roadDist);
    float tarmac = 1.0 - smoothstep(4.2 - aa, 4.2 + aa, roadDist);
    albedo = mix(albedo, vec3(0.16, 0.13, 0.09), verge * 0.7);
    albedo = mix(albedo, vec3(0.075, 0.078, 0.085), tarmac);

    // Low sun plus blue sky fill.
    float ndl = max(dot(n, uSunDir), 0.0);
    float open = smoothstep(0.12, 0.78, texture2D(uShade, vWorld.xz / TILE).r);
    vec3 sunLight = vec3(1.0, 0.54, 0.24) * 6.5 * ndl * shadow;
    vec3 skyLight = mix(vec3(0.05, 0.08, 0.13), vec3(0.20, 0.31, 0.48), n.y * 0.5 + 0.5) * (0.25 + 0.75 * open);
    // Light scattered through the canopy when the sun is behind it.
    float back = pow(max(dot(view, uSunDir), 0.0), 3.0) * (1.0 - tarmac);
    vec3 col = albedo * (sunLight + skyLight * 1.25) + albedo * vec3(1.0, 0.5, 0.2) * back * shadow * 0.9;

    // Headlamps on the road ahead of the car.
    vec2 rel = vWorld.xz - uCar.xz;
    float along = dot(rel, uCarDir);
    float across = dot(rel, vec2(-uCarDir.y, uCarDir.x));
    float spread = 3.2 + along * 0.2;
    float beam = smoothstep(0.0, 9.0, along) * exp(-along / 55.0) * exp(-(across * across) / (spread * spread));
    col += (albedo + 0.02) * vec3(1.0, 0.86, 0.62) * beam * 16.0;

    // Air: thicker low down, and mist pooling in the side valleys, drifting with the wind.
    float m1 = texture2D(uNoise, vWorld.xz / (TILE / 3.0) + uTime * vec2(0.0042, 0.0016)).a;
    float m2 = texture2D(uNoise, vWorld.xz / (TILE / 8.0) - uTime * vec2(0.0065, -0.0031)).r;
    float mistTop = 40.0 + m1 * 400.0 + m2 * 130.0;
    float mist = smoothstep(mistTop, mistTop - 170.0, vWorld.y);
    mist *= 0.2 + 0.8 * smoothstep(240.0, 1500.0, rd);
    mist *= smoothstep(250.0, 1400.0, dist);

    float dy = toPoint.y;
    float b = 0.0021;
    float fall = abs(dy) > 1.0 ? (1.0 - exp(-b * dy)) / (b * dy) : 1.0;
    float depth = 0.00036 * exp(-b * uCam.y) * fall * dist + mist * 2.1;
    float fog = 1.0 - exp(-depth);
    fog = max(fog, smoothstep(uFar * 0.72, uFar, dist));
    vec3 air = mix(hazeColor(view), hazeColor(view) * 1.25 + vec3(0.10, 0.11, 0.12), mist * 0.8);
    col = mix(col, air, fog);

    gl_FragColor = vec4(col, 1.0);
    ${OUTPUT_GLSL}
  }
`;

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
    gl_Position = p.xyww;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform float uTravel;
  varying vec3 vDir;
  ${HAZE_GLSL}
  ${DITHER_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    vec3 haze = hazeColor(d);
    float s = max(dot(d, uSunDir), 0.0);
    vec3 zenith = vec3(0.05, 0.21, 0.42);
    vec3 col = mix(haze, zenith, smoothstep(0.0, 0.5, d.y));
    col = mix(col, haze, 1.0 - smoothstep(-0.02, 0.07, d.y));

    // High cloud, lit from underneath by the rising sun.
    vec2 p = d.xz / (max(d.y, 0.0) + 0.11) * 0.16 + uTime * vec2(0.0016, 0.0006);
    float c = texture2D(uNoise, p).a * 0.62 + texture2D(uNoise, p * 2.9 + 0.3).r * 0.38;
    float cloud = smoothstep(0.50, 0.80, c) * smoothstep(0.015, 0.16, d.y);
    vec3 lit = mix(vec3(0.62, 0.60, 0.68), vec3(1.5, 0.84, 0.52), pow(s, 1.6));
    col = mix(col, lit, cloud * 0.72);

    // Far ranges beyond the modelled land: three hazy ridge lines, each paler than the one in front,
    // with mist lying at their feet.
    float az = atan(d.z, d.x);
    float el = d.y / max(length(d.xz), 0.001);
    for (int i = 2; i >= 0; i--) {
      float fi = float(i);
      float shift = uTravel * (0.000030 - fi * 0.000009);
      float prof = texture2D(uNoise, vec2(az * (0.42 + fi * 0.17) + shift + fi * 0.37, 0.23 + fi * 0.21)).a;
      prof = 1.0 - abs(2.0 * prof - 1.0) * 1.15;
      prof += (texture2D(uNoise, vec2(az * (1.9 + fi * 0.6) + shift * 3.0, 0.61 + fi * 0.13)).r - 0.5) * 0.35;
      float crest = -0.050 + fi * 0.017 + prof * (0.062 - fi * 0.014);
      float inside = 1.0 - smoothstep(crest - 0.0012, crest + 0.0012, el);
      vec3 body = mix(vec3(0.03, 0.085, 0.15), haze, 0.30 + fi * 0.21);
      body = mix(body, haze * 1.05, smoothstep(crest - 0.012, crest - 0.05, el));
      col = mix(col, body, inside);
    }

    // The sun: a small hot disc inside a wide bloom.
    col += vec3(1.0, 0.78, 0.5) * (pow(s, 500.0) * 1.0 + smoothstep(0.99978, 0.99992, s) * 9.0);

    gl_FragColor = vec4(col, 1.0);
    ${OUTPUT_GLSL}
  }
`;

const BIRD_VERTEX = /* glsl */ `
  attribute vec3 aCentre;
  attribute vec2 aFlap; // phase, speed
  uniform float uTime;
  void main() {
    // position.x = along the body, position.z = out along the wing (signed), position.y unused
    float reach = abs(position.z);
    float beat = sin(uTime * aFlap.y + aFlap.x);
    // Flap for a while, glide for a while.
    float glide = smoothstep(0.25, 0.6, sin(uTime * 0.31 + aFlap.x * 1.7));
    float angle = mix(beat * 0.85, 0.12, glide) * smoothstep(0.0, 0.25, reach);
    vec3 p = vec3(position.x, sin(angle) * reach + beat * 0.05 * (1.0 - glide), cos(angle) * position.z);
    vec3 drift = vec3(0.0, sin(uTime * 0.5 + aFlap.x) * 1.4, cos(uTime * 0.37 + aFlap.x * 2.0) * 1.8);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p + aCentre + drift, 1.0);
  }
`;

const BIRD_FRAGMENT = /* glsl */ `
  ${DITHER_GLSL}
  void main() {
    gl_FragColor = vec4(0.055, 0.075, 0.105, 1.0);
    ${OUTPUT_GLSL}
  }
`;

function buildFlock(count: number): THREE.BufferGeometry {
  const random = rng(77);
  // One bird: slim body plus two swept wings (x forward, z along the wing).
  const shape = [
    [0.55, 0, 0, -0.5, 0, 0.09, -0.5, 0, -0.09], // body
    [0.22, 0, 0.05, -0.18, 0, 0.05, -0.02, 0, 0.62], // inner right
    [-0.02, 0, 0.62, -0.18, 0, 0.05, -0.3, 0, 1.25], // outer right (swept back)
    [-0.02, 0, 0.62, 0.22, 0, 0.05, 0.1, 0, 0.66],
    [0.22, 0, -0.05, -0.02, 0, -0.62, -0.18, 0, -0.05], // inner left
    [-0.02, 0, -0.62, -0.3, 0, -1.25, -0.18, 0, -0.05],
    [-0.02, 0, -0.62, 0.1, 0, -0.66, 0.22, 0, -0.05],
  ];
  const positions: number[] = [];
  const centres: number[] = [];
  const flaps: number[] = [];
  for (let b = 0; b < count; b++) {
    // Loose V formation.
    const rank = Math.ceil(b / 2);
    const sideSign = b % 2 === 0 ? 1 : -1;
    const cx = -rank * 4.2 + (random() - 0.5) * 2.5;
    const cz = sideSign * rank * 3.6 + (random() - 0.5) * 2;
    const cy = (random() - 0.5) * 2.4;
    const phase = random() * 6.28;
    const speed = 6.2 + random() * 1.6;
    const scale = 0.85 + random() * 0.3;
    for (const tri of shape) {
      for (let v = 0; v < 3; v++) {
        positions.push(tri[v * 3] * scale, tri[v * 3 + 1], tri[v * 3 + 2] * scale);
        centres.push(cx, cy, cz);
        flaps.push(phase, speed);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aCentre", new THREE.Float32BufferAttribute(centres, 3));
  geometry.setAttribute("aFlap", new THREE.Float32BufferAttribute(flaps, 2));
  return geometry;
}

export function createTripsScene(ctx: SceneContext): BannerScene {
  const low = ctx.quality === "low";
  const bin = makeBin();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 2, 4, 60000);

  const sunAz = (20 * Math.PI) / 180;
  const sunEl = (8 * Math.PI) / 180;
  const sun = new THREE.Vector3(Math.cos(sunEl) * Math.cos(sunAz), Math.sin(sunEl), Math.cos(sunEl) * Math.sin(sunAz));

  const terrain = bakeTerrain(low ? 256 : 512, sun);
  bin.add(terrain.texture);
  bin.add(terrain.shade);
  const noise = bin.add(makeNoiseTexture(low ? 256 : 512, 9));
  noise.anisotropy = ctx.maxAnisotropy;

  /* ---- ground ---- */
  const cells = low ? 170 : 300;
  const spacing = low ? 110 : 62;
  const span = cells * spacing;
  const grid = bin.add(new THREE.PlaneGeometry(span, span, cells, cells));
  grid.rotateX(-Math.PI / 2);
  const uniforms = {
    uTerrain: { value: terrain.texture },
    uShade: { value: terrain.shade },
    uNoise: { value: noise },
    uSunDir: { value: sun },
    uCam: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uTravel: { value: 0 },
    uCar: { value: new THREE.Vector3() },
    uCarDir: { value: new THREE.Vector2(1, 0) },
    uFar: { value: span * 0.5 },
  };
  const groundMaterial = bin.add(
    new THREE.ShaderMaterial({ uniforms, vertexShader: TERRAIN_VERTEX, fragmentShader: TERRAIN_FRAGMENT }),
  );
  const ground = new THREE.Mesh(grid, groundMaterial);
  ground.frustumCulled = false;
  scene.add(ground);

  /* ---- sky ---- */
  const skyGeometry = bin.add(new THREE.SphereGeometry(1, 48, 24));
  const skyMaterial = bin.add(
    new THREE.ShaderMaterial({
      uniforms: { uNoise: uniforms.uNoise, uTime: uniforms.uTime, uSunDir: uniforms.uSunDir, uTravel: uniforms.uTravel },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    }),
  );
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  /* ---- car: a small white body, tail lamps, and a warm glow where the beams land ---- */
  const car = new THREE.Group();
  const bodyGeometry = bin.add(new THREE.BoxGeometry(4.4, 1.5, 1.8));
  const bodyMaterial = bin.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.55, 0.62) }));
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.95;
  car.add(body);
  const glow = bin.add(makeGlowTexture(64));
  const tailMaterial = bin.add(
    new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(3.2, 0.25, 0.1), blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const tail = new THREE.Sprite(tailMaterial);
  tail.position.set(-2.4, 1.1, 0);
  tail.scale.setScalar(low ? 60 : 38);
  car.add(tail);
  const headMaterial = bin.add(
    new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1.3, 0.95, 0.55), blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const head = new THREE.Sprite(headMaterial);
  head.position.set(5, 1.0, 0);
  head.scale.setScalar(low ? 60 : 40);
  car.add(head);
  scene.add(car);

  /* ---- birds ---- */
  const flockGeometry = bin.add(buildFlock(low ? 7 : 11));
  const flockMaterial = bin.add(
    new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime },
      vertexShader: BIRD_VERTEX,
      fragmentShader: BIRD_FRAGMENT,
      side: THREE.DoubleSide,
    }),
  );
  const flock = new THREE.Mesh(flockGeometry, flockMaterial);
  flock.frustumCulled = false;
  scene.add(flock);

  let carX = 2600;
  const target = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  let wideView = true;

  const place = (time: number) => {
    const cz = roadZ(carX);
    const slope = roadSlope(carX);
    car.position.set(carX, terrain.heightAt(carX, cz) + 0.2, cz);
    car.rotation.y = -Math.atan(slope);
    const inv = 1 / Math.hypot(1, slope);
    uniforms.uCar.value.copy(car.position);
    uniforms.uCarDir.value.set(inv, slope * inv);

    // Follow from behind and to one side, drifting a little like a real aircraft.
    const back = wideView ? 3300 : 3900;
    const camX = carX - back;
    const lift = (wideView ? 760 : 800) + Math.sin(time * 0.11) * 14;
    camera.position.set(camX, roadLevel(camX) + lift, valleyZ(camX) - 250 + Math.sin(time * 0.07) * 40);
    const aheadX = carX + 3600;
    target.set(aheadX, 420, valleyZ(aheadX) + 160);
    camera.up.set(Math.sin(time * 0.09) * 0.025, 1, 0);
    camera.lookAt(target);
    uniforms.uCam.value.copy(camera.position);

    // Snap the ground to its own grid so the hills never swim as it follows the camera.
    ground.position.set(
      Math.round((camera.position.x + span * 0.4) / spacing) * spacing,
      0,
      Math.round(camera.position.z / spacing) * spacing,
    );

    // Flock: flying the same way, slowly crossing the frame, then coming round again.
    camera.getWorldDirection(forward);
    right.crossVectors(forward, camera.up).normalize();
    const loop = (time * 0.021 + 0.35) % 1;
    const sideways = (0.5 - loop) * 230;
    const aheadBy = 150 + Math.sin(loop * Math.PI) * 40;
    flock.position
      .copy(camera.position)
      .addScaledVector(forward, aheadBy)
      .addScaledVector(right, sideways + 40);
    flock.position.y += (wideView ? 4 : 14) + Math.sin(loop * 6.28) * 6;
    flock.rotation.y = Math.atan2(-forward.z, forward.x) + 0.32;
  };

  return {
    scene,
    camera,
    update(time, dt) {
      uniforms.uTime.value = time;
      carX += SPEED * dt;
      uniforms.uTravel.value += SPEED * dt;
      // The land repeats every tile, so stepping back one tile is invisible and keeps numbers small.
      if (carX > TILE * 2) carX -= TILE;
      place(time);
    },
    resize(width, height, focus: BannerFocus) {
      wideView = focus.wide;
      const aspect = width / height;
      camera.fov = fitFov(aspect, 38, 84);
      // Keep the horizon in the upper part of the picture: more land, and room for the heading below.
      applyFocus(camera, width, height, { x: focus.x, y: focus.wide ? 0.36 : Math.min(focus.y + 0.06, 0.34), wide: focus.wide });
    },
    dispose() {
      bin.dispose();
    },
  };
}
