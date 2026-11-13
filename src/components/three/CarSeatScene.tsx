"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildErtiga } from "./ertigaModel";
import { CABIN_CUT_HEIGHT, buildErtigaInterior } from "./ertigaInterior";

export type SeatVisualState = "available" | "yours" | "taken" | "off" | "loading";
export type CarSeatSceneStatus = "ready" | "lost" | "slow" | "failed";

export interface CarSeatSceneProps {
  /** State of seats 1..6, in order. */
  states: SeatVisualState[];
  /** Which seats respond to taps (index 0 = seat 1). */
  tappable: boolean[];
  /** Seat whose hidden button has keyboard focus, or null. */
  focusSeat: number | null;
  onSeat: (seat: number) => void;
  onStatus: (status: CarSeatSceneStatus) => void;
  className?: string;
}

const FABRIC: Record<SeatVisualState, [number, number]> = {
  available: [0xd9ceb9, 0xebe3d3],
  yours: [0xcc4a04, 0xe25c0a],
  taken: [0x66747f, 0x74828d],
  off: [0xb3b8bb, 0xbcc1c4],
  loading: [0xcfd4d6, 0xd9dddf],
};

const LABEL_BASE =
  "pointer-events-none absolute left-0 top-0 flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold leading-4 shadow-[0_4px_12px_-4px_rgba(14,94,143,0.45)] will-change-transform";
const LABEL_STATE: Record<SeatVisualState, string> = {
  available: "border-[#1BA3B3] bg-[#FFFEFC] text-[#0F2A3D]",
  yours: "border-[#E8600F] bg-[#E8600F] text-white",
  taken: "border-[#6F808C] bg-[#6F808C] text-white",
  off: "border-[#C5CDD2] bg-[#EEF2F4] text-[#8496A2]",
  loading: "border-[#C5CDD2] bg-[#FFFEFC] text-[#8496A2]",
};

function labelText(seat: number, state: SeatVisualState): string {
  if (state === "yours") return `✓ ${seat}`;
  if (state === "loading") return "…";
  return String(seat);
}

