import { findDestination } from "@/components/living/scenes";
import { classifyWeather, compassPoint, NEUTRAL_WEATHER, type LiveWeather } from "@/components/living/weather";

/**
 * Current weather at a trip's destination (Open-Meteo, no key, only the place's fixed
 * coordinates are sent). Cached by Next for 15 minutes. Never throws: on any failure the
 * answer is a neutral default with `live: false`, so pages render on time regardless.
 */
export async function getDestinationWeather(
  slug?: string | null,
  region?: string | null,
  opts: { timeoutMs?: number; retry?: boolean } = {}
): Promise<LiveWeather> {
  const dest = findDestination(slug, region);
  if (!dest) return NEUTRAL_WEATHER;
  const fallback: LiveWeather = { ...NEUTRAL_WEATHER, place: dest.place };
  const timeoutMs = opts.timeoutMs ?? 5000;

  try {
    const api =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${dest.latitude}&longitude=${dest.longitude}` +
      "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day" +
      "&timezone=Asia/Kolkata";
    let res = await fetch(api, { next: { revalidate: 900 }, signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
    if ((!res || !res.ok) && opts.retry) {
      await new Promise((r) => setTimeout(r, 400));
      res = await fetch(api, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
    }
    if (!res || !res.ok) {
      console.error("[weather] lookup failed:", res ? res.status : "network/timeout");
      return fallback;
    }

    const json = (await res.json()) as { current?: Record<string, unknown> };
    const c = json.current ?? {};
    const num = (k: string): number | null => (typeof c[k] === "number" && Number.isFinite(c[k]) ? (c[k] as number) : null);

    const tempC = num("temperature_2m");
    const windKmh = num("wind_speed_10m");
    const windFromDeg = num("wind_direction_10m");
    if (tempC === null || windKmh === null || windFromDeg === null) return fallback;

    const humidity = num("relative_humidity_2m") ?? 60;
    const cloudCover = num("cloud_cover") ?? 30;
    const precipMm = num("precipitation") ?? 0;
    const code = num("weather_code") ?? 0;
    const { condition, label } = classifyWeather({ code, precipMm, cloudCover, humidity });

    return {
      live: true,
      place: dest.place,
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
    };
  } catch {
    return fallback;
  }
}
