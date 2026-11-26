"use client";

import { X } from "lucide-react";
import { getImageProps } from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Promotion } from "@/lib/data/promotions";
import { isOptimizableImage } from "@/lib/media";
import { pickPopup, shownMark } from "@/lib/popup-order";
import { OfferTerms, PromoCta } from "./PromoBanner";
import { PromoMedia } from "./PromoMedia";
import { THEME_BG, trackPromo } from "./track";

const SEEN = (id: string) => `promo-popup:${id}`;
/** Never interrupt someone checking or paying for a booking. */
const QUIET_PATHS = ["/booking-lookup"];
/** The pop-up card is at most 448 px wide on computers and the full width on phones. */
const POPUP_SIZES = "(min-width: 640px) 448px, 100vw";

/**
 * The pop-up picture as the browser fetches it: the resized copy from the site's image service,
 * never the upload itself (offer pictures are often 5-8 MB). The same answer every time, so the copy
 * fetched a few seconds before the pop-up opens is the very one the pop-up then shows.
 */
function popupPicture(url: string): { src: string; srcSet?: string; sizes?: string } {
  if (!isOptimizableImage(url)) return { src: url };
  const { props } = getImageProps({ src: url, alt: "", fill: true, sizes: POPUP_SIZES });
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
}

/** Width / height of a loaded picture, kept inside sensible limits for the card. */
function shapeOf(img: HTMLImageElement): number | null {
  if (!img.naturalWidth || !img.naturalHeight) return null;
  return Math.min(3, Math.max(0.5, img.naturalWidth / img.naturalHeight));
}

/**
 * Offer pop-up (rules in src/lib/popup-order.ts). What a browser has shown is remembered in that
 * browser only, so a phone and a laptop each keep their own memory.
 * - `picked`: the offer the owner chose in Admin → Offers & ads ("Make this the pop-up"). Only it
 *   pops up, once per visitor for each time the owner picks it; nothing else pops up.
 * - no pick: one offer per page that this browser has not shown, the newest first, so a new offer
 *   shows on every device at its next page instead of waiting behind older offers.
 * Appears after 8 s or when the visitor has scrolled a third of the page; bottom sheet on phones.
 *
 * The whole card is covered by the offer's own media: a film fills it; a picture sits uncropped on a
 * soft blurred copy of itself that runs behind the words too (no plain panel). The picture (or the
 * film's poster) is fetched a few seconds before the pop-up opens, so it is there when it slides up.
 */
