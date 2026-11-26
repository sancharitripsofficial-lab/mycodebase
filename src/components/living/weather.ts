/** Live weather shared by the API route (server) and the living photos (browser). */

export type WeatherCondition = "clear" | "cloudy" | "mist" | "rain" | "storm";

export type LiveWeather = {
  /** false when Open-Meteo could not be reached: the scene still animates, the chip is hidden. */
  live: boolean;
  place: string;
  condition: WeatherCondition;
  /** Plain words for the chip, e.g. "light rain". */
  label: string;
  tempC: number;
  windKmh: number;
  /** Direction the wind comes FROM, degrees clockwise from north. */
  windFromDeg: number;
  /** Same as a compass point, e.g. "NE". */
  windFrom: string;
  isDay: boolean;
  humidity: number;
  cloudCover: number;
  precipMm: number;
  /** Today's high / low in °C and highest chance of rain in % (IST day), when known. */
  todayMaxC?: number | null;
  todayMinC?: number | null;
  rainChance?: number | null;
  /** When the reading was taken (ISO). */
  updatedAt?: string;
  /** The weather service was unreachable: this is the last good reading (shown with its time). */
  stale?: boolean;
  /** Which service answered ("open-meteo" first, "met-no" as backup). */
  source?: string;
  /** Why there is no live reading (for checking only, never shown). */
  reason?: string;
};

/** How often the weather is re-checked while a page stays open. */
export const WEATHER_REFRESH_MS = 10 * 60 * 1000;

/** A reading older than this is no longer "now": it is hidden until a fresh one arrives. */
export const WEATHER_MAX_AGE_MS = 60 * 60 * 1000;

/** How old a reading is, or null when it carries no time. */
export function weatherAgeMs(w: Pick<LiveWeather, "updatedAt">, now: number = Date.now()): number | null {
  const at = w.updatedAt ? Date.parse(w.updatedAt) : NaN;
  return Number.isFinite(at) ? Math.max(0, now - at) : null;
}

/** Live, and recent enough to be shown as the weather "now". */
export function isWeatherFresh(w: LiveWeather | null | undefined, now: number = Date.now()): w is LiveWeather {
  if (!w?.live) return false;
  const age = weatherAgeMs(w, now);
  return age === null ? !w.stale : age <= WEATHER_MAX_AGE_MS;
}

const TIME = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
/** "2:05 pm" (IST) for the reading time, or "" when unknown. */
export const weatherTime = (w: LiveWeather) => (w.updatedAt ? TIME.format(new Date(w.updatedAt)) : "");

export const NEUTRAL_WEATHER: LiveWeather = {
  live: false,
  place: "Karnataka",
  condition: "clear",
  label: "clear",
  tempC: 24,
  windKmh: 9,
  windFromDeg: 250,
  windFrom: "WSW",
  isDay: true,
  humidity: 60,
  cloudCover: 25,
  precipMm: 0,
};

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function compassPoint(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  return POINTS[Math.round(d / 22.5) % 16];
}

/** WMO weather code + readings → the five scene conditions and a short label. */
export function classifyWeather(input: {
  code: number;
  precipMm: number;
  cloudCover: number;
  humidity: number;
}): { condition: WeatherCondition; label: string } {
  const { code, precipMm, cloudCover, humidity } = input;
  if (code >= 95) return { condition: "storm", label: "thunderstorm" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || precipMm >= 0.1) {
    if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return { condition: "rain", label: "drizzle" };
    if (code === 65 || code === 67 || code === 82 || precipMm >= 4) return { condition: "rain", label: "heavy rain" };
    if (code === 61 || code === 80 || precipMm < 1) return { condition: "rain", label: "light rain" };
    return { condition: "rain", label: "rain" };
  }
  if (code === 45 || code === 48) return { condition: "mist", label: "fog" };
  if (humidity >= 90 && cloudCover >= 60) return { condition: "mist", label: "misty" };
  if (code === 3 || cloudCover >= 70) return { condition: "cloudy", label: "overcast" };
  if (code === 2 || cloudCover >= 35) return { condition: "cloudy", label: "partly cloudy" };
  if (code === 1) return { condition: "clear", label: "mostly clear" };
  return { condition: "clear", label: "clear" };
}

function isLiveWeather(v: unknown): v is LiveWeather {
  if (!v || typeof v !== "object") return false;
  const w = v as Record<string, unknown>;
  return (
    typeof w.condition === "string" &&
    typeof w.tempC === "number" &&
    typeof w.windKmh === "number" &&
    typeof w.windFromDeg === "number" &&
    typeof w.isDay === "boolean"
  );
}

const cache = new Map<string, { at: number; p: Promise<LiveWeather> }>();
/** Readings come in 15-minute steps and pages are cached briefly: up to this age is normal for a new page. */
const SEED_GRACE_MS = 20 * 60 * 1000;

function cacheKey(key: { slug?: string; region?: string }): string {
  return key.slug ? `slug=${encodeURIComponent(key.slug)}` : `region=${encodeURIComponent(key.region ?? "")}`;
}

/** Browser: weather the server already put in the page, so no request is needed. */
export function seedLiveWeather(key: { slug?: string; region?: string } | null, weather: LiveWeather): void {
  if (!key || (!key.slug && !key.region) || !weather.live) return;
  const qs = cacheKey(key);
  if (cache.has(qs)) return;
  // The page's own reading counts as fresh only for as long as it really is. A page served from
  // the CDN hours after it was built carries an old reading: that one is re-checked straight away
  // instead of after ten minutes.
  const olderThanGrace = Math.max(0, (weatherAgeMs(weather) ?? 0) - SEED_GRACE_MS);
  cache.set(qs, { at: Date.now() - olderThanGrace, p: Promise.resolve(weather) });
}

/** Browser: one request per destination per page view, shared by every photo of that trip. */
export function fetchLiveWeather(key: { slug?: string; region?: string } | null): Promise<LiveWeather> {
  if (!key || (!key.slug && !key.region)) return Promise.resolve(NEUTRAL_WEATHER);
  const qs = cacheKey(key);
  const hit = cache.get(qs);
  // Shared by every photo / badge of that destination, re-checked every 10 minutes.
  if (hit && Date.now() - hit.at < WEATHER_REFRESH_MS) return hit.p;
  const previous = hit?.p;
  const p = fetch(`/api/weather?${qs}`, { credentials: "omit" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: unknown) => (isLiveWeather(j) ? j : null))
    .catch(() => null)
    // A failed re-check keeps what is already on screen instead of blanking it.
    .then(async (w) => w ?? (previous ? await previous : NEUTRAL_WEATHER));
  cache.set(qs, { at: Date.now(), p });
  return p;
}

/** Calls `onWeather` with fresh weather every 10 minutes while the page is visible (and on return). */
export function watchLiveWeather(key: { slug?: string; region?: string } | null, onWeather: (w: LiveWeather) => void): () => void {
  if (!key || (!key.slug && !key.region) || typeof window === "undefined") return () => {};
  let stopped = false;
  const check = () => {
    if (stopped || document.visibilityState !== "visible") return;
    void fetchLiveWeather(key).then((w) => {
      if (!stopped) onWeather(w);
    });
  };
  const timer = window.setInterval(check, WEATHER_REFRESH_MS);
  document.addEventListener("visibilitychange", check);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", check);
  };
}
