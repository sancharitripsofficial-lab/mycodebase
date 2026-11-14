import { afterEach, describe, expect, it, vi } from "vitest";
import { getDestinationWeather, placeQuery, resolveWeatherPlace } from "@/lib/weather-server";

const forecast = (over: Record<string, unknown> = {}) => ({
  current: {
    time: "2026-11-14T13:15",
    temperature_2m: 24.4,
    relative_humidity_2m: 81,
    precipitation: 0.4,
    weather_code: 61,
    cloud_cover: 90,
    wind_speed_10m: 11.2,
    wind_direction_10m: 250,
    is_day: 1,
    ...over,
  },
  daily: { temperature_2m_max: [27.6], temperature_2m_min: [18.2], precipitation_probability_max: [72] },
});

function mockFetch(handler: (url: string) => unknown | null) {
  const fn = vi.fn(async (url: string) => {
    const body = handler(String(url));
    if (body === null) throw new Error("offline");
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("live weather", () => {
  it("reads the place name from a trip's destination", () => {
    expect(placeQuery("Kodagu (Coorg), Karnataka")).toBe("Kodagu");
    expect(placeQuery("Murudeshwar, Uttara Kannada")).toBe("Murudeshwar");
  });

  it("uses exact built-in coordinates for our trips, and the trip's own place for new trips", async () => {
    const f = mockFetch((u) =>
      u.includes("geocoding") ? { results: [{ name: "Murudeshwar", latitude: 14.094, longitude: 74.4846, admin1: "Karnataka" }] } : null,
    );
    const coorg = await resolveWeatherPlace("coorg-rainforest-slow-drive", "Western Ghats", "Kodagu (Coorg), Karnataka");
    expect(coorg).toMatchObject({ place: "Kodagu", latitude: 12.4244 });
    expect(f).not.toHaveBeenCalled(); // no lookup needed for a built-in trip
    const scuba = await resolveWeatherPlace("scuba-diving", "Coastal Karnataka", "Murudeshwar, Karnataka");
    expect(scuba).toMatchObject({ place: "Murudeshwar", latitude: 14.094, longitude: 74.4846 });
  });

  it("knows common spellings: Murudeshwar is found as Murdeshwar but shown as written", async () => {
    mockFetch((u) =>
      u.includes("name=Murdeshwar")
        ? { results: [{ name: "Murdeshwar Island", latitude: 14.094, longitude: 74.4846, admin1: "Karnataka" }] }
        : u.includes("geocoding")
          ? { results: [] }
          : null,
    );
    const r = await resolveWeatherPlace("murudeshwar-scuba", "Coastal Karnataka", "Murudeshwar, Karnataka");
    expect(r).toMatchObject({ place: "Murudeshwar", latitude: 14.094 });
  });

  it("falls back to the region only when the place cannot be found", async () => {
    mockFetch((u) => (u.includes("geocoding") ? { results: [] } : null));
    const r = await resolveWeatherPlace("new-trip", "Coastal Karnataka", "Nowhere-ville");
    expect(r?.place).toBe("Karnataka coast");
  });

  it("gives now, today's high/low, chance of rain and the reading time (IST)", async () => {
    mockFetch((u) => (u.includes("api.open-meteo.com") ? forecast() : null));
    const w = await getDestinationWeather("hampi-boulders-and-ruins", "Heritage");
    expect(w).toMatchObject({ live: true, place: "Hampi", tempC: 24, label: "light rain", todayMaxC: 28, todayMinC: 18, rainChance: 72 });
    expect(w.updatedAt).toBe("2026-11-14T07:45:00.000Z"); // 13:15 IST
    expect(w.stale).toBeUndefined();
  });

  it("never goes blank on a hiccup: shows the last good reading, marked as such", async () => {
    mockFetch((u) => (u.includes("api.open-meteo.com") ? forecast({ temperature_2m: 30 }) : null));
    const good = await getDestinationWeather("gokarna-coastal-headlands", "Coastal Karnataka");
    expect(good.tempC).toBe(30);
    mockFetch(() => null); // service unreachable
    const later = await getDestinationWeather("gokarna-coastal-headlands", "Coastal Karnataka");
    expect(later).toMatchObject({ live: true, stale: true, tempC: 30, place: "Gokarna" });
  });

  it("switches to the backup service (MET Norway) when Open-Meteo refuses, keeping it live", async () => {
    const met = {
      properties: {
        timeseries: [
          {
            time: "2026-11-14T07:00:00Z",
            data: {
              instant: { details: { air_temperature: 25.1, relative_humidity: 50, cloud_area_fraction: 94, wind_speed: 1.6, wind_from_direction: 115 } },
              next_1_hours: { summary: { symbol_code: "lightrainshowers_day" }, details: { precipitation_amount: 0.6 } },
            },
          },
          { time: "2026-11-14T10:00:00Z", data: { instant: { details: { air_temperature: 27.4 } } } },
          { time: "2026-11-14T16:00:00Z", data: { instant: { details: { air_temperature: 19.6 } } } },
          { time: "2026-11-14T20:00:00Z", data: { instant: { details: { air_temperature: 15 } } } }, // next day in IST
        ],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("api.open-meteo.com")) return new Response("too many", { status: 429 });
        expect(new Headers(init?.headers).get("User-Agent")).toMatch(/Sanchari/); // MET Norway requires an identifying UA
        return new Response(JSON.stringify(met), { status: 200 });
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = await getDestinationWeather("coorg-rainforest-slow-drive", "Western Ghats");
    expect(w).toMatchObject({ live: true, source: "met-no", place: "Kodagu", tempC: 25, label: "light rain", windKmh: 6, todayMaxC: 27, todayMinC: 20, rainChance: null });
  });

  it("hides the weather (never invents it) when there has never been a good reading", async () => {
    mockFetch(() => null);
    const w = await getDestinationWeather("chikmagalur-coffee-trails", "Western Ghats");
    expect(w.live).toBe(false);
  });
});
