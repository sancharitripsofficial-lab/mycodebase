/**
 * Booking-funnel events for Google Analytics 4 (the measurement ID is set in Admin → Website text
 * → Analytics, or with NEXT_PUBLIC_GA_MEASUREMENT_ID). Without an ID nothing is loaded and nothing
 * is sent; the calls below are then harmless no-ops.
 *
 *   view_trip       a trip page was opened
 *   select_seats    the visitor chose a date / how many seats / a seat on the car map
 *   begin_checkout  "Continue to reservation" was pressed and the seats are now held
 *   purchase        the booking was completed: payment reference sent, or confirmed at once
 *   click_whatsapp  any "WhatsApp" link was tapped
 *   notify_me       someone asked to hear when a trip gets dates
 *
 * Never put a name, phone number, email or booking reference of a person in an event.
 * (The booking reference is the transaction id GA4 needs for `purchase`; it names no one.)
 */

import type { AnalyticsSettings } from "@/lib/types";

export type FunnelEvent = "view_trip" | "select_seats" | "begin_checkout" | "purchase" | "click_whatsapp" | "notify_me";

export type EventParams = Record<string, string | number | boolean | null | undefined | AnalyticsItem[]>;

/** A valid Google Ads tag ID ("AW-123456789"), or "" for anything else. */
export function cleanAdsId(value: unknown): string {
  const id = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^AW-\d{6,14}$/.test(id) ? id : "";
}

/**
 * A Google Ads conversion label, or "" for anything else. The owner may paste the whole send_to
 * value ("AW-123456789/AbC-D_efG"): only the part after the slash is kept.
 */
export function cleanAdsLabel(value: unknown): string {
  let v = typeof value === "string" ? value.trim() : "";
  if (v.includes("/")) v = v.slice(v.lastIndexOf("/") + 1);
  return /^[A-Za-z0-9_-]{6,40}$/.test(v) ? v : "";
}

export interface AnalyticsItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  /** Rupees (not paise). */
  price?: number;
  quantity?: number;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    /** The last few events, kept in the page so the funnel can be checked without an analytics account. */
    __sanchariEvents?: { name: FunnelEvent; params: EventParams; at: number }[];
    /** Google Ads purchase conversion target ("AW-…/label"), set by GoogleAnalytics when configured. */
    __sanchariAdsPurchase?: string;
  }
}

/** A valid GA4 measurement ID ("G-XXXXXXXXXX"), or "" for anything else. */
export function cleanMeasurementId(value: unknown): string {
  const id = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^G-[A-Z0-9]{6,14}$/.test(id) ? id : "";
}

/**
 * A search-engine ownership code (Google Search Console "HTML tag", Bing Webmaster "meta tag"), or
 * "" for anything else. The owner may paste the whole <meta …> tag: only its content is kept.
 */
export function cleanVerificationCode(value: unknown): string {
  let v = typeof value === "string" ? value.trim() : "";
  const fromTag = /content\s*=\s*["']([^"']+)["']/i.exec(v);
  if (fromTag) v = fromTag[1].trim();
  return /^[A-Za-z0-9_-]{8,120}$/.test(v) ? v : "";
}

/** Saved "analytics" row → settings. Anything that is not a valid ID or code means "off". */
export function mergeAnalyticsSettings(raw: unknown): AnalyticsSettings {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    gaMeasurementId: cleanMeasurementId(r.gaMeasurementId),
    googleSiteVerification: cleanVerificationCode(r.googleSiteVerification),
    bingSiteVerification: cleanVerificationCode(r.bingSiteVerification),
    googleAdsId: cleanAdsId(r.googleAdsId),
    googleAdsPurchaseLabel: cleanAdsLabel(r.googleAdsPurchaseLabel),
  };
}

/** Paise → rupees for GA4 "value" / "price" (GA4 wants the currency's main unit). */
export const rupees = (paise: number) => Math.round(paise) / 100;

export function tripItem(input: {
  slug: string;
  title: string;
  destination?: string;
  /** The date's code, e.g. the departure code, or "private" for a whole car. */
  variant?: string;
  pricePaise?: number;
  quantity?: number;
}): AnalyticsItem {
  return {
    item_id: input.slug,
    item_name: input.title,
    ...(input.destination ? { item_category: input.destination.split(",")[0].trim() } : {}),
    ...(input.variant ? { item_variant: input.variant } : {}),
    ...(typeof input.pricePaise === "number" ? { price: rupees(input.pricePaise) } : {}),
    quantity: input.quantity ?? 1,
  };
}

export function trackEvent(name: FunnelEvent, params: EventParams = {}): void {
  if (typeof window === "undefined") return;
  try {
    const log = (window.__sanchariEvents ??= []);
    log.push({ name, params, at: Date.now() });
    if (log.length > 40) log.splice(0, log.length - 40);
    window.gtag?.("event", name, params);
    // A finished booking also counts as a Google Ads conversion, so ads can be judged by bookings.
    if (name === "purchase" && window.__sanchariAdsPurchase) {
      window.gtag?.("event", "conversion", {
        send_to: window.__sanchariAdsPurchase,
        value: params.value,
        currency: params.currency ?? "INR",
        transaction_id: params.transaction_id,
      });
    }
  } catch {
    /* analytics must never break a booking */
  }
}

/** Sends an event at most once per browser tab for a given key (e.g. one `purchase` per booking). */
export function trackOnce(key: string, name: FunnelEvent, params: EventParams = {}): void {
  if (typeof window === "undefined") return;
  const storageKey = `sanchari-ev:${name}:${key}`;
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    /* private mode: send anyway */
  }
  trackEvent(name, params);
}
