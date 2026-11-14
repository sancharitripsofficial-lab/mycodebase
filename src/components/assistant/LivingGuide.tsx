"use client";

import { useEffect, useRef } from "react";
import type { GuideEmotion } from "@/lib/assistant/types";
import styles from "./assistant.module.css";

/**
 * Brings the cut-out guide to life in real time (WebGL, a few hundred pixels, very light):
 *  - 3D: a depth layer is built from his silhouette (head nearest), so when he turns his head and
 *    shoulders shift with real parallax instead of a flat tilt.
 *  - Unpredictable: every few seconds he picks a different small action (glance, nod, lean in,
 *    settle, curious tilt, look at you), never a fixed loop.
 *  - Aware: on a computer he turns toward the mouse; the chat's mood changes how he behaves.
 *  - Breathes all the time.
 * Shows nothing (the still picture stays) without WebGL, with reduced motion, or on Save-Data.
 */

const VERT = `
attribute vec2 p;
varying vec2 v;
void main() { v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
varying vec2 v;
uniform sampler2D img;
uniform sampler2D dep;
uniform vec2 look;      // where he looks: x = turn, y = up/down
uniform float roll;     // head tilt (radians)
uniform float lift;     // whole-body bounce (uv units)
uniform float breathe;  // 0..1
uniform float lean;     // >0 leans toward the viewer (scale)
uniform vec4 fit;       // image rect inside the canvas: x, y, w, h (uv units, y up)
vec2 toImg(vec2 c) { return vec2((c.x - fit.x) / fit.z, 1.0 - (c.y - fit.y) / fit.w); }
void main() {
  vec2 c = v;
  c.y -= lift;
  // lean + breathing: scale around the bottom centre (where his body meets the floor)
  float s = 1.0 + lean + breathe * 0.012;
  c = vec2(0.5, fit.y) + (c - vec2(0.5, fit.y)) / s;
  // tilt around the neck
  vec2 neck = vec2(0.5, fit.y + fit.w * 0.42);
  float cr = cos(roll), sr = sin(roll);
  vec2 d = c - neck;
  c = neck + vec2(cr * d.x - sr * d.y, sr * d.x + cr * d.y);
  // parallax: near parts (head) move more than far parts (shoulder edges)
  vec2 uv = toImg(c);
  float z = texture2D(dep, uv).r;
  uv = toImg(c - look * (z - 0.35) * 0.06);
  z = texture2D(dep, uv).r;
  uv = toImg(c - look * (z - 0.35) * 0.06);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0); return; }
  gl_FragColor = texture2D(img, uv);
}`;

type Act = { look: [number, number]; roll: number; lean: number; hold: number };

/** Small actions he picks from at random; mood decides which and how often. */
function nextAct(emotion: GuideEmotion, rnd: () => number): Act {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const j = (a: number) => (rnd() - 0.5) * a;
  switch (emotion) {
    case "thinking":
      return pick([
        { look: [-0.55 + j(0.2), 0.45 + j(0.15)], roll: -0.05, lean: 0, hold: 1.6 + rnd() },
        { look: [0.4 + j(0.2), 0.35], roll: 0.04, lean: 0, hold: 1.2 + rnd() },
      ]);
    case "listening":
      return pick([
        { look: [j(0.25), -0.15], roll: 0.09 + j(0.04), lean: 0.035, hold: 1.4 + rnd() },
        { look: [j(0.2), -0.3], roll: -0.06, lean: 0.03, hold: 0.9 },
      ]);
    case "talking":
      return { look: [j(0.5), -0.1 + j(0.25)], roll: j(0.08), lean: 0.015, hold: 0.6 + rnd() * 0.7 };
    case "happy":
      return { look: [j(0.7), 0.2 + j(0.2)], roll: j(0.12), lean: 0.02, hold: 0.7 + rnd() * 0.5 };
    case "sorry":
      return { look: [j(0.2), -0.5], roll: j(0.05), lean: -0.01, hold: 1.8 + rnd() };
    case "pointing":
      return { look: [0.55, -0.35], roll: 0.05, lean: 0.02, hold: 1.5 };
    case "wave":
      return { look: [j(0.3), 0.05], roll: j(0.1), lean: 0.02, hold: 0.8 + rnd() * 0.5 };
    default:
      return pick([
        { look: [0, 0], roll: 0, lean: 0, hold: 2 + rnd() * 2.5 }, // looks at you
        { look: [-0.7 + j(0.2), j(0.2)], roll: -0.03, lean: 0, hold: 1.2 + rnd() * 1.5 }, // glance left
        { look: [0.7 + j(0.2), j(0.2)], roll: 0.03, lean: 0, hold: 1.2 + rnd() * 1.5 }, // glance right
        { look: [j(0.2), -0.45], roll: 0, lean: 0.01, hold: 0.5 }, // nod
        { look: [j(0.3), 0.15], roll: (rnd() < 0.5 ? -1 : 1) * 0.09, lean: 0.02, hold: 1.4 + rnd() }, // curious tilt
        { look: [j(0.2), 0.1], roll: 0, lean: 0.035, hold: 1 + rnd() }, // leans in
      ]);
  }
}