export function PromoPopup({ promotions, picked = null }: { promotions: Promotion[]; picked?: { promo: Promotion; since: string } | null }) {
  const pathname = usePathname();
  const [promo, setPromo] = useState<Promotion | null>(null);
  /** Shape (width / height) of the offer picture once known, so the card has the right size at once. */
  const [shape, setShape] = useState<{ id: string; ratio: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  /** Where focus was before the offer opened, so closing it puts the visitor back there. */
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if ((promotions.length === 0 && !picked) || QUIET_PATHS.some((p) => pathname.startsWith(p))) return;
    let next: { promo: Promotion; pickSince: string | null } | undefined;
    try {
      next = pickPopup(promotions, picked, (id) => localStorage.getItem(SEEN(id)));
    } catch {
      next = undefined; // storage blocked: don't risk showing it on every page
    }
    if (!next) return;
    const chosen = next.promo;
    const pickSince = next.pickSince;
    let done = false;
    let gone = false;
    let retry = 0;
    // Fetch the offer's picture (or its film's poster) shortly before the pop-up opens: it is then
    // already there when the pop-up slides up, and the picture's shape is known so the card does not
    // jump. Not at once: the page's own pictures come first.
    let warm: HTMLImageElement | null = null;
    const warmUp = () => {
      if (warm) return;
      const url = chosen.mediaType === "image" ? chosen.mediaUrl : chosen.mediaType === "video" ? chosen.posterUrl : "";
      if (!url) return;
      const img = new Image();
      warm = img;
      img.decoding = "async";
      if (chosen.mediaType === "image") {
        const pic = popupPicture(url);
        img.onload = () => {
          const ratio = shapeOf(img);
          if (!gone && ratio) setShape({ id: chosen.id, ratio });
        };
        if (pic.sizes) img.sizes = pic.sizes;
        if (pic.srcSet) img.srcset = pic.srcSet;
        img.src = pic.src;
      } else {
        img.src = url;
      }
    };
    const warmTimer = window.setTimeout(warmUp, 3500);
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
      warmUp();
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPromo(chosen);
      trackPromo(chosen.id, "view");
      try {
        localStorage.setItem(SEEN(chosen.id), shownMark(new Date(), pickSince));
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
      gone = true;
      if (warm) warm.onload = null;
      window.clearTimeout(warmTimer);
      window.clearTimeout(timer);
      window.clearTimeout(retry);
      window.removeEventListener("scroll", onScroll);
    };
  }, [promotions, pathname, picked]);

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
  const immersive = promo.mediaType === "video" || promo.mediaType === "youtube";
  const picture = promo.mediaType === "image" && promo.mediaUrl ? popupPicture(promo.mediaUrl) : null;
  // Until the picture's own shape is known, a 16:9 place is kept for it.
  const ratio = shape && shape.id === promo.id ? shape.ratio : 16 / 9;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4 sm:pt-28" role="presentation">
      <button type="button" aria-label="Close offer" className="promo-backdrop absolute inset-0 bg-[#0B5683]/45 backdrop-blur-[2px]" onClick={() => setPromo(null)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-popup-title"
        className="promo-sheet relative max-h-[calc(100svh-0.5rem)] w-full max-w-md overflow-x-hidden overflow-y-auto rounded-t-3xl bg-forest-900 shadow-2xl sm:max-h-[calc(100svh-8rem)] sm:rounded-3xl"
      >
        {immersive ? (
          // Video offers: the film fills the card (muted, looping, "Tap for sound"); the offer's
          // words sit on a see-through shade at the bottom so the film stays visible behind them.
          <div className="relative h-[min(80svh,660px)] w-full sm:h-[min(620px,calc(100svh-9rem))]">
            <PromoMedia promo={promo} sizes={POPUP_SIZES} cover sound />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.3)_0%,rgb(0_0_0/0)_18%,rgb(0_0_0/0)_40%,rgb(6_26_23/0.5)_60%,rgb(6_26_23/0.86)_100%)]"
            />
            <button
              ref={closeRef}
              type="button"
              aria-label="Close offer"
              onClick={() => setPromo(null)}
              className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-forest-900 shadow"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="absolute inset-x-0 bottom-0 space-y-2.5 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.55)]">
              {promo.badge && (
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold text-white [text-shadow:none] ${THEME_BG[promo.theme]}`}>{promo.badge}</span>
              )}
              <h2 id="promo-popup-title" className="font-display text-[1.7rem] leading-tight font-semibold text-white">
                {promo.title}
              </h2>
              {promo.message && <p className="text-sm leading-relaxed text-white/90">{promo.message}</p>}
              <OfferTerms promo={promo} className="text-xs font-semibold text-white/90" />
              <div className="flex flex-wrap items-center gap-3 pt-1 [text-shadow:none]">
                <PromoCta promo={promo} className="btn-sunset inline-flex items-center gap-2 px-5 py-3 text-sm" onDone={() => setPromo(null)} />
                <button type="button" onClick={() => setPromo(null)} className="rounded-full px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/15">
                  Not now
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Picture offers, and offers with no media: the whole card is covered too. A soft blurred
          // copy of the picture fills the card from top to bottom; the full picture sits on it
          // uncropped (posters keep their words and logo), and the offer's words are on the blurred
          // part below, like the film pop-up. With no media the brand colour fills the card.
          <div className={`relative overflow-hidden ${THEME_BG[promo.theme]}`} data-popup-cover>
            {picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                {...picture}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-2xl brightness-[0.8] saturate-150"
              />
            ) : (
              <PromoMedia promo={promo} sizes={POPUP_SIZES} />
            )}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(6_26_23/0.1)_0%,rgb(6_26_23/0.34)_45%,rgb(6_26_23/0.74)_100%)]"
            />
            <div
              className={`relative w-full ${picture ? "max-h-[min(50svh,26rem)] min-h-[9rem]" : "aspect-[16/9]"}`}
              style={picture ? { aspectRatio: String(ratio) } : undefined}
            >
              {picture && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  {...picture}
                  alt=""
                  decoding="async"
                  onLoad={(e) => {
                    const r = shapeOf(e.currentTarget);
                    if (r && (shape?.id !== promo.id || shape.ratio !== r)) setShape({ id: promo.id, ratio: r });
                  }}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              )}
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
            <div className="relative space-y-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.55)]">
              {promo.badge && (
                <span className="inline-block rounded-full bg-white px-3 py-1 text-xs font-bold tracking-wide text-copper-700 shadow-sm [text-shadow:none]">{promo.badge}</span>
              )}
              <h2 id="promo-popup-title" className="font-display text-2xl leading-tight font-semibold text-white">
                {promo.title}
              </h2>
              {promo.message && <p className="text-sm leading-relaxed text-white/90">{promo.message}</p>}
              <OfferTerms promo={promo} className="text-xs font-semibold text-white/90" />
              <div className="flex flex-wrap items-center gap-3 pt-1 [text-shadow:none]">
                <PromoCta promo={promo} className="btn-sunset inline-flex items-center gap-2 px-5 py-3 text-sm" onDone={() => setPromo(null)} />
                <button type="button" onClick={() => setPromo(null)} className="rounded-full px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/15">
                  Not now
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
