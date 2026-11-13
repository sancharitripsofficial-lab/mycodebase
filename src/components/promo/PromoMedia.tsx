"use client";

import { Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode, type RefObject, type SyntheticEvent } from "react";
import type { Promotion } from "@/lib/data/promotions";
import { classifyVideoLink, isOptimizableImage } from "@/lib/media";
import { THEME_BG } from "./track";

function youtubeId(url: string): string | null {
  const v = classifyVideoLink(url);
  return v.kind === "youtube" ? v.embedUrl.split("/embed/")[1] ?? null : null;
}

/**
 * Fits uploaded media to its box on every screen size. When the picture or video is a very
 * different shape from the box (a tall phone video in a wide phone banner, a wide photo in the
 * tall popup), the whole picture is shown ("contain") over a soft blurred copy of itself,
 * instead of cutting off heads, text or the product. Close shapes simply fill the box.
 */
function useSmartFit(dims: { w: number; h: number } | null) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !dims || !dims.w || !dims.h) return;
    const decide = () => {
      const r = box.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const media = dims.w / dims.h;
      const frame = r.width / r.height;
      setFit(Math.max(media / frame, frame / media) > 1.28 ? "contain" : "cover");
    };
    decide();
    const ro = new ResizeObserver(decide);
    ro.observe(box);
    return () => ro.disconnect();
  }, [dims]);
  return { boxRef, fit };
}

function FitBox({
  boxRef,
  backdrop,
  children,
}: {
  boxRef: RefObject<HTMLDivElement | null>;
  backdrop: ReactNode;
  children: ReactNode;
}) {
  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden">
      {backdrop}
      {children}
    </div>
  );
}

/**
 * The picture, video or YouTube clip of an offer, filling its box (the parent sets the size).
 * Videos play muted and only while on screen; YouTube loads only after a tap.
 */
export function PromoMedia({ promo, sizes, priority = false }: { promo: Promotion; sizes: string; priority?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ytOpen, setYtOpen] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const { boxRef, fit } = useSmartFit(dims);
  const objectFit = fit === "contain" ? "object-contain" : "object-cover";

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
    const onImg = (e: SyntheticEvent<HTMLImageElement>) =>
      setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
    const optimise = isOptimizableImage(promo.mediaUrl);
    const backdrop =
      fit === "contain" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={promo.mediaUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl saturate-150"
        />
      ) : null;
    return (
      <FitBox boxRef={boxRef} backdrop={backdrop}>
        {optimise ? (
          <Image src={promo.mediaUrl} alt="" fill sizes={sizes} priority={priority} onLoad={onImg} className={objectFit} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={promo.mediaUrl}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            onLoad={onImg}
            className={`absolute inset-0 h-full w-full ${objectFit}`}
          />
        )}
      </FitBox>
    );
  }

  if (promo.mediaType === "video" && promo.mediaUrl) {
    const backdrop =
      fit === "contain" ? (
        promo.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={promo.posterUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl saturate-150"
          />
        ) : (
          <div className={`absolute inset-0 ${THEME_BG[promo.theme]}`} aria-hidden="true" />
        )
      ) : null;
    return (
      <FitBox boxRef={boxRef} backdrop={backdrop}>
        <video
          ref={videoRef}
          src={promo.mediaUrl}
          poster={promo.posterUrl || undefined}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          onLoadedMetadata={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
          className={`absolute inset-0 h-full w-full ${objectFit}`}
        />
      </FitBox>
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
