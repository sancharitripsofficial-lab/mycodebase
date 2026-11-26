"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface TripReel {
  src: string;
  poster: string;
  title: string;
  /** What the reel shows, for screen readers and search engines. */
  description: string;
  seconds: number;
}

/**
 * Short vertical reels made from real Sanchari trip photos and footage. Silent and looping, like a
 * phone feed: each plays only while it is on screen and pauses when scrolled away. Nothing loads
 * until the reel is near the screen (preload none + poster). Visitors who prefer less motion see
 * the poster and a play button instead of autoplay.
 */
export function TripReels({ reels }: { reels: TripReel[] }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
      {reels.map((r) => (
        <ReelCard key={r.src} reel={r} />
      ))}
    </div>
  );
}

function ReelCard({ reel }: { reel: TripReel }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [still, setStill] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStill(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          v.play().then(() => setPlaying(true)).catch(() => setStill(true));
        } else {
          v.pause();
          setPlaying(false);
        }
      },
      { threshold: [0, 0.5] }
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  const start = () => {
    const v = ref.current;
    if (!v) return;
    v.play().then(() => {
      setPlaying(true);
      setStill(false);
    }).catch(() => {});
  };

  return (
    <figure className="relative w-[70vw] max-w-[300px] shrink-0 snap-center sm:w-auto sm:max-w-none">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] bg-forest-900 shadow-lg ring-1 ring-black/5">
        <video
          ref={ref}
          src={reel.src}
          poster={reel.poster}
          muted
          loop
          playsInline
          preload="none"
          aria-label={reel.description}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {still && !playing && (
          <button
            type="button"
            onClick={start}
            className="absolute inset-0 flex items-center justify-center bg-transparent"
            aria-label={`Play: ${reel.title}`}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-cream-50/90 text-forest-900 shadow-md">
              <Play className="h-7 w-7 translate-x-0.5" aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
      <figcaption className="mt-2 px-1 text-sm font-semibold text-forest-900">{reel.title}</figcaption>
    </figure>
  );
}
