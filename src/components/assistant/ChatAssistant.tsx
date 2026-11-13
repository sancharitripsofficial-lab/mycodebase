"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prefersReducedMotionNow } from "@/components/motion/useMotionHooks";
import type { GuideEmotion } from "@/lib/assistant/types";
import type { ChatAssistantConfig, GuideMoodActions } from "./chat-config";
import { GuideAvatar } from "./GuideAvatar";
import styles from "./assistant.module.css";

export type { ChatAssistantConfig } from "./chat-config";

/* The chat window (messages, cards, networking) is a separate chunk: it loads on first open,
   when the visitor points at the launcher, or quietly 8 s after the page settles. */
const loadWindow = () => import("./ChatWindow");
const ChatWindow = lazy(loadWindow);
let windowChunk: Promise<unknown> | null = null;
function preloadWindow() {
  windowChunk ??= loadWindow().catch(() => {
    windowChunk = null; // try again next time
  });
}

const TEASER_KEY = "sanchari-guide-teaser";
/** Never interrupt someone checking or paying for a booking. */
const QUIET_PATHS = ["/booking-lookup"];
let teaserDone = false; // per page load, in case storage is blocked

/** `navigating`: the chat closed because the visitor followed a link (focus stays on the new page). */
export interface CloseOptions {
  navigating?: boolean;
}

/** The hello bubble never covers the booking form, someone typing, or an open dialog. */
function teaserWouldGetInTheWay(): boolean {
  if (window.location.hash === "#book") return true;
  if (document.activeElement?.matches("input, textarea, select")) return true;
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
}

/** The guide's emotion state machine. */
function useGuideMood(): [GuideEmotion, GuideMoodActions] {
  const [emotion, setEmotion] = useState<GuideEmotion>("idle");
  const cur = useRef<GuideEmotion>("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const actions = useMemo<GuideMoodActions>(() => {
    const set = (next: GuideEmotion, holdMs = 0) => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      cur.current = next;
      setEmotion(next);
      if (holdMs > 0) {
        timer.current = window.setTimeout(() => {
          timer.current = null;
          cur.current = "idle";
          setEmotion("idle");
        }, holdMs);
      }
    };
    const busy = () => cur.current === "thinking" || cur.current === "talking";
    return {
      wave: () => set("wave", 2400),
      listen: (on, soft = false) => {
        if (busy()) return;
        if (on) {
          if (cur.current === "listening" || (soft && timer.current !== null)) return;
          set("listening");
        } else if (cur.current === "listening") {
          set("idle");
        }
      },
      think: () => set("thinking"),
      talk: () => {
        if (cur.current !== "talking") set("talking");
      },
      finish: (e) => {
        const end: GuideEmotion = e === "talking" || e === "thinking" || e === "listening" ? "idle" : e;
        set(end, end === "idle" ? 0 : 3000);
      },
      sorry: () => set("sorry", 4000),
      reset: () => set("idle"),
    };
  }, []);

  return [emotion, actions];
}

