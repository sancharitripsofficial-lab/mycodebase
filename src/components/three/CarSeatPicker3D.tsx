"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { ErtigaSeatMap, SEAT_INFO, type ErtigaSeatMapProps } from "@/components/booking/ErtigaSeatMap";
import { usePrefersReducedMotion } from "@/components/motion/useMotionHooks";
import type { CarSeatSceneProps, CarSeatSceneStatus, SeatVisualState } from "./CarSeatScene";

/** Same contract as the 2D `ErtigaSeatMap`: this is a drop-in replacement. */
export type CarSeatPicker3DProps = ErtigaSeatMapProps;

// three.js and the cabin load as a separate chunk, in the browser only. If that chunk fails to load,
// the component renders nothing and the 2D seat map simply stays.
const CarSeatScene = dynamic<CarSeatSceneProps>(
  () =>
    import("./CarSeatScene")
      .then((m) => m.CarSeatScene)
      .catch(() => {
        const Unavailable = () => null;
        return Unavailable;
      }),
  { ssr: false },
);

const SEATS = [1, 2, 3, 4, 5, 6];
const SPOKEN: Record<number, string> = {
  1: "front, left window",
  2: "middle row, left window",
  3: "middle row, middle seat",
  4: "middle row, right window",
  5: "back row, left window",
  6: "back row, right window",
};
const STATE_SPOKEN: Record<SeatVisualState, string> = {
  available: "available",
  yours: "your seat",
  taken: "taken",
  off: "not offered on this trip",
  loading: "checking availability",
};

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

const SWATCH: Record<string, string> = {
  available: "border-[#1BA3B3] bg-[#EBE3D3]",
  yours: "border-[#E8600F] bg-[#E8600F]",
  taken: "border-[#6F808C] bg-[#8C99A3]",
  off: "border-[#C5CDD2] bg-[#DDE2E5]",
};

/**
 * Realistic 3D seat picker: a cutaway of the MPV with its cabin, seats you can tap, and a floating
 * number over each seat. The 2D `ErtigaSeatMap` is shown while the 3D view loads and whenever 3D is not
 * possible (no WebGL, reduced motion, lost context, a slow device, a failed download), so booking never
 * depends on it. Real, visually hidden buttons keep keyboard and screen-reader access.
 */
