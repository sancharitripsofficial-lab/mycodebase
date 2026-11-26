/**
 * The moving advertisement strip above the menu on every store page.
 * What runs in it: every live offer whose place is "Top bar on every page" (Admin → Offers & ads),
 * plus the owner's own short lines from Admin → Website text → Top ad strip. The owner also
 * chooses the speed there and can switch the strip off.
 */

export const TICKER_SPEEDS = ["slow", "normal", "fast"] as const;
export type TickerSpeed = (typeof TICKER_SPEEDS)[number];
/** How many pixels the strip moves each second. */
export const TICKER_PX_PER_SECOND: Record<TickerSpeed, number> = { slow: 38, normal: 60, fast: 90 };

export const MAX_TICKER_LINES = 8;
export const MAX_TICKER_TEXT = 90;

export interface TickerLine {
  text: string;
  /** Optional: a page on this site ("/trips") or an https link. */
  href: string;
}

export interface AdTickerSettings {
  enabled: boolean;
  speed: TickerSpeed;
  lines: TickerLine[];
}

export const DEFAULT_AD_TICKER: AdTickerSettings = { enabled: true, speed: "normal", lines: [] };

/** A link the strip may open: a path on this site or a full https address. Nothing else. */
export function isTickerLink(v: string): boolean {
  if (v === "") return true;
  if (/[\s"'<>\\`]/.test(v)) return false;
  return /^\/(?!\/)[A-Za-z0-9._~/?#=&%-]*$/.test(v) || /^https:\/\/[^/]+/i.test(v);
}

/** Saved "ad_ticker" row → settings. Anything broken falls back to the defaults. */
export function mergeAdTicker(raw: unknown): AdTickerSettings {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const lines = (Array.isArray(r.lines) ? r.lines : [])
    .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : {}))
    .map((l) => ({
      text: typeof l.text === "string" ? l.text.replace(/\s+/g, " ").trim().slice(0, MAX_TICKER_TEXT) : "",
      href: typeof l.href === "string" && isTickerLink(l.href.trim()) ? l.href.trim() : "",
    }))
    .filter((l) => l.text.length > 1)
    .slice(0, MAX_TICKER_LINES);
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_AD_TICKER.enabled,
    speed: TICKER_SPEEDS.includes(r.speed as TickerSpeed) ? (r.speed as TickerSpeed) : DEFAULT_AD_TICKER.speed,
    lines,
  };
}

/** Seconds for one full pass of a strip `widthPx` wide: the same pace however long the strip is. */
export function tickerDurationSeconds(widthPx: number, speed: TickerSpeed): number {
  const seconds = widthPx / TICKER_PX_PER_SECOND[speed];
  return Math.min(240, Math.max(8, Math.round(seconds * 10) / 10));
}
