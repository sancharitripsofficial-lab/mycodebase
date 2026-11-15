"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Silent looping preview of a video story on the blog list. Nothing downloads until the card is
 * near the screen; it plays only while visible and stays a still picture for visitors who prefer
 * less motion or save data.
 */
export function BlogCardVideo({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduce || saveData) return;
    let onScreen = false;
    const sync = () => {
      if (onScreen && document.visibilityState === "visible") {
        setLoad(true);
        v.muted = true;
        v.play().catch(() => undefined);
      } else v.pause();
    };
    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.4);
        sync();
      },
      { threshold: [0, 0.4, 0.8], rootMargin: "200px 0px" }
    );
    io.observe(v);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <video
      ref={ref}
      src={load ? src : undefined}
      poster={poster || undefined}
      muted
      loop
      playsInline
      preload="none"
      tabIndex={-1}
      aria-hidden="true"
      disablePictureInPicture
      className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
    />
  );
}
