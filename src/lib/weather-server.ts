import { DESTINATIONS, REGIONS } from "@/components/living/scenes";
import { classifyWeather, compassPoint, NEUTRAL_WEATHER, type LiveWeather } from "@/components/living/weather";

/**
 * Live weather at a trip's destination from Open-Meteo (no key; only the place's coordinates are
 * sent, never anything about the visitor). Accurate and always on:
 *  - The place is exact: built-in coordinates for our trips, the trip's own destination looked up
 *    by name for trips the owner adds later (e.g. "Murudeshwar"), the region only as a last resort.
 *  - Fresh: re-checked every 10 minutes (Open-Meteo's own current conditions update every 15).
 *  - Today's high / low and chance of rain come with it, plus the time of the reading.
 *  - Never blank on a hiccup: if the service is unreachable, the last good reading (up to 3 hours
 *    old) is shown with its time; only after that does the weather hide.
 * Never throws.
 */

const FRESH_SECONDS = 600;
const KEEP_LAST_GOOD_MS = 3 * 60 * 60 * 1000;

type Coords = { latitude: number; longitude: number; place: string };
const lastGood = new Map<string, { at: number; weather: LiveWeather }>();

/** "Kodagu (Coorg), Karnataka" -> "Kodagu"; "Murudeshwar, Uttara Kannada" -> "Murudeshwar". */
export function placeQuery(destination: string): string {
  return destination.replace(/\(.*?\)/g, "").split(/[,|·–—-]/)[0].trim();
}

/** Common spellings the place search doesn't know, mapped to the town it does (same weather). */
const PLACE_ALIASES: Record<string, string> = {
  murudeshwar: "Murdeshwar",
  murudeshwara: "Murdeshwar",
  murdeshwara: "Murdeshwar",
  coorg: "Madikeri",
  kodagu: "Madikeri",
  wayanad: "Kalpetta",
  chikkamagaluru: "Chikmagalur",
  mysuru: "Mysore",
  belagavi: "Belgaum",
  kalaburagi: "Gulbarga",
  shivamogga: "Shimoga",
  mangaluru: "Mangalore",
};

/** Coordinates for a place name in India (Karnataka preferred), cached for a week. */
async function geocode(name: string, timeoutMs: number): Promise<Coords | null> {
  if (!name || name.length < 3) return null;
  const alias = PLACE_ALIASES[name.toLowerCase()];
  return (await geocodeOnce(name, timeoutMs)) ?? (alias ? await geocodeOnce(alias, timeoutMs, name) : null);
}

async function geocodeOnce(name: string, timeoutMs: number, showAs?: string): Promise<Coords | null> {
  try {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search" +
      `?name=${encodeURIComponent(name)}&count=8&language=en&format=json&countryCode=IN`;
    const res = await fetch(url, { next: { revalidate: 7 * 24 * 3600 }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: { name: string; latitude: number; longitude: number; admin1?: string }[] };
    const list = json.results ?? [];
    const best = list.find((r) => r.admin1 === "Karnataka") ?? list[0];
    if (!best || !Number.isFinite(best.latitude) || !Number.isFinite(best.longitude)) return null;
    return { latitude: best.latitude, longitude: best.longitude, place: showAs ?? best.name };
  } catch {
    return null;
  }
}

/** Where to read the weather for a trip: exact preset > the trip's own destination > its region. */
export async function resolveWeatherPlace(
  slug: string | null | undefined,
  region: string | null | undefined,
  destination: string | null | undefined,
  timeoutMs = 2500,
): Promise<Coords | null> {
  if (slug && DESTINATIONS[slug]) {
    const d = DESTINATIONS[slug];
    return { latitude: d.latitude, longitude: d.longitude, place: d.place };
  }
  const found = destination ? await geocode(placeQuery(destination), timeoutMs) : null;
  if (found) return found;
  const r = region ? REGIONS[region.trim().toLowerCase()] : undefined;
  return r ? { latitude: r.latitude, longitude: r.longitude, place: r.place } : null;
}

export async function getDestinationWeather(
  slug?: string | null,
  region?: string | null,
  opts: { timeoutMs?: number; retry?: boolean; destination?: string | null } = {},
): Promise<LiveWeather> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const where = await resolveWeatherPlace(slug, region, opts.destination, Math.min(timeoutMs, 2500));
  if (!where) return NEUTRAL_WEATHER;
  const key = `${where.latitude.toFixed(3)},${where.longitude.toFixed(3)}`;
  const fallback = (): LiveWeather => {
    const kept = lastGood.get(key);
    if (kept && Date.now() - kept.at < KEEP_LAST_GOOD_MS) return { ...kept.weather, stale: true };
    return { ...NEUTRAL_WEATHER, place: where.place };
  };

  try {
    const api =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${where.latitude}&longitude=${where.longitude}` +
      "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&forecast_days=1&timezone=Asia/Kolkata";
    let res = await fetch(api, { next: { revalidate: FRESH_SECONDS }, signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
    if ((!res || !res.ok) && opts.retry) {
      await new Promise((r) => setTimeout(r, 400));
      res = await fetch(api, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
    }
    if (!res || !res.ok) {
      console.error("[weather] lookup failed:", res ? res.status : "network/timeout");
      return fallback();
    }

    const json = (await res.json()) as { current?: Record<string, unknown>; daily?: Record<string, unknown> };
    const c = json.current ?? {};
    const num = (k: string): number | null => (typeof c[k] === "number" && Number.isFinite(c[k]) ? (c[k] as number) : null);
    const day = (k: string): number | null => {
      const v = (json.daily ?? {})[k];
      return Array.isArray(v) && typeof v[0] === "number" && Number.isFinite(v[0]) ? (v[0] as number) : null;
    };

    const tempC = num("temperature_2m");
    const windKmh = num("wind_speed_10m");
    const windFromDeg = num("wind_direction_10m");
    if (tempC === null || windKmh === null || windFromDeg === null) return fallback();

    const humidity = num("relative_humidity_2m") ?? 60;
    const cloudCover = num("cloud_cover") ?? 30;
    const precipMm = num("precipitation") ?? 0;
    const code = num("weather_code") ?? 0;
    const { condition, label } = classifyWeather({ code, precipMm, cloudCover, humidity });
    // Open-Meteo gives the reading time in the requested zone (IST) without an offset.
    const time = typeof c.time === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(c.time) ? `${c.time}:00+05:30` : new Date().toISOString();
    const maxC = day("temperature_2m_max");
    const minC = day("temperature_2m_min");
    const rain = day("precipitation_probability_max");

    const weather: LiveWeather = {
      live: true,
      place: where.place,
      condition,
      label,
      tempC: Math.round(tempC),
      windKmh: Math.round(windKmh),
      windFromDeg: Math.round(windFromDeg),
      windFrom: compassPoint(windFromDeg),
      isDay: num("is_day") !== 0,
      humidity: Math.round(humidity),
      cloudCover: Math.round(cloudCover),
      precipMm,
      todayMaxC: maxC === null ? null : Math.round(maxC),
      todayMinC: minC === null ? null : Math.round(minC),
      rainChance: rain === null ? null : Math.round(rain),
      updatedAt: new Date(time).toISOString(),
    };
    lastGood.set(key, { at: Date.now(), weather });
    return weather;
  } catch {
    return fallback();
  }
}
