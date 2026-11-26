import { useEffect, useState } from "react";
import { isWeatherFresh, type LiveWeather } from "./weather";

/**
 * The reading to show as the weather "now": the latest live one, and only while it is fresh.
 *
 * A page can be served from the CDN long after it was built, with the weather of that moment in
 * its HTML. Until the browser has taken over, the reading is shown as the page has it (so the
 * first paint and the hydrated page agree); from then on a reading more than an hour old is hidden
 * until a fresh one arrives. It is checked again every few minutes, so a reading that grows old
 * on a page left open disappears too.
 */
export function useShownWeather(weather: LiveWeather | null): LiveWeather | null {
  const [mounted, setMounted] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setMounted(true);
    const timer = window.setInterval(() => setTick((n) => n + 1), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!weather?.live) return null;
  return !mounted || isWeatherFresh(weather) ? weather : null;
}
