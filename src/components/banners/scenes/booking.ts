import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { applyFocus, fitFov, type BannerFocus, type BannerScene, type SceneContext } from "../engine";
import { DITHER_GLSL, OUTPUT_GLSL, makeBin, rng } from "./shared";

/**
 * Booking banner: a printed boarding pass for a Sanchari trip, floating in soft studio light.
 *
 * The card is laminated paper with a foil security patch; as it turns, highlights sweep
 * across the laminate and the foil shifts colour. Behind it two more passes drift out of
 * focus among blurred points of light, which is what gives the picture its depth.
 */

const CARD_W = 3.6;
const CARD_H = 1.6;
const STUB = 0.735; // where the tear-off stub starts, as a fraction of the width

interface CardMaps {
  color: THREE.CanvasTexture;
  alpha: THREE.CanvasTexture;
  /** G = roughness, B = metalness (the foil patch). */
  surface: THREE.CanvasTexture;
  foil: THREE.CanvasTexture;
  grain: THREE.CanvasTexture;
  blurred: THREE.CanvasTexture;
  blurredAlpha: THREE.CanvasTexture;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function paintCard(width: number): CardMaps {
  const W = width;
  const H = Math.round((width * CARD_H) / CARD_W);
  const k = W / 2048; // all sizes below are for a 2048-wide canvas
  const random = rng(260606);
  const make = (w = W, h = H) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    return [canvas, canvas.getContext("2d") as CanvasRenderingContext2D] as const;
  };
  const sans = `system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  const serif = `Georgia, "Times New Roman", serif`;

  const [canvas, g] = make();
  g.scale(k, k);
  const w = 2048;
  const h = H / k;
  const stubX = w * STUB;

  // Paper.
  const paper = g.createLinearGradient(0, 0, w, h);
  paper.addColorStop(0, "#fffefc");
  paper.addColorStop(1, "#f4f8f8");
  g.fillStyle = paper;
  g.fillRect(0, 0, w, h);

  // Security background: fine wavy lines, like a banknote or a train ticket.
  g.lineWidth = 1.1;
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = i % 2 ? "rgba(27,163,179,0.10)" : "rgba(14,94,143,0.07)";
    g.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const y = 190 + i * 16 + Math.sin(x * 0.012 + i * 0.5) * 14 + Math.sin(x * 0.031 + i) * 5;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  // Header band.
  const band = g.createLinearGradient(0, 0, w, 0);
  band.addColorStop(0, "#0b5683");
  band.addColorStop(0.6, "#0e5e8f");
  band.addColorStop(1, "#0c7a8c");
  g.fillStyle = band;
  g.fillRect(0, 0, w, 168);
  g.fillStyle = "#e8600f";
  g.fillRect(0, 168, w, 9);

  g.textBaseline = "middle";
  g.fillStyle = "#fffefc";
  g.font = `600 64px ${serif}`;
  g.fillText("Sanchari", 78, 78);
  const nameWidth = g.measureText("Sanchari").width;
  g.font = `600 27px ${sans}`;
  g.fillStyle = "rgba(255,254,252,0.86)";
  g.fillText("M I C R O   T R I P S", 82, 128);
  g.font = `700 30px ${sans}`;
  g.fillStyle = "#ffd9bf";
  g.textAlign = "right";
  g.fillText("B O A R D I N G   P A S S", stubX - 60, 86);
  g.textAlign = "left";
  // Small route mark beside the name.
  g.strokeStyle = "#ff8a3d";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(98 + nameWidth, 92);
  g.bezierCurveTo(130 + nameWidth, 50, 160 + nameWidth, 110, 196 + nameWidth, 66);
  g.stroke();

  // Route.
  const label = (text: string, x: number, y: number) => {
    g.font = `600 25px ${sans}`;
    g.fillStyle = "#4b6273";
    g.fillText(text.split("").join(" "), x, y);
  };
  label("FROM", 82, 236);
  g.font = `700 150px ${sans}`;
  g.fillStyle = "#0e5e8f";
  g.fillText("BLR", 74, 338);
  const blrWidth = g.measureText("BLR").width;
  g.font = `500 34px ${sans}`;
  g.fillStyle = "#0f2a3d";
  g.fillText("Bengaluru", 82, 446);

  const toX = stubX - 470;
  label("TO", toX + 8, 236);
  g.font = `700 150px ${sans}`;
  g.fillStyle = "#0e5e8f";
  g.fillText("CRG", toX, 338);
  g.font = `500 34px ${sans}`;
  g.fillStyle = "#0f2a3d";
  g.fillText("Coorg · Madikeri", toX + 8, 446);

  // The road between them, with a little car on it.
  const roadFrom = 74 + blrWidth + 50;
  const roadTo = toX - 50;
  g.strokeStyle = "#1ba3b3";
  g.lineWidth = 5;
  g.setLineDash([20, 15]);
  g.beginPath();
  g.moveTo(roadFrom, 344);
  g.bezierCurveTo(roadFrom + 150, 268, roadTo - 150, 420, roadTo, 338);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = "#e8600f";
  const midX = (roadFrom + roadTo) / 2;
  roundRect(g, midX - 54, 318, 108, 40, 14);
  g.fill();
  roundRect(g, midX - 30, 294, 64, 34, 12);
  g.fill();
  g.fillStyle = "#fffefc";
  roundRect(g, midX - 22, 301, 22, 20, 5);
  g.fill();
  roundRect(g, midX + 5, 301, 22, 20, 5);
  g.fill();
  g.fillStyle = "#0f2a3d";
  g.beginPath();
  g.arc(midX - 30, 360, 13, 0, Math.PI * 2);
  g.arc(midX + 30, 360, 13, 0, Math.PI * 2);
  g.fill();
  g.font = `600 26px ${sans}`;
  g.fillStyle = "#4b6273";
  g.textAlign = "center";
  g.fillText("≈ 265 km · small-group road trip", midX, 432);
  g.textAlign = "left";

  // Details row.
  g.strokeStyle = "rgba(15,42,61,0.16)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(78, 508);
  g.lineTo(stubX - 60, 508);
  g.stroke();
  const fields: [string, string, number, boolean][] = [
    ["TRAVELLER", "YOUR NAME", 82, false],
    ["DATE", "12 DEC", 470, false],
    ["DEPARTS", "05:30", 720, false],
    ["VEHICLE", "ERTIGA · 6 SEATS", 940, false],
  ];
  for (const [name, value, x] of fields) {
    label(name, x, 560);
    g.font = `700 46px ${sans}`;
    g.fillStyle = "#0f2a3d";
    g.fillText(value, x, 624);
  }

  // Seat plan: driver, one beside, three in the middle row, two at the back.
  const planX = 82;
  const planY = 700;
  label("YOUR SEAT", planX, planY);
  const seats: [number, number, string][] = [
    [0, 0, "D"], [1, 0, "1A"],
    [0, 1, "2A"], [1, 1, "2B"], [2, 1, "2C"],
    [0.5, 2, "3A"], [1.5, 2, "3B"],
  ];
  g.strokeStyle = "rgba(14,94,143,0.5)";
  g.lineWidth = 3;
  roundRect(g, planX + 300, planY - 40, 520, 180, 44);
  g.stroke();
  for (const [col, row, name] of seats) {
    const x = planX + 330 + row * 165 + (row === 0 ? 0 : 6);
    const y = planY - 22 + col * 50 + (row === 0 ? 24 : 0);
    const mine = name === "2A";
    g.fillStyle = name === "D" ? "rgba(75,98,115,0.3)" : mine ? "#e8600f" : "rgba(14,94,143,0.16)";
    roundRect(g, x, y, 120, 42, 12);
    g.fill();
    g.font = `700 24px ${sans}`;
    g.fillStyle = mine ? "#fffefc" : "#0e5e8f";
    g.textAlign = "center";
    g.fillText(name === "D" ? "driver" : name, x + 60, y + 22);
    g.textAlign = "left";
  }
  g.font = `500 25px ${sans}`;
  g.fillStyle = "#4b6273";
  g.fillText("Window, middle row", planX, planY + 60);
  g.fillText("Max 6 travellers per car", planX, planY + 100);

  // Stub.
  g.textAlign = "center";
  const stubMid = (stubX + w) / 2 - 30;
  g.font = `700 30px ${sans}`;
  g.fillStyle = "#ffd9bf";
  g.fillText("S E A T", stubMid, 86);
  g.font = `700 230px ${sans}`;
  g.fillStyle = "#0e5e8f";
  g.fillText("2A", stubMid, 330);
  g.font = `700 40px ${sans}`;
  g.fillStyle = "#0f2a3d";
  g.fillText("BLR  →  CRG", stubMid, 486);
  g.font = `600 27px ${sans}`;
  g.fillStyle = "#4b6273";
  g.fillText("12 DEC · 05:30", stubMid, 540);
  // Barcode.
  let bx = stubX + 70;
  g.fillStyle = "#0f2a3d";
  while (bx < w - 150) {
    const bw = 3 + Math.floor(random() * 4) * 3;
    g.fillRect(bx, 610, bw, 150);
    bx += bw + 3 + Math.floor(random() * 3) * 3;
  }
  g.font = `600 26px ${sans}`;
  g.fillStyle = "#0f2a3d";
  g.fillText("S M T - 2 A 6 K 9", stubMid, 800);
  g.textAlign = "left";

  // Perforation.
  g.strokeStyle = "rgba(15,42,61,0.35)";
  g.lineWidth = 3;
  g.setLineDash([10, 12]);
  g.beginPath();
  g.moveTo(stubX, 40);
  g.lineTo(stubX, h - 40);
  g.stroke();
  g.setLineDash([]);

  // Foil patch (colour underneath is a pale silver; the shine comes from the material).
  const foilX = stubX - 250;
  const foilY = 722;
  const [surfaceCanvas, sg] = make();
  sg.scale(k, k);
  sg.fillStyle = "rgb(0,158,0)"; // paper: fairly rough, not metal
  sg.fillRect(0, 0, w, h);
  sg.fillStyle = "rgb(0,112,0)"; // printed band: a little glossier ink
  sg.fillRect(0, 0, w, 177);
  const [foilCanvas, fg] = make();
  fg.scale(k, k);
  fg.fillStyle = "#000";
  fg.fillRect(0, 0, w, h);
  const foilShape = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.arc(foilX + 90, foilY + 60, 84, 0, Math.PI * 2);
    c.fill();
  };
  g.fillStyle = "#c9d6dc";
  foilShape(g);
  g.strokeStyle = "rgba(14,94,143,0.55)";
  g.lineWidth = 2;
  for (let r = 16; r < 84; r += 11) {
    g.beginPath();
    g.arc(foilX + 90, foilY + 60, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.font = `700 30px ${sans}`;
  g.fillStyle = "rgba(11,86,131,0.85)";
  g.textAlign = "center";
  g.fillText("6", foilX + 90, foilY + 52);
  g.font = `700 15px ${sans}`;
  g.fillText("SEATS", foilX + 90, foilY + 80);
  g.textAlign = "left";
  sg.fillStyle = "rgb(0,46,255)";
  foilShape(sg);
  fg.fillStyle = "#fff";
  foilShape(fg);

  // Paper grain, used both for tiny relief and to vary the gloss.
  const [grainCanvas, gg] = make(512, 512);
  const grain = gg.createImageData(512, 512);
  for (let i = 0; i < grain.data.length; i += 4) {
    const v = 118 + random() * 26 + (random() < 0.02 ? 40 : 0);
    grain.data[i] = grain.data[i + 1] = grain.data[i + 2] = v;
    grain.data[i + 3] = 255;
  }
  gg.putImageData(grain, 0, 0);

  // Outline: rounded corners, a notch at each end of the perforation.
  const [alphaCanvas, ag] = make();
  ag.scale(k, k);
  ag.fillStyle = "#000";
  ag.fillRect(0, 0, w, h);
  ag.fillStyle = "#fff";
  roundRect(ag, 6, 6, w - 12, h - 12, 56);
  ag.fill();
  ag.fillStyle = "#000";
  ag.beginPath();
  ag.arc(stubX, 0, 36, 0, Math.PI * 2);
  ag.arc(stubX, h, 36, 0, Math.PI * 2);
  ag.fill();

  // Out-of-focus copies for the passes in the background.
  const soften = (source: HTMLCanvasElement) => {
    const [small, sm] = make(96, Math.round((96 * H) / W));
    sm.imageSmoothingQuality = "high";
    sm.drawImage(source, 0, 0, small.width, small.height);
    const [out, og] = make(384, Math.round((384 * H) / W));
    og.imageSmoothingQuality = "high";
    og.drawImage(small, 0, 0, out.width, out.height);
    return out;
  };

  const texture = (source: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(source);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  const grainTexture = texture(grainCanvas, false);
  grainTexture.wrapS = grainTexture.wrapT = THREE.RepeatWrapping;
  grainTexture.repeat.set(5, 2.2);
  return {
    color: texture(canvas, true),
    alpha: texture(alphaCanvas, false),
    surface: texture(surfaceCanvas, false),
    foil: texture(foilCanvas, false),
    grain: grainTexture,
    blurred: texture(soften(canvas), true),
    blurredAlpha: texture(soften(alphaCanvas), false),
  };
}

/** Round, slightly ring-edged blur disc: how a lens draws a point of light that is out of focus. */
function makeBokehTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,0.55)");
  gradient.addColorStop(0.72, "rgba(255,255,255,0.62)");
  gradient.addColorStop(0.86, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.93, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const BACKDROP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const BACKDROP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  uniform vec2 uFocus;
  varying vec2 vUv;
  ${DITHER_GLSL}
  void main() {
    vec2 p = vUv;
    // Ocean blue studio backdrop, lit from behind the card, with slow drifting pools of light.
    vec3 deep = vec3(0.012, 0.085, 0.20);
    vec3 ocean = vec3(0.022, 0.19, 0.36);
    vec3 teal = vec3(0.03, 0.36, 0.42);
    vec3 col = mix(deep, ocean, smoothstep(0.0, 0.9, p.y + p.x * 0.25));
    vec2 q = (p - uFocus) * vec2(uAspect, 1.0);
    col = mix(col, teal, exp(-dot(q, q) * 1.6) * 0.85);
    vec2 a = (p - vec2(0.82 + 0.05 * sin(uTime * 0.11), 0.05)) * vec2(uAspect, 1.0);
    col += vec3(0.95, 0.42, 0.14) * exp(-dot(a, a) * 2.2) * 0.34;
    vec2 b = (p - vec2(0.3 + 0.06 * cos(uTime * 0.09), 0.95)) * vec2(uAspect, 1.0);
    col += vec3(0.10, 0.55, 0.62) * exp(-dot(b, b) * 1.4) * 0.3;
    gl_FragColor = vec4(col, 1.0);
    ${OUTPUT_GLSL}
  }
`;

export function createBookingScene(ctx: SceneContext): BannerScene {
  const low = ctx.quality === "low";
  const bin = makeBin();
  const { renderer } = ctx;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 100);
  camera.position.set(0, 0, 7.2);

