"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { BannerFocus } from "./engine";
import type { BannerSceneName } from "./scenes";

const BannerCanvas = dynamic(() => import("./BannerCanvas"), { ssr: false, loading: () => null });

export interface PageBanner3DProps {
  /** Which real-time scene plays behind the heading. */
  scene: BannerSceneName;
  title: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  /** Width of the page column the heading lines up with. Default "4xl". */
  width?: "3xl" | "4xl" | "6xl";
  /** Extra content shown under the subtitle (links, notes). */
  children?: ReactNode;
}

/** Still picture shown first, and kept when 3D is unavailable or motion is reduced. */
const FALLBACK: Record<BannerSceneName, string> = {
  trips:
    "linear-gradient(180deg, rgb(19 90 75 / 0.15) 0%, rgb(20 82 63 / 0.35) 100%), url(/media/hero-western-ghats.jpg) center 40% / cover no-repeat, #135a4b",
  safety:
    "radial-gradient(60% 90% at 72% 70%, rgb(255 214 170 / 0.55), transparent 70%), linear-gradient(180deg, #7fb7cf 0%, #c9dfe4 55%, #5f8f9c 100%)",
  policies:
    "radial-gradient(55% 80% at 70% 45%, rgb(196 214 150 / 0.75), transparent 72%), linear-gradient(100deg, #135a4b 0%, #1b86a8 40%, #7db7a0 100%)",
  contact:
    "radial-gradient(70% 55% at 65% 100%, rgb(255 190 110 / 0.5), transparent 70%), linear-gradient(180deg, #135a4b 0%, #1d7f9e 38%, #e9a36b 60%, #11655a 62%, #14523f 100%)",
  booking:
    "radial-gradient(45% 70% at 72% 45%, rgb(255 254 252 / 0.4), transparent 70%), radial-gradient(40% 60% at 95% 100%, rgb(255 138 61 / 0.45), transparent 70%), linear-gradient(120deg, #14523f 0%, #135a4b 40%, #1ba3b3 100%)",
};

const WIDTHS = { "3xl": "max-w-3xl", "4xl": "max-w-4xl", "6xl": "max-w-6xl" } as const;

/**
 * Full-width page header with a living 3D scene behind real, selectable text.
 * The text and a still background render on the server; the WebGL layer is fetched after first
 * paint, only once the banner is on screen, and fades in over the still.
 */
export function PageBanner3D({ scene, title, eyebrow, subtitle, width = "4xl", children }: PageBanner3DProps) {
  const section = useRef<HTMLElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let idle = 0;
    let timer = 0;
    let observer: IntersectionObserver | null = null;

    const stop = () => {
      observer?.disconnect();
      observer = null;
      if (idle && "cancelIdleCallback" in window) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
      idle = 0;
      timer = 0;
    };

    const start = () => {
      stop();
      if (reduced.matches) {
        setMounted(false);
        setReady(false);
        return;
      }
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        // Drawn by a worker off the main thread, so it can start straight away (next frame).
        const go = () => setMounted(true);
        timer = globalThis.setTimeout(go, 0) as unknown as number;
      });
      observer.observe(element);
    };

    start();
    reduced.addEventListener("change", start);
    return () => {
      reduced.removeEventListener("change", start);
      stop();
    };
  }, []);

  /** Tells the scene where the free part of the banner is, so its subject never sits under the text. */
  const getFocus = useCallback((w: number, h: number): BannerFocus => {
    const wide = w >= 768;
    const box = section.current?.getBoundingClientRect();
    const copy = text.current?.getBoundingClientRect();
    if (!box || !copy) return { x: wide ? 0.7 : 0.5, y: wide ? 0.5 : 0.28, wide };
    if (wide) {
      const right = copy.right - box.left;
      return { x: Math.min(0.8, Math.max(0.6, (right + w) / 2 / w)), y: 0.5, wide };
    }
    const top = copy.top - box.top;
    return { x: 0.5, y: Math.min(0.42, Math.max(0.16, (top * 0.55) / h)), wide };
  }, []);

  const onReady = useCallback(() => setReady(true), []);
  const onLost = useCallback(() => setReady(false), []);

  return (
    <section
      ref={section}
      data-banner={scene}
      data-banner-live={ready ? "true" : "false"}
      className="relative isolate w-full overflow-hidden bg-[#135a4b] text-white"
    >
      <div aria-hidden="true" className="absolute inset-0" style={{ background: FALLBACK[scene] }} />
      <div
        aria-hidden="true"
        className={`absolute inset-0 transition-opacity duration-[1400ms] ease-out ${ready ? "opacity-100" : "opacity-0"}`}
      >
        {mounted && <BannerCanvas scene={scene} getFocus={getFocus} onReady={onReady} onLost={onLost} />}
      </div>
      {/* Tea-green veil (matches the home film) that keeps the heading readable over any frame of the scene. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,rgb(18_70_54/0.9)_0%,rgb(18_70_54/0.72)_38%,rgb(18_70_54/0.22)_66%,rgb(18_70_54/0)_84%)] md:bg-[linear-gradient(90deg,rgb(18_70_54/0.88)_0%,rgb(18_70_54/0.66)_30%,rgb(18_70_54/0.2)_56%,rgb(18_70_54/0)_74%)]"
      />
      <div
        className={`relative mx-auto flex min-h-[250px] w-full ${WIDTHS[width]} flex-col justify-end px-4 pt-28 pb-6 sm:min-h-[300px] sm:px-6 md:min-h-[340px] md:justify-center md:py-10 lg:min-h-[370px]`}
      >
        <div
          ref={text}
          className="min-w-0 max-w-xl space-y-2 break-words [text-shadow:0_1px_3px_rgb(10_40_30/0.55)] md:max-w-md lg:max-w-lg"
        >
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-peach-100">{eyebrow}</p>
          )}
          <h1 className="font-display text-3xl font-semibold text-white sm:text-4xl">{title}</h1>
          {subtitle && <p className="text-sm leading-relaxed text-white/95">{subtitle}</p>}
          {children}
        </div>
      </div>
    </section>
  );
}
