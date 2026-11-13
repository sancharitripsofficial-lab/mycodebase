import * as THREE from "three";
import { applyFocus, fitFov, type BannerFocus, type BannerScene, type SceneContext } from "../engine";
import { DITHER_GLSL, OUTPUT_GLSL, makeBin, makeGlowTexture, makeNoiseTexture, makePeriodicNoise, makeSkyEnvironment, rng } from "./shared";

/**
 * Contact banner: Bengaluru from the air at blue hour.
 *
 * Street lights spread to the horizon under the last orange of sunset, traffic creeps along
 * the arterial roads, the lakes hold the colour of the sky. A glossy pin floats over the city
 * centre and WhatsApp-green signal rings travel outwards from the spot it marks.
 */

const CITY = 170; // world units across the lit ground

interface CityMaps {
  lights: THREE.CanvasTexture;
  water: THREE.CanvasTexture;
  /** Arterial roads as polylines in world units, for the traffic. */
  roads: THREE.Vector2[][];
}

function paintCity(size: number): CityMaps {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#000";
  g.fillRect(0, 0, size, size);
  const random = rng(560001);
  const noise = makePeriodicNoise(91);
  const gauss = () => (random() + random() + random() + random() - 2) / 2; // roughly -1..1, centred

  // Lakes and big parks: no lights there.
  const waterCanvas = document.createElement("canvas");
  waterCanvas.width = waterCanvas.height = 512;
  const wg = waterCanvas.getContext("2d") as CanvasRenderingContext2D;
  wg.fillStyle = "#000";
  wg.fillRect(0, 0, 512, 512);
  const lakes: { x: number; y: number; rx: number; ry: number; rot: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const far = 0.05 + random() * 0.36;
    const a = random() * Math.PI * 2;
    lakes.push({
      x: 0.5 + Math.cos(a) * far,
      y: 0.5 + Math.sin(a) * far,
      rx: 0.008 + random() * 0.024,
      ry: 0.005 + random() * 0.012,
      rot: random() * Math.PI,
    });
  }
  const inLake = (u: number, v: number) => {
    for (const l of lakes) {
      const dx = u - l.x;
      const dy = v - l.y;
      const cr = Math.cos(l.rot);
      const sr = Math.sin(l.rot);
      const ex = (dx * cr + dy * sr) / (l.rx * 1.25);
      const ey = (-dx * sr + dy * cr) / (l.ry * 1.25);
      if (ex * ex + ey * ey < 1) return true;
    }
    return false;
  };
  wg.fillStyle = "#fff";
  wg.filter = "blur(1.5px)";
  for (const l of lakes) {
    wg.beginPath();
    wg.ellipse(l.x * 512, l.y * 512, l.rx * 512, l.ry * 512, l.rot, 0, Math.PI * 2);
    wg.fill();
  }

  // How built-up a spot is: dense in the middle, patchy suburbs, thinning to villages.
  const density = (u: number, v: number) => {
    const r = Math.hypot(u - 0.5, v - 0.5);
    const core = Math.exp(-Math.pow(r / 0.2, 2));
    const sprawl = Math.exp(-Math.pow(r / 0.42, 2)) * 0.55;
    const clump = noise.fbm(u, v, 9, 9, 4);
    return (core + sprawl) * (0.35 + 1.3 * clump * clump);
  };

  g.globalCompositeOperation = "lighter";

  // Neighbourhood street grids: short runs of parallel lamp-lit streets, each block at its own angle.
  const blocks = Math.round(size * 1.7);
  for (let i = 0; i < blocks; i++) {
    const u = 0.5 + gauss() * 0.42;
    const v = 0.5 + gauss() * 0.42;
    if (u < 0 || v < 0 || u > 1 || v > 1) continue;
    const d = density(u, v);
    if (random() > d * 1.1 || inLake(u, v)) continue;
    const angle = Math.floor(noise.noise(u * 7, v * 7, 7, 7) * 6) * 0.42 + (random() - 0.5) * 0.08;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const lanes = 2 + Math.floor(random() * 5);
    const gap = size * (0.0022 + random() * 0.0016);
    const length = size * (0.006 + random() * 0.02);
    const warm = random();
    g.strokeStyle =
      warm > 0.84
        ? `rgba(210,225,255,${0.06 + random() * 0.08})`
        : `rgba(255,${150 + Math.floor(random() * 50)},${60 + Math.floor(random() * 40)},${0.05 + random() * 0.1})`;
    g.lineWidth = size / 2048;
    for (let l = 0; l < lanes; l++) {
      const ox = u * size - dirY * gap * (l - lanes / 2);
      const oy = v * size + dirX * gap * (l - lanes / 2);
      g.beginPath();
      g.moveTo(ox - dirX * length, oy - dirY * length);
      g.lineTo(ox + dirX * length, oy + dirY * length);
      g.stroke();
    }
  }

  // Individual lamps, windows and signs.
  const dots = Math.round(size * 26);
  for (let i = 0; i < dots; i++) {
    const u = 0.5 + gauss() * 0.46;
    const v = 0.5 + gauss() * 0.46;
    if (u < 0 || v < 0 || u > 1 || v > 1) continue;
    if (random() > density(u, v) * 0.9 + 0.012 || inLake(u, v)) continue;
    const pick = random();
    const bright = 0.25 + random() * 0.6;
    if (pick < 0.66) g.fillStyle = `rgba(255,${160 + Math.floor(random() * 40)},${70 + Math.floor(random() * 40)},${bright})`;
    else if (pick < 0.88) g.fillStyle = `rgba(255,236,200,${bright})`;
    else if (pick < 0.97) g.fillStyle = `rgba(205,228,255,${bright})`;
    else g.fillStyle = random() < 0.5 ? `rgba(60,230,210,${bright})` : `rgba(255,70,60,${bright})`;
    const s = (size / 2048) * (random() < 0.07 ? 2.6 : 1.25);
    g.fillRect(u * size - s / 2, v * size - s / 2, s, s);
  }

  // Arterial roads: radials from the centre and two ring roads, each a string of bright lamps.
  const roads: THREE.Vector2[][] = [];
  const addRoad = (points: [number, number][], weight: number) => {
    g.strokeStyle = `rgba(255,176,96,${0.16 * weight})`;
    g.lineWidth = (size / 2048) * 2.2 * weight;
    g.shadowColor = "rgba(255,150,60,0.9)";
    g.shadowBlur = (size / 2048) * 4;
    g.beginPath();
    points.forEach(([u, v], i) => (i === 0 ? g.moveTo(u * size, v * size) : g.lineTo(u * size, v * size)));
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = `rgba(255,214,150,${0.6 * weight})`;
    for (let i = 0; i < points.length - 1; i++) {
      const [u0, v0] = points[i];
      const [u1, v1] = points[i + 1];
      const span = Math.hypot(u1 - u0, v1 - v0) * size;
      const step = (size / 2048) * 5;
      for (let s = 0; s < span; s += step) {
        const t = s / span;
        g.fillRect((u0 + (u1 - u0) * t) * size - 0.8, (v0 + (v1 - v0) * t) * size - 0.8, (size / 2048) * 1.7, (size / 2048) * 1.7);
      }
    }
    roads.push(points.map(([u, v]) => new THREE.Vector2((u - 0.5) * CITY, (v - 0.5) * CITY)));
  };
  for (let r = 0; r < 11; r++) {
    const base = (r / 11) * Math.PI * 2 + (random() - 0.5) * 0.3;
    const points: [number, number][] = [];
    let bend = 0;
    for (let s = 0; s <= 24; s++) {
      const dist = 0.03 + (s / 24) * 0.48;
      bend += (random() - 0.5) * 0.05;
      points.push([0.5 + Math.cos(base + bend) * dist, 0.5 + Math.sin(base + bend) * dist]);
    }
    addRoad(points, 1);
  }
  for (const [radius, weight] of [[0.085, 0.9], [0.2, 1], [0.34, 0.7]] as const) {
    const points: [number, number][] = [];
    for (let s = 0; s <= 90; s++) {
      const a = (s / 90) * Math.PI * 2;
      const wob = 1 + (noise.noise(s * 0.13, radius * 40, 256, 256) - 0.5) * 0.22;
      points.push([0.5 + Math.cos(a) * radius * wob, 0.5 + Math.sin(a) * radius * wob * 0.92]);
    }
    addRoad(points, weight);
  }

  // Each lamp throws a soft pool of light: add a blurred copy of everything.
  if ("filter" in g) {
    const copy = document.createElement("canvas");
    copy.width = copy.height = size;
    (copy.getContext("2d") as CanvasRenderingContext2D).drawImage(canvas, 0, 0);
    g.filter = `blur(${(size / 2048) * 5}px)`;
    g.globalAlpha = 0.3;
    g.drawImage(copy, 0, 0);
    g.filter = `blur(${(size / 2048) * 22}px)`;
    g.globalAlpha = 0.16;
    g.drawImage(copy, 0, 0);
    g.filter = "none";
    g.globalAlpha = 1;
  }

  const lights = new THREE.CanvasTexture(canvas);
  lights.colorSpace = THREE.SRGBColorSpace;
  const water = new THREE.CanvasTexture(waterCanvas);
  return { lights, water, roads };
}

