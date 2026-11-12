"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import styles from "./motion.module.css";
import { prefersReducedMotionNow, useInView, usePageVisible } from "./useMotionHooks";

export interface RoadTripRouteProps {
  className?: string;
  /** Stop names, first to last, e.g. ["Bengaluru", "Chikmagalur"]. A pin drops at each one. */
  labels?: string[];
  /** Keep driving the route again and again. Default true. */
  loop?: boolean;
  /** Time for one drive from the first stop to the last, in ms. Default 9000. */
  durationMs?: number;
  /** "onDark" for the ocean-blue hero, "onLight" for the cream canvas. */
  tone?: "onDark" | "onLight";
}

/* ---- Route geometry (fixed, so the server and the browser compute identical numbers) ---- */

const VIEW_W = 360;
const VIEW_H = 420;
const ROAD_D = "M70 372 C190 372 300 350 300 280 C300 200 60 220 60 140 C60 70 170 48 290 48";
const SEGMENTS: number[][] = [
  [70, 372, 190, 372, 300, 350, 300, 280],
  [300, 280, 300, 200, 60, 220, 60, 140],
  [60, 140, 60, 70, 170, 48, 290, 48],
];
const ROAD_WIDTH = 34;
const LANE_OFFSET = 8.5; // the car keeps to the left lane, as on Indian roads

interface RoutePoint {
  x: number;
  y: number;
  /** Heading in degrees. */
  angle: number;
}

const SAMPLES: { x: number; y: number; len: number }[] = (() => {
  const out: { x: number; y: number; len: number }[] = [];
  let len = 0;
  SEGMENTS.forEach((s, si) => {
    const steps = 160;
    for (let i = si === 0 ? 0 : 1; i <= steps; i++) {
      const t = i / steps;
      const m = 1 - t;
      const x = m * m * m * s[0] + 3 * m * m * t * s[2] + 3 * m * t * t * s[4] + t * t * t * s[6];
      const y = m * m * m * s[1] + 3 * m * m * t * s[3] + 3 * m * t * t * s[5] + t * t * t * s[7];
      const last = out[out.length - 1];
      if (last) len += Math.hypot(x - last.x, y - last.y);
      out.push({ x, y, len });
    }
  });
  return out;
})();
const TOTAL_LEN = SAMPLES[SAMPLES.length - 1].len;

/** Point and heading at a fraction (0 to 1) of the road's length. */
function pointAt(fraction: number): RoutePoint {
  const target = Math.min(1, Math.max(0, fraction)) * TOTAL_LEN;
  let lo = 0;
  let hi = SAMPLES.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (SAMPLES[mid].len <= target) lo = mid;
    else hi = mid;
  }
  const a = SAMPLES[lo];
  const b = SAMPLES[hi];
  const span = b.len - a.len || 1;
  const k = (target - a.len) / span;
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

