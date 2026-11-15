"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The trip's own film playing inside its card picture: silent, on a loop, by itself. Nothing is
 * downloaded until the card is near the screen; it plays only while the card is visible and the tab
 * is open, and fades in over the card photo once the first frame is ready. Visitors who prefer less
 * motion or save data keep the photo.
 */
export function TripCardVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduce || saveData) return;
    let near = false;
    let visible = false;
    const sync = () => {
      if (near) setLoad(true);
      if (visible && document.visibilityState === "visible") {
        v.muted = true;
        void v.play().catch(() => undefined);
      } else v.pause();
    };
    const nearIo = new IntersectionObserver(
      (entries) => {
        near = near || entries.some((e) => e.isIntersecting);
        sync();
      },
      { rootMargin: "300px 0px" }
    );
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.35);
        sync();
      },
      { threshold: [0, 0.35, 0.7] }
    );
    nearIo.observe(v);
    io.observe(v);
    document.addEventListener("visibilitychange", sync);
    return () => {
      nearIo.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <video
      ref={ref}
      src={load ? src : undefined}
      muted
      loop
      playsInline
      preload="none"
      tabIndex={-1}
      aria-hidden="true"
      disablePictureInPicture
      onPlaying={() => setShown(true)}
      className={`absolute inset-0 h-full w-full object-cover transition-[opacity,scale,transform] duration-700 group-hover:scale-[1.03] ${shown ? "opacity-100" : "opacity-0"}`}
    />
  );
}