/** Builds a soft depth map from the picture's silhouette: inside the body is nearer, the head nearest. */
function depthFrom(img: HTMLImageElement): HTMLCanvasElement {
  const N = 96;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, N, N);
  const src = ctx.getImageData(0, 0, N, N);
  const a = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) a[i] = src.data[i * 4 + 3] / 255;
  // two box blurs ~ rounded body
  const blur = (f: Float32Array, r: number) => {
    const t = new Float32Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = x + k;
          if (xx >= 0 && xx < N) { s += f[y * N + xx]; n++; }
        }
        t[y * N + x] = s / n;
      }
    const o = new Float32Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) {
          const yy = y + k;
          if (yy >= 0 && yy < N) { s += t[yy * N + x]; n++; }
        }
        o[y * N + x] = s / n;
      }
    return o;
  };
  const b = blur(blur(a, 6), 6);
  // where is the head? the top of the silhouette
  let top = 0;
  outer: for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (a[y * N + x] > 0.5) { top = y; break outer; }
  const out = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const hx = (x - N / 2) / (N * 0.24);
      const hy = (y - (top + N * 0.22)) / (N * 0.26);
      const head = Math.max(0, 1 - (hx * hx + hy * hy));
      const z = Math.min(1, b[i] * 0.75 + head * 0.45 * a[i]);
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = Math.round(z * 255);
      out.data[i * 4 + 3] = 255;
    }
  ctx.putImageData(out, 0, 0);
  return c;
}

