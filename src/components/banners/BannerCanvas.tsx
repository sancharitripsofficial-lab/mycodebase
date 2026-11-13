"use client";

import { useEffect, useRef } from "react";
import { createBannerHost, type BannerFocus, type BannerHost } from "./engine";
import { SCENE_LOADERS, type BannerSceneName } from "./scenes";

interface BannerCanvasProps {
  scene: BannerSceneName;
  getFocus: (width: number, height: number) => BannerFocus;
  onReady: () => void;
  onLost: () => void;
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

    return () => {
      cancelled = true;
      host?.dispose();
      canvas.remove();
    };
  }, [scene]);

  return <div ref={holder} aria-hidden="true" className="pointer-events-none absolute inset-0" />;
}