/** The WebGL part of the 3D seat picker: cutaway MPV, cabin, seat states, tap / hover handling. */
export function CarSeatScene({ states, tappable, focusSeat, onSeat, onStatus, className }: CarSeatSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const live = useRef({ states, tappable, focusSeat, onSeat, onStatus, dirty: true });
  useEffect(() => {
    const l = live.current;
    l.dirty = l.dirty || l.states.join() !== states.join();
    l.states = states;
    l.tappable = tappable;
    l.focusSeat = focusSeat;
    l.onSeat = onSeat;
    l.onStatus = onStatus;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const L = live.current;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const phone = coarse || window.innerWidth < 640;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;opacity:0;transition:opacity 500ms ease-out;";
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "default" });
    } catch {
      L.onStatus("failed");
      return;
    }
    host.prepend(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.7;
    roomEnv.dispose();
    pmrem.dispose();

    // One soft key light from the front-left, high up: calm showroom daylight
    const key = new THREE.DirectionalLight(0xfff4e6, 1.75);
    key.position.set(2.5, 6.5, -3.2);
    key.target.position.set(-0.3, 0.4, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
    key.shadow.camera.left = -3.2;
    key.shadow.camera.right = 3.2;
    key.shadow.camera.top = 3.2;
    key.shadow.camera.bottom = -3.2;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 16;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 5;
    key.shadow.autoUpdate = false; // static scene: refreshed only when a seat changes
    scene.add(key, key.target);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd8dc, 0.35));

    const car = buildErtiga({ detail: phone ? "low" : "high", cutHeight: CABIN_CUT_HEIGHT, anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
    car.setHeadlights(0.25);
    car.setSteer(0.18);
    const interior = buildErtigaInterior();
    car.body.add(interior.group);
    scene.add(car.group);

    const floorGeo = new THREE.PlaneGeometry(12, 12);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.ShadowMaterial({ color: 0x0e5e8f, opacity: 0.13 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = 0.004;
    floor.receiveShadow = true;
    scene.add(floor);

    /* ---- seat state ---- */
    const cFab = interior.seats.map((s) => s.fabric.color.clone());
    const cIns = interior.seats.map((s) => s.insert.color.clone());
    const press = interior.seats.map(() => 0);
    const glow = interior.seats.map(() => 0);
    const teal = new THREE.Color(0x1ba3b3);
    const orange = new THREE.Color(0xff8a3d);
    const tmp = new THREE.Color();
    let hover = -1;
    const applyStates = () => {
      interior.seats.forEach((s, i) => {
        const st = L.states[i] ?? "off";
        cFab[i].setHex(FABRIC[st][0]);
        cIns[i].setHex(FABRIC[st][1]);
        s.bag.visible = st === "taken";
        const el = labelRefs.current[i];
        if (el) {
          el.className = `${LABEL_BASE} ${LABEL_STATE[st]}`;
          el.textContent = labelText(s.seat, st);
        }
      });
      key.shadow.needsUpdate = true;
    };

    /* ---- camera ---- */
    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 60);
    const target = new THREE.Vector3(-0.15, 0.55, 0);
    const AZ0 = THREE.MathUtils.degToRad(36);
    const EL = THREE.MathUtils.degToRad(50);
    let baseDist = 10;
    let orbit = 0;
    let orbitTarget = 0;
    const fitPts: THREE.Vector3[] = [];
    for (const z of [-0.87, 0.87]) {
      for (const x of [-2.15, 1.75]) fitPts.push(new THREE.Vector3(x, 0.1, z));
      for (const x of [-2.1, 1.05]) fitPts.push(new THREE.Vector3(x, CABIN_CUT_HEIGHT, z));
    }
    fitPts.push(new THREE.Vector3(2.2, 0.5, 0));
    for (const s of interior.seats) fitPts.push(s.anchor.clone().setY(s.anchor.y + 0.14));
    const place = (az: number, el: number, dist: number) => {
      // behind the car and to its left: the car's left is the viewer's left, the bonnet points away
      camera.position.set(target.x - Math.cos(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z - Math.sin(az) * Math.cos(el) * dist);
      camera.lookAt(target);
      camera.updateMatrixWorld();
    };
    const proj = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const fit = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      target.set(-0.15, 0.55, 0);
      baseDist = 12;
      // centre the car in the frame, then move in until it fills it
      for (let iter = 0; iter < 6; iter++) {
        place(AZ0, EL, baseDist);
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const p of fitPts) {
          proj.copy(p).project(camera);
          minX = Math.min(minX, proj.x);
          maxX = Math.max(maxX, proj.x);
          minY = Math.min(minY, proj.y);
          maxY = Math.max(maxY, proj.y);
        }
        const halfH = baseDist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        right.setFromMatrixColumn(camera.matrixWorld, 0);
        up.setFromMatrixColumn(camera.matrixWorld, 1);
        target.addScaledVector(right, ((minX + maxX) / 2) * halfH * camera.aspect).addScaledVector(up, ((minY + maxY) / 2 + 0.03) * halfH);
        baseDist *= Math.max((maxX - minX) / 2 / 0.93, (maxY - minY) / 2 / 0.86);
      }
    };

    /* ---- pointer: tap to pick, hover on desktop, horizontal drag for a small orbit ---- */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hits = interior.seats.map((s) => s.hit);
    const centres = interior.seats.map((s) => new THREE.Vector3(s.group.position.x - 0.1, s.group.position.y + 0.5, s.group.position.z));
    /** Seat under the pointer. Rows overlap on screen, so of all seats the ray passes through, the one whose middle is nearest the pointer wins. */
    const seatAt = (cx: number, cy: number): number => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      let best = -1;
      let bestD = Infinity;
      for (const hit of ray.intersectObjects(hits, false)) {
        const i = (hit.object.userData.seat as number) - 1;
        proj.copy(centres[i]).project(camera);
        const d = Math.hypot((proj.x - ndc.x) * r.width, (proj.y - ndc.y) * r.height);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };
    let down: { x: number; y: number; t: number; orbit: number; id: number; dragging: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, t: performance.now(), orbit: orbitTarget, id: e.pointerId, dragging: false };
    };
    const onMove = (e: PointerEvent) => {
      if (down && e.pointerId === down.id) {
        const dx = e.clientX - down.x;
        const dy = e.clientY - down.y;
        if (!down.dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.6) down.dragging = true;
        if (down.dragging) orbitTarget = THREE.MathUtils.clamp(down.orbit + dx * 0.006, -0.5, 0.5);
        return;
      }
      if (e.pointerType === "mouse") {
        const i = seatAt(e.clientX, e.clientY);
        hover = i >= 0 && L.tappable[i] ? i : -1;
        canvas.style.cursor = hover >= 0 ? "pointer" : "";
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      const d = down;
      down = null;
      if (d.dragging || performance.now() - d.t > 700 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
      const i = seatAt(e.clientX, e.clientY);
      if (i >= 0 && L.tappable[i]) {
        press[i] = 1;
        L.onSeat(i + 1);
      }
    };
    const onCancel = () => {
      down = null;
    };
    const onLeave = () => {
      hover = -1;
      canvas.style.cursor = "";
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerleave", onLeave);

    /* ---- loop ---- */
    let raf = 0;
    let running = false;
    let last = 0;
    let time = 0;
    let frames = 0;
    let ready = false;
    let lost = false;
    let inView = true;
    let acc = 0;
    let accN = 0;
    let slowWindows = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const rawDt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      const dt = Math.min(0.05, rawDt);
      time += dt;
      if (L.dirty) {
        L.dirty = false;
        applyStates();
      }
      const ease = 1 - Math.exp(-dt * 9);
      let moving = false;
      interior.seats.forEach((s, i) => {
        const st = L.states[i] ?? "off";
        s.fabric.color.lerp(cFab[i], ease);
        s.insert.color.lerp(cIns[i], ease);
        const want = i === hover || L.focusSeat === i + 1 ? 1 : 0;
        glow[i] += (want - glow[i]) * ease;
        if (st === "yours") {
          tmp.copy(orange);
          s.fabric.emissive.copy(tmp);
          s.fabric.emissiveIntensity = 0.07 + 0.06 * Math.sin(time * 2.6) + glow[i] * 0.12;
        } else if (st === "loading") {
          s.fabric.emissive.setHex(0xffffff);
          s.fabric.emissiveIntensity = 0.05 + 0.05 * Math.sin(time * 3 + i);
        } else {
          s.fabric.emissive.copy(teal);
          s.fabric.emissiveIntensity = glow[i] * 0.3;
        }
        s.insert.emissive.copy(s.fabric.emissive);
        s.insert.emissiveIntensity = s.fabric.emissiveIntensity;
        if (press[i] > 0) {
          press[i] = Math.max(0, press[i] - dt / 0.28);
          s.group.scale.y = 1 - 0.07 * Math.sin(Math.PI * (1 - press[i]));
          moving = true;
        } else if (s.group.scale.y !== 1) s.group.scale.y = 1;
      });
      if (moving) key.shadow.needsUpdate = true;

      orbit += (orbitTarget - orbit) * (1 - Math.exp(-dt * 6));
      place(AZ0 + orbit + Math.sin(time * 0.35) * 0.03, EL + Math.sin(time * 0.27 + 1) * 0.012, baseDist * (1 + Math.sin(time * 0.22) * 0.006));
      renderer.render(scene, camera);

      // labels
      const w = host.clientWidth;
      const h = host.clientHeight;
      interior.seats.forEach((s, i) => {
        const el = labelRefs.current[i];
        if (!el) return;
        proj.copy(s.anchor).project(camera);
        const x = (proj.x * 0.5 + 0.5) * w;
        const y = (1 - (proj.y * 0.5 + 0.5)) * h;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(1 + glow[i] * 0.12).toFixed(3)})`;
        el.style.outline = L.focusSeat === i + 1 ? "2px solid #0E5E8F" : "none";
        el.style.outlineOffset = "2px";
      });

      frames++;
      if (!ready && frames >= 2) {
        ready = true;
        canvas.style.opacity = "1";
        labelRefs.current.forEach((el) => {
          if (el) el.style.opacity = "1";
        });
        L.onStatus("ready");
      }
      // Too slow to be pleasant: hand over to the 2D map. An unfocused window is throttled by the browser, so it is not judged.
      if (frames > 40 && rawDt < 0.25 && document.hasFocus()) {
        acc += rawDt;
        accN++;
        if (accN >= 40) {
          slowWindows = acc / accN > 0.05 ? slowWindows + 1 : 0;
          acc = 0;
          accN = 0;
          if (slowWindows >= 3) L.onStatus("slow");
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

    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(host);
    const io = new IntersectionObserver(([entry]) => {
      inView = !!entry && entry.isIntersecting;
      if (inView) start();
      else stop();
    });
    io.observe(host);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      stop();
      L.onStatus("lost");
    };
    canvas.addEventListener("webglcontextlost", onLost);
    L.dirty = true;
    start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("pointerleave", onLeave);
      interior.dispose();
      car.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      envTarget.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return (
    <div ref={hostRef} className={className} aria-hidden="true">
      {[1, 2, 3, 4, 5, 6].map((seat, i) => (
        <span
          key={seat}
          ref={(el) => {
            labelRefs.current[i] = el;
          }}
          className={LABEL_BASE}
          style={{ opacity: 0, transition: "opacity 400ms ease-out" }}
        />
      ))}
    </div>
  );
}
