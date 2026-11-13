import * as THREE from "three";
import { buildErtiga } from "@/components/three/ertigaModel";
import { applyFocus, fitFov, type BannerFocus, type BannerScene, type SceneContext } from "../engine";
import { makeBin, makeGlowTexture, makePeriodicNoise, makeSkyEnvironment, rng } from "./shared";

/**
 * Safety banner: the trip car pulled over at a Ghats viewpoint in early light.
 *
 * Seen calmly from a front three-quarter angle: damp tarmac, a crash barrier, grass moving in
 * the breeze, mist drifting through the valley behind and ridge after ridge fading into haze.
 * The camera breathes on a slow arc; nothing else hurries.
 */

const ROAD_TILE = 24; // metres of road covered by one repeat of the surface picture

/** Road surface colour: tarmac with worn wheel tracks, painted lines, gravel shoulder, verge. */
function paintRoad(size: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  const ppm = size / ROAD_TILE;
  const zToY = (z: number) => (z + ROAD_TILE / 2) * ppm;
  const noise = makePeriodicNoise(31);
  const random = rng(5);

  const image = g.createImageData(size, size);
  const px = image.data;
  for (let y = 0; y < size; y++) {
    const z = y / ppm - ROAD_TILE / 2;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const grain = random();
      const blotch = noise.fbm(u, v, 6, 6, 4);
      const fine = noise.fbm(u, v, 48, 48, 2);
      let r: number;
      let gg: number;
      let b: number;
      // The edges wander a little so nothing is ruler-straight.
      const wobble = (noise.noise(u * 12, 3.3, 12, 8) - 0.5) * 0.18;
      if (z > -1.62 + wobble && z < 6.05 - wobble) {
        // Tarmac: dark binder, pale stone chips, lighter polished wheel tracks.
        const track =
          Math.exp(-Math.pow((z - -0.72) / 0.3, 2)) + Math.exp(-Math.pow((z - 0.78) / 0.3, 2)) +
          Math.exp(-Math.pow((z - 3.2) / 0.32, 2)) + Math.exp(-Math.pow((z - 4.7) / 0.32, 2));
        let tone = 46 + blotch * 26 + fine * 14 + track * 9;
        if (grain > 0.9) tone += 34 * (grain - 0.9) * 10;
        if (grain < 0.08) tone -= 14;
        r = tone * 0.98;
        gg = tone;
        b = tone * 1.06;
      } else if (z > -2.5 + wobble * 2 && z < 6.9) {
        // Gravel and dust at the road edge.
        const tone = 96 + blotch * 44 + (grain - 0.5) * 60;
        r = tone * 1.04;
        gg = tone * 0.95;
        b = tone * 0.82;
      } else {
        // Verge: earth showing through short grass.
        const green = noise.fbm(u, v, 14, 14, 3);
        const tone = 52 + green * 52 + (grain - 0.5) * 34;
        r = tone * (0.86 + (1 - green) * 0.35);
        gg = tone * 1.08;
        b = tone * 0.5;
      }
      const i = (y * size + x) * 4;
      px[i] = r;
      px[i + 1] = gg;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);

  // Painted lines, slightly worn.
  const line = (z: number, width: number, dash?: [number, number]) => {
    g.fillStyle = "rgba(226,226,214,0.86)";
    if (!dash) g.fillRect(0, zToY(z) - (width * ppm) / 2, size, width * ppm);
    else {
      const period = dash[0] + dash[1];
      for (let x = 0; x < ROAD_TILE; x += period) g.fillRect(x * ppm, zToY(z) - (width * ppm) / 2, dash[0] * ppm, width * ppm);
    }
  };
  line(-1.36, 0.14);
  line(2.2, 0.13, [3, 5]);
  line(5.78, 0.14);
  // Wear: scuff the paint and add a few hairline cracks.
  g.globalCompositeOperation = "source-atop";
  for (let i = 0; i < size * 5; i++) {
    const z = [-1.36, 2.2, 5.78][i % 3] + (random() - 0.5) * 0.2;
    g.fillStyle = `rgba(60,62,66,${0.12 + random() * 0.3})`;
    g.fillRect(random() * size, zToY(z), 1 + random() * 5, 1 + random() * 2);
  }
  g.globalCompositeOperation = "source-over";
  g.strokeStyle = "rgba(18,20,24,0.5)";
  g.lineWidth = Math.max(1, size / 1400);
  for (let c = 0; c < 9; c++) {
    let x = random() * size;
    let y = zToY(-1.2 + random() * 6.8);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 14; k++) {
      x += (random() - 0.3) * size * 0.02;
      y += (random() - 0.5) * size * 0.012;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Fine surface relief (normal map) and a dampness map: darker = wetter, shinier patches. */
function makeRoadRelief(size: number): { normal: THREE.DataTexture; rough: THREE.DataTexture } {
  const noise = makePeriodicNoise(88);
  const random = rng(19);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      height[y * size + x] = noise.fbm(x / size, y / size, 10, 10, 4) * 0.6 + random() * 0.4;
    }
  }
  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.2;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normal[i] = 127.5 - (dx / len) * 127.5;
      normal[i + 1] = 127.5 - (dy / len) * 127.5;
      normal[i + 2] = 127.5 + (1 / len) * 127.5;
      normal[i + 3] = 255;
      // Damp patches collect in the broad low spots.
      const damp = noise.fbm(x / size + 0.4, y / size + 0.7, 3, 3, 4);
      const value = 150 + (damp - 0.5) * 300 + (random() - 0.5) * 30;
      rough[i] = rough[i + 1] = rough[i + 2] = Math.max(70, Math.min(240, value));
      rough[i + 3] = 255;
    }
  }
  const make = (data: Uint8Array) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  return { normal: make(normal), rough: make(rough) };
}

