"use client";

import { Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Promotion } from "@/lib/data/promotions";
import { classifyVideoLink, isOptimizableImage } from "@/lib/media";
import { THEME_BG } from "./track";

function youtubeId(url: string): string | null {
  const v = classifyVideoLink(url);
  return v.kind === "youtube" ? v.embedUrl.split("/embed/")[1] ?? null : null;
}

/**
 * The picture, video or YouTube clip of an offer, filling its box (the parent sets the size).
 * Videos play muted and only while on screen; YouTube loads only after a tap.
 */
export function PromoMedia({ promo, sizes, priority = false }: { promo: Promotion; sizes: string; priority?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ytOpen, setYtOpen] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) void v.play().catch(() => undefined);
        else v.pause();
      },
      { threshold: 0.25 }
    );
    io.observe(v);
    return () => io.disconnect();
  }, [promo.mediaUrl]);

  if (promo.mediaType === "image" && promo.mediaUrl) {
    return isOptimizableImage(promo.mediaUrl) ? (
      <Image src={promo.mediaUrl} alt="" fill sizes={sizes} priority={priority} className="object-cover" />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={promo.mediaUrl} alt="" loading={priority ? "eager" : "lazy"} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
    );
  }

  if (promo.mediaType === "video" && promo.mediaUrl) {
    return (
      <video
        ref={videoRef}
        src={promo.mediaUrl}
        poster={promo.posterUrl || undefined}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  if (promo.mediaType === "youtube") {
    const id = youtubeId(promo.mediaUrl);
    if (id) {
      return ytOpen ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
          title={promo.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setYtOpen(true)}
          className="group absolute inset-0 h-full w-full"
          aria-label={`Play video: ${promo.title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-[#0B5683]/20 transition group-hover:bg-[#0B5683]/10" />
          <span className="absolute top-1/2 left-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-copper-600 shadow-lg transition group-hover:scale-105">
            <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden="true" />
          </span>
        </button>
      );
    }
  }

  // No media: a moving light over the brand colour so the banner still feels alive.
  return (
    <div className={`absolute inset-0 overflow-hidden ${THEME_BG[promo.theme]}`} aria-hidden="true">
      <div className="promo-sheen absolute -inset-1/2" />
      <svg viewBox="0 0 400 200" className="absolute right-0 bottom-0 h-full w-auto opacity-25" preserveAspectRatio="xMaxYMax meet">
        <path d="M40 190 C160 190 330 170 330 120 C330 70 120 90 120 45 C120 15 220 8 380 8" fill="none" stroke="white" strokeWidth="14" strokeLinecap="round" />
        <path d="M40 190 C160 190 330 170 330 120 C330 70 120 90 120 45 C120 15 220 8 380 8" fill="none" stroke="#0B5683" strokeWidth="2" strokeDasharray="10 12" className="promo-dash" />
      </svg>
    </div>
  );
}
