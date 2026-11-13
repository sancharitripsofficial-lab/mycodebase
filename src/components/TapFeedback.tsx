"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const INTERACTIVE = 'a[href], button:not(:disabled), [role="button"], summary, label[for], .tap';

/**
 * Makes every tap feel answered immediately:
 *  1. Touch: iOS only shows :active "pressed" styles when a touchstart listener exists, so one
 *     passive listener is added; Android phones also get a tiny 8 ms vibration on buttons/cards.
 *  2. Navigation: a thin sunset progress bar starts the moment an internal link is tapped and
 *     finishes when the new page is on screen, so a tap never looks ignored.
 */
export function TapFeedback() {
  const pathname = usePathname();
  const [progress, setProgress] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const startedAt = useRef(0);

  // Finish the bar when the route has changed.
  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setProgress((p) => (p === null ? null : 100));
    const done = window.setTimeout(() => setProgress(null), 220);
    return () => window.clearTimeout(done);
  }, [pathname]);

  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const el = (e.target as Element | null)?.closest(INTERACTIVE);
      if (!el || el.getAttribute("aria-disabled") === "true") return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      try {
        navigator.vibrate?.(8);
      } catch {
        /* some browsers block vibration; the visual press still shows */
      }
    };

    const onClick = (e: MouseEvent) => {
      // Runs in the capture phase: Next's <Link> calls preventDefault() during bubbling, so a
      // bubbling listener would never see client-side navigations.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const samePage = url.pathname === window.location.pathname && url.search === window.location.search;
      if (samePage) return; // in-page #anchor jumps need no bar
      startedAt.current = Date.now();
      setProgress(12);
      if (timer.current) window.clearInterval(timer.current);
      timer.current = window.setInterval(() => {
        setProgress((p) => (p === null || p >= 90 ? p : p + (90 - p) * 0.12));
      }, 120);
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("touchstart", noop);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("click", onClick, true);
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  if (progress === null) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
    >
      <div
        className="h-full rounded-r-full bg-gradient-to-r from-lagoon-500 via-sunset-400 to-copper-600 shadow-[0_0_10px_rgb(255_138_61/0.7)] transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${progress}%`, opacity: progress >= 100 ? 0 : 1 }}
      />
    </div>
  );
}
