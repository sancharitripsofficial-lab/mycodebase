/**
 * The visitor's language choice, shared by the browser (LanguageProvider, EARLY_LANG_SCRIPT) and
 * the middleware. Pure and dependency-free, so the middleware can import it.
 *
 * Order of trust: ?lang= in the address > the "sanchari-lang" cookie > localStorage.
 * The cookie matters for a trip address that redirects (lib/trip-slugs.ts): Next writes the
 * redirect's Location without the request's ?lang=kn, so the middleware copies ?lang= into a
 * short-lived cookie on that request and the page the visitor lands on still opens in Kannada.
 */

export type LangChoice = "en" | "kn";

/** Cookie (and localStorage key) holding the choice. */
export const LANG_COOKIE = "sanchari-lang";
/** How long the middleware's hand-over cookie lives (seconds): enough to follow one redirect. */
export const LANG_HANDOFF_MAX_AGE = 300;

export function asLang(value: string | null | undefined): LangChoice | null {
  return value === "kn" || value === "en" ? value : null;
}

/** The choice in a document.cookie / Cookie header string, or null. */
export function langFromCookieString(cookie: string | null | undefined): LangChoice | null {
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === LANG_COOKIE) return asLang(part.slice(eq + 1).trim());
  }
  return null;
}
