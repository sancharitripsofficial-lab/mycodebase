"use client";

import { Megaphone, Pause, Play, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { tickerDurationSeconds, type AdTickerSettings } from "@/lib/ad-ticker";
import type { Promotion } from "@/lib/data/promotions";
import { offerEndLabel } from "@/lib/offer-rules";
import { trackPromo } from "./track";
import { promoHref, scrollIfSamePage } from "./PromoBanner";

const CLOSED_KEY = "promo-topbar-closed";

interface Item {
  key: string;
  offerId: string | null;
  badge: string;
  text: string;
  detail: string;
  cta: string;
  href: string;
}

function ItemLink({ item, children, className }: { item: Item; children: React.ReactNode; className: string }) {
  if (!item.href) return <span className={className}>{children}</span>;
  const onClick = (e: React.MouseEvent) => {
    if (item.offerId) trackPromo(item.offerId, "click");
    scrollIfSamePage(e, item.href);
  };
  return item.href.startsWith("/") ? (
    <Link href={item.href} onClick={onClick} className={className}>
      {children}
    </Link>
  ) : (
    <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
      {children}
    </a>
  );
}

/**
 * The moving advertisement strip above the menu on every store page.
 *
 * It carries every live "top bar" offer and the owner's own lines (Admin → Website text → Top ad
 * strip), gliding right to left in one endless loop at the speed the owner chose. It stops while
 * a visitor points at it, touches it, tabs into it or presses Pause, so a line can be read and
 * tapped; each line opens its own link. Visitors who prefer less motion get a still strip they can
 * swipe sideways. Closable for the visit.
 */
export function PromoTopBar({ promotions, ticker }: { promotions: Promotion[]; ticker: AdTickerSettings }) {
  const [closed, setClosed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const items: Item[] = [
    ...promotions.map((p) => ({
      key: `offer-${p.id}`,
      offerId: p.id,
      badge: p.badge,
      text: p.title,
      detail: [p.message, offerEndLabel(p.endsAt)].filter(Boolean).join(" · "),
      cta: p.ctaLabel && p.ctaUrl ? p.ctaLabel : "",
      href: p.ctaLabel && p.ctaUrl ? promoHref(p) : "",
    })),
    ...ticker.lines.map((l, i) => ({ key: `line-${i}`, offerId: null, badge: "", text: l.text, detail: "", cta: "", href: l.href })),
  ];
  const idsKey = items.map((i) => `${i.key}:${i.text}`).join("|");

  useEffect(() => {
    try {
      if (sessionStorage.getItem(CLOSED_KEY) === idsKey) setClosed(true);
    } catch {
      /* ignore */
    }
  }, [idsKey]);

  // One pass takes as long as the strip is wide: a long strip never races, a short one never crawls.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setDuration(tickerDurationSeconds(el.scrollWidth / 2, ticker.speed));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [idsKey, ticker.speed, closed]);

  // Each offer in the strip counts as seen once per visit.
  useEffect(() => {
    if (closed) return;
    for (const p of promotions) {
      const key = `promo-seen:${p.id}`;
      try {
        if (sessionStorage.getItem(key)) continue;
        sessionStorage.setItem(key, "1");
      } catch {
        /* storage blocked: still count */
      }
      trackPromo(p.id, "view");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per set of offers
  }, [idsKey, closed]);

  if (!ticker.enabled || items.length === 0 || closed) return null;

  const stopped = paused || held;
  const run = (hidden: boolean) => (
    <ul className="ad-ticker-run" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <li key={item.key} className="ad-ticker-item">
          <span className="ad-ticker-spark" aria-hidden="true" />
          <ItemLink item={item} className="ad-ticker-link">
            {item.badge && <span className="ad-ticker-badge">{item.badge}</span>}
            <span className="font-semibold">{item.text}</span>
            {item.detail && <span className="text-white/85">{item.detail}</span>}
            {item.cta && <span className="ad-ticker-cta">{item.cta}</span>}
          </ItemLink>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="ad-ticker relative z-40 text-white" role="region" aria-label="Offers and news">
      <span className="ad-ticker-label" aria-hidden="true">
        <Megaphone className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Offers</span>
      </span>
      <div
        className="ad-ticker-window"
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocusCapture={() => setHeld(true)}
        onBlurCapture={() => setHeld(false)}
        onTouchStart={() => setHeld(true)}
        onTouchEnd={() => setHeld(false)}
        onTouchCancel={() => setHeld(false)}
      >
        <div
          ref={trackRef}
          className="ad-ticker-track"
          style={{ animationDuration: duration ? `${duration}s` : undefined, animationPlayState: stopped || !duration ? "paused" : "running" }}
        >
          {run(false)}
          {/* A second copy follows the first so the loop has no gap; screen readers hear the lines once. */}
          <div className="ad-ticker-copy" inert>
            {run(true)}
          </div>
        </div>
      </div>
      <div className="ad-ticker-tools">
        <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? "Play the offers strip" : "Pause the offers strip"} className="ad-ticker-btn ad-ticker-motion-only">
          {paused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
        <button
          type="button"
          aria-label="Hide the offers strip"
          onClick={() => {
            setClosed(true);
            try {
              sessionStorage.setItem(CLOSED_KEY, idsKey);
            } catch {
              /* ignore */
            }
          }}
          className="ad-ticker-btn"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
