"use client";

import { ArrowDownRight, Hand, Sparkles } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { usePageVisible, usePrefersReducedMotion } from "@/components/motion/useMotionHooks";
import type { GuideEmotion } from "@/lib/assistant/types";
import { LivingGuide } from "./LivingGuide";
import styles from "./assistant.module.css";

export interface GuideAvatarProps {
  emotion: GuideEmotion;
  /** Picture or video per emotion (Admin → Chat guide). Missing ones fall back to idle, then the Sanchari badge. */
  media: Partial<Record<GuideEmotion, string>>;
  /** Outer size in px (ring included). */
  size: number;
  name: string;
  /** Stop all motion and videos (chat closed). Also stops on its own while the tab is hidden. */
  paused?: boolean;
  /** Small still avatar for message bubbles: no motion, no effects. */
  mini?: boolean;
  /** See-through pictures: a 3D pop-out character with no circle (photos with a background keep the round frame). */
  cutout?: boolean;
  className?: string;
}

/** Short words for what the guide is doing, shown as a chip beside the guide. */
export const GUIDE_MOOD_LABEL: Record<GuideEmotion, string> = {
  idle: "Online",
  wave: "Namaskara!",
  listening: "Listening…",
  thinking: "Checking the calendar…",
  talking: "Here you go",
  happy: "Great news!",
  sorry: "Sorry!",
  pointing: "Here you go",
};

/** Small status chip whose dot and words follow the guide's mood. */
export function GuideMoodChip({ emotion, className = "" }: { emotion: GuideEmotion; className?: string }) {
  return (
    <span className={`${styles.moodChip} ${className}`} data-emotion={emotion}>
      <span className={styles.moodDot} aria-hidden="true" />
      {GUIDE_MOOD_LABEL[emotion]}
    </span>
  );
}

const VIDEO_RE = /\.(mp4|webm|m4v|mov)(?:[?#]|$)/i;
/** Only same-site paths and http(s) URLs are ever used as a media source. */
const safeSrc = (src: string | undefined): string | null => {
  if (!src) return null;
  const s = src.trim();
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  return /^https?:\/\//i.test(s) ? s : null;
};

function MediaLayer({
  src,
  ready,
  playing,
  onReady,
  onFail,
  onFadeEnd,
}: {
  src: string;
  ready: boolean;
  playing: boolean;
  onReady: () => void;
  onFail: () => void;
  onFadeEnd?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isVideo = VIDEO_RE.test(src);
  // Always ask for a real first frame, so a video that is not allowed to play (reduced motion,
  // iOS Low Power Mode) still shows the guide instead of an empty circle.
  const videoSrc = !src.includes("#") ? `${src}#t=0.1` : src;

  // Play only while visible and wanted; pause otherwise (saves battery and data).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      const p = v.play();
      if (p) p.catch(() => undefined);
    } else {
      v.pause();
    }
  }, [playing, src]);

  // Never wait forever for a slow or stubborn file: show it after a moment anyway.
  useEffect(() => {
    if (ready) return;
    const t = window.setTimeout(onReady, 1500);
    return () => window.clearTimeout(t);
  }, [ready, onReady]);

  const imgRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (el && el.complete && el.naturalWidth > 0) onReady();
    },
    [onReady],
  );

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        className={styles.layer}
        data-ready={ready}
        src={videoSrc}
        autoPlay={playing}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
        disablePictureInPicture
        onLoadedData={onReady}
        onCanPlay={onReady}
        onError={onFail}
        onTransitionEnd={onFadeEnd}
      />
    );
  }
  return (
    // Admin-uploaded pictures can live on any host, so a plain <img> (next/image only allows known hosts).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      className={styles.layer}
      data-ready={ready}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={onReady}
      onError={onFail}
      onTransitionEnd={onFadeEnd}
    />
  );
}

/**
 * The chat guide character. Shows the owner's picture / video for the current emotion
 * (cross-fading 350 ms between emotions), or the Sanchari badge when none is uploaded,
 * and adds a light motion per emotion: breathing, leaning in, thinking, talking, waving…
 */
