"use client";

import { CloudRain, CloudSun, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useShownWeather } from "./useShownWeather";
import { fetchLiveWeather, seedLiveWeather, watchLiveWeather, weatherTime, type LiveWeather } from "./weather";

function Icon({ w }: { w: LiveWeather }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (w.condition === "rain" || w.condition === "storm") return <CloudRain className={cls} aria-hidden="true" />;
  if (w.condition === "clear" && w.isDay) return <Sun className={cls} aria-hidden="true" />;
  return <CloudSun className={cls} aria-hidden="true" />;
}

/**
 * Live weather for a trip, shown with the first paint (from the server) and then kept live:
 * re-checked every 10 minutes while the page is open, and when the visitor comes back to the tab.
 * Each reading carries the time it was taken, and one more than an hour old is not shown at all.
 */
export function LiveWeatherBadge({
  slug,
  region,
  initial,
  variant,
  className = "",
}: {
  slug: string;
  region?: string | null;
  initial: LiveWeather | null;
  /** "temp": icon + temperature. "now": "Now in Kodagu: light rain · today 18–26°C · rain 60%". */
  variant: "temp" | "now";
  className?: string;
}) {
  const [latest, setLatest] = useState<LiveWeather | null>(initial);

  useEffect(() => {
    let cancelled = false;
    const key = { slug, ...(region ? { region } : {}) };
    if (initial?.live) seedLiveWeather(key, initial);
    const apply = (fresh: LiveWeather) => {
      if (!cancelled && fresh.live) setLatest(fresh);
    };
    // Straight away too: a page built hours ago gets today's reading as soon as it opens.
    void fetchLiveWeather(key).then(apply);
    const stop = watchLiveWeather(key, apply);
    return () => {
      cancelled = true;
      stop();
    };
  }, [slug, region, initial]);

  const w = useShownWeather(latest);
  if (!w) return null;
  if (variant === "temp") {
    return (
      <span className={className} title={weatherTime(w) ? `Updated ${weatherTime(w)}` : undefined}>
        <Icon w={w} />
        {w.tempC}°C
      </span>
    );
  }
  return (
    <p className={className}>
      <Icon w={w} />
      <span>
        Now in {w.place}: {w.label}
        {w.todayMinC != null && w.todayMaxC != null && <> · today {w.todayMinC}–{w.todayMaxC}°C</>}
        {w.rainChance != null && <> · rain {w.rainChance}%</>}
        {weatherTime(w) && <> · updated {weatherTime(w)}</>}
      </span>
    </p>
  );
}
