import { NextResponse } from "next/server";
import { getDestinationWeather } from "@/lib/weather-server";

/**
 * Current weather at a trip's destination, for the living photos.
 * Only the destination's fixed coordinates go to Open-Meteo (no key, no visitor data).
 * Cached for 15 minutes. If anything fails we answer with a neutral default (`live: false`)
 * so the scene keeps animating and the "Live in ..." chip simply stays hidden.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const weather = await getDestinationWeather(url.searchParams.get("slug"), url.searchParams.get("region"), {
    retry: true,
  });
  // A failed lookup is cached for a minute only, so a short outage doesn't hide the weather for 15 minutes.
  const headers = weather.live
    ? { "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=1800" }
    : { "Cache-Control": "public, max-age=30, s-maxage=60" };
  return NextResponse.json(weather, { headers });
}
