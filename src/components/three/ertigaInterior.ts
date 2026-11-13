import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ERTIGA_HALF_LENGTH, ertigaPlanHalfWidth } from "./ertigaModel";

/**
 * Cabin for the cutaway MPV (see `buildErtiga({ cutHeight })`): floor, door cards, dashboard, steering
 * wheel on the RIGHT (India), centre console with gear lever, the driver's seat and six passenger seats.
 *
 * Same axes as the car: +X front, +Y up, +Z the car's right. Seat numbering matches the booking flow:
 * 1 front-left passenger, 2/3/4 middle row left/centre/right, 5/6 back row left/right.
 */

export const CABIN_CUT_HEIGHT = 0.97;
const FLOOR_Y = 0.34;
const CABIN_BACK_X = -2.05;
const CABIN_FRONT_X = 1.0;

export interface InteriorSeat {
  seat: number;
  group: THREE.Group;
  fabric: THREE.MeshStandardMaterial;
  insert: THREE.MeshStandardMaterial;
  /** Shown on taken seats: a travel bag left on the cushion. */
  bag: THREE.Object3D;
  /** Invisible, generous tap target. `userData.seat` holds the seat number. */
  hit: THREE.Mesh;
  /** Where the floating seat label goes, in the interior group's space. */
  anchor: THREE.Vector3;
}

export interface ErtigaInterior {
  group: THREE.Group;
  seats: InteriorSeat[];
  dispose(): void;
}

const innerHalfWidth = (x: number) => Math.max(0, 0.984 * ertigaPlanHalfWidth(x) - 0.085);

function clothTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#eeeeee";
  ctx.fillRect(0, 0, size, size);
  let seed = 9173;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const weave = (x / 2 + y / 2) % 2 === 0 ? 10 : -6;
      const v = 232 + weave + (rnd() - 0.5) * 22;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  return t;
}

