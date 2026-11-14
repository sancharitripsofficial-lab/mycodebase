import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/components/living/scenes";
import { getPublishedTripsWithDetails } from "@/lib/data/repository";
import { getDestinationWeather } from "@/lib/weather-server";

/**
 * Live weather at a trip's destination, for the photos and weather badges (refreshed by the
 * browser every 10 minutes). Only the destination's coordinates go to Open-Meteo (no key, no
 * visitor data). Trips without built-in coordinates use their own destination name, so a trip
 * the owner adds later (e.g. Murudeshwar) still gets its real local weather.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const region = url.searchParams.get("region");
  let destination: string | null = null;
  if (slug && !DESTINATIONS[slug]) {
    const { trips } = await getPublishedTripsWithDetails();
    destination = trips.find((t) => t.trip.slug === slug)?.trip.destination ?? null;
  }
  const weather = await getDestinationWeather(slug, region, { retry: true, destination });
  // Fresh readings are shared for 10 minutes; a failed lookup only for a minute.
  const headers =
    weather.live && !weather.stale
      ? { "Cache-Control": "public, max-age=120, s-maxage=600, stale-while-revalidate=600" }
      : { "Cache-Control": "public, max-age=30, s-maxage=60" };
  return NextResponse.json(weather, { headers });
}
