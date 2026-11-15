"use client";

import { Play, Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode, type RefObject, type SyntheticEvent } from "react";
import { useHasAudio } from "@/lib/use-has-audio";
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
function useSmartFit(dims: { w: number; h: number } | null, tolerance = 1.28) {
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
      setFit(Math.max(media / frame, frame / media) > tolerance ? "contain" : "cover");
    };
    decide();
    const ro = new ResizeObserver(decide);
    ro.observe(box);
    return () => ro.disconnect();
  }, [dims, tolerance]);
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
export function PromoMedia({
  promo,
  sizes,
  priority = false,
  cover = false,
  sound = false,
}: {
  promo: Promotion;
  sizes: string;
  priority?: boolean;
  /** Always fill the box (the pop-up's full-card film). */
  cover?: boolean;
  /** Show a Sound on/off button on videos (they always start muted). */
  sound?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  // Pictures are usually posters with words and a logo near the edges: never crop them (any
  // difference in shape shows the whole picture over its blurred copy). Videos may fill the box.
  const { boxRef, fit } = useSmartFit(dims, promo.mediaType === "image" ? 1.01 : 1.28);
  const objectFit = !cover && fit === "contain" ? "object-contain" : "object-cover";
  const [soundOn, setSoundOn] = useState(false);
  const soundRef = useRef(false);
  // Autoplay refused (iPad / iPhone Low Power Mode, data saver): show a play button and start on the
  // visitor's first tap anywhere instead of leaving a frozen picture.
  const [blocked, setBlocked] = useState(false);

  // The clip is fetched only when it comes near the screen (not with the page), then plays while
  // at least a quarter of it is visible, and picks up again when the visitor returns to the tab.
  const [near, setNear] = useState(false);
  const onScreen = useRef(false);
  const reduceMotion = useRef(false);
  const tryPlay = (v: HTMLVideoElement | null) => {
    if (!v || reduceMotion.current || !onScreen.current || document.visibilityState !== "visible") return;
    if (!v.currentSrc && !v.getAttribute("src")) return; // not loaded yet: canplay will start it
    if (!soundRef.current) {
      v.muted = true;
      v.defaultMuted = true;
    }
    void v.play().then(
      () => setBlocked(false),
      (err: unknown) => {
        if ((err as { name?: string } | null)?.name === "NotAllowedError") setBlocked(true);
      }
    );
  };
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // React does not write the "muted" attribute into the page; Safari needs it for autoplay.
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nearIo = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setNear(true);
          nearIo.disconnect();
        }
      },
      { rootMargin: "300px 0px" }
    );
    nearIo.observe(v);
    const io = new IntersectionObserver(
      ([e]) => {
        onScreen.current = Boolean(e?.isIntersecting && e.intersectionRatio >= 0.25);
        if (reduceMotion.current) return;
        if (onScreen.current) tryPlay(v);
        else v.pause();
      },
      { threshold: [0, 0.25] }
    );
    io.observe(v);
    const onVisible = () => {
      if (document.visibilityState === "visible") tryPlay(v);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      nearIo.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promo.mediaUrl]);
  // Autoplay was refused: the first tap / key press anywhere on the page starts the film.
  useEffect(() => {
    if (!blocked) return;
    const start = () => tryPlay(videoRef.current);
    document.addEventListener("pointerdown", start, { once: true, passive: true });
    document.addEventListener("keydown", start, { once: true });
    return () => {
      document.removeEventListener("pointerdown", start);
      document.removeEventListener("keydown", start);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);
  // Wide places (banners, tablets, computers) play the offer's wide copy of its film when it has
  // one, so a tall phone video is not shrunk to a strip; the phone pop-up keeps the tall one.
  const [boxWide, setBoxWide] = useState(false);
  const wideUrl = promo.mediaType === "video" ? (promo.wideMediaUrl ?? "") : "";
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !wideUrl) return;
    const decide = () => {
      const r = box.getBoundingClientRect();
      // Square-ish boxes (tablets, where the banner splits into two columns) take the wide film:
      // the two shapes meet at 1:1.
      if (r.width && r.height) setBoxWide(r.width / r.height >= 1);
    };
    decide();
    const ro = new ResizeObserver(decide);
    ro.observe(box);
    return () => ro.disconnect();
  }, [boxRef, wideUrl]);
  const videoSrc = wideUrl && boxWide ? wideUrl : promo.mediaUrl;
  // Only clips that really have sound get the button (our own films are silent).
  const hasAudio = useHasAudio(videoRef, near ? videoSrc : null);

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
    // An offer with both a tall and a wide film always fills its box with the closer shape (never a
    // thin strip with bars); a single film keeps the smart fit.
    const fill = cover || Boolean(wideUrl);
    const videoFit = fill ? "object-cover" : objectFit;
    const backdrop =
      !fill && fit === "contain" ? (
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
          src={near ? videoSrc : undefined}
          poster={promo.posterUrl || undefined}
          muted
          loop
          playsInline
          preload={near ? "auto" : "none"}
          aria-hidden="true"
          onLoadedMetadata={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
          onCanPlay={(e) => tryPlay(e.currentTarget)}
          className={`absolute inset-0 h-full w-full ${videoFit}`}
        />
        {blocked && (
          <button
            type="button"
            onClick={() => tryPlay(videoRef.current)}
            aria-label={`Play video: ${promo.title}`}
            className="group absolute inset-0 z-[5] flex items-center justify-center"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-copper-600 shadow-lg transition group-hover:scale-105">
              <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden="true" />
            </span>
          </button>
        )}
        {sound && hasAudio === true && (
          <button
            type="button"
            onClick={() => {
              const v = videoRef.current;
              const next = !soundOn;
              setSoundOn(next);
              soundRef.current = next;
              if (v) {
                v.muted = !next;
                if (next) v.volume = 1;
                void v.play().catch(() => undefined);
              }
            }}
            aria-label={soundOn ? "Turn sound off" : "Turn sound on"}
            className="absolute top-3 left-3 z-10 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/70"
          >
            {soundOn ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
            {soundOn ? "Sound on" : "Tap for sound"}
          </button>
        )}
      </FitBox>
    );
  }

  if (promo.mediaType === "youtube") {
    const id = youtubeId(promo.mediaUrl);
    if (id) return <YouTubeLoop id={id} title={promo.title} isShort={/\/shorts\//i.test(promo.mediaUrl)} />;
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

/**
 * A YouTube clip in an offer: plays by itself, muted, on a loop, once the offer is on screen (the
 * player loads only then). Shorts keep their tall shape over a blurred copy of their picture
 * instead of black bars. "Sound on" unmutes; visitors who prefer less motion get a play button.
 */
function YouTubeLoop({ id, title, isShort }: { id: string; title: string; isShort: boolean }) {
  const box = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [live, setLive] = useState(false);
  const [manual, setManual] = useState(false);
  const [sound, setSound] = useState(false);
  const thumb = `https://i.ytimg.com/vi/${id}/${isShort ? "oar2" : "hqdefault"}.jpg`;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setManual(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting && e.intersectionRatio >= 0.25) {
          setLive(true);
          io.disconnect();
        }
      },
      { threshold: [0, 0.25] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const command = (func: string) =>
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");

  const params = `autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&rel=0&modestbranding=1&enablejsapi=1`;

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden bg-[#0f2b2b]">
      {/* Blurred picture behind (fills the sides of a tall Short). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl saturate-150"
      />
      <div className={isShort ? "absolute inset-y-0 left-1/2 aspect-[9/16] h-full -translate-x-1/2" : "absolute inset-0"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt=""
          aria-hidden="true"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {live && (
          <iframe
            ref={frame}
            src={`https://www.youtube-nocookie.com/embed/${id}?${params}`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        )}
      </div>
      {manual && !live && (
        <button
          type="button"
          onClick={() => setLive(true)}
          className="group absolute inset-0 h-full w-full"
          aria-label={`Play video: ${title}`}
        >
          <span className="absolute top-1/2 left-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-copper-600 shadow-lg transition group-hover:scale-105">
            <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden="true" />
          </span>
        </button>
      )}
      {live && (
        <button
          type="button"
          onClick={() => {
            command(sound ? "mute" : "unMute");
            command("playVideo");
            setSound(!sound);
          }}
          className="absolute top-3 left-3 z-10 inline-flex min-h-9 items-center rounded-full bg-black/55 px-3 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/70"
          aria-label={sound ? "Turn sound off" : "Turn sound on"}
        >
          {sound ? "Sound on" : "Sound off"}
        </button>
      )}
    </div>
  );
}
