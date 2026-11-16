import { SITE_URL } from "@/lib/seo";

/**
 * IndexNow: tells Bing (which also feeds Yahoo and DuckDuckGo), Yandex, Naver and Seznam at once
 * that pages are new or changed, instead of waiting for them to find out. Google does not use it;
 * Google reads the sitemap.
 *
 * The key is public by design: search engines read it at /<key>.txt (public/<key>.txt) to check
 * that the ping really came from this site. Keep that file and this constant the same.
 */
export const INDEXNOW_KEY = "de1c819f0c470e1772dec3b99546a534";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** The JSON body of one IndexNow ping: this site's own addresses only, each once. */
export function indexNowBody(urls: readonly string[], siteUrl: string = SITE_URL) {
  const base = siteUrl.replace(/\/+$/, "");
  const host = new URL(base).host;
  const own = urls
    .map((u) => (/^https?:\/\//i.test(u) ? u : `${base}${u.startsWith("/") ? "" : "/"}${u}`))
    .filter((u) => {
      try {
        return new URL(u).host === host;
      } catch {
        return false;
      }
    });
  return { host, key: INDEXNOW_KEY, keyLocation: `${base}/${INDEXNOW_KEY}.txt`, urlList: [...new Set(own)].slice(0, 10000) };
}

const MIN_GAP_MS = 10 * 60_000;
let lastPing = 0;

/**
 * Send the ping. Only the live site does (never a preview or a local run), at most once every ten
 * minutes per server instance, and it never throws: a failed ping must not fail an admin save.
 */
export async function pingIndexNow(urls: readonly string[], opts: { force?: boolean } = {}): Promise<"sent" | "skipped" | "failed"> {
  if (process.env.VERCEL_ENV !== "production" || !/^https:\/\//i.test(SITE_URL)) return "skipped";
  const now = Date.now();
  if (!opts.force && now - lastPing < MIN_GAP_MS) return "skipped";
  const body = indexNowBody(urls);
  if (body.urlList.length === 0) return "skipped";
  lastPing = now;
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[indexnow] ping refused:", res.status);
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("[indexnow] ping failed:", err instanceof Error ? err.message : err);
    return "failed";
  }
}
