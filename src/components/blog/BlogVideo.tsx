"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isSafeMediaLink } from "@/lib/blog";

/**
 * A story video that plays by itself, muted, on a loop, while it is on screen (phones allow muted
 * autoplay). It pauses off screen and in a background tab; a sound button turns the sound on. Steady
 * 16:9 frame (no layout jump) with the cover picture until the first frame. Visitors who prefer less
 * motion or save data get the normal play button instead.
 */
export function BlogVideo({ src, poster, title, className = "" }: { src: string; poster?: string; title: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [manual, setManual] = useState(false);
  const safe = isSafeMediaLink(src);

  useEffect(() => {
    const v = ref.current;
    if (!v || !safe) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduce || saveData) {
      setManual(true);
      return;
    }
    let onScreen = false;
    const sync = () => {
      if (onScreen && document.visibilityState === "visible") {
        v.muted = v.muted || !v.dataset.userSound;
        v.play().catch(() => setManual(true)); // browser refused: fall back to the play button
      } else v.pause();
    };
    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.35);
        sync();
      },
      { threshold: [0, 0.35, 0.6] }
    );
    io.observe(v);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [safe]);

  if (!safe) return null;
  const type = /\.webm(?:[?#]|$)/i.test(src) ? "video/webm" : "video/mp4";

  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-[#0f2b2b] shadow-[0_24px_60px_-28px_rgb(13_95_107/0.6)] ${className}`}>
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        muted={muted}
        loop
        playsInline
        autoPlay={!manual}
        controls={manual}
        preload="metadata"
        poster={poster && isSafeMediaLink(poster) ? poster : undefined}
        aria-label={title}
        controlsList="nodownload"
        disablePictureInPicture
      >
        <source src={src} type={type} />
      </video>
      {!manual && (
        <button
          type="button"
          onClick={() => {
            const v = ref.current;
            const next = !muted;
            setMuted(next);
            if (v) {
              v.muted = next;
              if (!next) v.dataset.userSound = "1";
              else delete v.dataset.userSound;
              v.play().catch(() => undefined);
            }
          }}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          className="absolute right-3 bottom-3 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/70"
        >
          {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
          {muted ? "Sound off" : "Sound on"}
        </button>
      )}
    </div>
  );
}
