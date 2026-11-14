"use client";

import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Promotion } from "@/lib/data/promotions";
import { PromoMedia } from "./PromoMedia";
import { THEME_BG, trackPromo, useTrackView } from "./track";

export function PromoCta({ promo, className }: { promo: Promotion; className: string }) {
  if (!promo.ctaLabel || !promo.ctaUrl) return null;
  const onClick = () => trackPromo(promo.id, "click");
  // An offer for one trip whose button still says "all trips" opens that trip's dates instead.
  const href = promo.tripSlug && promo.ctaUrl === "/trips" ? `/trips/${promo.tripSlug}#book` : promo.ctaUrl;
  const inner = (
    <>
      {promo.ctaLabel}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </>
  );
  return href.startsWith("/") ? (
    <Link href={href} onClick={onClick} className={className}>
      {inner}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
      {inner}
    </a>
  );
}

/**
 * Offers carousel for one place on the site (home, all trips, trip page). Swipe on phones,
 * arrows on desktop, moves on by itself every 7 s unless the visitor is hovering or reading.
 */
export function PromoBanner({ promotions, className = "", preview = false }: { promotions: Promotion[]; className?: string; preview?: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const startX = useRef<number | null>(null);
  const count = promotions.length;
  const current = promotions[Math.min(index, count - 1)] ?? null;
  useTrackView(rootRef, preview ? null : current?.id ?? null);

  const go = useCallback((d: number) => setIndex((i) => (i + d + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") go(1);
    }, 7000);
    return () => window.clearInterval(t);
  }, [count, paused, go]);

  if (!current) return null;

  return (
    <section
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label="Offers"
      className={`relative overflow-hidden rounded-3xl shadow-[0_18px_50px_-20px_rgba(11,86,131,0.45)] ${THEME_BG[current.theme]} ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") startX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (startX.current === null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > 45 && count > 1) go(dx < 0 ? 1 : -1);
      }}
      style={{ touchAction: "pan-y" }}
    >
      <div key={current.id} className="promo-enter grid md:grid-cols-[1.1fr_1fr]">
        <div className="relative aspect-[16/9] w-full md:aspect-auto md:min-h-[300px]">
          <PromoMedia promo={current} sizes="(min-width: 768px) 55vw, 100vw" />
        </div>
        <div className="flex flex-col justify-center gap-3 p-5 text-white sm:p-7 md:p-9" aria-live={paused ? "off" : "polite"}>
          {current.badge && (
            <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-bold tracking-wide text-copper-700 shadow-sm">
              {current.badge}
            </span>
          )}
          <h2 className="font-display text-2xl leading-tight font-semibold sm:text-3xl">{current.title}</h2>
          {current.message && <p className="text-sm leading-relaxed text-white/90 sm:text-base">{current.message}</p>}
          <PromoCta
            promo={current}
            className="mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-forest-900 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
          />
          {count > 1 && (
            <div className="mt-2 flex items-center gap-3">
              <button type="button" onClick={() => go(-1)} aria-label="Previous offer" className="hidden h-9 w-9 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/30 md:flex">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex gap-1.5">
                {promotions.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-label={`Offer ${i + 1} of ${count}`}
                    aria-current={i === index ? "true" : undefined}
                    onClick={() => setIndex(i)}
                    className="flex h-6 items-center"
                  >
                    <span className={`block h-2 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-2 bg-white/50"}`} />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => go(1)} aria-label="Next offer" className="hidden h-9 w-9 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/30 md:flex">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