export function GuideAvatar({ emotion, media, size, name, paused = false, mini = false, cutout = false, className = "" }: GuideAvatarProps) {
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [failed, setFailed] = useState<string[]>([]);

  const pick = (e: GuideEmotion) => {
    const s = safeSrc(media[e]);
    return s && !failed.includes(s) ? s : null;
  };
  // Bubble avatars are 30 px stills: never mount a <video> for each message (heavy on phones).
  // Use the idle picture, else any picture, else the Sanchari badge.
  const firstImage = () => {
    for (const v of Object.values(media)) {
      const s = safeSrc(v);
      if (s && !VIDEO_RE.test(s) && !failed.includes(s)) return s;
    }
    return null;
  };
  const idle = pick("idle");
  const src = mini ? (idle && !VIDEO_RE.test(idle) ? idle : firstImage()) : (pick(emotion) ?? idle);

  // Cross-fade: keep the previous layer on screen until the next one has loaded.
  // (State adjusted during render when the source changes — React's recommended pattern.)
  const [cur, setCur] = useState<string | null>(src);
  const [prev, setPrev] = useState<string | null>(null);
  const [curReady, setCurReady] = useState(true);
  if (src !== cur) {
    setPrev(reduced || !cur || failed.includes(cur) ? null : cur);
    setCur(src);
    setCurReady(false);
  }

  const markReady = useCallback(() => {
    setCurReady(true);
    if (reduced) setPrev(null);
  }, [reduced]);
  const dropPrev = useCallback(() => setPrev(null), []);
  const markFailed = useCallback((bad: string) => {
    setFailed((f) => (f.includes(bad) ? f : [...f, bad]));
  }, []);

  const stopped = paused || !visible;
  const playing = !stopped && !reduced && !mini;
  const ringW = Math.max(2, Math.round(size * 0.045));
  const fxIcon = Math.max(10, Math.round(size * 0.24));
  const showFx = !mini && size >= 44;
  // Cut-out pictures (no background) are drawn as a pop-out character; the badge fallback stays round.
  const popOut = cutout && Boolean(cur);
  // A cut-out still picture comes alive (3D depth, breathing, random small actions, looks at you).
  const canLive = popOut && !mini && !reduced && Boolean(cur) && !VIDEO_RE.test(cur ?? "");
  const [livingOn, setLivingOn] = useState(false);

  return (
    <span
      className={`${styles.avatar} ${className}`}
      style={{ width: size, height: size, "--ring-w": `${ringW}px` } as CSSProperties}
      data-emotion={mini ? "idle" : emotion}
      data-paused={stopped}
      data-mini={mini}
      data-cutout={popOut}
      {...(mini ? { "aria-hidden": true } : { role: "img", "aria-label": `${name}, your Sanchari guide` })}
    >
      {!mini && <span className={styles.halo} aria-hidden="true" />}
      {!mini && <span className={styles.floor} aria-hidden="true" />}
      <span className={styles.tilt} aria-hidden="true">
      <span className={styles.motion} aria-hidden="true">
        <span className={styles.ring} />
        <span className={styles.face} data-living={canLive && livingOn ? "true" : undefined}>
          {cur ? (
            <>
              {prev && prev !== cur && (
                <MediaLayer
                  key={`p:${prev}`}
                  src={prev}
                  ready
                  playing={playing}
                  onReady={noop}
                  onFail={dropPrev}
                />
              )}
              <MediaLayer
                key={`c:${cur}`}
                src={cur}
                ready={curReady}
                playing={playing}
                onReady={markReady}
                onFail={() => markFailed(cur)}
                onFadeEnd={dropPrev}
              />
              {canLive && cur && <LivingGuide key={`l:${cur}`} src={cur} emotion={emotion} paused={stopped} onLive={setLivingOn} />}
            </>
          ) : (
            <Image
              src="/brand/sanchari-mark.png"
              alt=""
              width={Math.round(size * 0.74)}
              height={Math.round(size * 0.74)}
              className={styles.mark}
            />
          )}
        </span>
      </span>
      </span>
      {showFx && (
        <span className={styles.fx} aria-hidden="true">
          {emotion === "thinking" && (
            <span className={styles.thought}>
              <span />
              <span />
              <span />
            </span>
          )}
          {emotion === "talking" && (
            <span className={styles.wave}>
              <span />
              <span />
              <span />
              <span />
            </span>
          )}
          {emotion === "happy" && <Sparkles className={styles.sparkle} style={{ width: fxIcon, height: fxIcon }} strokeWidth={2.4} />}
          {emotion === "wave" && (
            <span className={styles.hand} style={{ width: fxIcon + 8, height: fxIcon + 8 }}>
              <Hand style={{ width: fxIcon - 2, height: fxIcon - 2 }} strokeWidth={2.4} />
            </span>
          )}
          {emotion === "pointing" && (
            <span className={styles.point} style={{ width: fxIcon + 6, height: fxIcon + 6 }}>
              <ArrowDownRight style={{ width: fxIcon - 4, height: fxIcon - 4 }} strokeWidth={2.6} />
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function noop() {}
