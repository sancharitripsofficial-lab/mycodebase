/**
 * Page-banner renderer running in a Web Worker on an OffscreenCanvas.
 *
 * Building a banner scene bakes terrain, shadows and noise textures pixel by pixel, which used to
 * freeze the page for one to several seconds. Here that work and every frame happen off the main
 * thread, so scrolling, taps and the rest of the page stay smooth while the banner appears.
 * The main thread (BannerCanvas) sends size, focus and visibility; this worker only draws.
 */
import * as THREE from "three";
import type { BannerFocus, BannerQuality, BannerScene } from "./engine";
import { SCENE_LOADERS, type BannerSceneName } from "./scenes";

// Scenes paint small textures with document.createElement("canvas"); in a worker that is an OffscreenCanvas.
const g = globalThis as unknown as { document?: { createElement: (tag: string) => OffscreenCanvas } };
if (!g.document) g.document = { createElement: () => new OffscreenCanvas(1, 1) };

type InMsg =
  | {
      type: "init";
      canvas: OffscreenCanvas;
      scene: BannerSceneName;
      width: number;
      height: number;
      dpr: number;
      quality: BannerQuality;
      focus: BannerFocus;
    }
  | { type: "resize"; width: number; height: number; focus: BannerFocus }
  | { type: "visible"; visible: boolean }
  | { type: "dispose" };

const post = (type: "ready" | "lost" | "failed") => (self as unknown as Worker).postMessage({ type });

const raf: (cb: FrameRequestCallback) => number =
  typeof self.requestAnimationFrame === "function"
    ? (cb) => self.requestAnimationFrame(cb)
    : (cb) => self.setTimeout(() => cb(performance.now()), 16) as unknown as number;
const caf: (id: number) => void =
  typeof self.cancelAnimationFrame === "function" ? (id) => self.cancelAnimationFrame(id) : (id) => self.clearTimeout(id);

let renderer: THREE.WebGLRenderer | null = null;
let scene: BannerScene | null = null;
let canvas: OffscreenCanvas | null = null;
let width = 1;
let height = 1;
let ratio = 1;
let visible = false;
let disposed = false;
let lost = false;
let handle = 0;
let last = 0;
let time = 0;
let announced = false;
let frames = 0;
let gapSum = 0;
let slowWindows = 0;

function frame(now: number) {
  handle = 0;
  if (disposed || lost || !scene || !renderer) return;
  const gap = last ? now - last : 16.7;
  last = now;
  const dt = Math.min(gap, 50) / 1000; // long gaps (scrolled away) must not make the scene jump
  time += dt;
  scene.update(time, dt);
  renderer.render(scene.scene, scene.camera);
  if (!announced) {
    announced = true;
    post("ready");
  }
  gapSum += gap;
  frames += 1;
  if (frames >= 60) {
    // Under 25 frames a second for two windows in a row: draw fewer pixels rather than drop frames.
    if (gapSum / frames > 40 && ratio > 1) {
      slowWindows += 1;
      if (slowWindows >= 2) {
        ratio = Math.max(1, ratio - 0.25);
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height, false);
        slowWindows = 0;
      }
    } else slowWindows = 0;
    frames = 0;
    gapSum = 0;
  }
  schedule();
}

function schedule() {
  if (handle || disposed || lost || !visible || !scene) return;
  handle = raf(frame);
}

function halt() {
  if (handle) caf(handle);
  handle = 0;
  last = 0;
}

async function init(msg: Extract<InMsg, { type: "init" }>) {
  canvas = msg.canvas;
  width = Math.max(1, msg.width);
  height = Math.max(1, msg.height);
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
  } catch {
    post("failed");
    return;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x135a4b, 1);
  ratio = Math.min(msg.dpr || 1, msg.quality === "low" ? 1.5 : 2);
  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height, false);

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    lost = true;
    halt();
    post("lost");
  });

  try {
    const factory = await SCENE_LOADERS[msg.scene]();
    if (disposed) return;
    scene = factory({
      renderer,
      quality: msg.quality,
      maxAnisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    });
    scene.resize(width, height, msg.focus);
    // Compile every shader before the first frame, in parallel where the GPU driver allows it.
    await renderer.compileAsync(scene.scene, scene.camera);
  } catch (error) {
    console.warn("[banner worker] scene could not be built", error);
    scene = null;
    post("failed");
    return;
  }
  if (disposed) return;
  schedule();
}

self.onmessage = (event: MessageEvent<InMsg>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init":
      void init(msg);
      break;
    case "resize":
      width = Math.max(1, msg.width);
      height = Math.max(1, msg.height);
      if (renderer) renderer.setSize(width, height, false);
      if (scene && renderer && !lost) {
        scene.resize(width, height, msg.focus);
        scene.update(time, 0);
        renderer.render(scene.scene, scene.camera); // never show a stretched frame
      }
      break;
    case "visible":
      visible = msg.visible;
      if (visible) schedule();
      else halt();
      break;
    case "dispose":
      disposed = true;
      halt();
      try {
        scene?.dispose();
      } catch {
        /* ignore */
      }
      scene = null;
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer = null;
      self.close();
      break;
  }
};
