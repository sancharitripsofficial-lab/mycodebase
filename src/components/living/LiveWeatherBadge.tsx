"use client";

import { CloudRain, CloudSun, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { seedLiveWeather, watchLiveWeather, weatherTime, type LiveWeather } from "./weather";

function Icon({ w }: { w: LiveWeather }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (w.condition === "rain" || w.condition === "storm") return <CloudRain className={cls} aria-hidden="true" />;
  if (w.condition === "clear" && w.isDay) return <Sun className={cls} aria-hidden="true" />;
  return <CloudSun className={cls} aria-hidden="true" />;
}

/**
 * Live weather for a trip, shown with the first paint (from the server) and then kept live:
 * re-checked every 10 minutes while the page is open, and when the visitor comes back to the tab.
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
  const [w, setW] = useState<LiveWeather | null>(initial);

  useEffect(() => {
    const key = { slug, ...(region ? { region } : {}) };
    if (initial?.live) seedLiveWeather(key, initial);
    return watchLiveWeather(key, (fresh) => {
      if (fresh.live) setW(fresh);
    });
  }, [slug, region, initial]);

  if (!w?.live) return null;
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
      </span>
    </p>
  );
}