export function LivingGuide({
  src,
  emotion,
  paused,
  onLive,
}: {
  src: string;
  emotion: GuideEmotion;
  paused: boolean;
  /** Called with true once he is moving (the still picture can hide), false if he can't. */
  onLive: (live: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const emotionRef = useRef(emotion);
  const pausedRef = useRef(paused);
  emotionRef.current = emotion;
  pausedRef.current = paused;
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onLiveRef.current(false); // the still picture shows until this one is moving
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return onLiveRef.current(false);

    let disposed = false;
    let raf = 0;
    // The browser can drop WebGL (low memory): then the still picture simply shows again.
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      onLiveRef.current(false);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    if (gl.isContextLost()) return;
    const img = new Image();
    img.decoding = "async";
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";

    const compile = (type: number, code: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, code);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return onLiveRef.current(false);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uLook = u("look"), uRoll = u("roll"), uLift = u("lift"), uBreathe = u("breathe"), uLean = u("lean"), uFit = u("fit");

    const texture = (unit: number, source: TexImageSource) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    };

    // ---------- behaviour ----------
    let seed = (Math.random() * 1e9) | 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) | 0) >>> 0) / 4294967296;
    const cur = { x: 0, y: 0, roll: 0, lean: 0, lift: 0 };
    const vel = { x: 0, y: 0, roll: 0, lean: 0, lift: 0 };
    let act: Act = nextAct(emotionRef.current, rnd);
    let actUntil = 0;
    let lastEmotion = emotionRef.current;
    let pointer: { x: number; y: number; at: number } | null = null;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const onPointer = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY, at: performance.now() };
    };
    if (finePointer) window.addEventListener("pointermove", onPointer, { passive: true });

    let visible = true;
    const io = new IntersectionObserver((es) => {
      visible = es.some((x) => x.isIntersecting);
    });
    io.observe(canvas);

    let last = performance.now();
    let shownOnce = false;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (pausedRef.current || !visible || document.visibilityState !== "visible") return;

      // size (DPR-aware, small)
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.round(rect.width * dpr));
      const h = Math.max(2, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      // the square picture, contained and standing on the bottom edge
      const side = Math.min(w, h);
      gl.uniform4f(uFit, (w - side) / 2 / w, 0, side / w, side / h);
      if (side !== sharpSide) uploadSharp(side);

      // mood changed: react right away
      const emo = emotionRef.current;
      const t = now / 1000;
      if (emo !== lastEmotion) {
        lastEmotion = emo;
        actUntil = 0;
      }
      if (t > actUntil) {
        act = nextAct(emo, rnd);
        actUntil = t + act.hold;
      }
      let tx = act.look[0];
      let ty = act.look[1];
      // a computer mouse nearby: he looks at it for a few seconds
      if (pointer && now - pointer.at < 3000) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height * 0.35;
        tx = Math.max(-1, Math.min(1, (pointer.x - cx) / 420));
        ty = Math.max(-0.8, Math.min(0.8, (cy - pointer.y) / 420));
      }
      // talking: slow, gentle nods; happy: a soft lift (no fast bobbing, nothing that reads as shaking)
      const talk = emo === "talking" ? Math.sin(t * 3.2) * 0.035 : 0;
      const bounce = emo === "happy" ? 0.012 * (0.5 - 0.5 * Math.cos(t * 3.6)) : 0;

      // Critically damped easing: every move eases in and settles without overshoot or wobble.
      const spring = (k: keyof typeof cur, target: number, stiff = 9) => {
        const damp = 2 * Math.sqrt(stiff);
        vel[k] += ((target - cur[k]) * stiff - vel[k] * damp) * dt;
        cur[k] += vel[k] * dt;
      };
      spring("x", tx);
      spring("y", ty + talk);
      spring("roll", act.roll + Math.sin(t * 0.45) * 0.01);
      spring("lean", act.lean, 6);
      spring("lift", bounce, 20);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uLook, cur.x, cur.y);
      gl.uniform1f(uRoll, cur.roll);
      gl.uniform1f(uLean, cur.lean);
      gl.uniform1f(uLift, cur.lift);
      gl.uniform1f(uBreathe, 0.5 + 0.5 * Math.sin(t * 1.6));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // Only now does the still picture step aside: never an empty moment.
      if (!shownOnce) {
        shownOnce = true;
        onLiveRef.current(true);
      }
    };

    // Sharp at any size: the picture is resized by the browser's high-quality scaler to exactly the
    // pixels it fills on screen (1 picture pixel = 1 screen pixel), never stretched by the GPU.
    let sharpSide = 0;
    const sharp = document.createElement("canvas");
    const uploadSharp = (side: number) => {
      sharpSide = side;
      const px = Math.max(8, Math.min(1024, side));
      sharp.width = sharp.height = px;
      const c2 = sharp.getContext("2d")!;
      c2.imageSmoothingEnabled = true;
      c2.imageSmoothingQuality = "high";
      c2.clearRect(0, 0, px, px);
      c2.drawImage(img, 0, 0, px, px);
      texture(0, sharp);
    };

    img.onload = () => {
      if (disposed) return;
      try {
        texture(0, img);
        texture(1, depthFrom(img));
        gl.uniform1i(u("img"), 0);
        gl.uniform1i(u("dep"), 1);
        raf = requestAnimationFrame(frame);
      } catch {
        onLiveRef.current(false); // e.g. a picture from another site without CORS
      }
    };
    img.onerror = () => onLiveRef.current(false);
    img.src = src;

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      if (finePointer) window.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("webglcontextlost", onLost);
      // The context is not force-lost here: a quick re-run (React dev mode, a new picture) reuses it.
    };
  }, [src]);

  return <canvas ref={canvasRef} className={`${styles.layer} ${styles.living}`} aria-hidden="true" />;
}