/** Door cards: light upper trim, dark lower, arm-rest shadow, speaker grilles, shut lines. u runs rear to front. */
function doorCardTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#d3c9b6";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#c2b7a2";
  ctx.fillRect(0, h * 0.34, w, h * 0.2); // fabric insert band
  ctx.fillStyle = "#4a5057";
  ctx.fillRect(0, h * 0.6, w, h * 0.4);
  const g = ctx.createLinearGradient(0, h * 0.52, 0, h * 0.62);
  g.addColorStop(0, "rgba(40,44,50,0)");
  g.addColorStop(1, "rgba(40,44,50,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.52, w, h * 0.1);
  const span = CABIN_FRONT_X - CABIN_BACK_X;
  const ux = (x: number) => ((x - CABIN_BACK_X) / span) * w;
  ctx.strokeStyle = "rgba(60,62,66,0.7)";
  ctx.lineWidth = 3;
  for (const x of [0.86, -0.08, -1.06]) {
    ctx.beginPath();
    ctx.moveTo(ux(x), 0);
    ctx.lineTo(ux(x), h);
    ctx.stroke();
  }
  for (const x of [0.55, -0.4]) {
    ctx.fillStyle = "#3a3f45";
    ctx.beginPath();
    ctx.arc(ux(x), h * 0.8, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2c3035";
    for (let i = 0; i < 40; i++) {
      const a = i * 2.4;
      const r = 3 + (i / 40) * 20;
      ctx.fillRect(ux(x) + Math.cos(a) * r, h * 0.8 + Math.sin(a) * r, 2, 2);
    }
  }
  for (const x of [0.3, -0.62]) {
    ctx.fillStyle = "#b9bfc4";
    ctx.beginPath();
    ctx.roundRect(ux(x) - 34, h * 0.26, 68, 12, 6);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildErtigaInterior(options: { castShadow?: boolean } = {}): ErtigaInterior {
  const castShadow = options.castShadow ?? true;
  const group = new THREE.Group();
  group.name = "ertiga-interior";
  const trash: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T): T => {
    trash.push(d);
    return d;
  };
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = group, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = castShadow && shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const cloth = keep(clothTexture());
  const paint = keep(new THREE.MeshPhysicalMaterial({ color: 0xcdd1cf, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }));
  const carpet = keep(new THREE.MeshStandardMaterial({ color: 0x474e55, map: cloth, roughness: 1, side: THREE.DoubleSide }));
  const rubber = keep(new THREE.MeshStandardMaterial({ color: 0x2f3439, roughness: 0.85, side: THREE.DoubleSide }));
  const charcoal = keep(new THREE.MeshStandardMaterial({ color: 0x3b4148, roughness: 0.7 }));
  const softDash = keep(new THREE.MeshStandardMaterial({ color: 0x353a40, roughness: 0.82 }));
  const beige = keep(new THREE.MeshStandardMaterial({ color: 0xcfc5b1, roughness: 0.8 }));
  const satin = keep(new THREE.MeshStandardMaterial({ color: 0xb4bac0, roughness: 0.35, metalness: 0.9 }));
  const screen = keep(new THREE.MeshStandardMaterial({ color: 0x0c2a3a, roughness: 0.12, emissive: 0x1ba3b3, emissiveIntensity: 0.25 }));
  const cardTex = keep(doorCardTexture());
  const card = keep(new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.85, side: THREE.DoubleSide }));

  /* ---- sectioned body edge (the flat cap where the roof was cut away) ---- */
  {
    const pos: number[] = [];
    const idx: number[] = [];
    const xs: number[] = [];
    for (let x = -ERTIGA_HALF_LENGTH; x < CABIN_BACK_X; x += 0.03) xs.push(x);
    xs.push(CABIN_BACK_X - 0.0005, CABIN_BACK_X);
    for (let x = CABIN_BACK_X + 0.05; x <= 1.16; x += 0.05) xs.push(x);
    for (const s of [1, -1]) {
      const base = pos.length / 3;
      xs.forEach((x, i) => {
        const zo = 0.984 * ertigaPlanHalfWidth(x);
        const zi = x < CABIN_BACK_X ? 0 : Math.max(0, zo - 0.085);
        pos.push(x, CABIN_CUT_HEIGHT, s * zo, x, CABIN_CUT_HEIGHT, s * zi);
        if (i < xs.length - 1) {
          const k = base + i * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      });
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(idx);
    add(geo, paint, group, false);
  }

  /* ---- door cards + rear wall ---- */
  {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const n = 62;
    const span = CABIN_FRONT_X - CABIN_BACK_X;
    for (const s of [1, -1]) {
      const base = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const x = CABIN_BACK_X + (span * i) / n;
        const z = s * innerHalfWidth(x);
        pos.push(x, FLOOR_Y, z, x, CABIN_CUT_HEIGHT, z);
        uv.push(i / n, 0, i / n, 1);
        if (i < n) {
          const k = base + i * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
    }
    const zb = innerHalfWidth(CABIN_BACK_X);
    const base = pos.length / 3;
    pos.push(CABIN_BACK_X, FLOOR_Y, -zb, CABIN_BACK_X, CABIN_CUT_HEIGHT, -zb, CABIN_BACK_X, FLOOR_Y, zb, CABIN_BACK_X, CABIN_CUT_HEIGHT, zb);
    uv.push(0.02, 0, 0.02, 1, 0.06, 0, 0.06, 1);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    add(geo, card, group, false);
  }

  /* ---- floor ---- */
  {
    const shape = new THREE.Shape();
    const n = 40;
    const span = CABIN_FRONT_X + 0.1 - CABIN_BACK_X;
    for (let i = 0; i <= n; i++) {
      const x = CABIN_BACK_X + (span * i) / n;
      const z = innerHalfWidth(Math.min(x, CABIN_FRONT_X));
      if (i === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }
    for (let i = n; i >= 0; i--) {
      const x = CABIN_BACK_X + (span * i) / n;
      shape.lineTo(x, -innerHalfWidth(Math.min(x, CABIN_FRONT_X)));
    }
    const geo = keep(new THREE.ShapeGeometry(shape));
    geo.rotateX(Math.PI / 2);
    geo.translate(0, FLOOR_Y, 0);
    add(geo, carpet, group, false);
  }

  /* ---- dashboard ---- */
  {
    const half = innerHalfWidth(CABIN_FRONT_X);
    const prof = new THREE.Shape();
    prof.moveTo(1.16, 0.955);
    prof.lineTo(0.78, 0.965);
    prof.quadraticCurveTo(0.64, 0.96, 0.63, 0.86);
    prof.lineTo(0.68, 0.64);
    prof.lineTo(0.82, 0.5);
    prof.lineTo(1.16, 0.5);
    const geo = keep(new THREE.ExtrudeGeometry(prof, { depth: half * 2, bevelEnabled: false, curveSegments: 10 }));
    geo.translate(0, 0, -half);
    add(geo, softDash);
    // windscreen-base trim: also hides the shallow slice line where the cut meets the bonnet
    const cowl = keep(new RoundedBoxGeometry(0.2, 0.035, half * 2 + 0.12, 2, 0.015));
    add(cowl, charcoal, group, false).position.set(1.14, 0.965, 0);
    // lower trim on the passenger side (glovebox)
    const glove = keep(new RoundedBoxGeometry(0.05, 0.2, 0.52, 2, 0.02));
    const gb = add(glove, beige);
    gb.position.set(0.665, 0.7, -0.4);
    gb.rotation.z = -0.22;
    // centre touchscreen
    const scr = keep(new RoundedBoxGeometry(0.02, 0.13, 0.24, 2, 0.008));
    const sm = add(scr, screen, group, false);
    sm.position.set(0.625, 0.86, 0);
    sm.rotation.z = -0.12;
    // instrument hood in front of the driver
    const hood = keep(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 20, 1, false, 0, Math.PI));
    hood.rotateZ(Math.PI / 2); // dome up
    hood.rotateY(Math.PI / 2); // axis across the car
    const hm = add(hood, softDash);
    hm.scale.set(1, 0.42, 1);
    hm.position.set(0.78, 0.955, 0.37);
    // vents
    const vent = keep(new RoundedBoxGeometry(0.02, 0.05, 0.14, 2, 0.008));
    for (const z of [-0.62, -0.2, 0.2, 0.64]) {
      const v = add(vent, charcoal, group, false);
      v.position.set(0.628, 0.9, z);
    }
  }

  /* ---- steering wheel (right-hand drive) ---- */
  {
    const wheel = new THREE.Group();
    const rim = keep(new THREE.TorusGeometry(0.18, 0.017, 10, 36));
    add(rim, charcoal, wheel);
    const hub = keep(new THREE.CylinderGeometry(0.055, 0.06, 0.04, 20));
    const hubM = add(hub, charcoal, wheel);
    hubM.rotation.x = Math.PI / 2;
    const spoke = keep(new THREE.BoxGeometry(0.17, 0.028, 0.014));
    for (const a of [0, Math.PI, -Math.PI / 2]) {
      const sp = add(spoke, charcoal, wheel, false);
      sp.position.set(Math.cos(a) * 0.095, Math.sin(a) * 0.095, 0);
      sp.rotation.z = a;
    }
    const badge = keep(new THREE.CircleGeometry(0.03, 16));
    const bm = add(badge, satin, wheel, false);
    bm.position.z = 0.022;
    const column = keep(new THREE.CylinderGeometry(0.028, 0.034, 0.3, 12));
    const cm = add(column, charcoal, wheel, false);
    cm.rotation.x = Math.PI / 2;
    cm.position.z = -0.15;
    wheel.position.set(0.5, 0.88, 0.37);
    wheel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-0.9, 0.44, 0).normalize());
    group.add(wheel);
  }

  /* ---- centre console, gear lever, handbrake ---- */
  {
    const cons = keep(new RoundedBoxGeometry(0.78, 0.2, 0.19, 2, 0.03));
    const c = add(cons, charcoal);
    c.position.set(0.27, FLOOR_Y + 0.1, 0);
    const boot = keep(new THREE.CylinderGeometry(0.02, 0.05, 0.07, 12));
    const b = add(boot, rubber);
    b.position.set(0.44, FLOOR_Y + 0.23, 0);
    const stick = keep(new THREE.CylinderGeometry(0.009, 0.011, 0.15, 8));
    const st = add(stick, satin);
    st.position.set(0.435, FLOOR_Y + 0.32, 0);
    st.rotation.z = 0.12;
    const knob = keep(new THREE.SphereGeometry(0.03, 16, 12));
    const kn = add(knob, charcoal);
    kn.position.set(0.425, FLOOR_Y + 0.405, 0);
    kn.scale.set(1, 1.15, 1);
    const brake = keep(new RoundedBoxGeometry(0.24, 0.035, 0.04, 2, 0.015));
    const hb = add(brake, charcoal);
    hb.position.set(0.12, FLOOR_Y + 0.24, 0.035);
    hb.rotation.z = 0.2;
  }

  /* ---- rear wheel-arch trims ---- */
  {
    const trim = keep(new RoundedBoxGeometry(0.86, 0.42, 0.34, 3, 0.1));
    for (const s of [1, -1]) {
      const t = add(trim, beige);
      t.position.set(-1.4, FLOOR_Y + 0.2, s * 0.64);
    }
  }

  /* ---- seats ---- */
  const postGeo = keep(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6));
  const headGeo = keep(new RoundedBoxGeometry(0.11, 0.19, 0.27, 3, 0.045));
  const bagGeo = keep(new RoundedBoxGeometry(0.3, 0.17, 0.24, 3, 0.06));
  const strapGeo = keep(new THREE.TorusGeometry(0.07, 0.009, 6, 16, Math.PI));
  const bagMat = keep(new THREE.MeshStandardMaterial({ color: 0x0c6478, map: cloth, roughness: 0.9 }));
  const strapMat = keep(new THREE.MeshStandardMaterial({ color: 0xe8600f, roughness: 0.8 }));
  const matGeo = keep(new RoundedBoxGeometry(0.4, 0.012, 0.36, 2, 0.006));
  const hitMat = keep(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  const seatGeos = new Map<string, { cushion: THREE.BufferGeometry; cIns: THREE.BufferGeometry; base: THREE.BufferGeometry; back: THREE.BufferGeometry; bIns: THREE.BufferGeometry; hit: THREE.BufferGeometry }>();
  const geosFor = (w: number, depth: number, backH: number) => {
    const key = `${w}-${depth}-${backH}`;
    let g = seatGeos.get(key);
    if (!g) {
      g = {
        cushion: keep(new RoundedBoxGeometry(depth, 0.15, w, 4, 0.06)),
        cIns: keep(new RoundedBoxGeometry(depth - 0.13, 0.04, w - 0.16, 2, 0.018)),
        base: keep(new THREE.BoxGeometry(depth - 0.1, 0.2, w - 0.08)),
        back: keep(new RoundedBoxGeometry(0.14, backH, w, 4, 0.06)),
        bIns: keep(new RoundedBoxGeometry(0.04, backH - 0.17, w - 0.16, 2, 0.018)),
        hit: keep(new THREE.BoxGeometry(depth + 0.16, backH + 0.62, w + 0.03)),
      };
      seatGeos.set(key, g);
    }
    return g;
  };

  const makeSeat = (x: number, z: number, w: number, depth: number, backH: number, seat: number): InteriorSeat => {
    const g = geosFor(w, depth, backH);
    const fabric = keep(new THREE.MeshStandardMaterial({ color: 0xd8ccb6, map: cloth, bumpMap: cloth, bumpScale: 0.6, roughness: 0.95 }));
    const insert = keep(new THREE.MeshStandardMaterial({ color: 0xe9e0cf, map: cloth, bumpMap: cloth, bumpScale: 0.8, roughness: 0.9 }));
    const sg = new THREE.Group();
    sg.position.set(x, FLOOR_Y, z);
    add(g.base, charcoal, sg, false).position.set(0.01, 0.1, 0);
    add(g.cushion, fabric, sg).position.set(0.02, 0.26, 0);
    add(g.cIns, insert, sg, false).position.set(0.035, 0.322, 0);
    const back = new THREE.Group();
    back.position.set(-depth / 2 + 0.05, 0.3, 0);
    back.rotation.z = 0.2;
    add(g.back, fabric, back).position.set(0, backH / 2, 0);
    add(g.bIns, insert, back, false).position.set(0.058, backH / 2 - 0.01, 0);
    for (const pz of [-0.07, 0.07]) add(postGeo, satin, back, false).position.set(0, backH + 0.04, pz);
    add(headGeo, fabric, back).position.set(0.012, backH + 0.16, 0);
    sg.add(back);
    const bag = new THREE.Group();
    add(bagGeo, bagMat, bag);
    const strap = add(strapGeo, strapMat, bag, false);
    strap.position.y = 0.075;
    bag.position.set(0.04, 0.42, 0);
    bag.rotation.y = 0.35;
    bag.visible = false;
    sg.add(bag);
    const hit = new THREE.Mesh(g.hit, hitMat);
    hit.position.set(-0.05, (backH + 0.62) / 2, 0);
    hit.userData.seat = seat;
    sg.add(hit);
    // floor mat in the footwell
    const mat = add(matGeo, rubber, group, false);
    mat.position.set(x + depth / 2 + 0.2, FLOOR_Y + 0.006, z);
    mat.scale.z = Math.min(1, w / 0.4);
    group.add(sg);
    const lean = Math.sin(0.2) * (backH + 0.3);
    return { seat, group: sg, fabric, insert, bag, hit, anchor: new THREE.Vector3(x - depth / 2 + 0.05 - lean, FLOOR_Y + 0.3 + backH + 0.42, z) };
  };

  // driver (not bookable): darker trim, on the right
  const driver = makeSeat(0.2, 0.37, 0.48, 0.5, 0.62, 0);
  driver.fabric.color.set(0x56616b);
  driver.insert.color.set(0x626e79);
  driver.hit.visible = false;

  const seats: InteriorSeat[] = [
    makeSeat(0.2, -0.37, 0.48, 0.5, 0.62, 1),
    makeSeat(-0.68, -0.44, 0.43, 0.48, 0.58, 2),
    makeSeat(-0.68, 0, 0.4, 0.48, 0.56, 3),
    makeSeat(-0.68, 0.44, 0.43, 0.48, 0.58, 4),
    makeSeat(-1.5, -0.25, 0.44, 0.42, 0.52, 5),
    makeSeat(-1.5, 0.25, 0.44, 0.42, 0.52, 6),
  ];

  return {
    group,
    seats,
    dispose() {
      for (const d of trash) d.dispose();
    },
  };
}
