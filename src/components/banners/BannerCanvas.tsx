"use client";

import { useEffect, useRef } from "react";
import { createBannerHost, pickQuality, type BannerFocus, type BannerHost, type BannerQuality } from "./engine";
import { SCENE_LOADERS, type BannerSceneName } from "./scenes";

interface BannerCanvasProps {
  scene: BannerSceneName;
  getFocus: (width: number, height: number) => BannerFocus;
  onReady: () => void;
  onLost: () => void;
}

/** Browsers that can draw WebGL from a worker (Chrome, Edge, Firefox, Safari 17+). */
function canRenderInWorker(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    "transferControlToOffscreen" in HTMLCanvasElement.prototype
  );
}

/**
 * Banner drawn by a Web Worker: the scene is built and every frame drawn off the main thread,
 * so the page never freezes while the banner's landscape is prepared. The page only reports
 * size, where the heading sits, and whether the banner is on screen.
 */
function createWorkerHost(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  scene: BannerSceneName,
  quality: BannerQuality,
  callbacks: { current: Pick<BannerCanvasProps, "getFocus" | "onReady" | "onLost"> }
): BannerHost {
  const worker = new Worker(new URL("./banner.worker.ts", import.meta.url), { type: "module" });
  const offscreen = canvas.transferControlToOffscreen();
  let width = Math.max(1, container.clientWidth);
  let height = Math.max(1, container.clientHeight);
  let onScreen = false;

  worker.onmessage = (event: MessageEvent<{ type: "ready" | "lost" | "failed" }>) => {
    if (event.data.type === "ready") callbacks.current.onReady();
    else callbacks.current.onLost();
  };
  worker.onerror = () => callbacks.current.onLost();

  worker.postMessage(
    {
      type: "init",
      canvas: offscreen,
      scene,
      width,
      height,
      dpr: window.devicePixelRatio || 1,
      quality,
      focus: callbacks.current.getFocus(width, height),
    },
    [offscreen]
  );

  const sendVisible = () => worker.postMessage({ type: "visible", visible: onScreen && !document.hidden });
  const io = new IntersectionObserver(
    (entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      sendVisible();
    },
    { rootMargin: "80px 0px" }
  );
  io.observe(container);
  document.addEventListener("visibilitychange", sendVisible);

  const ro = new ResizeObserver(() => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    if (w === width && h === height) return;
    width = w;
    height = h;
    worker.postMessage({ type: "resize", width, height, focus: callbacks.current.getFocus(width, height) });
  });
  ro.observe(container);

  return {
    dispose() {
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", sendVisible);
      worker.postMessage({ type: "dispose" });
      // Give the worker a moment to free the GPU context, then stop it for good.
      window.setTimeout(() => worker.terminate(), 1500);
    },
  };
}

/**
 * The WebGL layer of a page banner. Loaded on its own (never on the server) so three.js is
 * only downloaded once a banner is actually about to be seen.
 */
export default function BannerCanvas({ scene, getFocus, onReady, onLost }: BannerCanvasProps) {
  const holder = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ getFocus, onReady, onLost });
  useEffect(() => {
    callbacks.current = { getFocus, onReady, onLost };
  });

  useEffect(() => {
    const container = holder.current;
    if (!container) return;
    let cancelled = false;
    let host: BannerHost | null = null;
    // A fresh canvas per mount: a canvas whose context was released cannot be reused.
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "display:block;width:100%;height:100%;pointer-events:none";
    container.appendChild(canvas);

    if (canRenderInWorker()) {
      // Progressive: the light version is on screen in a few seconds; on capable screens the sharp
      // version is then prepared in a second worker and cross-fades in over it when ready.
      let sharp: { host: BannerHost; canvas: HTMLCanvasElement } | null = null;
      let upgradeTimer = 0;
      const wantSharp = pickQuality(Math.max(1, container.clientWidth)) === "high";
      const startSharp = () => {
        if (cancelled || sharp) return;
        const hi = document.createElement("canvas");
        hi.setAttribute("aria-hidden", "true");
        hi.style.cssText =
          "position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none;opacity:0;transition:opacity 900ms ease-out";
        container.appendChild(hi);
        const hiHost = createWorkerHost(hi, container, scene, "high", {
          current: {
            getFocus: (w, h) => callbacks.current.getFocus(w, h),
            onReady: () => {
              if (cancelled) return;
              hi.style.opacity = "1";
              // Once the sharp picture covers it, free the light one.
              window.setTimeout(() => {
                if (cancelled) return;
                host?.dispose();
                canvas.remove();
                host = hiHost;
                sharp = null;
              }, 1000);
            },
            onLost: () => {
              hiHost.dispose();
              hi.remove();
            },
          },
        });
        sharp = { host: hiHost, canvas: hi };
      };
      try {
        host = createWorkerHost(canvas, container, scene, "low", {
          current: {
            getFocus: (w, h) => callbacks.current.getFocus(w, h),
            onReady: () => {
              callbacks.current.onReady();
              if (wantSharp && !sharp) upgradeTimer = window.setTimeout(startSharp, 1200);
            },
            onLost: () => callbacks.current.onLost(),
          },
        });
      } catch (error) {
        console.warn("[banner] worker could not start", error);
        callbacks.current.onLost();
      }
      return () => {
        cancelled = true;
        window.clearTimeout(upgradeTimer);
        host?.dispose();
        canvas.remove();
        if (sharp) {
          sharp.host.dispose();
          sharp.canvas.remove();
        }
      };
    } else {
      // Older browsers: draw on the page itself (the scene is still built only once on screen).
      SCENE_LOADERS[scene]()
        .then((factory) => {
          if (cancelled) return;
          host = createBannerHost({
            canvas,
            container,
            factory,
            getFocus: (w, h) => callbacks.current.getFocus(w, h),
            onReady: () => callbacks.current.onReady(),
            onLost: () => callbacks.current.onLost(),
          });
          if (!host) callbacks.current.onLost();
        })
        .catch((error) => {
          console.warn("[banner] scene could not be loaded", error);
          if (!cancelled) callbacks.current.onLost();
        });
    }

    return () => {
      cancelled = true;
      host?.dispose();
      canvas.remove();
    };
  }, [scene]);

  return <div ref={holder} aria-hidden="true" className="pointer-events-none absolute inset-0" />;
}
