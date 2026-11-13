import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Procedural compact 7-seat MPV (Ertiga-class proportions, no brand marks).
 *
 * Axes: +X is the front of the car, +Y is up, +Z is the car's right-hand side.
 * The origin sits on the ground, midway along the body. Units are metres.
 *
 * The body is one smooth lofted shell. Windows, lamps, grille, shut lines and trim are painted
 * onto it from four orthographic "blueprints" (side, top, front, rear) that are projected in the
 * fragment shader, so every edge stays crisp at any distance without extra geometry.
 */

export interface ErtigaOptions {
  /** "low" halves the blueprint texture size (phones / weak GPUs). Default "high". */
  detail?: "high" | "low";
  /** Body colour. Default pearl white. */
  paint?: THREE.ColorRepresentation;
  /** Number plate text. */
  plate?: string;
  /** Max anisotropy for the blueprint textures. */
  anisotropy?: number;
  castShadow?: boolean;
  /**
   * Cutaway: slice the body off at this height (metres) so the cabin is open from above. Roof rails,
   * antenna and mirrors are left out. Pair with `buildErtigaInterior` for the cabin itself.
   */
  cutHeight?: number;
}

export interface ErtigaHandles {
  /** Root. Put this in the scene; move / yaw it along the road. */
  group: THREE.Group;
  /** Sprung mass (shell, glass, mirrors, rails). Roll = rotation.x, pitch = rotation.z, heave = position.y. */
  body: THREE.Group;
  /** Spin nodes in the order front-left, front-right, rear-left, rear-right. */
  wheels: THREE.Object3D[];
  /** Front steering pivots (rotation.y, positive steers left). */
  steering: THREE.Object3D[];
  wheelRadius: number;
  wheelBase: number;
  frontAxleX: number;
  rearAxleX: number;
  /** Roll all four wheels forward by a distance in metres. */
  roll(distance: number): void;
  /** Steering angle in radians, positive = left. */
  setSteer(angle: number): void;
  /** 0 = tail lamps only, 1 = full brake lights. */
  setBrake(amount: number): void;
  /** 0 = lamps off, 1 = DRL / headlamps on. */
  setHeadlights(amount: number): void;
  /** Whole-car opacity, for fades. */
  setOpacity(opacity: number): void;
  /** Keeps the lamp glows from shining through the body. Call once per frame. */
  updateGlow(camera: THREE.Camera): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ dimensions */

const HALF_L = 2.2; // 4.40 m long
const HALF_W = 0.865; // 1.73 m wide
const FRONT_AXLE_X = 1.34;
const REAR_AXLE_X = -1.4;
const WHEEL_R = 0.31; // 185/65 R15
const WHEEL_Z = 0.745;
const ARCH_R = 0.385;
const XS_F = 1.45; // where the nose starts to taper in plan
const XS_R = -1.7;

/* ------------------------------------------------------------------ maths */

/** Monotone cubic interpolation (no overshoot between the key points). */
function pchip(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m: number[] = new Array<number>(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h[i] * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h[i] * m[i + 1]
    );
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* Side silhouette, rear to front. */
const topProfile = pchip(
  [-2.2, -2.19, -2.16, -2.07, -1.97, -1.88, -1.78, -1.4, -0.6, 0.0, 0.27, 0.6, 0.97, 1.06, 1.5, 1.9, 2.04, 2.1, 2.135, 2.16, 2.185, 2.2],
  [0.8, 0.95, 1.08, 1.33, 1.53, 1.615, 1.645, 1.665, 1.675, 1.65, 1.59, 1.335, 1.03, 0.995, 0.945, 0.865, 0.825, 0.795, 0.74, 0.66, 0.58, 0.52],
);
const bottomProfile = pchip(
  [-2.2, -2.12, -1.9, -1.0, 1.0, 1.9, 2.0, 2.12, 2.18, 2.2],
  [0.42, 0.31, 0.25, 0.21, 0.21, 0.22, 0.225, 0.26, 0.33, 0.4],
);
const beltProfile = pchip([-2.2, -1.9, 0.9, 2.2], [1.06, 1.05, 0.985, 0.95]);

/** Half width of the body at its widest height, seen from above. */
export function ertigaPlanHalfWidth(x: number): number {
  return planHalfWidth(x);
}
export const ERTIGA_HALF_LENGTH = 2.2;

function planHalfWidth(x: number): number {
  let w = HALF_W * (1 - 0.03 * Math.pow((x + 0.2) / 2.4, 2));
  if (x > XS_F) {
    const t = clamp01((x - XS_F) / (HALF_L - XS_F));
    w *= Math.pow(Math.max(0, 1 - Math.pow(t, 2.4)), 1 / 2.4);
  } else if (x < XS_R) {
    const t = clamp01((XS_R - x) / (HALF_L + XS_R));
    w *= Math.pow(Math.max(0, 1 - Math.pow(t, 3.4)), 1 / 3.4);
  }
  return Math.max(0.004, w);
}

/**
 * Side-glass band at station x on the +z side (mirror z for the other side): from the shoulder
 * just above the belt line to where the roof corner starts. Same formulas as `crossSection`, so
 * windows drawn from it sit exactly in the body's glasshouse.
 */
export function ertigaGlassBand(x: number): { z0: number; y0: number; z1: number; y1: number; roofY: number } {
  const yb = bottomProfile(x);
  const yt = Math.max(topProfile(x), yb + 0.1);
  const wf = planHalfWidth(x);
  const k = Math.min(1, wf / HALF_W);
  const yBelt = Math.max(yb + 0.045, Math.min(beltProfile(x), yt - 0.05));
  const hG = yt - yBelt;
  const zSh = wf * 0.985;
  const led = 0.05 * k;
  const sh = Math.min(0.02, hG * 0.25);
  const crown = Math.min(0.035 * k, hG * 0.25);
  const rr = Math.min(0.11, (hG - sh - crown) * 0.6);
  const tumble = 0.16 * k * clamp01((hG - 0.05) / 0.5);
  const z0 = zSh - led;
  return { z0, y0: yBelt + sh, z1: z0 - tumble, y1: yt - crown - rr, roofY: yt };
}

/** Half cross-section (z >= 0) at station x, from the bottom centre round to the roof centre. */
function crossSection(x: number): [number, number][] {
  const yb = bottomProfile(x);
  const yt = Math.max(topProfile(x), yb + 0.1);
  const wf = planHalfWidth(x);
  const k = Math.min(1, wf / HALF_W);
  const yBelt = Math.max(yb + 0.045, Math.min(beltProfile(x), yt - 0.05));
  const hG = yt - yBelt;
  const rb = Math.min(0.14, (yBelt - yb) * 0.45);
  const pts: [number, number][] = [];

  // Underside
  const zBot = wf * 0.965 - rb * k;
  for (let i = 0; i <= 3; i++) pts.push([(zBot * i) / 3, yb]);
  // Rocker corner
  for (let i = 1; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push([zBot + rb * k * Math.sin(a), yb + rb - rb * Math.cos(a)]);
  }
  // Body side: slightly barrelled, widest a little under halfway up
  const y0 = yb + rb;
  for (let i = 1; i <= 12; i++) {
    const tau = i / 12;
    const prof = tau < 0.45 ? 1 - 0.035 * Math.pow(1 - tau / 0.45, 2) : 1 - 0.015 * Math.pow((tau - 0.45) / 0.55, 2);
    pts.push([wf * prof, y0 + (yBelt - y0) * tau]);
  }
  // Shoulder ledge under the glass
  const zSh = wf * 0.985;
  const led = 0.05 * k;
  const sh = Math.min(0.02, hG * 0.25);
  for (let i = 1; i <= 3; i++) {
    const a = (i / 3) * (Math.PI / 2);
    pts.push([zSh - led * (1 - Math.cos(a)), yBelt + sh * Math.sin(a)]);
  }
  // Glasshouse side with tumblehome
  const crown = Math.min(0.035 * k, hG * 0.25);
  const rr = Math.min(0.11, (hG - sh - crown) * 0.6);
  const tumble = 0.16 * k * clamp01((hG - 0.05) / 0.5);
  const zg0 = zSh - led;
  const yg0 = yBelt + sh;
  const zg1 = zg0 - tumble;
  const yg1 = yt - crown - rr;
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    pts.push([zg0 + (zg1 - zg0) * t + 0.012 * k * Math.sin(Math.PI * t) * clamp01(hG / 0.5), yg0 + (yg1 - yg0) * t]);
  }
  // Roof corner
  for (let i = 1; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push([zg1 - rr * k * (1 - Math.cos(a)), yg1 + rr * Math.sin(a)]);
  }
  // Roof / bonnet with a light crown
  const zr = zg1 - rr * k;
  for (let i = 1; i <= 8; i++) {
    const z = zr * (1 - i / 8);
    pts.push([z, yt - crown * Math.pow(z / zr, 2)]);
  }
  return pts;
}

function buildShellGeometry(): THREE.BufferGeometry {
  const xs: number[] = [];
  const K = 16;
  for (let i = 0; i <= K; i++) xs.push(-HALF_L + (XS_R + HALF_L) * Math.pow(i / K, 2.2));
  const midN = Math.round((XS_F - XS_R) / 0.045);
  for (let i = 1; i < midN; i++) xs.push(XS_R + ((XS_F - XS_R) * i) / midN);
  for (let i = K; i >= 0; i--) xs.push(HALF_L - (HALF_L - XS_F) * Math.pow(i / K, 2.2));

  const positions: number[] = [];
  let ring = 0;
  for (const x of xs) {
    const half = crossSection(x);
    const m = half.length;
    ring = 2 * m - 2;
    for (let j = 0; j < m; j++) positions.push(x, half[j][1], half[j][0]);
    for (let j = m - 2; j >= 1; j--) positions.push(x, half[j][1], -half[j][0]);
  }
  const indices: number[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let r = 0; r < ring; r++) {
      const a = i * ring + r;
      const b = i * ring + ((r + 1) % ring);
      const c = (i + 1) * ring + r;
      const d = (i + 1) * ring + ((r + 1) % ring);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------------ blueprint painting */

type Ctx = CanvasRenderingContext2D;
type PathFn = (c: Ctx) => void;

/** Draws the same shape into an albedo canvas and a "properties" canvas (R roughness, G metalness, B lamp glow). */
class Painter {
  readonly albedo: HTMLCanvasElement;
  readonly props: HTMLCanvasElement;
  private readonly a: Ctx;
  private readonly p: Ctx;

  constructor(width: number, height: number, pxPerMetre: number, originX: number) {
    this.albedo = document.createElement("canvas");
    this.props = document.createElement("canvas");
    for (const c of [this.albedo, this.props]) {
      c.width = width;
      c.height = height;
    }
    this.a = this.albedo.getContext("2d") as Ctx;
    this.p = this.props.getContext("2d") as Ctx;
    for (const c of [this.a, this.p]) {
      c.setTransform(pxPerMetre, 0, 0, -pxPerMetre, originX * pxPerMetre, height);
      c.lineJoin = "round";
      c.lineCap = "round";
    }
  }

  private static prop(rough: number, metal: number, glow: number): string {
    return `rgb(${Math.round(rough * 255)},${Math.round(metal * 255)},${Math.round(glow * 255)})`;
  }

  base(albedo: string, rough: number, metal = 0): void {
    for (const [c, style] of [
      [this.a, albedo],
      [this.p, Painter.prop(rough, metal, 0)],
    ] as [Ctx, string][]) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = style;
      c.fillRect(0, 0, c.canvas.width, c.canvas.height);
      c.restore();
    }
  }

  fill(path: PathFn, albedo: string, rough: number, metal = 0, glow = 0): void {
    for (const [c, style] of [
      [this.a, albedo],
      [this.p, Painter.prop(rough, metal, glow)],
    ] as [Ctx, string][]) {
      c.beginPath();
      path(c);
      c.fillStyle = style;
      c.fill();
    }
  }

  stroke(path: PathFn, width: number, albedo: string, rough: number, metal = 0, glow = 0): void {
    for (const [c, style] of [
      [this.a, albedo],
      [this.p, Painter.prop(rough, metal, glow)],
    ] as [Ctx, string][]) {
      c.beginPath();
      path(c);
      c.lineWidth = width;
      c.strokeStyle = style;
      c.stroke();
    }
  }

  clip(path: PathFn, draw: () => void): void {
    for (const c of [this.a, this.p]) {
      c.save();
      c.beginPath();
      path(c);
      c.clip();
    }
    draw();
    for (const c of [this.a, this.p]) c.restore();
  }

  /** Albedo-only shading (soft gradients, grime). */
  shade(draw: (c: Ctx) => void): void {
    draw(this.a);
  }
}

function poly(pts: number[][], radius = 0): PathFn {
  return (c) => {
    const n = pts.length;
    if (radius <= 0) {
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.closePath();
      return;
    }
    const mid = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const m0 = mid(pts[n - 1], pts[0]);
    c.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const m = mid(p, pts[(i + 1) % n]);
      c.arcTo(p[0], p[1], m[0], m[1], radius);
    }
    c.closePath();
  };
}

const line = (pts: number[][]): PathFn => (c) => {
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
};

const rect = (x0: number, y0: number, x1: number, y1: number, r = 0): PathFn =>
  poly(
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
    r,
  );

const mirrorZ = (pts: number[][], s: number) => pts.map((p) => [p[0] * s, p[1]]);

// Material presets: [albedo, roughness, metalness]
const GLASS: [string, number, number] = ["#10171c", 0.04, 0];
const GLOSS_BLACK: [string, number, number] = ["#0c0e10", 0.28, 0];
const PLASTIC: [string, number, number] = ["#1d2023", 0.72, 0];
const CHROME: [string, number, number] = ["#e4e7ea", 0.14, 1];
const SHUT: [string, number, number] = ["#565b60", 0.7, 0];
const LAMP: [string, number, number] = ["#b9c1c8", 0.1, 0.85];
const RED_LENS: [string, number, number] = ["#b8101c", 0.12, 0];
const AMBER: [string, number, number] = ["#e88a12", 0.15, 0];

function paintSide(P: Painter, paint: string): void {
  P.base(paint, 0.45);
  // Soft grounding shade along the sills and a faint crease half-way up the doors
  P.shade((c) => {
    const g = c.createLinearGradient(0, 0.2, 0, 0.5);
    g.addColorStop(0, "rgba(70,82,92,0.42)");
    g.addColorStop(1, "rgba(70,82,92,0)");
    c.fillStyle = g;
    c.fillRect(-2.4, 0, 4.8, 0.5);
    const cr = c.createLinearGradient(0, 0.5, 0, 0.6);
    cr.addColorStop(0, "rgba(70,82,92,0)");
    cr.addColorStop(0.5, "rgba(70,82,92,0.1)");
    cr.addColorStop(1, "rgba(70,82,92,0)");
    c.fillStyle = cr;
    c.fillRect(-1.9, 0.5, 3.7, 0.1);
  });
  // Arch lips
  for (const xw of [FRONT_AXLE_X, REAR_AXLE_X]) {
    P.stroke((c) => c.arc(xw, WHEEL_R, ARCH_R + 0.012, 0, Math.PI * 2), 0.024, "#7c8388", 0.6);
  }

  // Daylight opening
  const dlo = [
    [0.84, 1.03],
    [0.3, 1.4],
    [-0.55, 1.485],
    [-1.5, 1.47],
    [-1.83, 1.14],
    [-1.76, 1.085],
  ];
  P.stroke(poly(dlo, 0.05), 0.05, ...GLOSS_BLACK);
  P.fill(poly(dlo, 0.05), ...GLASS);
  P.clip(poly(dlo, 0.05), () => {
    P.fill(rect(-0.14, 0.9, -0.02, 1.6), ...GLOSS_BLACK);
    P.fill(rect(-1.12, 0.9, -1.0, 1.6), ...GLOSS_BLACK);
    // faint sky sheen across the top of the glass
    P.shade((c) => {
      const g = c.createLinearGradient(0, 1.5, 0, 1.2);
      g.addColorStop(0, "rgba(120,150,170,0.28)");
      g.addColorStop(1, "rgba(120,150,170,0)");
      c.fillStyle = g;
      c.fillRect(-2, 1.0, 3, 0.6);
    });
  });

  // Shut lines
  const w = 0.009;
  P.stroke(line([[0.86, 1.02], [0.86, 0.3]]), w, ...SHUT);
  P.stroke(line([[-0.08, 1.04], [-0.08, 0.3]]), w, ...SHUT);
  P.stroke(
    (c) => {
      c.moveTo(-1.06, 1.08);
      c.lineTo(-1.06, 0.66);
      c.quadraticCurveTo(-1.06, 0.54, -1.035, 0.47);
    },
    w,
    ...SHUT,
  );
  P.stroke(line([[0.86, 0.3], [-1.0, 0.3]]), w, ...SHUT);
  P.stroke(rect(-1.74, 0.84, -1.58, 0.99, 0.03), 0.007, ...SHUT);
  // Door handles
  for (const x0 of [0.0, -0.98]) {
    P.fill(rect(x0 - 0.01, 0.885, x0 + 0.19, 0.945, 0.025), "#b7bcc0", 0.5);
    P.fill(rect(x0, 0.9, x0 + 0.17, 0.935, 0.015), ...CHROME);
  }
  // Side repeater
  P.fill(rect(1.0, 0.845, 1.09, 0.872, 0.012), ...AMBER);

  // Head lamp wrapping round the corner
  const head = [
    [2.25, 0.6],
    [2.25, 0.78],
    [1.95, 0.815],
    [1.62, 0.81],
    [1.7, 0.75],
    [1.98, 0.68],
  ];
  P.fill(poly(head, 0.02), ...GLOSS_BLACK);
  P.fill(
    poly(
      [
        [2.25, 0.63],
        [2.25, 0.765],
        [1.95, 0.8],
        [1.68, 0.797],
        [1.74, 0.757],
        [1.99, 0.7],
      ],
      0.015,
    ),
    ...LAMP,
  );
  P.stroke(line([[2.25, 0.625], [1.985, 0.695], [1.75, 0.755]]), 0.02, "#ffffff", 0.2, 0, 1);

  // Tail lamp running up the rear pillar
  const tail = [
    [-2.25, 0.92],
    [-2.25, 1.14],
    [-2.08, 1.3],
    [-1.98, 1.42],
    [-1.925, 1.38],
    [-1.96, 1.1],
    [-2.0, 0.92],
  ];
  P.fill(poly(tail, 0.02), ...RED_LENS);
  P.stroke(line([[-2.06, 0.97], [-2.02, 1.12], [-1.975, 1.33]]), 0.018, "#e0182a", 0.1);
}

function paintTop(P: Painter, paint: string): void {
  P.base(paint, 0.45);
  // Windscreen
  const ws = [
    [0.955, -0.73],
    [0.955, 0.73],
    [0.3, 0.5],
    [0.3, -0.5],
  ];
  P.stroke(poly(ws, 0.06), 0.06, ...GLOSS_BLACK);
  P.fill(poly(ws, 0.06), ...GLASS);
  P.clip(poly(ws, 0.06), () => {
    P.shade((c) => {
      const g = c.createLinearGradient(0.3, 0, 0.95, 0);
      g.addColorStop(0, "rgba(130,160,180,0.3)");
      g.addColorStop(1, "rgba(130,160,180,0.02)");
      c.fillStyle = g;
      c.fillRect(0.2, -0.8, 0.8, 1.6);
    });
    // wipers
    P.stroke(line([[0.93, -0.05], [0.9, 0.58]]), 0.014, ...PLASTIC);
    P.stroke(line([[0.93, -0.62], [0.9, -0.03]]), 0.014, ...PLASTIC);
  });
  // Cowl panel
  P.fill(rect(0.955, -0.71, 1.03, 0.71, 0.03), ...PLASTIC);
  // Bonnet shut line
  P.stroke(
    (c) => {
      c.moveTo(1.03, -0.71);
      c.lineTo(1.8, -0.7);
      c.quadraticCurveTo(2.07, -0.6, 2.085, 0);
      c.quadraticCurveTo(2.07, 0.6, 1.8, 0.7);
      c.lineTo(1.03, 0.71);
    },
    0.009,
    ...SHUT,
  );
  // High-mounted stop lamp on the spoiler edge
  P.fill(rect(-1.93, -0.2, -1.905, 0.2, 0.01), ...RED_LENS);
}

function paintFront(P: Painter, paint: string): void {
  P.base(paint, 0.45);
  // Lower valance
  P.fill(rect(-1.2, 0, 1.2, 0.295), ...PLASTIC);
  // Upper grille
  const grille = [
    [-0.47, 0.765],
    [0.47, 0.765],
    [0.41, 0.648],
    [-0.41, 0.648],
  ];
  P.fill(poly(grille, 0.025), "#090a0c", 0.55);
  P.clip(poly(grille, 0.025), () => {
    for (let i = 0; i < 26; i++) {
      const z = -0.5 + i * 0.04;
      P.stroke(line([[z, 0.64], [z + 0.03, 0.78]]), 0.006, "#24282c", 0.5);
    }
    for (const y of [0.673, 0.7, 0.727]) P.stroke(line([[-0.5, y], [0.5, y]]), 0.011, ...CHROME);
  });
  P.stroke(line([[-0.455, 0.762], [0.455, 0.762]]), 0.018, ...CHROME);
  // Lower intake
  const intake = [
    [-0.52, 0.455],
    [0.52, 0.455],
    [0.44, 0.315],
    [-0.44, 0.315],
  ];
  P.fill(poly(intake, 0.03), "#0b0c0e", 0.7);
  P.clip(poly(intake, 0.03), () => {
    for (const y of [0.35, 0.385, 0.42]) P.stroke(line([[-0.6, y], [0.6, y]]), 0.01, "#2a2e32", 0.6);
  });
  for (const s of [-1, 1]) {
    // Head lamps
    const lamp = mirrorZ(
      [
        [0.455, 0.668],
        [0.455, 0.76],
        [0.9, 0.79],
        [0.9, 0.6],
        [0.7, 0.618],
      ],
      s,
    );
    P.fill(poly(lamp, 0.02), ...GLOSS_BLACK);
    const inner = mirrorZ(
      [
        [0.475, 0.685],
        [0.475, 0.745],
        [0.9, 0.772],
        [0.9, 0.63],
        [0.7, 0.643],
      ],
      s,
    );
    P.fill(poly(inner, 0.015), ...LAMP);
    for (const z of [0.585, 0.71]) {
      P.fill((c) => c.arc(z * s, 0.712, 0.036, 0, Math.PI * 2), "#3b4046", 0.2, 0.6);
      P.fill((c) => c.arc(z * s, 0.712, 0.024, 0, Math.PI * 2), "#f4f6f8", 0.08, 0.4, 0.75);
    }
    P.stroke(line(mirrorZ([[0.48, 0.676], [0.7, 0.628], [0.9, 0.612]], s)), 0.017, "#ffffff", 0.2, 0, 1);
    // Fog lamp pods
    P.fill(poly(mirrorZ([[0.58, 0.48], [0.82, 0.47], [0.8, 0.355], [0.6, 0.36]], s), 0.03), ...PLASTIC);
    P.fill((c) => c.arc(0.69 * s, 0.418, 0.04, 0, Math.PI * 2), ...LAMP);
  }
}

function paintRear(P: Painter, paint: string): void {
  P.base(paint, 0.45);
  P.fill(rect(-1.2, 0, 1.2, 0.36), ...PLASTIC);
  // Tailgate glass
  const glass = [
    [-0.66, 1.11],
    [0.66, 1.11],
    [0.55, 1.53],
    [-0.55, 1.53],
  ];
  P.stroke(poly(glass, 0.06), 0.05, ...GLOSS_BLACK);
  P.fill(poly(glass, 0.06), ...GLASS);
  P.clip(poly(glass, 0.06), () => {
    P.shade((c) => {
      const g = c.createLinearGradient(0, 1.53, 0, 1.25);
      g.addColorStop(0, "rgba(130,160,180,0.3)");
      g.addColorStop(1, "rgba(130,160,180,0)");
      c.fillStyle = g;
      c.fillRect(-0.8, 1.0, 1.6, 0.6);
    });
  });
  // Tailgate shut lines
  P.stroke(line([[-0.74, 0.6], [0.74, 0.6]]), 0.009, ...SHUT);
  for (const s of [-1, 1]) {
    P.stroke(line(mirrorZ([[0.74, 0.6], [0.74, 0.9]], s)), 0.009, ...SHUT);
    // L-shaped tail lamps
    P.fill(poly(mirrorZ([[0.56, 0.92], [0.9, 0.92], [0.9, 1.4], [0.6, 1.4]], s), 0.03), ...RED_LENS);
    P.fill(poly(mirrorZ([[0.36, 0.985], [0.62, 0.985], [0.62, 1.075], [0.36, 1.075]], s), 0.02), ...RED_LENS);
    P.stroke(line(mirrorZ([[0.67, 0.99], [0.68, 1.33]], s)), 0.022, "#e0182a", 0.1);
    P.fill(rect(Math.min(0.6 * s, 0.7 * s), 0.935, Math.max(0.6 * s, 0.7 * s), 0.965, 0.008), "#e9edf0", 0.12, 0.3);
    P.fill(rect(Math.min(0.73 * s, 0.84 * s), 0.935, Math.max(0.73 * s, 0.84 * s), 0.965, 0.008), ...AMBER);
    // Bumper reflectors
    P.fill(rect(Math.min(0.5 * s, 0.72 * s), 0.44, Math.max(0.5 * s, 0.72 * s), 0.475, 0.008), ...RED_LENS);
  }
  // Chrome garnish between the lamps
  P.fill(rect(-0.35, 1.0, 0.35, 1.05, 0.012), ...CHROME);
}

/* ------------------------------------------------------------------ parts */

function buildWheelGeometries() {
  // Tyre profile (radius, axial), with three circumferential grooves
  const tp: THREE.Vector2[] = [];
  const add = (r: number, a: number) => tp.push(new THREE.Vector2(r, a));
  add(0.192, -0.078);
  add(0.2, -0.09);
  add(0.235, -0.097);
  add(0.27, -0.0965);
  add(0.292, -0.089);
  add(0.304, -0.076);
  add(0.309, -0.064);
  for (const g of [-0.042, 0, 0.042]) {
    add(0.31, g - 0.0075);
    add(0.302, g - 0.0055);
    add(0.302, g + 0.0055);
    add(0.31, g + 0.0075);
  }
  add(0.309, 0.064);
  add(0.304, 0.076);
  add(0.292, 0.089);
  add(0.27, 0.0965);
  add(0.235, 0.097);
  add(0.2, 0.09);
  add(0.192, 0.078);
  const tyre = new THREE.LatheGeometry(tp, 44);
  tyre.rotateX(Math.PI / 2);

  // Alloy: barrel + five-spoke face + hub + nuts
  const barrel = new THREE.LatheGeometry(
    [
      [0.193, -0.08],
      [0.199, -0.087],
      [0.199, -0.079],
      [0.186, -0.07],
      [0.172, -0.05],
      [0.172, 0.062],
      [0.188, 0.076],
      [0.199, 0.079],
      [0.199, 0.087],
      [0.193, 0.08],
    ].map(([r, a]) => new THREE.Vector2(r, a)),
    40,
  );
  barrel.rotateX(Math.PI / 2);

  const face = new THREE.Shape();
  face.absarc(0, 0, 0.188, 0, Math.PI * 2, false);
  const ri = 0.066;
  const ro = 0.16;
  const hw = 0.0215;
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2 + Math.PI / 2;
    const a1 = a0 + (Math.PI * 2) / 5;
    const di = Math.asin(hw / ri);
    const dout = Math.asin((hw * 0.8) / ro);
    const hole = new THREE.Path();
    hole.moveTo(Math.cos(a0 + di) * ri, Math.sin(a0 + di) * ri);
    hole.absarc(0, 0, ri, a0 + di, a1 - di, false);
    hole.lineTo(Math.cos(a1 - dout) * ro, Math.sin(a1 - dout) * ro);
    hole.absarc(0, 0, ro, a1 - dout, a0 + dout, true);
    hole.closePath();
    face.holes.push(hole);
  }
  const faceGeo = new THREE.ExtrudeGeometry(face, {
    depth: 0.016,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 2,
    curveSegments: 20,
  });
  faceGeo.translate(0, 0, 0.056);
  const hub = new THREE.CylinderGeometry(0.03, 0.04, 0.03, 20);
  hub.rotateX(Math.PI / 2);
  hub.translate(0, 0, 0.082);
  const alloyParts: THREE.BufferGeometry[] = [barrel, faceGeo, hub];
  for (let i = 0; i < 5; i++) {
    const nut = new THREE.CylinderGeometry(0.008, 0.008, 0.014, 8);
    nut.rotateX(Math.PI / 2);
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    nut.translate(Math.cos(a) * 0.052, Math.sin(a) * 0.052, 0.082);
    alloyParts.push(nut);
  }
  const alloy = mergeGeometries(alloyParts.map((g) => (g.index ? g.toNonIndexed() : g)));
  alloyParts.forEach((g) => g.dispose());