const HORIZON_GLSL = /* glsl */ `
  uniform vec3 uSunset; // direction of the afterglow, on the horizon
  vec3 horizonColor(vec3 dir) {
    float s = max(dot(normalize(vec3(dir.x, 0.0, dir.z)), uSunset), 0.0);
    vec3 cool = vec3(0.035, 0.16, 0.29);
    vec3 ember = vec3(0.95, 0.36, 0.12);
    return mix(cool, ember, pow(s, 7.0) * 0.6) + ember * pow(s, 40.0) * 0.3;
  }
`;

const GROUND_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  uniform sampler2D uLights;
  uniform sampler2D uWater;
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform vec3 uCam;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${HORIZON_GLSL}
  ${DITHER_GLSL}
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 toPoint = vWorld - uCam;
    float dist = length(toPoint);
    vec3 view = toPoint / dist;

    // Unlit land at dusk: deep blue-teal, a little paler where it is built up.
    vec4 broad = texture2D(uNoise, vUv * 5.0);
    vec3 col = mix(vec3(0.010, 0.040, 0.075), vec3(0.022, 0.065, 0.105), broad.r);

    // Lakes mirror the sky they face.
    float lake = texture2D(uWater, vUv).r;
    vec3 mirror = horizonColor(reflect(view, vec3(0.0, 1.0, 0.0))) * 0.32 + vec3(0.012, 0.05, 0.10);
    float ripple = texture2D(uNoise, vUv * 90.0 + uTime * 0.01).g;
    col = mix(col, mirror * (0.8 + 0.4 * ripple), lake);

    // City lights, with the faint shimmer of warm air.
    vec3 lights = texture2D(uLights, vUv).rgb;
    float shimmer = texture2D(uNoise, vUv * 46.0 + vec2(uTime * 0.013, -uTime * 0.009)).b;
    col += lights * (0.95 + 0.55 * shimmer) * (1.0 - lake);

    // Close to the camera single lamps resolve into crisp points.
    vec2 grid = vUv * 1500.0;
    vec2 cell = floor(grid);
    float pick = hash2(cell);
    vec2 offset = fract(grid) - 0.5 - (vec2(hash2(cell + 17.0), hash2(cell + 43.0)) - 0.5) * 0.5;
    float lamp = smoothstep(0.2, 0.02, length(offset)) * step(0.8, pick);
    float lum = dot(lights, vec3(0.5, 0.4, 0.1));
    vec3 lampColor = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.93, 0.8), step(0.93, pick));
    col += lampColor * lamp * smoothstep(0.02, 0.3, lum) * 2.2 * (1.0 - smoothstep(22.0, 55.0, dist)) * (1.0 - lake);

    // Signal rings spreading from the pin.
    float r = length(vWorld.xz);
    vec3 green = vec3(0.07, 0.83, 0.33);
    float rings = 0.0;
    for (int i = 0; i < 3; i++) {
      float phase = fract(uTime * 0.16 + float(i) / 3.0);
      float radius = 1.2 + phase * 30.0;
      float width = 0.22 + phase * 0.9;
      rings += smoothstep(width, 0.0, abs(r - radius)) * pow(1.0 - phase, 1.6);
    }
    col += green * rings * 2.6;
    col += green * exp(-r * r / 18.0) * (0.55 + 0.2 * sin(uTime * 1.9));

    // Evening haze towards the horizon.
    float fog = 1.0 - exp(-dist * 0.011);
    col = mix(col, mix(vec3(0.03, 0.14, 0.26), horizonColor(view), 0.4), fog * 0.92);

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
  varying vec3 vDir;
  ${HORIZON_GLSL}
  ${DITHER_GLSL}
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    vec3 low = mix(vec3(0.03, 0.14, 0.26), horizonColor(d), 0.4 + 0.6 * smoothstep(-0.01, 0.03, d.y));
    float s = max(dot(normalize(vec3(d.x, 0.0, d.z)), uSunset), 0.0);
    // Orange at the horizon, rose above it, then teal and deep ocean blue overhead.
    vec3 rose = mix(vec3(0.06, 0.24, 0.40), vec3(0.50, 0.28, 0.34), pow(s, 4.0));
    vec3 high = vec3(0.022, 0.105, 0.24);
    float up = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(low, rose, smoothstep(0.015, 0.11, up));
    col = mix(col, high, smoothstep(0.04, 0.4, up));

    // Long thin evening clouds, their undersides still lit.
    float az = atan(d.z, d.x);
    vec2 p = vec2(az * 0.55 + uTime * 0.0012, up * 3.2);
    float c = texture2D(uNoise, p).a * 0.65 + texture2D(uNoise, p * vec2(2.3, 3.1)).r * 0.35;
    float cloud = smoothstep(0.52, 0.76, c) * smoothstep(0.012, 0.07, up) * (1.0 - smoothstep(0.2, 0.42, up));
    vec3 lit = mix(vec3(0.05, 0.15, 0.27), vec3(1.0, 0.46, 0.26), pow(s, 2.2));
    col = mix(col, lit, cloud * 0.75);

    // First stars.
    vec3 cell = floor(d * 260.0);
    float star = step(0.9972, hash(cell)) * smoothstep(0.22, 0.6, up);
    col += vec3(0.75, 0.85, 1.0) * star * (0.35 + 0.3 * sin(uTime * 1.7 + hash(cell + 3.0) * 40.0));

    gl_FragColor = vec4(col, 1.0);
    ${OUTPUT_GLSL}
  }
