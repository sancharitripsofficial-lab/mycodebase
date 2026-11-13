"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { RoadTripRoute } from "@/components/motion/RoadTripRoute";
import { usePrefersReducedMotion } from "@/components/motion/useMotionHooks";
import type { RoadTrip3DProps, RoadTrip3DStatus } from "./RoadTrip3D";

// three.js and the scene load as their own chunk, in the browser only, once the page is idle.
// If the chunk fails to load (flaky network), render nothing: the flat route simply stays on screen.
const RoadTrip3D = dynamic<RoadTrip3DProps>(
  () =>
    import("./RoadTrip3D")
      .then((m) => m.RoadTrip3D)
      .catch(() => {
        const Unavailable = () => null;
        return Unavailable;
      }),
  { ssr: false },
);

/** Switch the minimap back to the live 3D road (heavier: see the note in the effect below). */
const MINIMAP_3D = false;

export interface RoadTripMinimapProps {
  /** Stop names, first to last, e.g. ["Bengaluru", "Kodagu"]. Shown as "Bengaluru \u2192 Kodagu" under the map. */
  labels: string[];
  /** Optional extra caption text, e.g. "265 km \u00b7 6 h". Nothing is shown unless you pass it. */
  meta?: string;
  /** Size and position. Give it a width (the map is square; the caption sits below). */
  className?: string;
}

function webglAvailable(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Game-style minimap HUD: the live 3D "S" road seen from above inside a small glass frame, with the car
 * driving the route. Falls back to the flat animated route for reduced motion, no WebGL, a lost context
 * or a device that cannot keep up. Never captures pointer or touch input.
 */
export function RoadTripMinimap({ labels, meta, className }: RoadTripMinimapProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [armed, setArmed] = useState(false);
  const [live, setLive] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (reducedMotion || gaveUp) return;
    let cancelled = false;
    // Phones and laptops with few cores / little memory keep the flat animated route: building the
    // 3D road there would stall scrolling for a second or more.
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const capable =
      (nav.hardwareConcurrency ?? 8) >= 6 && (nav.deviceMemory ?? 8) >= 4 && !nav.connection?.saveData;
    // Measured 13 Nov: building the 3D road stalls the home page for 1.5–3 s even on fast laptops,
    // so the minimap uses the flat animated route (same S road, car driving it) everywhere.
    if (!MINIMAP_3D || !capable) return;
    const arm = () => {
      if (!cancelled && webglAvailable()) setArmed(true);
    };
    if ("requestIdleCallback" in window) {
      // Wait until the page has settled (hero film playing, first scroll done) before building the map.
      const id = window.requestIdleCallback(arm, { timeout: 3500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = setTimeout(arm, 700);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [reducedMotion, gaveUp]);

  const onStatus = useCallback((status: RoadTrip3DStatus) => {
    if (status === "ready") setLive(true);
    else if (status === "lost") setLive(false);
    else {
      setGaveUp(true);
      setLive(false);
    }
  }, []);

  const show3d = armed && !reducedMotion && !gaveUp;
  const covered = show3d && live;
  const short = labels.map((l) => l.replace(/\(.*?\)/g, "").trim());
  const route = short.length > 1 ? `${short[0]} \u2192 ${short[short.length - 1]}` : (short[0] ?? "");

  return (
    <div
      role="img"
      aria-label={`Live route map: ${short.join(" to ")}`}
      className={`pointer-events-none select-none rounded-2xl border border-white/20 p-1 md:p-1.5 ${className ?? ""}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-inset ring-white/15">
        {/* Watermark: the map is see-through and dissolves at the edges, so the hero film shows behind it. */}
        <div className="absolute inset-0 opacity-[0.72] [mask-image:radial-gradient(closest-side,#000_62%,transparent_100%)] [-webkit-mask-image:radial-gradient(closest-side,#000_62%,transparent_100%)]">
          {!covered && (
            <div className="absolute inset-0 flex items-center justify-center p-1">
              <div style={{ height: "100%", aspectRatio: "360 / 420" }}>
                <RoadTripRoute tone="onDark" />
              </div>
            </div>
          )}
          {show3d && <RoadTrip3D variant="minimap" labels={labels} className="absolute inset-0" onStatus={onStatus} />}
        </div>
        {/* compass tick */}
        <span className="absolute left-1 top-1 flex flex-col items-center text-[8px] font-bold leading-none text-white drop-shadow md:left-1.5 md:top-1.5 md:text-[10px]">
          <span aria-hidden="true" className="mb-px h-0 w-0 border-x-[3px] border-b-[5px] border-x-transparent border-b-[#FF8A3D] md:border-x-4 md:border-b-[7px]" />
          N
        </span>
        {/* live dot */}
        <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#FF8A3D] shadow-[0_0_0_3px_rgba(255,138,61,0.3)] motion-safe:animate-pulse" />
      </div>
      <p className="truncate px-0.5 pt-1 text-center text-[9px] font-semibold leading-tight tracking-wide text-white [text-shadow:0_1px_3px_rgb(10_40_30/0.7)] md:pt-1.5 md:text-xs">
        {route}
        {meta ? <span className="font-medium text-white/75"> {"\u00b7"} {meta}</span> : null}
      </p>
    </div>
  );
}