function carTransform(fraction: number): string {
  const p = pointAt(fraction);
  return `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${p.angle.toFixed(2)}) translate(0 ${-LANE_OFFSET}) scale(1.2)`;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const START_DELAY_MS = 900; // let the road draw itself first
const HOLD_MS = 1500; // pause at the destination
const FADE_MS = 450;

const PALETTE = {
  onLight: {
    road: ["#0B5683", "#1BA3B3", "#E8600F"],
    shadow: "rgba(15, 42, 61, 0.14)",
    dash: "#FFFEFC",
    label: "#0F2A3D",
    halo: "rgba(255, 254, 252, 0.92)",
    firstPin: "#0E5E8F",
    firstPinDot: "#FFFEFC",
    midPin: "#0C7A8C",
    lastPin: "#E8600F",
    compass: "#0C7A8C",
  },
  onDark: {
    road: ["#C4ECF1", "#58C7D3", "#FF9A57"],
    shadow: "rgba(8, 62, 96, 0.4)",
    dash: "#0B5683",
    label: "#FFFEFC",
    halo: "rgba(11, 86, 131, 0.55)",
    firstPin: "#FFFEFC",
    firstPinDot: "#0E5E8F",
    midPin: "#DDF3F4",
    lastPin: "#FF8A3D",
    compass: "#DDF3F4",
  },
} as const;

const PIN_D = "M0 0C-3-7-12-16-12-30A12 12 0 1 1 12-30C12-16 3-7 0 0Z";

/** Signature Sanchari animation: a winding "S" road with flowing lane dashes, pins that drop in, and a car that drives the route. */
export function RoadTripRoute({
  className,
  labels,
  loop = true,
  durationMs = 9000,
  tone = "onLight",
}: RoadTripRouteProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const carRef = useRef<SVGGElement | null>(null);
  const elapsedRef = useRef(0);
  const gradientId = `road-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const started = useInView(svgRef, { once: true, threshold: 0.2 });
  const onScreen = useInView(svgRef);
  const pageVisible = usePageVisible();
  const active = started && onScreen && pageVisible;

  const c = PALETTE[tone];
  const stopNames = labels && labels.length > 0 ? labels : null;
  const stopCount = stopNames ? stopNames.length : 2;
  const stops = Array.from({ length: stopCount }, (_, i) => {
    const p = pointAt(stopCount === 1 ? 1 : i / (stopCount - 1));
    return { x: Number(p.x.toFixed(1)), y: Number(p.y.toFixed(1)), name: stopNames?.[i] };
  });

  // Drive the car. Position is written straight to the SVG node, so React never re-renders per frame.
  useEffect(() => {
    const car = carRef.current;
    if (!car || !started) return;

    const drive = Math.max(1500, durationMs);
    const cycle = drive + HOLD_MS + FADE_MS;
    const place = (fraction: number, opacity: number) => {
      car.setAttribute("transform", carTransform(fraction));
      car.style.opacity = opacity.toFixed(3);
    };

    if (prefersReducedMotionNow()) {
      place(1, 1); // static: parked at the destination
      return;
    }
    if (!active) return;

    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (last) elapsedRef.current += Math.min(64, now - last);
      last = now;
      const t = elapsedRef.current - START_DELAY_MS;
      if (t < 0) {
        place(0, 0);
      } else if (!loop && t >= drive) {
        place(1, 1);
        return; // parked for good
      } else {
        const local = t % cycle;
        const fadeIn = Math.min(1, local / FADE_MS);
        const fadeOut = Math.min(1, Math.max(0, (cycle - local) / FADE_MS));
        place(easeInOut(Math.min(1, local / drive)), Math.min(fadeIn, loop ? fadeOut : 1));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, active, loop, durationMs]);

  const ariaLabel = stopNames
    ? `Road trip route: ${stopNames.join(" to ")}`
    : "Winding road trip route";

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={ariaLabel}
      className={className ? `${styles.route} ${className}` : styles.route}
      data-started={started ? "true" : "false"}
      data-active={active ? "true" : "false"}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="320" y2="0">
          <stop offset="0" stopColor={c.road[0]} />
          <stop offset="0.5" stopColor={c.road[1]} />
          <stop offset="1" stopColor={c.road[2]} />
        </linearGradient>
      </defs>

      {/* Soft shadow, the road itself, then the flowing centre line */}
      <path
        d={ROAD_D}
        pathLength={1}
        className={styles.routeRoad}
        fill="none"
        stroke={c.shadow}
        strokeWidth={ROAD_WIDTH}
        strokeLinecap="round"
        transform="translate(0 7)"
      />
      <path
        d={ROAD_D}
        pathLength={1}
        className={styles.routeRoad}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={ROAD_WIDTH}
        strokeLinecap="round"
      />
      <path
        d={ROAD_D}
        className={styles.routeDash}
        fill="none"
        stroke={c.dash}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeDasharray="9 13"
      />

      {/* Compass, echoing the logo */}
      <g className={styles.routeFade} transform="translate(128 296)" style={{ "--d": "700ms" } as CSSProperties}>
        <circle r="15" fill="none" stroke={c.compass} strokeWidth="1.6" opacity="0.55" />
        <path d="M0-19v5M0 14v5M-19 0h5M14 0h5" stroke={c.compass} strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
        <g className={styles.routeNeedle}>
          <path d="M0-11L4 0H-4Z" fill="#E8600F" />
          <path d="M0 11L4 0H-4Z" fill={c.compass} />
          <circle r="1.6" fill="#FFFEFC" />
        </g>
      </g>

      {/* Car (drawn facing right; top-down view) */}
      <g ref={carRef} transform={carTransform(0)} style={{ opacity: 0 }}>
        <rect x="-12" y="-4.5" width="26" height="13" rx="5.5" fill="rgba(15, 42, 61, 0.22)" />
        <rect x="-13" y="-6.5" width="26" height="13" rx="5.5" fill="#FFFEFC" stroke="#0B5683" strokeWidth="1.4" />
        <path d="M3.6-4.7L8-3.5V3.5L3.6 4.7Z" fill="#0E5E8F" />
        <path d="M-9-3.6L-6.2-4.5V4.5L-9 3.6Z" fill="#1373A8" />
        <rect x="-5" y="-4.5" width="7.6" height="9" rx="1.6" fill="#DDF3F4" />
        <circle cx="11.6" cy="-3.9" r="1.2" fill="#F5A524" />
        <circle cx="11.6" cy="3.9" r="1.2" fill="#F5A524" />
        <circle cx="-12" cy="-3.9" r="1" fill="#E8600F" />
        <circle cx="-12" cy="3.9" r="1" fill="#E8600F" />
      </g>

      {/* Stops: a pin drops at each one, with its name beside it */}
      {stops.map((stop, i) => {
        const isFirst = i === 0;
        const isLast = i === stops.length - 1 && stops.length > 1;
        const fill = isLast ? c.lastPin : isFirst ? c.firstPin : c.midPin;
        const dot = isLast ? "#FFFEFC" : c.firstPinDot;
        const delay = { "--d": `${500 + i * 350}ms` } as CSSProperties;
        const labelRight = stop.x < VIEW_W / 2;
        return (
          <g key={i} transform={`translate(${stop.x} ${stop.y})`}>
            {isLast && <circle r="9" fill="none" stroke={c.lastPin} strokeWidth="2" className={styles.routeRipple} />}
            <g className={styles.routePin} style={delay}>
              <path d={PIN_D} fill={fill} stroke="rgba(15, 42, 61, 0.18)" strokeWidth="1" />
              <circle cy="-30" r="4.6" fill={dot} />
            </g>
            {stop.name && (
              <text
                x={labelRight ? 20 : -20}
                y={-29}
                textAnchor={labelRight ? "start" : "end"}
                className={`${styles.routeLabel} ${styles.routeFade}`}
                style={{ "--d": `${650 + i * 350}ms` } as CSSProperties}
                fill={c.label}
                stroke={c.halo}
              >
                {stop.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