export function CarSeatPicker3D(props: CarSeatPicker3DProps) {
  const { takenSeats, selectedSeats, maxCapacity = 6, mode, privateCar = false, onToggleSeat, loading = false, showLegend = true, className } = props;
  const reducedMotion = usePrefersReducedMotion();
  const [armed, setArmed] = useState(false);
  const [live, setLive] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [touched2d, setTouched2d] = useState(false);
  const [focusSeat, setFocusSeat] = useState<number | null>(null);

  useEffect(() => {
    if (reducedMotion || gaveUp) return;
    let cancelled = false;
    const arm = () => {
      if (!cancelled && webglAvailable()) setArmed(true);
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(arm, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = setTimeout(arm, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [reducedMotion, gaveUp]);

  const onStatus = useCallback((status: CarSeatSceneStatus) => {
    if (status === "ready") setLive(true);
    else {
      // lost context, too slow, or failed: stay on the 2D map for the rest of this visit
      setGaveUp(true);
      setLive(false);
    }
  }, []);

  const cap = Math.max(0, Math.min(6, Math.floor(maxCapacity)));
  const pick = mode === "pick";
  const stateOf = (seat: number): SeatVisualState => {
    if (seat > cap) return "off";
    if (loading) return "loading";
    if (privateCar) return "yours";
    if (takenSeats.includes(seat)) return "taken";
    if (selectedSeats.includes(seat)) return "yours";
    return "available";
  };
  const states = SEATS.map(stateOf);
  const tappable = states.map((s) => pick && !privateCar && (s === "available" || s === "yours"));

  const want3d = armed && !reducedMotion && !gaveUp && !touched2d;
  const show3d = want3d && live;

  const onSeat = useCallback((seat: number) => onToggleSeat?.(seat), [onToggleSeat]);

  const takenCount = states.filter((s) => s === "taken").length;
  const yoursCount = states.filter((s) => s === "yours").length;
  const freeCount = states.filter((s) => s === "available").length;
  let statusMain: string;
  let statusYou = "";
  if (loading) statusMain = "Checking seats…";
  else if (privateCar) {
    statusMain = "Private car";
    statusYou = `all ${cap} seats are yours`;
  } else {
    statusMain = `${takenCount} of ${cap} seats taken`;
    statusYou = mode === "view" && yoursCount === 0 ? "" : mode === "view" ? `yours: ${yoursCount}` : `you picked ${yoursCount}`;
  }
  const summary = loading
    ? "Car seat map. Checking which seats are free."
    : privateCar
      ? `Car seat map. Private car: all ${cap} seats are yours.`
      : `Car seat map. ${takenCount} of ${cap} seats taken, ${yoursCount} picked by you, ${freeCount} available.`;

  return (
    <div className={`relative mx-auto w-full min-w-0 max-w-[420px] text-[#0F2A3D] ${className ?? ""}`}>
      {!show3d ? (
        // If someone starts picking on the 2D map before 3D is ready, keep the 2D map: nothing moves under their finger.
        <div onPointerDownCapture={() => setTouched2d(true)} onKeyDownCapture={() => setTouched2d(true)}>
          <ErtigaSeatMap {...props} className={undefined} />
        </div>
      ) : null}
      {want3d ? (
        <div
          className={
            show3d
              ? "relative h-[340px] w-full overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_50%_58%,#DDF3F4_0%,#F2F8FA_55%,#FFFEFC_100%)]"
              : "pointer-events-none absolute left-0 top-0 h-[340px] w-full overflow-hidden opacity-0"
          }
          role={show3d ? (pick ? "group" : "img") : undefined}
          aria-hidden={show3d ? undefined : true}
          aria-label={show3d ? (pick ? "Choose your seats. The car is shown from behind: the driver sits front right." : summary) : undefined}
          aria-busy={(show3d && loading) || undefined}
        >
          <CarSeatScene states={states} tappable={tappable} focusSeat={focusSeat} onSeat={onSeat} onStatus={onStatus} className="absolute inset-0 select-none" />
          {show3d && pick ? (
            <div className="sr-only">
              {SEATS.map((seat, i) => (
                <button
                  key={seat}
                  type="button"
                  aria-pressed={states[i] === "yours"}
                  aria-label={`Seat ${seat}, ${SPOKEN[seat]} — ${STATE_SPOKEN[states[i]]}`}
                  title={SEAT_INFO[seat].label}
                  disabled={!tappable[i]}
                  onFocus={() => setFocusSeat(seat)}
                  onBlur={() => setFocusSeat((cur) => (cur === seat ? null : cur))}
                  onClick={() => onToggleSeat?.(seat)}
                />
              ))}
            </div>
          ) : null}
          <p className="pointer-events-none absolute bottom-2 left-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4B6273]/80">Front ↗ · Driver on the right</p>
        </div>
      ) : null}

      {show3d && showLegend ? (
        <>
          <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs font-medium text-[#4B6273]" aria-label="Seat colours">
            {(["available", "yours", "taken", ...(cap < 6 ? ["off"] : [])] as const).map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className={`inline-block h-3.5 w-3.5 rounded-[5px] border-2 ${SWATCH[k]}`} />
                {k === "available" ? "Available" : k === "yours" ? "Your seat" : k === "taken" ? "Taken" : "Not offered"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-center text-sm font-semibold text-[#0F2A3D]" role={pick ? "status" : undefined} aria-live={pick ? "polite" : undefined}>
            {statusMain}
            {statusYou ? (
              <>
                {" • "}
                <span className="text-[#E8600F]">{statusYou}</span>
              </>
            ) : null}
          </p>
        </>
      ) : null}
    </div>
  );
}

export default CarSeatPicker3D;
