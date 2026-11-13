import { NextResponse } from "next/server";
import { findDestination } from "@/components/living/scenes";
import { classifyWeather, compassPoint, NEUTRAL_WEATHER, type LiveWeather } from "@/components/living/weather";

/**
 * Current weather at a trip's destination, for the living photos.
 * Only the destination's fixed coordinates go to Open-Meteo (no key, no visitor data).
 * Cached for 15 minutes. If anything fails we answer with a neutral default (`live: false`)
 * so the scene keeps animating and the "Live in ..." chip simply stays hidden.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const region = url.searchParams.get("region");
  const dest = findDestination(slug, region);

  const headers = { "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=1800" };
  if (!dest) return NextResponse.json(NEUTRAL_WEATHER, { headers });

  const fallback: LiveWeather = { ...NEUTRAL_WEATHER, place: dest.place };

  try {
    const api =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${dest.latitude}&longitude=${dest.longitude}` +
      "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day" +
      "&timezone=Asia/Kolkata";
    const res = await fetch(api, { next: { revalidate: 900 }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return NextResponse.json(fallback, { headers });

    const json = (await res.json()) as { current?: Record<string, unknown> };
    const c = json.current ?? {};
    const num = (k: string): number | null => (typeof c[k] === "number" && Number.isFinite(c[k]) ? (c[k] as number) : null);

    const tempC = num("temperature_2m");
    const windKmh = num("wind_speed_10m");
    const windFromDeg = num("wind_direction_10m");
    if (tempC === null || windKmh === null || windFromDeg === null) return NextResponse.json(fallback, { headers });

    const humidity = num("relative_humidity_2m") ?? 60;
    const cloudCover = num("cloud_cover") ?? 30;
    const precipMm = num("precipitation") ?? 0;
    const code = num("weather_code") ?? 0;
    const { condition, label } = classifyWeather({ code, precipMm, cloudCover, humidity });

    const body: LiveWeather = {
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
    return NextResponse.json(body, { headers });
  } catch {
    return NextResponse.json(fallback, { headers });
  }
}