function paintGrass(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  const random = rng(404);
  for (let i = 0; i < 130; i++) {
    const x0 = size * (0.08 + random() * 0.84);
    const lean = (random() - 0.5) * size * 0.34;
    const tall = size * (0.35 + random() * 0.6);
    const w = 1.4 + random() * 2.2;
    const dry = random();
    const light = 20 + random() * 18;
    g.fillStyle = dry > 0.7 ? `hsl(${48 + random() * 12} 34% ${light + 24}%)` : `hsl(${78 + random() * 24} ${26 + random() * 16}% ${light}%)`;
    g.beginPath();
    g.moveTo(x0 - w, size);
    g.quadraticCurveTo(x0 + lean * 0.3, size - tall * 0.6, x0 + lean, size - tall);
    g.quadraticCurveTo(x0 + lean * 0.4 + w, size - tall * 0.55, x0 + w, size);
    g.closePath();
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A band of hills on an arc behind the car: canopy-edged skyline on top, mist at its feet. */
function buildRidge(
  radius: number,
  low: number,
  high: number,
  seed: number,
  top: THREE.Color,
  foot: THREE.Color,
  bumps: number,
): THREE.BufferGeometry {
  const noise = makePeriodicNoise(seed);
  const steps = 360;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const from = Math.PI * 0.42;
  const to = Math.PI * 1.9;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = from + (to - from) * t;
    const shape = noise.ridged(t, 0.37, 7, 5, 4) * 0.75 + noise.fbm(t, 0.71, 3, 3, 3) * 0.45;
    const crown = (noise.noise(t * 420, 1.7, 420, 8) - 0.5) * bumps + (noise.noise(t * 150, 5.1, 150, 8) - 0.5) * bumps * 1.6;
    const y = low + (high - low) * shape + crown;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    positions.push(x, y, z, x, -radius * 0.12, z);
    colors.push(top.r, top.g, top.b, foot.r, foot.g, foot.b);
    if (i < steps) {
      const k = i * 2;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  return geometry;
}

/** W-beam crash barrier rail, running along X. */
function buildRail(length: number): THREE.BufferGeometry {
  const profile: [number, number][] = [
    [0, -0.155], [0, -0.13], [0.07, -0.09], [0.07, -0.04], [0, 0], [0.07, 0.04], [0.07, 0.09], [0, 0.13], [0, 0.155],
  ];
  const shape = new THREE.Shape();
  profile.forEach(([d, y], i) => (i === 0 ? shape.moveTo(d, y) : shape.lineTo(d, y)));
  for (let i = profile.length - 1; i >= 0; i--) shape.lineTo(profile[i][0] + 0.007, profile[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, steps: 1 });
  geometry.translate(0, 0, -length / 2);
  geometry.rotateY(Math.PI / 2); // extrusion axis -> X, profile depth -> -Z (towards the valley)
  return geometry;
}

export function createSafetyScene(ctx: SceneContext): BannerScene {
  const low = ctx.quality === "low";
  const bin = makeBin();
  const { renderer } = ctx;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 2, 0.3, 2500);

  /* ---- light: soft early sun from the camera side, sky fill from everywhere ---- */
  const sunDir = new THREE.Vector3(0.8, 0.4, 0.3).normalize();
  const env = bin.add(
    makeSkyEnvironment(renderer, {
      zenith: new THREE.Color(0.1, 0.3, 0.62),
      horizon: new THREE.Color(0.66, 0.74, 0.82),
      ground: new THREE.Color(0.16, 0.19, 0.17),
      sunDir,
      sunColor: new THREE.Color(1.0, 0.82, 0.6),
      glow: 2.4,
      disc: 60,
    }),
  );
  scene.environment = env.texture;
  scene.environmentIntensity = 0.8;
  scene.background = env.texture;
  scene.backgroundBlurriness = 0.22;
  scene.backgroundIntensity = 1.0;

  const sunLight = new THREE.DirectionalLight(new THREE.Color(1.0, 0.84, 0.64), 2.3);
  sunLight.position.copy(sunDir).multiplyScalar(30);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.setScalar(low ? 1024 : 2048);
  sunLight.shadow.camera.left = -7;
  sunLight.shadow.camera.right = 7;
  sunLight.shadow.camera.top = 7;
  sunLight.shadow.camera.bottom = -7;
  sunLight.shadow.camera.near = 5;
  sunLight.shadow.camera.far = 60;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.02;
  sunLight.shadow.radius = 5;
  scene.add(sunLight, sunLight.target);

  /* ---- ground ---- */
  const groundGeometry = bin.add(new THREE.PlaneGeometry(260, 120, 1, 80));
  groundGeometry.rotateX(-Math.PI / 2);
  {
    const pos = groundGeometry.attributes.position;
    const uv = groundGeometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // The verge falls away into the valley beyond the barrier.
      const over = Math.max(0, -z - 3.6);
      pos.setY(i, -Math.pow(over, 1.35) * 0.2);
      uv.setXY(i, x / ROAD_TILE, 1 - (z + ROAD_TILE / 2) / ROAD_TILE);
    }
    groundGeometry.computeVertexNormals();
  }
  const roadMap = bin.add(paintRoad(low ? 1024 : 2048));
  roadMap.anisotropy = ctx.maxAnisotropy;
  roadMap.flipY = false;
  // flipY off: v runs with +z, so mirror the lookup we set above.
  {
    const uv = groundGeometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  }
  const relief = makeRoadRelief(low ? 256 : 512);
  bin.add(relief.normal);
  bin.add(relief.rough);
  relief.normal.repeat.set(9, 9);
  relief.rough.repeat.set(0.55, 0.55);
  relief.normal.anisotropy = ctx.maxAnisotropy;
  const groundMaterial = bin.add(
    new THREE.MeshStandardMaterial({
      map: roadMap,
      normalMap: relief.normal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: relief.rough,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.9,
    }),
  );
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.receiveShadow = true;
  scene.add(ground);

  /* ---- crash barrier ---- */
  const steel = bin.add(new THREE.MeshStandardMaterial({ color: 0xb9c0c4, metalness: 0.85, roughness: 0.42, envMapIntensity: 1.1 }));
  const railGeometry = bin.add(buildRail(120));
  const rail = new THREE.Mesh(railGeometry, steel);
  rail.position.set(0, 0.56, -2.75);
  rail.castShadow = true;
  rail.receiveShadow = true;
  scene.add(rail);
  const postGeometry = bin.add(new THREE.BoxGeometry(0.09, 0.82, 0.12));
  const posts = new THREE.InstancedMesh(postGeometry, steel, 31);
  const reflectorGeometry = bin.add(new THREE.BoxGeometry(0.012, 0.07, 0.1));
  const reflectorMaterial = bin.add(new THREE.MeshStandardMaterial({ color: 0xe8600f, emissive: 0xe8600f, emissiveIntensity: 0.35, roughness: 0.3 }));
  const reflectors = new THREE.InstancedMesh(reflectorGeometry, reflectorMaterial, 31);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 31; i++) {
    const x = -60 + i * 4;
    m4.makeTranslation(x, 0.35, -2.83);
    posts.setMatrixAt(i, m4);
    m4.makeRotationY(Math.PI / 2).setPosition(x + 0.4, 0.56, -2.728);
    reflectors.setMatrixAt(i, m4);
  }
  posts.castShadow = true;
  scene.add(posts, reflectors);

  /* ---- grass on the verge, moving in the breeze ---- */
  const grassMap = bin.add(paintGrass());
  const tuft = new THREE.PlaneGeometry(0.7, 0.5);
  tuft.translate(0, 0.25, 0);
  const tuftB = tuft.clone().rotateY(Math.PI / 2);
  const positions = [...tuft.attributes.position.array, ...tuftB.attributes.position.array];
  const uvs = [...tuft.attributes.uv.array, ...tuftB.attributes.uv.array];
  const front = [...(tuft.index as THREE.BufferAttribute).array, ...Array.from((tuftB.index as THREE.BufferAttribute).array, (v) => v + 4)];
  // Both faces are drawn as front faces with an upward normal, so neither side goes dark.
  const idx = [...front];
  for (let i = 0; i < front.length; i += 3) idx.push(front[i], front[i + 2], front[i + 1]);
  tuft.dispose();
  tuftB.dispose();
  const grassGeometry = bin.add(new THREE.BufferGeometry());
  grassGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  grassGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  grassGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(8).fill([0, 1, 0]).flat(), 3));
  grassGeometry.setIndex(idx);
  const wind = { value: 0 };
  const grassMaterial = bin.add(
    new THREE.MeshLambertMaterial({ map: grassMap, alphaTest: 0.35 }),
  );
  grassMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float gx = instanceMatrix[3].x; float gz = instanceMatrix[3].z;
          float gust = sin(uWind * 1.3 + gx * 0.35) * 0.6 + sin(uWind * 2.9 + gx * 1.7 + gz * 2.3) * 0.4;
          transformed.x += gust * 0.11 * uv.y * uv.y;
          transformed.z += cos(uWind * 1.9 + gz * 1.1) * 0.04 * uv.y;
        #endif`,
      );
  };
  const tufts = low ? 700 : 1900;
  const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, tufts);
  {
    const random = rng(2024);
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < tufts; i++) {
      const far = random() < 0.22;
      const z = far ? 6.6 + random() * 5 : -2.45 - Math.pow(random(), 1.6) * 7;
      const x = -30 + random() * 46;
      const over = Math.max(0, -z - 3.6);
      p.set(x, -Math.pow(over, 1.35) * 0.2 - 0.02, z);
      q.setFromAxisAngle(up, random() * Math.PI);
      const size = 0.45 + random() * 0.75;
      s.set(size, size * (0.7 + random() * 0.8), size);
      m4.compose(p, q, s);
      grass.setMatrixAt(i, m4);
    }
  }
  grass.receiveShadow = true;
  scene.add(grass);

  /* ---- valley backdrop: ridges fading into haze, with mist between them ---- */
  const haze = new THREE.Color(0.4, 0.6, 0.8);
  const forest = new THREE.Color(0.035, 0.1, 0.11);
  const ridgeMaterial = bin.add(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  const layers: [number, number, number, number, number][] = [
    // radius, lowest crest, highest crest, haze amount, canopy bumps
    [170, -6, 13, 0.3, 1.1],
    [330, 4, 34, 0.56, 1.3],
    [620, 22, 76, 0.75, 1.2],
    [1100, 60, 150, 0.88, 0],
  ];
  layers.forEach(([radius, lo, hi, amount, bumps], i) => {
    const top = forest.clone().lerp(haze, amount);
    const foot = haze.clone().lerp(new THREE.Color(0.86, 0.9, 0.94), 0.35 + amount * 0.4);
    const geometry = bin.add(buildRidge(radius, lo, hi, 60 + i * 7, top, foot, bumps));
    const mesh = new THREE.Mesh(geometry, ridgeMaterial);
    mesh.renderOrder = -5 + i * -1;
    scene.add(mesh);
  });

  const puff = bin.add(makeGlowTexture(128));
  const mistMaterial = bin.add(
    new THREE.SpriteMaterial({ map: puff, color: new THREE.Color(0.93, 0.95, 0.96), transparent: true, opacity: 0.5, depthWrite: false }),
  );
  const mist: { sprite: THREE.Sprite; speed: number; base: number }[] = [];
  {
    const random = rng(8);
    const count = low ? 12 : 22;
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(mistMaterial);
      const depth = 60 + random() * 420;
      const a = Math.PI * (0.75 + random() * 0.95);
      sprite.position.set(Math.cos(a) * depth, -4 + random() * 10 + depth * 0.035, Math.sin(a) * depth);
      const w = depth * (0.7 + random() * 0.9);
      sprite.scale.set(w, w * (0.1 + random() * 0.08), 1);
      scene.add(sprite);
      mist.push({ sprite, speed: (0.6 + random()) * (random() < 0.5 ? 1 : -1), base: sprite.position.y });
    }
  }

  /* ---- the car ---- */
  const car = buildErtiga({ detail: low ? "low" : "high", anisotropy: ctx.maxAnisotropy, castShadow: true });
  bin.add(car);
  car.setHeadlights(1);
  car.setBrake(0);
  car.setSteer(0.2);
  scene.add(car.group);

  // Where the low beams land on the road.
  const beamMaterial = bin.add(
    new THREE.MeshBasicMaterial({ map: puff, color: new THREE.Color(1.0, 0.9, 0.7), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const beamGeometry = bin.add(new THREE.PlaneGeometry(9, 4.2));
  beamGeometry.rotateX(-Math.PI / 2);
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.position.set(6.6, 0.03, 0);
  scene.add(beam);

  /* ---- drifting motes catching the sun ---- */
  const moteCount = low ? 40 : 90;
  const motePositions = new Float32Array(moteCount * 3);
  const moteSeeds: number[] = [];
  {
    const random = rng(51);
    for (let i = 0; i < moteCount; i++) {
      motePositions[i * 3] = -6 + random() * 14;
      motePositions[i * 3 + 1] = 0.2 + random() * 3;
      motePositions[i * 3 + 2] = -5 + random() * 10;
      moteSeeds.push(random() * 6.28);
    }
  }
  const moteGeometry = bin.add(new THREE.BufferGeometry());
  moteGeometry.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
  const moteMaterial = bin.add(
    new THREE.PointsMaterial({ map: puff, color: new THREE.Color(1.0, 0.92, 0.75), size: 0.035, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }),
  );
  const motes = new THREE.Points(moteGeometry, moteMaterial);
  scene.add(motes);

  renderer.toneMappingExposure = 1.0;

  let distance = 8.4;
  const look = new THREE.Vector3(0.15, 0.74, 0);

  return {
    scene,
    camera,
    update(time, dt) {
      wind.value = time;
      // Slow arc around the front three-quarter view, with a little rise and fall.
      const angle = 0.72 + Math.sin(time * 0.11) * 0.2;
      const d = distance + Math.sin(time * 0.07 + 1) * 0.35;
      camera.position.set(Math.cos(angle) * d, 1.32 + Math.sin(time * 0.09) * 0.14, Math.sin(angle) * d);
      camera.lookAt(look);

      // Thin cloud passing in front of the sun.
      sunLight.intensity = 2.3 + Math.sin(time * 0.17) * 0.28 + Math.sin(time * 0.41 + 2) * 0.12;
      car.body.position.y = Math.sin(time * 0.9) * 0.0015; // idling
      car.updateGlow(camera);

      for (const m of mist) {
        m.sprite.position.x += m.speed * dt;
        m.sprite.position.y = m.base + Math.sin(time * 0.1 + m.base) * 0.8;
        if (m.sprite.position.x > 520) m.sprite.position.x = -520;
        if (m.sprite.position.x < -520) m.sprite.position.x = 520;
      }
      const p = moteGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < moteCount; i++) {
        const s = moteSeeds[i];
        p.setX(i, p.getX(i) + (0.12 + Math.sin(time * 0.5 + s) * 0.06) * dt);
        p.setY(i, p.getY(i) + Math.sin(time * 0.7 + s * 3) * 0.04 * dt);
        if (p.getX(i) > 8) p.setX(i, -6);
      }
      p.needsUpdate = true;
    },
    resize(width, height, focus: BannerFocus) {
      const aspect = width / height;
      camera.fov = fitFov(aspect, 30, 68);
      distance = focus.wide ? 8.4 : 9.4;
      applyFocus(camera, width, height, { x: focus.x, y: focus.wide ? 0.56 : focus.y + 0.03, wide: focus.wide });
    },
    dispose() {
      bin.dispose();
    },
  };
}
