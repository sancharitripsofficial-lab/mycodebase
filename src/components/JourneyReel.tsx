"use client";

import { BedDouble, Camera, Car, House, MapPin, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { JOURNEY_STEP_LABELS, type JourneyStepKey } from "@/lib/home-content";
import { BUILT_IN_JOURNEY } from "@/lib/site-media";

/** The trip, step by step, in the order the film shows it. */
const STEPS: { key: JourneyStepKey; label: string; icon: LucideIcon }[] = [
  { key: "pickup", label: JOURNEY_STEP_LABELS.pickup, icon: MapPin },
  { key: "journey", label: JOURNEY_STEP_LABELS.journey, icon: Car },
  { key: "moments", label: JOURNEY_STEP_LABELS.moments, icon: Camera },
  { key: "stay", label: JOURNEY_STEP_LABELS.stay, icon: BedDouble },
  { key: "drop", label: JOURNEY_STEP_LABELS.drop, icon: House },
];

/**
 * Seconds in the built-in film where each step's scene takes over (halfway through each dissolve);
 * the last entry is where it dissolves back into the pick-up (the film loops without a jump).
 */
const BUILT_IN_STEP_STARTS = [0, 2.0, 4.6, 7.1, 9.7, 12.4];
const BUILT_IN_LENGTH = 12.7;


type Props = {
  /** Computer film (landscape, about 5:4) and phone film (portrait, about 2:3). */
  wideSrc?: string;
  tallSrc?: string;
  widePoster?: string;
  tallPoster?: string;
  /** Owner's own film: the five steps advance evenly instead of following the built-in scene times. */
  custom?: boolean;
  /** Stamp over the film, e.g. "Upcoming · Stay + Food" (Admin → Home page). */
  watermark?: string;
  /** Steps that are not offered yet: shown with an "Upcoming" tag (Admin → Home page). */
  upcoming?: JourneyStepKey[];
  className?: string;
  children?: ReactNode;
};

/**
 * A card whose whole background is a looping film of a Sanchari trip, with the card's own words on
 * top and the five steps lighting up as the film reaches them. The film loads only once the page
 * has finished loading and the card is near the screen, pauses off screen, and stays a still
 * picture for visitors who prefer less motion or save data.
 */
export function JourneyReel({
  wideSrc = BUILT_IN_JOURNEY.wide,
  tallSrc = BUILT_IN_JOURNEY.tall,
  widePoster = BUILT_IN_JOURNEY.widePoster,
  tallPoster = BUILT_IN_JOURNEY.tallPoster,
  custom = false,
  watermark = "",
  upcoming = [],
  className = "",
  children,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [tall, setTall] = useState<boolean | null>(null);

  // Phone (portrait card) or computer (landscape card) film.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setTall(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Load the film after the page has loaded, once the card comes near the screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduce || saveData) return;
    let io: IntersectionObserver | null = null;
    const watch = () => {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setReady(true);
            io?.disconnect();
          }
        },
        { rootMargin: "400px 0px" }
      );
      io.observe(el);
    };
    if (document.readyState === "complete") watch();
    else window.addEventListener("load", watch, { once: true });
    return () => {
      window.removeEventListener("load", watch);
      io?.disconnect();
    };
  }, []);

  // Play only while on screen and the tab is visible.
  useEffect(() => {
    const el = root.current;
    const v = video.current;
    if (!ready || !el || !v) return;
    let onScreen = false;
    const sync = () => {
      if (onScreen && document.visibilityState === "visible") {
        v.muted = true;
        v.play().catch(() => undefined);
      } else v.pause();
    };
    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      sync();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [ready, tall]);

  // Follow the film: which step is showing and how far along it is.
  useEffect(() => {
    const v = video.current;
    if (!ready || !v) return;
    let raf = 0;
    const tick = () => {
      const d = v.duration || 0;
      const t = v.currentTime;
      if (d > 0) {
        let s = 0;
        if (custom) s = Math.min(STEPS.length - 1, Math.floor((t / d) * STEPS.length));
        else {
          for (let i = 0; i < STEPS.length; i++) if (t >= BUILT_IN_STEP_STARTS[i]) s = i;
          if (t >= BUILT_IN_STEP_STARTS[STEPS.length]) s = 0;
        }
        setStep(s);
        // About ten updates a second is plenty for the little route lines (CSS smooths the rest).
        const p = Math.min(1, t / d);
        setProgress((prev) => (Math.abs(p - prev) > 0.009 || p < prev ? p : prev));
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      setPlaying(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const stop = () => cancelAnimationFrame(raf);
    v.addEventListener("playing", start);
    v.addEventListener("pause", stop);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("playing", start);
      v.removeEventListener("pause", stop);
    };
  }, [ready, tall, custom]);

  const src = tall ? tallSrc : wideSrc;

  return (
    <div ref={root} className={`journey-reel relative isolate overflow-hidden rounded-3xl bg-forest-900 shadow-[0_28px_60px_-30px_rgb(9_45_40/0.75)] ${className}`}>
      {/* The film fills the whole card: a still frame first, then the film fades in over it. */}
      <picture>
        <source media="(max-width: 767px)" srcSet={tallPoster} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={widePoster} alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      </picture>
      {ready && tall !== null && (
        <video
          key={src}
          ref={video}
          src={src}
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          tabIndex={-1}
          aria-hidden="true"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${playing ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {/* A light shade only where the words sit, so the film stays clearly visible. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgb(8_40_36/0.52)_0%,rgb(8_40_36/0.24)_50%,rgb(8_40_36/0.58)_100%)] md:bg-[linear-gradient(100deg,rgb(8_40_36/0.62)_0%,rgb(8_40_36/0.3)_50%,rgb(8_40_36/0.04)_100%)]"
      />

      {/* Watermark stamp (owner's words), gently pulsing in the corner. */}
      {watermark && (
        <span className="journey-watermark pointer-events-none absolute top-3 right-3 z-20 -rotate-3 rounded-xl border-2 border-white/75 bg-white/10 px-2.5 py-1 text-[10px] font-extrabold tracking-[0.16em] text-white uppercase shadow-[0_6px_18px_-8px_rgb(0_0_0/0.6)] [text-shadow:0_1px_2px_rgb(0_0_0/0.45)] sm:top-5 sm:right-5 sm:px-3 sm:py-1.5 sm:text-xs">
          {watermark}
        </span>
      )}

      <div className="relative z-10 flex h-full flex-col [text-shadow:0_1px_3px_rgb(6_30_26/0.6)]">
        <div className="flex-1">{children}</div>

        {/* Pick-up → Journey → Moments → Stay → Drop: available steps lit, upcoming ones tagged,
            the step on screen glows and the line between steps fills as the film moves on. */}
        <ol aria-label="Your trip, end to end" className="mt-9 grid grid-cols-5 [text-shadow:none]">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const soon = upcoming.includes(s.key);
            const on = playing && i === step;
            const nextSoon = i < STEPS.length - 1 && upcoming.includes(STEPS[i + 1].key);
            const fill = !playing ? 0 : i < step ? 1 : i === step ? stepFraction(progress, i, custom) : 0;
            return (
              <li key={s.key} className="relative flex min-w-0 flex-col items-center" aria-current={on ? "step" : undefined}>
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`absolute top-[18px] left-1/2 h-0.5 w-full -translate-y-1/2 overflow-hidden rounded-full ${soon || nextSoon ? "bg-white/30" : "bg-white/75"}`}
                  >
                    <span className="absolute inset-y-0 left-0 rounded-full bg-saffron-500 transition-[width] duration-300" style={{ width: `${Math.round(fill * 100)}%` }} />
                  </span>
                )}
                {soon && (
                  <span className="journey-soon absolute -top-[18px] left-1/2 z-20 -translate-x-1/2 rounded-full bg-saffron-500 px-1.5 py-px text-[8.5px] leading-[1.45] font-extrabold tracking-wide whitespace-nowrap text-forest-900 uppercase shadow-[0_2px_8px_-2px_rgb(0_0_0/0.5)] sm:text-[9.5px]">
                    Upcoming
                  </span>
                )}
                <span
                  className={`relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-full transition-all duration-500 ${
                    soon ? "border-[1.5px] border-dashed border-white/85 bg-forest-900/55 text-white" : "bg-white text-forest-900 shadow-[0_4px_12px_-4px_rgb(0_0_0/0.55)]"
                  } ${on ? "scale-110 ring-4 ring-saffron-500/75" : ""}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className={`mt-1.5 max-w-full truncate px-0.5 text-center text-[11px] leading-tight font-semibold sm:text-xs ${soon ? "text-white/85" : "text-white"}`}>
                  {s.label}
                  {soon && <span className="sr-only"> (upcoming)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** How far through step i the film is (0-1), for the little route line after it. */
function stepFraction(progress: number, i: number, custom: boolean): number {
  if (custom) {
    const per = 1 / STEPS.length;
    return Math.max(0, Math.min(1, (progress - i * per) / per));
  }
  const t = progress * BUILT_IN_LENGTH;
  const a = BUILT_IN_STEP_STARTS[i];
  const b = BUILT_IN_STEP_STARTS[i + 1];
  return Math.max(0, Math.min(1, (t - a) / (b - a)));
}
