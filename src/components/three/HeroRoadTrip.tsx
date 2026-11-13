"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { RoadTripRoute } from "@/components/motion/RoadTripRoute";
import { usePrefersReducedMotion } from "@/components/motion/useMotionHooks";
import type { RoadTrip3DProps, RoadTrip3DStatus } from "./RoadTrip3D";

// The 3D scene (three.js + procedural assets) is a separate chunk, fetched only in the browser after first paint.
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

export interface HeroRoadTripProps {
  /** Stop names, first to last. */
  labels: string[];
  /** Size and position of the visual. Give it a width and an aspect ratio. */
  className?: string;
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Hero visual: the flat "S" route draws first (and stays as the fallback for reduced motion, missing WebGL,
 * a lost context or a device that cannot keep up), then the live 3D road trip fades in over it.
 */
export function HeroRoadTrip({ labels, className }: HeroRoadTripProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [armed, setArmed] = useState(false);
  const [live, setLive] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [fallbackGone, setFallbackGone] = useState(false);

  useEffect(() => {
    if (reducedMotion || gaveUp) return;
    let cancelled = false;
    const arm = () => {
      if (!cancelled && webglAvailable()) setArmed(true);
    };
    // Wait for the browser to go idle so the hero text and video are never delayed.
    const idle = window.requestIdleCallback;
    if (typeof idle === "function") {
      const id = idle(arm, { timeout: 1800 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = window.setTimeout(arm, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [reducedMotion, gaveUp]);

  const onStatus = useCallback((status: RoadTrip3DStatus) => {
    if (status === "ready") {
      setLive(true);
    } else if (status === "lost") {
      setLive(false);
      setFallbackGone(false);
    } else {
      setGaveUp(true);
      setLive(false);
      setFallbackGone(false);
    }
  }, []);

  const show3d = armed && !reducedMotion && !gaveUp;
  const covered = show3d && live;

  return (
    <div className={className ? `relative ${className}` : "relative"}>
      {!(covered && fallbackGone) && (
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-700 ${covered ? "opacity-0" : "opacity-100"}`}
          aria-hidden={covered}
          onTransitionEnd={() => {
            if (covered) setFallbackGone(true);
          }}
        >
          <div style={{ height: "min(100%, 420px)", aspectRatio: "360 / 420", maxWidth: "100%" }}>
            <RoadTripRoute tone="onDark" labels={labels} />
          </div>
        </div>
      )}
      {show3d && <RoadTrip3D labels={labels} className="absolute inset-0" onStatus={onStatus} />}
    </div>
  );
}