`;

function buildPin(): THREE.LatheGeometry {
  const points: THREE.Vector2[] = [new THREE.Vector2(0.0001, 0)];
  const centre = 2.25;
  const from = -Math.asin(1 / centre);
  for (let i = 0; i <= 40; i++) {
    const a = from + ((Math.PI / 2 - from) * i) / 40;
    points.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a)), centre + Math.sin(a)));
  }
  return new THREE.LatheGeometry(points, 64);
}

export function createContactScene(ctx: SceneContext): BannerScene {
  const low = ctx.quality === "low";
  const bin = makeBin();
  const { renderer } = ctx;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 2, 0.5, 600);

  const sunset = new THREE.Vector3(-0.55, 0, -0.83).normalize();
  const noise = bin.add(makeNoiseTexture(256, 5));
  const city = paintCity(low ? 1024 : 2048);
  bin.add(city.lights);
  bin.add(city.water);
  city.lights.anisotropy = ctx.maxAnisotropy;

  const uniforms = {
    uLights: { value: city.lights },
    uWater: { value: city.water },
    uNoise: { value: noise },
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uSunset: { value: sunset },
  };

  const groundGeometry = bin.add(new THREE.PlaneGeometry(CITY, CITY));
  groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = bin.add(new THREE.ShaderMaterial({ uniforms, vertexShader: GROUND_VERTEX, fragmentShader: GROUND_FRAGMENT }));
  scene.add(new THREE.Mesh(groundGeometry, groundMaterial));
  // Beyond the city: unlit country fading into the haze.
  const farGeometry = bin.add(new THREE.RingGeometry(CITY * 0.49, 500, 64, 1));
  farGeometry.rotateX(-Math.PI / 2);
  const dark = bin.add(new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1));
  dark.needsUpdate = true;
  const farMaterial = bin.add(
    new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uLights: { value: dark }, uWater: { value: dark } },
      vertexShader: GROUND_VERTEX,
      fragmentShader: GROUND_FRAGMENT,
    }),
  );
  const far = new THREE.Mesh(farGeometry, farMaterial);
  far.position.y = -0.02;
  scene.add(far);

  const skyGeometry = bin.add(new THREE.SphereGeometry(1, 48, 24));
  const skyMaterial = bin.add(
    new THREE.ShaderMaterial({
      uniforms: { uNoise: uniforms.uNoise, uTime: uniforms.uTime, uSunset: uniforms.uSunset },
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

  /* ---- traffic ---- */
  const cars = low ? 140 : 380;
  const carPositions = new Float32Array(cars * 3);
  const carColors = new Float32Array(cars * 3);
  const carState: { road: number; at: number; speed: number }[] = [];
  const lengths = city.roads.map((road) => {
    const cumulative = [0];
    for (let i = 1; i < road.length; i++) cumulative.push(cumulative[i - 1] + road[i].distanceTo(road[i - 1]));
    return cumulative;
  });
  {
    const random = rng(333);
    for (let i = 0; i < cars; i++) {
      const road = Math.floor(random() * city.roads.length);
      const forward = random() < 0.5;
      carState.push({ road, at: random(), speed: (0.5 + random() * 0.9) * (forward ? 1 : -1) });
      // Headlamps one way, tail lamps the other.
      const c = forward ? [1.0, 0.92, 0.75] : [1.0, 0.16, 0.08];
      carColors.set(c, i * 3);
    }
  }
  const trafficGeometry = bin.add(new THREE.BufferGeometry());
  trafficGeometry.setAttribute("position", new THREE.BufferAttribute(carPositions, 3));
  trafficGeometry.setAttribute("color", new THREE.BufferAttribute(carColors, 3));
  const glow = bin.add(makeGlowTexture(64, 0.2));
  const trafficMaterial = bin.add(
    new THREE.PointsMaterial({ map: glow, vertexColors: true, size: 0.75, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 }),
  );
  const traffic = new THREE.Points(trafficGeometry, trafficMaterial);
  traffic.frustumCulled = false;
  scene.add(traffic);
  const placeCars = (dt: number) => {
    for (let i = 0; i < cars; i++) {
      const state = carState[i];
      const cumulative = lengths[state.road];
      const total = cumulative[cumulative.length - 1];
      state.at = (state.at + (state.speed * dt) / total + 1) % 1;
      const want = state.at * total;
      let k = 1;
      while (k < cumulative.length - 1 && cumulative[k] < want) k++;
      const t = (want - cumulative[k - 1]) / (cumulative[k] - cumulative[k - 1] || 1);
      const a = city.roads[state.road][k - 1];
      const b = city.roads[state.road][k];
      // Keep left: each direction on its own side of the road.
      const side = state.speed > 0 ? 0.12 : -0.12;
      const nx = -(b.y - a.y);
      const nz = b.x - a.x;
      const nl = Math.hypot(nx, nz) || 1;
      carPositions[i * 3] = a.x + (b.x - a.x) * t + (nx / nl) * side;
      carPositions[i * 3 + 1] = 0.06;
      carPositions[i * 3 + 2] = a.y + (b.y - a.y) * t + (nz / nl) * side;
    }
    trafficGeometry.attributes.position.needsUpdate = true;
  };

  /* ---- the pin ---- */
  const env = bin.add(
    makeSkyEnvironment(renderer, {
      zenith: new THREE.Color(0.05, 0.2, 0.42),
      horizon: new THREE.Color(0.2, 0.42, 0.6),
      ground: new THREE.Color(0.1, 0.09, 0.07),
      sunDir: sunset.clone().setY(0.04),
      sunColor: new THREE.Color(1.0, 0.45, 0.18),
      glow: 5,
      disc: 0,
    }),
  );
  scene.environment = env.texture;
  scene.environmentIntensity = 1.5;
  const key = new THREE.DirectionalLight(new THREE.Color(1.0, 0.62, 0.36), 2.2);
  key.position.set(sunset.x * 20, 6, sunset.z * 20);
  const fill = new THREE.DirectionalLight(new THREE.Color(0.45, 0.75, 1.0), 1.1);
  fill.position.set(8, 10, 14);
  // The city below lights the underside.
  const bounce = new THREE.DirectionalLight(new THREE.Color(1.0, 0.7, 0.4), 0.9);
  bounce.position.set(0, -10, 2);
  scene.add(key, fill, bounce);

  const pin = new THREE.Group();
  const pinGeometry = bin.add(buildPin());
  const pinMaterial = bin.add(
    new THREE.MeshPhysicalMaterial({
      color: 0xf0640f,
      roughness: 0.2,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      emissive: 0xe8600f,
      emissiveIntensity: 0.22,
      envMapIntensity: 1.3,
    }),
  );
  pin.add(new THREE.Mesh(pinGeometry, pinMaterial));
  const badgeGeometry = bin.add(new THREE.CylinderGeometry(0.42, 0.42, 2.04, 48));
  badgeGeometry.rotateX(Math.PI / 2);
  const badgeMaterial = bin.add(
    new THREE.MeshPhysicalMaterial({ color: 0xfffefc, roughness: 0.3, clearcoat: 0.6, emissive: 0xfff3e0, emissiveIntensity: 0.25 }),
  );
  const badge = new THREE.Mesh(badgeGeometry, badgeMaterial);
  badge.position.y = 2.25;
  pin.add(badge);
  pin.scale.setScalar(1.25);
  scene.add(pin);

  // Halo where the pin points at the ground.
  const haloMaterial = bin.add(
    new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(0.08, 0.9, 0.36), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.6 }),
  );
  const halo = new THREE.Sprite(haloMaterial);
  halo.position.set(0, 0.5, 0);
  halo.scale.setScalar(3.2);
  scene.add(halo);

  renderer.toneMappingExposure = 1.0;

  let radius = 30;
  let lift = 9.5;
  const look = new THREE.Vector3(0, 2.6, 0);

  return {
    scene,
    camera,
    update(time, dt) {
      uniforms.uTime.value = time;
      // Slow circle around the pin, always keeping the afterglow somewhere ahead.
      const a = 1.05 + Math.sin(time * 0.045) * 0.42;
      camera.position.set(Math.cos(a) * radius, lift + Math.sin(time * 0.07) * 0.6, Math.sin(a) * radius);
      camera.lookAt(look);
      uniforms.uCam.value.copy(camera.position);

      pin.position.y = 1.15 + Math.sin(time * 1.1) * 0.22;
      pin.rotation.y = time * 0.35;
      const beat = 0.5 + 0.5 * Math.sin(time * 1.9);
      haloMaterial.opacity = 0.35 + beat * 0.3;
      halo.scale.setScalar(2.8 + beat * 0.9);
      placeCars(dt);
    },
    resize(w, h, focus: BannerFocus) {
      const aspect = w / h;
      camera.fov = fitFov(aspect, 36, 78);
      radius = focus.wide ? 27 : 33;
      lift = focus.wide ? 8.5 : 10;
      applyFocus(camera, w, h, { x: focus.x, y: focus.wide ? 0.54 : focus.y + 0.05, wide: focus.wide });
    },
    dispose() {
      bin.dispose();
    },
  };
}