  /* ---- studio light ---- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = bin.add(pmrem.fromScene(room, 0.03));
  pmrem.dispose();
  room.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
  scene.environment = env.texture;
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(new THREE.Color(1.0, 0.95, 0.88), 1.5);
  key.position.set(-3, 4, 6);
  scene.add(key);
  // The light that sweeps across the card.
  const sweep = new THREE.PointLight(new THREE.Color(1.0, 0.9, 0.75), 26, 30, 2);
  scene.add(sweep);

  /* ---- backdrop ---- */
  const backdropUniforms = { uTime: { value: 0 }, uAspect: { value: 2 }, uFocus: { value: new THREE.Vector2(0.7, 0.5) } };
  const backdropGeometry = bin.add(new THREE.PlaneGeometry(2, 2));
  const backdropMaterial = bin.add(
    new THREE.ShaderMaterial({ uniforms: backdropUniforms, vertexShader: BACKDROP_VERTEX, fragmentShader: BACKDROP_FRAGMENT, depthTest: false, depthWrite: false }),
  );
  const backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  /* ---- the pass ---- */
  const maps = paintCard(low ? 1280 : 2048);
  Object.values(maps).forEach((t) => bin.add(t));
  maps.color.anisotropy = ctx.maxAnisotropy;

  const cardGeometry = bin.add(new THREE.PlaneGeometry(CARD_W, CARD_H, 64, 24));
  {
    // Paper is never perfectly flat: a gentle S-curl along its length, a touch across.
    const pos = cardGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.95 + 0.4) * 0.05 + Math.cos(y * 2.1) * 0.012 + (x > CARD_W * (STUB - 0.5) ? (x - CARD_W * (STUB - 0.5)) * 0.07 : 0));
    }
    cardGeometry.computeVertexNormals();
  }
  const cardMaterial = bin.add(
    new THREE.MeshPhysicalMaterial({
      map: maps.color,
      alphaMap: maps.alpha,
      alphaTest: 0.5,
      roughnessMap: maps.surface,
      metalnessMap: maps.surface,
      roughness: 1,
      metalness: 1,
      bumpMap: maps.grain,
      bumpScale: 0.6,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      iridescence: 1,
      iridescenceMap: maps.foil,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [180, 620],
      envMapIntensity: 1.0,
      side: THREE.DoubleSide,
    }),
  );
  cardMaterial.alphaToCoverage = true;
  const card = new THREE.Mesh(cardGeometry, cardMaterial);
  const cardRig = new THREE.Group();
  cardRig.add(card);
  scene.add(cardRig);

  // Soft shadow the pass would throw on the backdrop: a blurred dark copy just behind it.
  const shadowMaterial = bin.add(
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.0, 0.035, 0.09), alphaMap: maps.blurredAlpha, transparent: true, opacity: 0.38, depthWrite: false }),
  );
  const shadow = new THREE.Mesh(cardGeometry, shadowMaterial);
  shadow.scale.setScalar(1.12);
  shadow.renderOrder = -2;
  scene.add(shadow);

  /* ---- passes further back, out of focus ---- */
  const farMaterial = bin.add(
    new THREE.MeshBasicMaterial({ map: maps.blurred, alphaMap: maps.blurredAlpha, transparent: true, opacity: 0.8, depthWrite: false, color: new THREE.Color(0.42, 0.62, 0.74), side: THREE.DoubleSide }),
  );
  const farCards = [
    { mesh: new THREE.Mesh(cardGeometry, farMaterial), base: new THREE.Vector3(-3.3, 1.25, -4.6), tilt: 0.34, seed: 1.3 },
    { mesh: new THREE.Mesh(cardGeometry, farMaterial), base: new THREE.Vector3(3.1, -1.45, -6.2), tilt: -0.28, seed: 4.1 },
  ];
  farCards.forEach((far) => {
    far.mesh.renderOrder = -4;
    scene.add(far.mesh);
  });

  /* ---- blurred points of light ---- */
  const bokehTexture = bin.add(makeBokehTexture());
  const palette = [new THREE.Color(1.0, 0.5, 0.18), new THREE.Color(1.0, 0.72, 0.3), new THREE.Color(0.2, 0.8, 0.86), new THREE.Color(0.9, 0.96, 1.0), new THREE.Color(0.25, 0.6, 1.0)];
  const bokeh: { sprite: THREE.Sprite; material: THREE.SpriteMaterial; base: THREE.Vector3; seed: number; level: number }[] = [];
  {
    const random = rng(42);
    const count = low ? 16 : 30;
    for (let i = 0; i < count; i++) {
      const near = i < 3;
      const material = bin.add(
        new THREE.SpriteMaterial({ map: bokehTexture, color: palette[Math.floor(random() * palette.length)], blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      );
      const sprite = new THREE.Sprite(material);
      const z = near ? 2.5 + random() * 1.5 : -3 - random() * 9;
      const spread = (7.2 - z) * 0.62;
      const base = new THREE.Vector3((random() - 0.5) * spread * 2.2, (random() - 0.5) * spread * 0.7, z);
      const size = near ? 1.1 + random() * 0.8 : 0.35 + random() * 1.2;
      sprite.scale.setScalar(size);
      sprite.renderOrder = near ? 5 : -5;
      scene.add(sprite);
      bokeh.push({ sprite, material, base, seed: random() * 6.28, level: near ? 0.07 + random() * 0.05 : 0.1 + random() * 0.26 });
    }
  }

  renderer.toneMappingExposure = 1.0;
  scene.environmentRotation = new THREE.Euler();

  let cardScale = 1;

  return {
    scene,
    camera,
    update(time) {
      backdropUniforms.uTime.value = time;

      // The pass: slow turn and tilt, a gentle rise and fall.
      cardRig.rotation.y = -0.3 + Math.sin(time * 0.38) * 0.3;
      cardRig.rotation.x = 0.1 + Math.sin(time * 0.29 + 1) * 0.11;
      cardRig.rotation.z = -0.07 + Math.sin(time * 0.21 + 2) * 0.035;
      cardRig.position.y = Math.sin(time * 0.55) * 0.07;
      cardRig.scale.setScalar(cardScale);
      shadow.position.set(0.5 + cardRig.rotation.y * 0.4, -0.42 + cardRig.position.y * 0.5, -1.9);
      shadow.rotation.copy(cardRig.rotation);
      shadow.scale.setScalar(cardScale * 1.12);

      // Light crossing the laminate from left to right, again and again.
      const pass = (time * 0.16) % 1;
      sweep.position.set(-5 + pass * 10, 1.2 + Math.sin(time * 0.3) * 0.6, 2.6);
      sweep.intensity = 26 * Math.sin(pass * Math.PI);
      scene.environmentRotation.y = time * 0.12;

      for (const far of farCards) {
        far.mesh.position.set(
          far.base.x + Math.sin(time * 0.13 + far.seed) * 0.4,
          far.base.y + Math.sin(time * 0.19 + far.seed * 2) * 0.25,
          far.base.z,
        );
        far.mesh.rotation.set(0.2 + Math.sin(time * 0.17 + far.seed) * 0.15, far.tilt * 2 + Math.sin(time * 0.11 + far.seed) * 0.3, far.tilt);
      }
      for (const b of bokeh) {
        b.sprite.position.set(
          b.base.x + Math.sin(time * 0.1 + b.seed) * 0.5,
          b.base.y + Math.cos(time * 0.13 + b.seed * 1.7) * 0.3,
          b.base.z,
        );
        b.material.opacity = b.level * (0.7 + 0.3 * Math.sin(time * 0.6 + b.seed * 3));
      }
    },
    resize(w, h, focus: BannerFocus) {
      const aspect = w / h;
      camera.fov = fitFov(aspect, 30, 66);
      // Fit the pass into the free part of the banner.
      const visibleH = 2 * 7.2 * Math.tan((camera.fov * Math.PI) / 360);
      const visibleW = visibleH * aspect;
      const roomW = focus.wide ? visibleW * (1 - focus.x) * 2 * 0.86 : visibleW * 0.8;
      const roomH = focus.wide ? visibleH * 0.6 : visibleH * focus.y * 2 * 0.64;
      cardScale = Math.min(roomW / CARD_W, roomH / CARD_H, 1.1);
      backdropUniforms.uAspect.value = aspect;
      backdropUniforms.uFocus.value.set(focus.x, 1 - focus.y);
      applyFocus(camera, w, h, focus);
    },
    dispose() {
      bin.dispose();
    },
  };
}