/** Shown for a moment on the very first open if the window chunk is still downloading. */
function WindowFallback({ config, onClose }: { config: ChatAssistantConfig; onClose: (opts?: CloseOptions) => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Chat with ${config.guideName}`}
      aria-busy="true"
      data-chat-window=""
      className={`${styles.panel} ${styles.panelIn} fixed top-0 right-0 left-0 z-[65] flex h-[100dvh] flex-col overflow-hidden bg-cream-50 sm:top-auto sm:right-4 sm:bottom-4 sm:left-auto sm:h-[min(680px,calc(100dvh-2rem))] sm:w-[min(400px,calc(100vw-2rem))] sm:rounded-[1.6rem] sm:shadow-[0_30px_80px_-24px_rgb(13_95_107/0.55)] lg:right-6 lg:bottom-6`}
    >
      <div className={`${styles.header} flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 text-white`}>
        <GuideAvatar emotion="wave" media={config.guideMedia} size={64} name={config.guideName} />
        <p className="flex-1 font-display text-xl font-semibold">{config.guideName}</p>
        <button
          type="button"
          onClick={() => onClose()}
          aria-label="Close chat"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className={`${styles.body} flex flex-1 items-start p-4`}>
        <div className="skeleton h-16 w-3/4 rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * Floating chat guide: a small launcher with the guide's face (and a one-time hello), which
 * opens the full chat window. Mounted by the store layout only when the owner enabled it.
 */
export function ChatAssistant({ config }: { config: ChatAssistantConfig }) {
  const [emotion, mood] = useGuideMood();
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const [teaser, setTeaser] = useState(false);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const refocus = useRef(false);
  const wasOpen = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const pathname = usePathname() ?? "/";
  const quiet = QUIET_PATHS.some((p) => pathname.startsWith(p));
  const name = config.guideName;
  const stacked = Boolean(config.whatsappUrl);

  // Load the window code when the browser is idle, 8 s after the page loads.
  useEffect(() => {
    let idle = 0;
    const t = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(preloadWindow, { timeout: 4000 });
      else preloadWindow();
    }, 8000);
    return () => {
      window.clearTimeout(t);
      if (idle && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
    };
  }, []);

  // One friendly hello per visit, ~6 s after landing (not on the booking / payment check page).
  useEffect(() => {
    if (phase !== "closed" || quiet || teaserDone) return;
    try {
      if (sessionStorage.getItem(TEASER_KEY)) {
        teaserDone = true;
        return;
      }
    } catch {
      /* storage blocked: fall back to once per page load */
    }
    let show = 0;
    const tryShow = () => {
      if (teaserWouldGetInTheWay()) {
        show = window.setTimeout(tryShow, 10000);
        return;
      }
      teaserDone = true;
      setTeaser(true);
      mood.wave();
      try {
        sessionStorage.setItem(TEASER_KEY, "shown");
      } catch {
        /* ignore */
      }
    };
    show = window.setTimeout(tryShow, 6000);
    return () => window.clearTimeout(show);
  }, [phase, quiet, mood]);

  // The hello quietly goes away after a while.
  useEffect(() => {
    if (!teaser) return;
    const hide = window.setTimeout(() => setTeaser(false), 16000);
    const onFocus = () => {
      if (teaserWouldGetInTheWay()) setTeaser(false);
    };
    document.addEventListener("focusin", onFocus);
    window.addEventListener("hashchange", onFocus);
    return () => {
      window.clearTimeout(hide);
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("hashchange", onFocus);
    };
  }, [teaser]);

  // Back on the launcher after the chat closes (keyboard and screen-reader users keep their place).
  useEffect(() => {
    if (phase !== "closed") {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    mood.reset();
    if (refocus.current) {
      refocus.current = false;
      launcherRef.current?.focus({ preventScroll: true });
    }
  }, [phase, mood]);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const open = useCallback(() => {
    preloadWindow();
    teaserDone = true;
    setTeaser(false);
    try {
      sessionStorage.setItem(TEASER_KEY, "opened");
    } catch {
      /* ignore */
    }
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setPhase("open");
    mood.wave();
  }, [mood]);

  const close = useCallback((opts?: CloseOptions) => {
    // After following a link, keyboard and screen-reader users stay on the new page's content.
    refocus.current = !opts?.navigating;
    mood.reset();
    if (prefersReducedMotionNow()) {
      setPhase("closed");
      return;
    }
    setPhase("closing");
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setPhase("closed");
    }, 190);
  }, [mood]);

  const dismissTeaser = () => {
    setTeaser(false);
    launcherRef.current?.focus({ preventScroll: true });
  };

  const closed = phase === "closed";

  return (
    <>
      <div
        className={`fixed right-4 z-[60] flex flex-col items-end sm:right-6 ${
          stacked
            ? "bottom-[calc(5.25rem+env(safe-area-inset-bottom))] sm:bottom-[5.5rem]"
            : "bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-6"
        } ${closed ? "" : "pointer-events-none invisible opacity-0"}`}
      >
        {teaser && closed && (
          <div
            className={`${styles.teaser} relative mb-3 w-[min(17rem,calc(100vw-2rem))] rounded-2xl border border-stone-200 bg-cream-50 shadow-[var(--shadow-lift)]`}
          >
            <button type="button" onClick={open} className="block w-full rounded-2xl p-3.5 pr-11 text-left text-sm leading-snug text-ink-900">
              <span className="font-bold text-forest-900">Hi, I&apos;m {name}</span> — ask me anything about our trips: dates,
              seats left, prices and pickup points.
            </button>
            <button
              type="button"
              onClick={dismissTeaser}
              aria-label={`Hide ${name}'s message`}
              className="absolute top-0.5 right-0.5 grid h-11 w-11 place-items-center rounded-full text-stone-600 hover:bg-lagoon-100 hover:text-forest-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        <button
          ref={launcherRef}
          type="button"
          onClick={open}
          onPointerEnter={preloadWindow}
          onFocus={preloadWindow}
          onTouchStart={preloadWindow}
          aria-label={`Ask ${name} — live trip answers from your Sanchari guide`}
          aria-haspopup="dialog"
          aria-expanded={phase === "open"}
          className="relative flex items-center gap-3 rounded-full bg-cream-50 p-1 shadow-[0_14px_34px_-12px_rgb(13_95_107/0.55),0_2px_6px_rgb(13_95_107/0.12)] ring-1 ring-stone-200 hover:-translate-y-0.5 hover:ring-lagoon-500/50 sm:p-1.5 sm:pr-5"
        >
          <span className="relative block">
            <span className={styles.launcherPulse} aria-hidden="true" />
            <GuideAvatar emotion={closed ? emotion : "idle"} media={config.guideMedia} size={52} name={name} paused={!closed} />
            <span className={styles.onlineDot} aria-hidden="true" />
          </span>
          <span className="hidden text-left leading-tight sm:block" aria-hidden="true">
            <span className="block text-sm font-bold text-forest-900">Ask {name}</span>
            <span className="block text-xs text-stone-600">Live trip answers</span>
          </span>
        </button>
      </div>

      {!closed && (
        <Suspense fallback={<WindowFallback config={config} onClose={close} />}>
          <ChatWindow config={config} emotion={emotion} mood={mood} closing={phase === "closing"} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
