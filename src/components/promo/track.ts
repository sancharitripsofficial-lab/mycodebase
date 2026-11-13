"use client";

import { useEffect, type RefObject } from "react";

/** Count an offer view/click. Fire-and-forget; never blocks navigation. */
export function trackPromo(id: string, kind: "view" | "click"): void {
  try {
    const body = JSON.stringify({ id, kind });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/promotions/track", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/promotions/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    /* counting is best-effort */
  }
}

/** Count one view per offer per browser session, when at least half of it is on screen. */
export function useTrackView(ref: RefObject<Element | null>, id: string | null): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !id) return;
    const key = `promo-seen:${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* storage blocked: still count */
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          trackPromo(id, "view");
          try {
            sessionStorage.setItem(key, "1");
          } catch {
            /* ignore */
          }
          io.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, id]);
}

export const THEME_BG: Record<"sunset" | "ocean" | "teal", string> = {
  sunset: "bg-[linear-gradient(120deg,#B9470A_0%,#E8600F_55%,#F07A2E_100%)]",
  ocean: "bg-[linear-gradient(120deg,#0B5683_0%,#0E5E8F_55%,#137C9E_100%)]",
  teal: "bg-[linear-gradient(120deg,#0A6675_0%,#0C7A8C_55%,#13919F_100%)]",
};
