"use client";

import Image, { getImageProps } from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./motion.module.css";
import { useInView, usePageVisible, usePrefersReducedMotion } from "./useMotionHooks";

export interface HeroSlide {
  src: string;
  /** Leave empty for purely decorative backgrounds (the default). */
  alt?: string;
}

export interface HeroCinematicProps {
  /** Photos for the Ken-Burns slideshow. Defaults to the Sanchari destination photos. */
  slides?: HeroSlide[];
  /** Optional looping background video (mp4). Falls back to the slideshow if it cannot play. */
  videoSrc?: string;
  /** Optional smaller/portrait video used on screens up to 767px wide. */
  mobileVideoSrc?: string;
  /** Still frame shown while the video loads. */
  posterSrc?: string;
  /** Portrait still frame for phones (matches `mobileVideoSrc`). */
  mobilePosterSrc?: string;
  /** Time each photo stays up, in ms. Default 6000. */
  intervalMs?: number;
  /** Crossfade length, in ms. Default 1200. */
  fadeMs?: number;
  /** Where the ocean-blue scrim sits: "left" (text on the left), "full" (centred text) or "none". */
  scrim?: "left" | "full" | "none";
  className?: string;
}

const DEFAULT_SLIDES: HeroSlide[] = [
  { src: "/media/hero-western-ghats.jpg" },
  { src: "/media/dest-chikmagalur.jpg" },
  { src: "/media/dest-coorg.jpg" },
  { src: "/media/dest-gokarna.jpg" },
  { src: "/media/dest-hampi.jpg" },
];

/** Cinematic hero background: looping video or a crossfading Ken-Burns photo slideshow under an ocean-blue scrim with a sunset glow. Place inside a `relative` section. */
export function HeroCinematic({
  slides = DEFAULT_SLIDES,
  videoSrc,
  mobileVideoSrc,
  posterSrc,
  mobilePosterSrc,
  intervalMs = 6000,
  fadeMs = 1200,
  scrim = "left",
  className,
}: HeroCinematicProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [show, setShow] = useState({ index: 0, prev: -1, mounted: 1 });
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const reducedMotion = usePrefersReducedMotion();
  const onScreen = useInView(rootRef);
  const pageVisible = usePageVisible();
  const playing = onScreen && pageVisible && !reducedMotion;
  const videoMode = Boolean(videoSrc) && !videoFailed && !reducedMotion;
  const count = slides.length;

  // Slideshow clock. Only ticks while the hero is on screen, so phones are not kept busy.
  useEffect(() => {
    if (videoMode || !playing || count < 2) return;
    // Mount the next photo early so it has loaded before its crossfade.
    const preload = window.setTimeout(
      () => setShow((s) => ({ ...s, mounted: Math.max(s.mounted, Math.min(count, s.index + 2)) })),
      Math.min(1500, intervalMs / 2),
    );
    const next = window.setTimeout(
      () => setShow((s) => ({ index: (s.index + 1) % count, prev: s.index, mounted: s.mounted })),
      intervalMs,
    );
    return () => {
      window.clearTimeout(preload);
      window.clearTimeout(next);
    };
  }, [videoMode, playing, count, intervalMs, show.index]);

  // Video: start muted, pause off screen, and fall back to photos if the browser refuses.
  useEffect(() => {
    const video = videoRef.current;
    if (!videoMode || !video) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData) {
      const id = requestAnimationFrame(() => setVideoFailed(true));
      return () => cancelAnimationFrame(id);
    }
    if (!playing) {
      video.pause();
      return;
    }
    video.muted = true;
    video.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return; // paused mid-start
      setVideoFailed(true);
    });
  }, [videoMode, playing]);

  const rootStyle = {
    "--hero-fade": `${fadeMs}ms`,
    "--hero-kb": `${intervalMs + fadeMs * 2}ms`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={className ? `${styles.hero} ${className}` : styles.hero}
      data-playing={playing ? "true" : "false"}
      style={rootStyle}
    >
      {videoMode ? (
        <>
          <HeroPoster
            src={posterSrc ?? slides[0]?.src ?? "/media/hero-western-ghats.jpg"}
            mobileSrc={mobilePosterSrc}
          />
          {/* No poster attribute: the optimised still above is already on screen, so phones
              don't download a second full-size copy of it. */}
          <video
            ref={videoRef}
            className={styles.heroVideo}
            data-ready={videoReady ? "true" : "false"}
            muted
            loop
            playsInline
            preload="metadata"
            tabIndex={-1}
            disablePictureInPicture
            onPlaying={() => setVideoReady(true)}
            onError={() => setVideoFailed(true)}
          >
            {mobileVideoSrc && <source src={mobileVideoSrc} type="video/mp4" media="(max-width: 767px)" />}
            <source src={videoSrc} type="video/mp4" onError={() => setVideoFailed(true)} />
          </video>
        </>
      ) : (
        slides.map((slide, i) => {
          if (i >= show.mounted && i !== show.index) return null;
          const state = i === show.index ? "active" : i === show.prev ? "leaving" : "idle";
          return (
            <div key={slide.src} className={styles.heroSlide} data-state={state}>
              <div className={styles.heroKenBurns} data-kb={i % 4}>
                <Image
                  src={slide.src}
                  alt={slide.alt ?? ""}
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  className={styles.heroMedia}
                />
              </div>
            </div>
          );
        })
      )}
      {scrim !== "none" && <div className={styles.heroScrim} data-scrim={scrim} />}
      <div className={styles.heroGlow} />
    </div>
  );
}

/** Poster still with art direction: the portrait frame on phones, the wide frame from 768px. */
function HeroPoster({ src, mobileSrc }: { src: string; mobileSrc?: string }) {
  if (!mobileSrc) {
    return <Image src={src} alt="" fill priority fetchPriority="high" sizes="100vw" className={styles.heroMedia} />;
  }
  const common = { alt: "", fill: true, priority: true, sizes: "100vw" } as const;
  const {
    props: { srcSet: wide },
  } = getImageProps({ ...common, src });
  const {
    props: { srcSet: tall, ...img },
  } = getImageProps({ ...common, src: mobileSrc });
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={wide} />
      <source media="(max-width: 767px)" srcSet={tall} />
      {/* The page's largest picture (what Google times as "LCP"): fetch it first, never lazily. */}
      {/* eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element */}
      <img {...img} loading="eager" fetchPriority="high" className={styles.heroMedia} />
    </picture>
  );
}
