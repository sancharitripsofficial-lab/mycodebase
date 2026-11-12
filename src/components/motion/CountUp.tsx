"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "./motion.module.css";
import { prefersReducedMotionNow } from "./useMotionHooks";

export interface CountUpProps {
  /** Final number to land on. */
  value: number;
  /** Number to start from. Default 0. */
  from?: number;
  durationMs?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

function format(n: number, decimals: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Stat number that counts up once when scrolled into view (e.g. "6 seats", "4 routes"). */
export function CountUp({
  value,
  from = 0,
  durationMs = 1400,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: CountUpProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const liveRef = useRef<HTMLSpanElement | null>(null);
  const finalText = `${prefix}${format(value, decimals)}${suffix}`;

  // The server renders the final number (good for no-JS and search engines). Before the first
  // paint we rewind the visible copy to `from`, then count up when it scrolls into view.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const live = liveRef.current;
    if (!root || !live) return;
    const write = (n: number) => {
      live.textContent = `${prefix}${format(n, decimals)}${suffix}`;
    };
    if (prefersReducedMotionNow() || typeof IntersectionObserver === "undefined") {
      write(value);
      return;
    }

    write(from);
    let raf = 0;
    let startedAt = 0;
    const tick = (now: number) => {
      if (!startedAt) startedAt = now;
      const p = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
      const eased = 1 - Math.pow(1 - p, 4); // ease-out quart: quick start, soft landing
      write(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          io.disconnect();
          raf = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(root);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      write(value);
    };
  }, [value, from, durationMs, decimals, prefix, suffix]);

  return (
    <span ref={rootRef} className={className ? `${styles.count} ${className}` : styles.count}>
      <span className={styles.srOnly}>{finalText}</span>
      {/* Invisible copy of the final value reserves the width, so nothing shifts while counting. */}
      <span className={styles.countSizer} aria-hidden="true">
        {finalText}
      </span>
      <span ref={liveRef} className={styles.countLive} aria-hidden="true" suppressHydrationWarning>
        {finalText}
      </span>
    </span>
  );
}
