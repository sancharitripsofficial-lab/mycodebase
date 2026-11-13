import * as THREE from "three";

/**
 * Small render host shared by every page banner scene.
 *
 * It owns the WebGL renderer and the frame loop; a scene module only builds its objects and
 * advances them. The host pauses the loop when the banner is off screen or the tab is hidden,
 * lowers the pixel ratio when frames run long, survives a lost WebGL context and frees
 * everything on dispose.
 */

export type BannerQuality = "high" | "low";

/** Where the scene's subject should sit, as a fraction of the canvas (0,0 = top-left). */
export interface BannerFocus {
  x: number;
  y: number;
  /** True when the heading sits beside the scene (tablet / desktop), false when it sits below. */
  wide: boolean;
}

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  quality: BannerQuality;
  maxAnisotropy: number;
}

export interface BannerScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** time and dt in seconds. */
  update(time: number, dt: number): void;
  resize(width: number, height: number, focus: BannerFocus): void;
  dispose(): void;
}

export type SceneFactory = (ctx: SceneContext) => BannerScene;

export interface BannerHostOptions {
  canvas: HTMLCanvasElement;
  /** Element whose box the canvas fills and whose visibility decides whether frames are drawn. */
  container: HTMLElement;
  factory: SceneFactory;
  getFocus: (width: number, height: number) => BannerFocus;
  /** Called after the first frame has been drawn (and again after a restored context). */
  onReady: () => void;
  /** Called when WebGL is lost; the static fallback should show again. */
  onLost: () => void;
}

export interface BannerHost {
  dispose(): void;
}

export function pickQuality(width: number): BannerQuality {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  const touchPhone = window.matchMedia("(pointer: coarse)").matches && width < 900;
  return width < 640 || weak || touchPhone ? "low" : "high";
}

/** Shifts the picture so the point the camera looks at lands on `focus` instead of the centre. */
export function applyFocus(camera: THREE.PerspectiveCamera, width: number, height: number, focus: BannerFocus): void {
  camera.aspect = width / height;
  camera.setViewOffset(width, height, (0.5 - focus.x) * width, (0.5 - focus.y) * height, width, height);
  camera.updateProjectionMatrix();
}

/** Vertical field of view that keeps the horizontal one under `maxHorizontal` on very wide banners. */
export function fitFov(aspect: number, vertical: number, maxHorizontal: number): number {
  const limit = (2 * Math.atan(Math.tan((maxHorizontal * Math.PI) / 360) / aspect) * 180) / Math.PI;
  return Math.min(vertical, limit);
}

export function createBannerHost(options: BannerHostOptions): BannerHost | null {
  const { canvas, container, factory, getFocus, onReady, onLost } = options;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
  } catch {
    return null;
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Ocean blue, never black, if a frame is ever shown before the scene covers it.
  renderer.setClearColor(0x0e5e8f, 1);

  let width = Math.max(1, container.clientWidth);
  let height = Math.max(1, container.clientHeight);
  const quality = pickQuality(width);
  const maxRatio = quality === "low" ? 1.5 : 2;
  let ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height, false);

  const ctx: SceneContext = {
    renderer,
    quality,
    maxAnisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  };

  let scene: BannerScene | null = null;
  let disposed = false;
  let lost = false;
  let inView = false;
  let raf = 0;
  let last = 0;
  let time = 0;
  let announced = false;

  // Rolling timing, exposed on the canvas for tuning and tests.
  let frames = 0;
  let cpuSum = 0;
  let gapSum = 0;
  let slowWindows = 0;

  const build = () => {
    try {
      scene = factory(ctx);
      scene.resize(width, height, getFocus(width, height));
    } catch (error) {
      console.warn("[banner] scene could not be built", error);
      scene = null;
      onLost();
    }
  };

  const frame = (now: number) => {
    raf = 0;
    if (disposed || lost || !scene) return;
    const gap = last ? now - last : 16.7;
    last = now;
    // Long gaps (tab switch, scroll away) must not make the scene jump.
    const dt = Math.min(gap, 50) / 1000;
    time += dt;

    const start = performance.now();
    scene.update(time, dt);
    renderer.render(scene.scene, scene.camera);
    cpuSum += performance.now() - start;
    gapSum += gap;
    frames += 1;

    if (!announced) {
      announced = true;
      onReady();
    }

    if (frames >= 60) {
      const avgGap = gapSum / frames;
      canvas.dataset.frameMs = avgGap.toFixed(1);
      canvas.dataset.cpuMs = (cpuSum / frames).toFixed(2);
      canvas.dataset.ratio = ratio.toFixed(2);
      // Under 25 frames a second for two windows in a row: draw fewer pixels rather than drop frames.
      if (avgGap > 40 && ratio > 1) {
        slowWindows += 1;
        if (slowWindows >= 2) {
          ratio = Math.max(1, ratio - 0.25);
          renderer.setPixelRatio(ratio);
          renderer.setSize(width, height, false);
          slowWindows = 0;
        }
      } else {
        slowWindows = 0;
      }
      frames = 0;
      cpuSum = 0;
      gapSum = 0;
    }
    schedule();
  };

  const schedule = () => {
    if (raf || disposed || lost || !inView || document.hidden || !scene) return;
    raf = requestAnimationFrame(frame);
  };
  const halt = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  };

  const onVisibility = () => {
    if (document.hidden) halt();
    else schedule();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const io = new IntersectionObserver(
    (entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      if (inView) schedule();
      else halt();
    },
    { rootMargin: "80px 0px" },
  );
  io.observe(container);

  const ro = new ResizeObserver(() => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(width, height, false);
    scene?.resize(width, height, getFocus(width, height));
    // Draw straight away so a resize never shows a stretched frame.
    if (scene && !lost && !document.hidden) {
      scene.update(time, 0);
      renderer.render(scene.scene, scene.camera);
    }
  });
  ro.observe(container);

  const onContextLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    halt();
    onLost();
  };
  const onContextRestored = () => {
    if (disposed) return;
    lost = false;
    announced = false;
    try {
      scene?.dispose();
    } catch {
      /* resources died with the old context */
    }
    build();
    schedule();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  build();
  if (!scene) {
    // Nothing to show; leave the fallback in place.
    document.removeEventListener("visibilitychange", onVisibility);
    io.disconnect();
    ro.disconnect();
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    renderer.dispose();
    return null;
  }

  return {
    dispose() {
      disposed = true;
      halt();
      document.removeEventListener("visibilitychange", onVisibility);
      io.disconnect();
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      try {
        scene?.dispose();
      } catch {
        /* ignore */
      }
      scene = null;
      renderer.dispose();
      // Hand the GPU context back now rather than at garbage collection (browsers cap live contexts).
      renderer.forceContextLoss();
    },
  };
}
