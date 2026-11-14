"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Promotion } from "@/lib/data/promotions";
import { PromoCta } from "./PromoBanner";
import { PromoMedia } from "./PromoMedia";
import { THEME_BG, trackPromo } from "./track";

const SEEN = (id: string) => `promo-popup:${id}`;
/** Never interrupt someone checking or paying for a booking. */
const QUIET_PATHS = ["/booking-lookup"];

/**
 * One offer pop-up per visit, at most once per offer per visitor (remembered in the browser).
 * Appears after 8 s or when the visitor has scrolled a third of the page; bottom sheet on phones.
 */
export function PromoPopup({ promotions }: { promotions: Promotion[] }) {
  const pathname = usePathname();
  const [promo, setPromo] = useState<Promotion | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  /** Where focus was before the offer opened, so closing it puts the visitor back there. */
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (promotions.length === 0 || QUIET_PATHS.some((p) => pathname.startsWith(p))) return;
    let next: Promotion | undefined;
    try {
      next = promotions.find((p) => !localStorage.getItem(SEEN(p.id)));
    } catch {
      next = undefined; // storage blocked: don't risk showing it on every page
    }
    if (!next) return;
    const chosen = next;
    let done = false;
    let retry = 0;
    const show = () => {
      if (done) return;
      // Not while the booking form is open or someone is typing.
      if (window.location.hash === "#book" || document.activeElement?.matches("input, textarea, select")) return;
      // Never on top of the chat guide or another open dialog: try again a little later.
      if (document.querySelector('[data-chat-window], [role="dialog"][aria-modal="true"]')) {
        window.clearTimeout(retry);
        retry = window.setTimeout(show, 15000);
        return;
      }
      done = true;
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPromo(chosen);
      trackPromo(chosen.id, "view");
      try {
        localStorage.setItem(SEEN(chosen.id), new Date().toISOString());
      } catch {
        /* ignore */
      }
    };
    const timer = window.setTimeout(show, 8000);
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && window.scrollY / max > 0.33) show();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      done = true;
      window.clearTimeout(timer);
      window.clearTimeout(retry);
      window.removeEventListener("scroll", onScroll);
    };
  }, [promotions, pathname]);

  // Going to another page (for example tapping the logo to go home) closes the offer.
  useEffect(() => {
    setPromo(null);
  }, [pathname]);

  useEffect(() => {
    if (!promo) return;
    // Lets the header (logo, menu, language) sit above the pop-up's dimmed background.
    document.documentElement.dataset.promoOpen = "true";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPromo(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      delete document.documentElement.dataset.promoOpen;
      // Back to where the visitor was (if it is still on the page).
      const back = returnFocus.current;
      returnFocus.current = null;
      if (back && back.isConnected) back.focus({ preventScroll: true });
    };
  }, [promo]);

  if (!promo) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <button type="button" aria-label="Close offer" className="promo-backdrop absolute inset-0 bg-[#0B5683]/45 backdrop-blur-[2px]" onClick={() => setPromo(null)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-popup-title"
        className="promo-sheet relative w-full max-w-md overflow-hidden rounded-t-3xl bg-cream-50 shadow-2xl sm:rounded-3xl"
      >
        <div className="relative aspect-[16/9] w-full">
          <PromoMedia promo={promo} sizes="(min-width: 640px) 448px, 100vw" />
          <button
            ref={closeRef}
            type="button"
            aria-label="Close offer"
            onClick={() => setPromo(null)}
            className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-forest-900 shadow"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {promo.badge && (
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold text-white ${THEME_BG[promo.theme]}`}>{promo.badge}</span>
          )}
          <h2 id="promo-popup-title" className="font-display text-2xl font-semibold text-forest-900">
            {promo.title}
          </h2>
          {promo.message && <p className="text-sm leading-relaxed text-stone-600">{promo.message}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <PromoCta promo={promo} className="btn-sunset inline-flex items-center gap-2 px-5 py-3 text-sm" onDone={() => setPromo(null)} />
            <button type="button" onClick={() => setPromo(null)} className="rounded-full px-4 py-3 text-sm font-semibold text-stone-600 hover:bg-lagoon-100">
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
