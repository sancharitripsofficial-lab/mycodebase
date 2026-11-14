"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Promotion } from "@/lib/data/promotions";
import { THEME_BG, trackPromo, useTrackView } from "./track";
import { promoHref, scrollIfSamePage } from "./PromoBanner";

const CLOSED_KEY = "promo-topbar-closed";

/** Thin rotating offers bar above the menu on every store page. Closable for the session. */
export function PromoTopBar({ promotions }: { promotions: Promotion[] }) {
  const [index, setIndex] = useState(0);
  const [closed, setClosed] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const idsKey = promotions.map((p) => p.id).join(",");
  const current = promotions[index % Math.max(1, promotions.length)] ?? null;
  useTrackView(ref, closed ? null : current?.id ?? null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(CLOSED_KEY) === idsKey) setClosed(true);
    } catch {
      /* ignore */
    }
  }, [idsKey]);

  useEffect(() => {
    if (promotions.length < 2 || closed) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % promotions.length), 5000);
    return () => window.clearInterval(t);
  }, [promotions.length, closed]);

  if (!current || closed) return null;

  const text = (
    <>
      {current.badge && <span className="mr-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-copper-700">{current.badge}</span>}
      <span className="font-semibold">{current.title}</span>
      {current.message && <span className="hidden text-white/85 lg:inline"> — {current.message}</span>}
    </>
  );

  return (
    <div ref={ref} className={`relative z-40 text-white ${THEME_BG[current.theme]}`} role="region" aria-label="Current offer">
      <div className="mx-auto flex min-h-10 max-w-6xl items-center gap-2 py-1.5 pr-10 pl-4 text-xs sm:px-12 sm:text-sm">
        <p key={current.id} className="promo-fade min-w-0 flex-1 truncate text-center">
          {text}
        </p>
        {current.ctaLabel && current.ctaUrl && (
          promoHref(current).startsWith("/") ? (
            <Link
              href={promoHref(current)}
              onClick={(e) => {
                trackPromo(current.id, "click");
                scrollIfSamePage(e, promoHref(current));
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-3 py-1 font-semibold underline-offset-2 transition hover:bg-white/30"
            >
              {current.ctaLabel}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <a
              href={promoHref(current)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackPromo(current.id, "click")}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-3 py-1 font-semibold transition hover:bg-white/30"
            >
              {current.ctaLabel}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )
        )}
      </div>
      <button
        type="button"
        aria-label="Hide offers bar"
        onClick={() => {
          setClosed(true);
          try {
            sessionStorage.setItem(CLOSED_KEY, idsKey);
          } catch {
            /* ignore */
          }
        }}
        className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-white/85 hover:bg-white/15 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
