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
};

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

const cache = new Map<string, Promise<LiveWeather>>();

function cacheKey(key: { slug?: string; region?: string }): string {
  return key.slug ? `slug=${encodeURIComponent(key.slug)}` : `region=${encodeURIComponent(key.region ?? "")}`;
}

/** Browser: weather the server already put in the page, so no request is needed. */
export function seedLiveWeather(key: { slug?: string; region?: string } | null, weather: LiveWeather): void {
  if (!key || (!key.slug && !key.region) || !weather.live) return;
  const qs = cacheKey(key);
  if (!cache.has(qs)) cache.set(qs, Promise.resolve(weather));
}

/** Browser: one request per destination per page view, shared by every photo of that trip. */
export function fetchLiveWeather(key: { slug?: string; region?: string } | null): Promise<LiveWeather> {
  if (!key || (!key.slug && !key.region)) return Promise.resolve(NEUTRAL_WEATHER);
  const qs = cacheKey(key);
  let p = cache.get(qs);
  if (!p) {
    p = fetch(`/api/weather?${qs}`, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => (isLiveWeather(j) ? j : NEUTRAL_WEATHER))
      .catch(() => NEUTRAL_WEATHER);
    cache.set(qs, p);
  }
  return p;
}