  // Brake disc and a dark back plate so nothing shows through the spokes
  const disc = new THREE.CylinderGeometry(0.135, 0.135, 0.014, 32);
  disc.rotateX(Math.PI / 2);
  disc.translate(0, 0, 0.024);
  const back = new THREE.CylinderGeometry(0.172, 0.172, 0.01, 28);
  back.rotateX(Math.PI / 2);
  back.translate(0, 0, -0.03);
  return { tyre, alloy, disc, back };
}

/** Upper part of a wheel-arch liner: an open tube seen from inside, plus its inner wall. */
function buildArchLiner(): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const seg = 26;
  const a0 = -0.42;
  const a1 = Math.PI + 0.42;
  const zIn = 0.4;
  const zOut = 0.845;
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    const x = Math.cos(a) * ARCH_R;
    const y = Math.sin(a) * ARCH_R;
    pos.push(x, y, zIn, x, y, zOut);
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  // inner wall fan
  const centre = pos.length / 3;
  pos.push(0, 0.05, zIn);
  for (let i = 0; i < seg; i++) idx.push(centre, i * 2, (i + 1) * 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function radialTexture(stops: [number, string][], size = 128): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d") as Ctx;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function plateTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext("2d") as Ctx;
  ctx.fillStyle = "#fbfbf8";
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = "#16181a";
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = "#1c4fa3";
  ctx.font = "700 20px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("IND", 36, 92);
  ctx.beginPath();
  ctx.arc(36, 48, 14, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#1c4fa3";
  ctx.stroke();
  ctx.fillStyle = "#121416";
  let size = 78;
  ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
  while (ctx.measureText(text).width > 420 && size > 30) {
    size -= 4;
    ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`;
  }
  ctx.fillText(text, 282, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ------------------------------------------------------------------ builder */

export function buildErtiga(options: ErtigaOptions = {}): ErtigaHandles {
  const detail = options.detail ?? "high";
  const paintHex = `#${new THREE.Color(options.paint ?? "#cdd1cf").getHexString()}`;
  const castShadow = options.castShadow ?? true;
  const anisotropy = options.anisotropy ?? 4;

  const group = new THREE.Group();
  group.name = "ertiga";
  group.rotation.order = "YZX";
  const body = new THREE.Group();
  body.name = "ertiga-body";
  group.add(body);

  const disposables: { dispose(): void }[] = [];
  const fadeMaterials: { material: THREE.Material; base: number }[] = [];
  const track = <T extends THREE.Material>(m: T, base = 1): T => {
    m.transparent = true;
    fadeMaterials.push({ material: m, base });
    disposables.push(m);
    return m;
  };

  /* ---- blueprint textures ---- */
  const W = detail === "high" ? 2048 : 1024;
  const H = W / 2;
  const ppm = W / 4.8;
  const side = new Painter(W, H, ppm, 2.4);
  const top = new Painter(W, H, ppm, 2.4);
  const front = new Painter(H, H, ppm, 1.2);
  const rear = new Painter(H, H, ppm, 1.2);
  paintSide(side, paintHex);
  // The top view uses z as its vertical axis, centred on the canvas
  for (const c of [top.albedo, top.props]) {
    const ctx = c.getContext("2d") as Ctx;
    ctx.setTransform(ppm, 0, 0, -ppm, 2.4 * ppm, H / 2);
  }
  paintTop(top, paintHex);
  paintFront(front, paintHex);
  paintRear(rear, paintHex);
  const tex = (canvas: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    disposables.push(t);
    return t;
  };
  const uniforms = {
    tSideA: { value: tex(side.albedo, true) },
    tSideP: { value: tex(side.props, false) },
    tTopA: { value: tex(top.albedo, true) },
    tTopP: { value: tex(top.props, false) },
    tFrontA: { value: tex(front.albedo, true) },
    tFrontP: { value: tex(front.props, false) },
    tRearA: { value: tex(rear.albedo, true) },
    tRearP: { value: tex(rear.props, false) },
    uBrake: { value: 0 },
    uHead: { value: 1 },
    uArch: { value: new THREE.Vector4(FRONT_AXLE_X, REAR_AXLE_X, WHEEL_R, ARCH_R) },
    uCut: { value: options.cutHeight ?? 99 },
  };

  /* ---- shell ---- */
  const shellMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.045,
      envMapIntensity: 1.45,
    }),
  );
  shellMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCarPos;\nvarying vec3 vCarNrm;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCarPos = position;\nvCarNrm = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vCarPos;
        varying vec3 vCarNrm;
        uniform sampler2D tSideA; uniform sampler2D tSideP;
        uniform sampler2D tTopA; uniform sampler2D tTopP;
        uniform sampler2D tFrontA; uniform sampler2D tFrontP;
        uniform sampler2D tRearA; uniform sampler2D tRearP;
        uniform float uBrake; uniform float uHead; uniform vec4 uArch; uniform float uCut;
        vec3 carAlb; vec3 carProp;`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        if (vCarPos.y > uCut) discard;
        if (abs(vCarPos.z) > 0.5 && (distance(vCarPos.xy, vec2(uArch.x, uArch.z)) < uArch.w || distance(vCarPos.xy, vec2(uArch.y, uArch.z)) < uArch.w)) discard;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          vec3 cn = normalize(vCarNrm);
          vec3 an = abs(cn);
          vec2 uvS = vec2((vCarPos.x + 2.4) / 4.8, vCarPos.y / 2.4);
          vec2 uvT = vec2((vCarPos.x + 2.4) / 4.8, (vCarPos.z + 1.2) / 2.4);
          vec2 uvF = vec2((vCarPos.z + 1.2) / 2.4, vCarPos.y / 2.4);
          vec3 sA = texture2D(tSideA, uvS).rgb; vec3 sP = texture2D(tSideP, uvS).rgb;
          vec3 tA = texture2D(tTopA, uvT).rgb; vec3 tP = texture2D(tTopP, uvT).rgb;
          vec3 fA = texture2D(tFrontA, uvF).rgb; vec3 fP = texture2D(tFrontP, uvF).rgb;
          vec3 rA = texture2D(tRearA, uvF).rgb; vec3 rP = texture2D(tRearP, uvF).rgb;
          if (an.z >= an.x && an.z >= an.y) { carAlb = sA; carProp = sP; }
          else if (an.y > an.x) {
            if (cn.y < 0.0) { carAlb = vec3(0.012); carProp = vec3(0.85, 0.0, 0.0); }
            else { carAlb = tA; carProp = tP; }
          }
          else if (cn.x > 0.0) { carAlb = fA; carProp = fP; }
          else { carAlb = rA; carProp = rP; }
          diffuseColor.rgb *= carAlb;
        }`,
      )
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = carProp.r;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = carProp.g;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          float redMask = smoothstep(0.2, 0.42, carAlb.r - 2.5 * max(carAlb.g, carAlb.b));
          totalEmissiveRadiance += vec3(1.0, 0.035, 0.02) * redMask * (0.3 + 5.0 * uBrake);
          totalEmissiveRadiance += vec3(1.0, 0.93, 0.82) * smoothstep(0.45, 0.9, carProp.b) * 2.6 * uHead;
        }`,
      )
      .replace(
        "#include <lights_physical_fragment>",
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= smoothstep(0.62, 0.5, carProp.r) * (1.0 - carProp.g);
        #endif`,
      );
  };
  shellMat.customProgramCacheKey = () => "ertiga-shell-2";
  const shellGeo = buildShellGeometry();
  disposables.push(shellGeo);
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.castShadow = castShadow;
  shell.receiveShadow = true;
  body.add(shell);

  /* ---- shared materials ---- */
  const paintMat = track(
    new THREE.MeshPhysicalMaterial({ color: paintHex, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.045, envMapIntensity: 1.45 }),
  );
  const blackGloss = track(new THREE.MeshStandardMaterial({ color: 0x0c0e10, roughness: 0.3, metalness: 0.2 }));
  const darkMatte = track(new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.95, side: THREE.DoubleSide }));
  const rubber = track(new THREE.MeshStandardMaterial({ color: 0x232426, roughness: 0.86 }));
  const alloyMat = track(new THREE.MeshStandardMaterial({ color: 0xc6cace, roughness: 0.3, metalness: 1, side: THREE.DoubleSide }));
  const steel = track(new THREE.MeshStandardMaterial({ color: 0x70757b, roughness: 0.45, metalness: 1 }));
  const mirrorGlass = track(new THREE.MeshStandardMaterial({ color: 0xdfe6ec, roughness: 0.04, metalness: 1 }));

  /* ---- wheel-arch liners ---- */
  const linerGeo = buildArchLiner();
  disposables.push(linerGeo);
  for (const ax of [FRONT_AXLE_X, REAR_AXLE_X]) {
    for (const s of [1, -1]) {
      const liner = new THREE.Mesh(linerGeo, darkMatte);
      liner.position.set(ax, WHEEL_R, 0);
      liner.scale.z = s;
      body.add(liner);
    }
  }

  if (options.cutHeight === undefined) {
  /* ---- mirrors ---- */
  const mirrorShell = new THREE.SphereGeometry(1, 20, 14);
  const mirrorArm = new THREE.BoxGeometry(0.05, 0.03, 0.09);
  const mirrorFace = new THREE.CircleGeometry(1, 20);
  disposables.push(mirrorShell, mirrorArm, mirrorFace);
  for (const s of [1, -1]) {
    const housing = new THREE.Mesh(mirrorShell, paintMat);
    housing.scale.set(0.058, 0.06, 0.098);
    housing.position.set(0.8, 1.06, s * 0.925);
    housing.castShadow = castShadow;
    const arm = new THREE.Mesh(mirrorArm, blackGloss);
    arm.position.set(0.81, 1.025, s * 0.85);
    const glass = new THREE.Mesh(mirrorFace, mirrorGlass);
    glass.scale.set(0.082, 0.047, 1);
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(0.8 - 0.045, 1.06, s * 0.925);
    body.add(housing, arm, glass);
  }

  /* ---- roof rails + antenna ---- */
  for (const s of [1, -1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      const x = -1.55 + 1.62 * u;
      const lift = 0.05 * Math.pow(Math.sin(Math.PI * u), 0.45);
      pts.push(new THREE.Vector3(x, topProfile(x) - 0.03 + 0.008 + lift, s * 0.5));
    }
    const railGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.019, 8, false);
    disposables.push(railGeo);
    const rail = new THREE.Mesh(railGeo, blackGloss);
    rail.castShadow = castShadow;
    body.add(rail);
  }
  const finGeo = new THREE.ConeGeometry(0.04, 0.085, 14);
  disposables.push(finGeo);
  const fin = new THREE.Mesh(finGeo, blackGloss);
  fin.scale.set(2.4, 1, 0.55);
  fin.position.set(-1.64, topProfile(-1.64) + 0.035, 0);
  fin.rotation.z = 0.25;
  body.add(fin);

  }

  /* ---- number plates ---- */
  const plateTex = plateTexture(options.plate ?? "KA 01 SM 0006");
  const plateMat = track(new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 }));
  const plateGeo = new THREE.PlaneGeometry(0.5, 0.125);
  disposables.push(plateTex, plateGeo);
  const plateF = new THREE.Mesh(plateGeo, plateMat);
  plateF.position.set(HALF_L + 0.006, 0.555, 0);
  plateF.rotation.y = Math.PI / 2;
  const plateR = new THREE.Mesh(plateGeo, plateMat);
  plateR.position.set(-HALF_L - 0.006, 0.79, 0);
  plateR.rotation.y = -Math.PI / 2;
  body.add(plateF, plateR);

  /* ---- lamp glows ---- */
  const glowTex = radialTexture([
    [0, "rgba(255,255,255,1)"],
    [0.25, "rgba(255,255,255,0.55)"],
    [0.6, "rgba(255,255,255,0.12)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  disposables.push(glowTex);
  const glowMat = (color: number) => {
    const m = new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    disposables.push(m);
    return m;
  };
  const tailGlowMat = glowMat(0xff2a18);
  const headGlowMat = glowMat(0xfff0d2);
  for (const s of [1, -1]) {
    const t = new THREE.Sprite(tailGlowMat);
    t.position.set(-2.17, 1.1, s * 0.7);
    t.scale.setScalar(0.62);
    const h = new THREE.Sprite(headGlowMat);
    h.position.set(2.1, 0.7, s * 0.66);
    h.scale.setScalar(0.36);
    body.add(t, h);
  }

  /* ---- wheels ---- */
  const wg = buildWheelGeometries();
  disposables.push(wg.tyre, wg.alloy, wg.disc, wg.back);
  const wheels: THREE.Object3D[] = [];
  const steering: THREE.Object3D[] = [];
  const corners: [number, number][] = [
    [FRONT_AXLE_X, -1],
    [FRONT_AXLE_X, 1],
    [REAR_AXLE_X, -1],
    [REAR_AXLE_X, 1],
  ];
  corners.forEach(([ax, s], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(ax, WHEEL_R, s * WHEEL_Z);
    const spin = new THREE.Group();
    const flip = new THREE.Group();
    if (s < 0) flip.rotation.y = Math.PI;
    const tyre = new THREE.Mesh(wg.tyre, rubber);
    const alloy = new THREE.Mesh(wg.alloy, alloyMat);
    const disc = new THREE.Mesh(wg.disc, steel);
    const back = new THREE.Mesh(wg.back, darkMatte);
    tyre.castShadow = castShadow;
    flip.add(tyre, alloy, disc, back);
    spin.add(flip);
    pivot.add(spin);
    group.add(pivot);
    wheels.push(spin);
    if (i < 2) steering.push(pivot);
  });

  /* ---- contact shadow ---- */
  const shadowTex = radialTexture(
    [
      [0, "rgba(8,22,32,1)"],
      [0.55, "rgba(8,22,32,0.9)"],
      [0.78, "rgba(8,22,32,0.3)"],
      [1, "rgba(8,22,32,0)"],
    ],
    128,
  );
  const shadowGeo = new THREE.PlaneGeometry(5.3, 2.5);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
  disposables.push(shadowTex, shadowGeo, shadowMat);
  const contact = new THREE.Mesh(shadowGeo, shadowMat);
  contact.position.y = 0.02;
  contact.renderOrder = -1;
  group.add(contact);

  /* ---- handles ---- */
  let brake = 0;
  let head = 1;
  let opacity = 1;
  let spinAngle = 0;
  const vFwd = new THREE.Vector3();
  const vCam = new THREE.Vector3();
  const vPos = new THREE.Vector3();

  return {
    group,
    body,
    wheels,
    steering,
    wheelRadius: WHEEL_R,
    wheelBase: FRONT_AXLE_X - REAR_AXLE_X,
    frontAxleX: FRONT_AXLE_X,
    rearAxleX: REAR_AXLE_X,
    roll(distance) {
      spinAngle -= distance / WHEEL_R;
      if (spinAngle < -Math.PI * 200) spinAngle += Math.PI * 200;
      for (const w of wheels) w.rotation.z = spinAngle;
    },
    setSteer(angle) {
      for (const p of steering) p.rotation.y = angle;
    },
    setBrake(amount) {
      brake = clamp01(amount);
      uniforms.uBrake.value = brake;
    },
    setHeadlights(amount) {
      head = clamp01(amount);
      uniforms.uHead.value = head;
    },
    setOpacity(value) {
      opacity = clamp01(value);
      group.visible = opacity > 0.01;
      for (const f of fadeMaterials) f.material.opacity = f.base * opacity;
      shadowMat.opacity = 0.8 * opacity;
    },
    updateGlow(camera) {
      group.getWorldPosition(vPos);
      vFwd.set(1, 0, 0).transformDirection(group.matrixWorld);
      vCam.setFromMatrixPosition(camera.matrixWorld).sub(vPos).normalize();
      const facing = vFwd.dot(vCam);
      const rearVis = THREE.MathUtils.smoothstep(-facing, 0.12, 0.55);
      const frontVis = THREE.MathUtils.smoothstep(facing, 0.12, 0.55);
      tailGlowMat.opacity = (0.1 + 0.8 * brake) * rearVis * opacity;
      headGlowMat.opacity = 0.3 * head * frontVis * opacity;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
