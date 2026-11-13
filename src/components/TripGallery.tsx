"use client";

import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { LivingPhoto } from "@/components/living/LivingPhoto";
import type { LiveWeather } from "@/components/living/weather";
import { isOptimizableImage } from "@/lib/media";

type Props = {
  title: string;
  destination: string;
  slug: string;
  region: string;
  heroUrl: string;
  galleryUrls: string[];
  weather: LiveWeather | null;
};

/**
 * Trip photos: the big living photo plus thumbnails. Tapping any photo opens it full screen,
 * where visitors can swipe, use the arrows or the keyboard, and close with Esc or the X.
 */
export function TripGallery({ title, destination, slug, region, heroUrl, galleryUrls, weather }: Props) {
  const photos = Array.from(new Set([heroUrl, ...galleryUrls].filter(Boolean)));
  const thumbs = galleryUrls.filter((u) => u && u !== heroUrl).slice(0, 3);
  const [open, setOpen] = useState<number | null>(null);

  const label = (i: number) => (i === 0 ? `${title} — ${destination}` : `${destination} photo ${i + 1}`);

  return (
    <div className="space-y-3">
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-stone-200 bg-stone-200">
        <LivingPhoto
          variant="hero"
          slug={slug}
          region={region}
          src={heroUrl}
          initialWeather={weather}
          alt={label(0)}
          priority
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="object-cover"
        />
        <button
          type="button"
          onClick={() => setOpen(0)}
          className="group absolute inset-0 z-[5] cursor-zoom-in"
          aria-label={`Open photo 1 of ${photos.length} full screen`}
        >
          <span className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-forest-900 shadow-sm transition group-hover:bg-white">
            <Expand className="h-3.5 w-3.5" aria-hidden="true" />
            {photos.length > 1 ? `${photos.length} photos` : "View"}
          </span>
        </button>
      </div>

      {thumbs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {thumbs.map((url) => {
            const i = photos.indexOf(url);
            return (
              <button
                key={url}
                type="button"
                onClick={() => setOpen(i)}
                className="relative aspect-[3/2] cursor-zoom-in overflow-hidden rounded-xl border border-stone-200 bg-stone-200"
                aria-label={`Open photo ${i + 1} of ${photos.length} full screen`}
              >
                <LivingPhoto
                  variant="card"
                  slug={slug}
                  region={region}
                  src={url}
                  initialWeather={weather}
                  alt={label(i)}
                  sizes="(max-width: 1024px) 33vw, 20vw"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      {open !== null && <Lightbox photos={photos} start={open} label={label} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Lightbox({
  photos,
  start,
  label,
  onClose,
}: {
  photos: string[];
  start: number;
  label: (i: number) => string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const n = photos.length;
  const go = useCallback((step: number) => setIndex((i) => (i + step + n) % n), [n]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      before?.focus?.();
    };
  }, [go, onClose]);

  const src = photos[index];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${n}`}
      className="fixed inset-0 z-[80] flex flex-col bg-[#0e3832] text-white"
      style={{ animation: "promo-fade-kf 200ms ease-out both" }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-sm font-semibold">{label(index)}</p>
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-xs text-white/75">
            {index + 1} / {n}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close photo"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1 touch-pan-y select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const mx = e.clientX - d.x;
          if (Math.abs(mx) > Math.abs(e.clientY - d.y)) setDx(mx);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.id !== e.pointerId) return;
          const mx = e.clientX - d.x;
          setDx(0);
          if (n > 1 && Math.abs(mx) > 50) go(mx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDx(0);
        }}
      >
        <div
          className="absolute inset-0 px-2 pb-2 sm:px-16"
          style={{ transform: `translateX(${dx}px)`, transition: dx ? "none" : "transform 220ms ease-out" }}
        >
          <div className="relative h-full w-full">
            <Image
              key={src}
              src={src}
              alt={label(index)}
              fill
              sizes="100vw"
              priority
              unoptimized={!isOptimizableImage(src)}
              className="object-contain"
              draggable={false}
            />
          </div>
        </div>

        {n > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute top-1/2 left-2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 sm:left-4"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute top-1/2 right-2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 sm:right-4"
            >
              <ChevronRight className="h-6 w-6" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      {n > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto px-4 pt-1 pb-4">
          {photos.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === index ? "border-saffron-500" : "border-transparent opacity-70"}`}
            >
              <Image src={p} alt="" fill sizes="64px" unoptimized={!isOptimizableImage(p)} className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
