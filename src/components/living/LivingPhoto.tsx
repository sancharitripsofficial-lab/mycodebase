"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { isOptimizableImage } from "@/lib/media";
import type { LivingHandle } from "./engine";
import { resolveScene } from "./scenes";
import { fetchLiveWeather, NEUTRAL_WEATHER, seedLiveWeather, type LiveWeather } from "./weather";

export type LivingPhotoProps = {
  src: string;
  alt: string;
  /** Same meaning as on next/image. The photo always fills its (position: relative) parent. */
  sizes?: string;
  priority?: boolean;
  /** Applied to the photo and to the living layer on top of it (e.g. "object-cover"). */
  className?: string;
  /** Defaults to "is this a local / Supabase photo the optimiser can handle". */
  unoptimized?: boolean;
  /**
   * "card": subtle (leaves swaying, light shimmer, a few falling leaves) for grids.
   * "hero": everything (clouds, mist, birds, flags, rain when it rains) plus the live weather chip.
   */
  variant?: "card" | "hero";
  /** Trip slug and region pick the destination (live weather, what drifts in the air). */
  slug?: string;
  region?: string;
  /** Hero only: show the "Live in ..." chip. Default true. */
  weatherChip?: boolean;
  /** Weather the server already looked up: the chip shows with the first paint, no request. */
  initialWeather?: LiveWeather | null;
};

function whenIdle(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: ms });
    else setTimeout(resolve, Math.min(ms, 250));
  });
}

/**
 * A photo that is alive. The normal next/image is always rendered first, so search engines,
 * the first paint and visitors without JavaScript / WebGL / with "reduce motion" see exactly
 * the same picture as before. Once the photo is on screen, a WebGL layer fades in on top and
 * re-draws the same picture with wind, drifting cloud, water, mist, leaves and live weather.
 * The layer never takes clicks or touches.
 */
export function LivingPhoto({
  src,
  alt,
  sizes,
  priority,
  className,
  unoptimized,
  variant = "card",
  slug,
  region,
  weatherChip = true,
  initialWeather = null,
}: LivingPhotoProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<LivingHandle | null>(null);
  const seeded = initialWeather?.live ? initialWeather : null;
  const weatherRef = useRef<LiveWeather>(seeded ?? NEUTRAL_WEATHER);
  const [shown, setShown] = useState(false);
  const [weather, setWeather] = useState<LiveWeather | null>(seeded);

  const scene = useMemo(() => resolveScene(src, slug, region), [src, slug, region]);
  if (seeded && typeof window !== "undefined") seedLiveWeather(scene.weatherKey, seeded);

  // Live weather for this destination (one request per destination, shared by all its photos).
  useEffect(() => {
    let cancelled = false;
    fetchLiveWeather(scene.weatherKey).then((w) => {
      if (cancelled) return;
      weatherRef.current = w;
      handleRef.current?.setWeather(w);
      setWeather(w);
    });
    return () => {
      cancelled = true;
    };
  }, [scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    if (new URLSearchParams(window.location.search).get("living") === "off") return;

    let cancelled = false;
    let started = false;
    let inView = false;
    let handle: LivingHandle | null = null;

    const start = async () => {
      if (started) return;
      started = true;
      try {
        if (!img.complete || !img.naturalWidth) {
          await new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          });
        }
        if (cancelled || !img.naturalWidth) return;
        await whenIdle(variant === "hero" ? 300 : 900); // never compete with the first paint
        if (cancelled) return;
        const { mountLiving } = await import("./engine");
        if (cancelled) return;
        const h = await mountLiving({
          canvas,
          src: img.currentSrc || img.src,
          scene,
          variant,
          weather: weatherRef.current,
          onShow: (show) => {
            if (!cancelled) setShown(show);
          },
        });
        if (cancelled) {
          h?.dispose();
          return;
        }
        handle = h;
        handleRef.current = h;
        h?.setVisible(inView);
      } catch {
        // Any failure simply leaves the normal photo in place.
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        inView = entries[entries.length - 1]?.isIntersecting ?? false;
        if (inView) void start();
        handle?.setVisible(inView);
      },
      { rootMargin: "80px" }
    );
    io.observe(canvas);

    return () => {
      cancelled = true;
      io.disconnect();
      handle?.dispose();
      handleRef.current = null;
      setShown(false);
    };
  }, [scene, variant]);

  const showChip = variant === "hero" && weatherChip && weather?.live;

  return (
    <>
      <Image
        ref={imgRef}
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={unoptimized ?? !isOptimizableImage(src)}
        className={className}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 h-full w-full select-none ${className ?? ""}`}
        style={{
          opacity: shown ? 1 : 0,
          transition: "opacity 1.2s ease, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
      {showChip && weather && <WeatherChip weather={weather} />}
    </>
  );
}

function WeatherChip({ weather }: { weather: LiveWeather }) {
  // The arrow points where the wind is going (up = north), like a weather vane.
  const blowingTo = (weather.windFromDeg + 180) % 360;
  return (
    <p
      className="pointer-events-none absolute bottom-2 left-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-x-2 gap-y-0 rounded-2xl border border-white/70 bg-cream-50/90 px-2.5 py-1 text-[10px] font-semibold leading-snug text-forest-900 shadow-[0_6px_20px_-8px_rgb(14_94_143/0.55)] backdrop-blur-sm sm:bottom-3 sm:left-3 sm:px-3 sm:py-1.5 sm:text-xs"
      style={{ animation: "living-chip-in 0.6s ease both" }}
    >
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-copper-600 opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-copper-600" />
        </span>
        <span>
          Live in {weather.place} · {weather.tempC}°C · {weather.label}
        </span>
      </span>
      <span className="flex items-center gap-1 text-forest-700">
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 shrink-0 text-copper-600"
          style={{ transform: `rotate(${blowingTo}deg)` }}
          aria-hidden="true"
        >
          <path d="M8 1.5 12.5 13 8 10.4 3.5 13Z" fill="currentColor" />
        </svg>
        <span>
          wind {weather.windKmh} km/h from {weather.windFrom}
        </span>
      </span>
      <style>{"@keyframes living-chip-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}"}</style>
    </p>
  );
}
