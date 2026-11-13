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
    const arm = () => {
      if (!cancelled && webglAvailable()) setArmed(true);
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(arm, { timeout: 1800 });
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
      className={`pointer-events-none select-none rounded-2xl border border-white/30 bg-white/10 p-1 shadow-[0_14px_34px_-14px_rgba(8,62,96,0.75)] backdrop-blur-md md:p-1.5 ${className ?? ""}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-[#0B5683]/25 ring-1 ring-inset ring-white/20">
        {!covered && (
          <div className="absolute inset-0 flex items-center justify-center p-1">
            <div style={{ height: "100%", aspectRatio: "360 / 420" }}>
              <RoadTripRoute tone="onDark" />
            </div>
          </div>
        )}
        {show3d && <RoadTrip3D variant="minimap" labels={labels} className="absolute inset-0" onStatus={onStatus} />}
        {/* compass tick */}
        <span className="absolute left-1 top-1 flex flex-col items-center text-[8px] font-bold leading-none text-white drop-shadow md:left-1.5 md:top-1.5 md:text-[10px]">
          <span aria-hidden="true" className="mb-px h-0 w-0 border-x-[3px] border-b-[5px] border-x-transparent border-b-[#FF8A3D] md:border-x-4 md:border-b-[7px]" />
          N
        </span>
        {/* live dot */}
        <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#FF8A3D] shadow-[0_0_0_3px_rgba(255,138,61,0.3)] motion-safe:animate-pulse" />
      </div>
      <p className="truncate px-0.5 pt-1 text-center text-[9px] font-semibold leading-tight tracking-wide text-white md:pt-1.5 md:text-xs">
        {route}
        {meta ? <span className="font-medium text-white/75"> {"\u00b7"} {meta}</span> : null}
      </p>
    </div>
  );
}
