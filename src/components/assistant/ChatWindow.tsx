"use client";

import { Clock, Ellipsis, MessageCircle, Phone, RotateCcw, SendHorizontal, ShieldCheck, X } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { prefersReducedMotionNow } from "@/components/motion/useMotionHooks";
import { CHAT_LIMITS, type AnswerAction, type ChatRequest, type GuideEmotion } from "@/lib/assistant/types";
import type { CloseOptions } from "./ChatAssistant";
import type { ChatAssistantConfig, GuideMoodActions } from "./chat-config";
import {
  LineSplitter,
  MAX_ANSWER_CHARS,
  STORE_KEY,
  buildTurns,
  messagesForSaving,
  nextRevealCount,
  parseEvent,
  restoreMessages,
  tripSlugFromPath,
  type ChatMessageData,
  type GuideMessage,
} from "./chat-stream";
import { ChatMessage, GuideRow, RichText, SuggestionChips, TypingBubble, guideBubble, type GuideLook } from "./ChatMessage";
import { GuideAvatar, GuideMoodChip } from "./GuideAvatar";
import styles from "./assistant.module.css";

const PHONE_MQ = "(max-width: 639px), (pointer: coarse) and (max-height: 500px)";
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const INPUT_MAX_PX = 120;

const isPhone = () => typeof window !== "undefined" && window.matchMedia(PHONE_MQ).matches;

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

class ChatHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
class ChatStreamError extends Error {}

/** Plain words for screen readers: no markdown marks, links read as their label. */
const plainText = (text: string) =>
  text
    .replace(/\*\*/g, "")
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "$1")
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

interface RevealState {
  id: string;
  full: string;
  shown: number;
  ended: boolean;
  doneEmotion: GuideEmotion;
  raf: number;
}
const freshReveal = (id = ""): RevealState => ({ id, full: "", shown: 0, ended: false, doneEmotion: "idle", raf: 0 });

interface ChatWindowProps {
  config: ChatAssistantConfig;
  emotion: GuideEmotion;
  mood: GuideMoodActions;
  /** Playing the close animation; unmounts right after. */
  closing: boolean;
  onClose: (opts?: CloseOptions) => void;
}

/** The chat window itself (loaded on demand by ChatAssistant). */
export default function ChatWindow({ config, emotion, mood, closing, onClose }: ChatWindowProps) {
  const pathname = usePathname() ?? "/";
  const titleId = useId();
  const inputId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

  const [messages, setMessages] = useState<ChatMessageData[]>(() => {
    try {
      return restoreMessages(sessionStorage.getItem(STORE_KEY));
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [shown, setShown] = useState<{ id: string; n: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  /** Phone = full-screen sheet (modal). Desktop = a side panel; the page behind stays usable. */
  const [phone, setPhone] = useState(isPhone);
  /** The latest finished answer, read once by screen readers (the typing animation is not). */
  const [announce, setAnnounce] = useState("");

  const messagesRef = useRef(messages);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const stick = useRef(true);
  const rev = useRef<RevealState>(freshReveal());

  const name = config.guideName;
  const care = config.careNumber;
  const careHref = care ? `tel:+${care}` : null;
  const look: GuideLook = useMemo(
    () => ({ guideName: config.guideName, media: config.guideMedia, cutout: config.guideCutout }),
    [config.guideName, config.guideMedia, config.guideCutout],
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Keep the conversation for this visit (never while an answer is still arriving).
  useEffect(() => {
    if (busy) return;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(messagesForSaving(messages)));
    } catch {
      /* storage blocked: the chat still works, it just won't be remembered */
    }
  }, [messages, busy]);

  // Closing / leaving: stop the request and the typing animation, keep what was finished.
  useEffect(() => {
    const reveal = rev;
    const abort = abortRef;
    const latest = messagesRef;
    return () => {
      abort.current?.abort();
      if (reveal.current.raf) cancelAnimationFrame(reveal.current.raf);
      try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(messagesForSaving(latest.current)));
      } catch {
        /* ignore */
      }
    };
  }, []);

  /* ---------------- Text reveal (one frame at a time) ---------------- */
  const pump = useCallback(
    function step() {
      const r = rev.current;
      r.raf = 0;
      if (r.shown < r.full.length) {
        r.shown = nextRevealCount(r.full, r.shown, prefersReducedMotionNow());
        setShown({ id: r.id, n: r.shown });
        r.raf = requestAnimationFrame(step);
        return;
      }
      if (r.ended) {
        setShown(null);
        busyRef.current = false;
        setBusy(false);
        mood.finish(r.doneEmotion);
        if (r.full.trim()) setAnnounce(`${name}: ${plainText(r.full)}`);
      }
    },
    [mood, name],
  );
  const kick = useCallback(() => {
    if (!rev.current.raf) rev.current.raf = requestAnimationFrame(pump);
  }, [pump]);

  /* ---------------- Input ---------------- */
  const grow = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_PX)}px`;
  }, []);

  /* ---------------- Errors, in the guide's own words ---------------- */
  const errorMessage = useCallback(
    (err: unknown): GuideMessage => {
      let text: string;
      if (err instanceof ChatHttpError) {
        if (err.status === 429) text = err.message || "You're asking faster than I can check the calendar! Please wait a minute and ask again.";
        else if (err.status === 400) text = err.message || "I couldn't read that question. Could you ask it a little differently?";
        else if (err.status === 404) text = "I'm away from the desk right now, so I can't answer here.";
        else text = "I can't reach our live trip calendar right now. Please try again in a moment.";
      } else if (err instanceof ChatStreamError) {
        text = err.message || "Sorry, I lost my train of thought. Could you ask that again?";
      } else {
        text = "I can't connect right now — please check your internet and try again.";
      }
      if (care && !text.includes(config.careDisplay)) {
        text += `\n\nFor quick help, call customer care on **${config.careDisplay}**${config.careHours ? ` (${config.careHours})` : ""}.`;
      } else if (!care && config.whatsappUrl) {
        text += "\n\nYou can also message our team on WhatsApp.";
      }
      const actions: AnswerAction[] = [];
      if (care) actions.push({ kind: "call", label: `Call ${config.careDisplay}`, tel: `tel:+${care}` });
      if (config.whatsappUrl) actions.push({ kind: "whatsapp", label: "WhatsApp us", href: config.whatsappUrl });
      return { id: newId(), role: "guide", text, cards: [], actions, suggestions: [], source: "system", status: "error" };
    },
    [care, config.careDisplay, config.careHours, config.whatsappUrl],
  );

  /* ---------------- Ask a question ---------------- */
  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim().slice(0, CHAT_LIMITS.maxQuestionChars);
      if (!question || busyRef.current) return;

      const userMsg: ChatMessageData = { id: newId(), role: "user", text: question };
      const body: ChatRequest = {
        messages: buildTurns(messagesRef.current, question),
        page: { path: pathname, tripSlug: tripSlugFromPath(pathname) },
      };
      stick.current = true;
      setMessages((list) => [...list, userMsg]);
      setInput("");
      requestAnimationFrame(grow);
      busyRef.current = true;
      setBusy(true);
      setWaiting(true);
      mood.think();

      const ac = new AbortController();
      abortRef.current = ac;
      const guideId = newId();
      let created = false;
      let source: "guide" | "ai" = "guide";
      let doneEmotion: GuideEmotion = "idle";
      let gotDone = false;
      let incomplete = false;
      let total = 0;

      const patch = (fn: (g: GuideMessage) => GuideMessage) =>
        setMessages((list) => list.map((m) => (m.id === guideId && m.role === "guide" ? fn(m) : m)));
      const addText = (delta: string) => {
        ensure();
        if (!rev.current.full) mood.talk();
        rev.current.full += delta;
        patch((g) => ({ ...g, text: g.text + delta }));
        kick();
      };
      const ensure = () => {
        if (created) return;
        created = true;
        rev.current = freshReveal(guideId);
        setWaiting(false);
        // Start the typewriter at 0 in the same render, so the answer never flashes in full first.
        setShown({ id: guideId, n: 0 });
        const msg: GuideMessage = {
          id: guideId,
          role: "guide",
          text: "",
          cards: [],
          actions: [],
          suggestions: [],
          source,
          status: "streaming",
          at: Date.now(),
        };
        setMessages((list) => [...list, msg]);
      };

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: ac.signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body) {
          let msg = "";
          try {
            const j = (await res.json()) as { error?: unknown };
            if (typeof j.error === "string") msg = j.error.slice(0, 300);
          } catch {
            /* not JSON */
          }
          throw new ChatHttpError(res.status, msg);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const lines = new LineSplitter();
        const handle = (line: string) => {
          const ev = parseEvent(line);
          if (!ev) return;
          switch (ev.type) {
            case "meta":
              source = ev.source;
              if (created) patch((g) => ({ ...g, source }));
              break;
            case "text": {
              const room = MAX_ANSWER_CHARS - total;
              if (!ev.delta || room <= 0) break;
              const delta = ev.delta.slice(0, room);
              total += delta.length;
              addText(delta);
              break;
            }
            case "cards":
              ensure();
              patch((g) => ({ ...g, cards: [...g.cards, ...ev.cards].slice(0, 8) }));
              break;
            case "actions":
              ensure();
              patch((g) => ({ ...g, actions: [...g.actions, ...ev.actions].slice(0, 6) }));
              break;
            case "suggestions":
              ensure();
              patch((g) => ({ ...g, suggestions: ev.items }));
              break;
            case "done":
              gotDone = true;
              doneEmotion = ev.emotion;
              incomplete = ev.incomplete === true;
              break;
            case "error":
              throw new ChatStreamError(ev.message);
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of lines.push(decoder.decode(value, { stream: true }))) handle(line);
          if (gotDone) {
            reader.cancel().catch(() => undefined);
            break;
          }
        }
        if (!gotDone) for (const line of [...lines.push(decoder.decode()), ...lines.flush()]) handle(line);
        if (!created) throw new ChatStreamError("");
        // The connection dropped before the answer said it was finished: say so honestly.
        if (!gotDone) {
          incomplete = true;
          addText("\n\n(The connection dropped, so this answer may be cut short. Please ask again.)");
        }

        if (abortRef.current === ac) abortRef.current = null;
        // An unfinished answer stays on screen but is never sent back as conversation history.
        patch((g) => ({ ...g, source, status: incomplete ? "error" : "done" }));
        rev.current.ended = true;
        rev.current.doneEmotion = gotDone ? doneEmotion : "sorry";
        kick();
      } catch (err) {
        if (ac.signal.aborted) return; // closed, or "Start over"
        if (abortRef.current === ac) abortRef.current = null;
        if (rev.current.raf) cancelAnimationFrame(rev.current.raf);
        rev.current = freshReveal();
        setShown(null);
        setWaiting(false);
        const note = errorMessage(err);
        setMessages((list) => [
          ...list
            .filter((m) => m.id !== guideId || m.text.trim().length > 0)
            .map((m) => (m.id === guideId && m.role === "guide" ? { ...m, status: "error" as const } : m)),
          note,
        ]);
        setAnnounce(`${name}: ${plainText(note.text)}`);
        busyRef.current = false;
        setBusy(false);
        mood.sorry();
      }
    },
    [pathname, mood, kick, grow, errorMessage, name],
  );

  /* Quick questions and suggestions vanish once tapped: keep keyboard focus inside the chat. */
  const pick = useCallback(
    (q: string) => {
      void send(q);
      requestAnimationFrame(() => {
        if (isPhone()) dialogRef.current?.focus({ preventScroll: true });
        else inputRef.current?.focus({ preventScroll: true });
      });
    },
    [send],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  /* ---------------- Start over ---------------- */
  const startOver = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (rev.current.raf) cancelAnimationFrame(rev.current.raf);
    rev.current = freshReveal();
    busyRef.current = false;
    setBusy(false);
    setWaiting(false);
    setShown(null);
    setMessages([]);
    setInput("");
    setAnnounce("");
    setMenuOpen(false);
    try {
      sessionStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
    mood.wave();
    requestAnimationFrame(() => {
      grow();
      inputRef.current?.focus({ preventScroll: true });
    });
  };

  /* On phones the chat covers the page, so following a link closes it. */
  const onNavigate = useCallback(() => {
    if (isPhone()) onClose({ navigating: true });
  }, [onClose]);

  // Closing: stop the answer now (not 190 ms later on unmount), so nothing arrives while it fades.
  useEffect(() => {
    if (!closing) return;
    abortRef.current?.abort();
    abortRef.current = null;
    if (rev.current.raf) {
      cancelAnimationFrame(rev.current.raf);
      rev.current.raf = 0;
    }
  }, [closing]);

  // Desktop panel: Esc closes it from anywhere on the page (inside the chat, onKeyDown handles it).
  useEffect(() => {
    if (phone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-chat-window])')) return; // another dialog is on top
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phone, onClose]);

  /* ---------------- Scrolling: stay at the newest message unless the visitor scrolled up ---------------- */
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  // New message / typing dots: jump to the bottom. Growing text and late-loading card photos are
  // followed by the ResizeObserver below.
  const messageCount = messages.length;
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messageCount, waiting]);
  useEffect(() => {
    const list = listRef.current;
    const log = logRef.current;
    if (!list || !log || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stick.current) list.scrollTop = list.scrollHeight;
    });
    ro.observe(log);
    return () => ro.disconnect();
  }, []);

  /* ---------------- Focus, keyboard, scroll lock, phone keyboard ---------------- */
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      // Phones: don't pop the keyboard up straight away.
      if (isPhone()) dialogRef.current?.focus({ preventScroll: true });
      else inputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!phone) return;
    const { body, documentElement: html } = document;
    const prevBody = body.style.overflow;
    const prevHtml = html.style.overflow;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevBody;
      html.style.overflow = prevHtml;
    };
  }, [phone]);

  // Phones: fit the sheet to the visible area so the on-screen keyboard never hides the input.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const vv = window.visualViewport;
    const mq = window.matchMedia(PHONE_MQ);
    let raf = 0;
    const apply = () => {
      raf = 0;
      const phone = mq.matches;
      setPhone(phone);
      if (phone && vv) {
        el.style.height = `${Math.round(vv.height)}px`;
        el.style.top = `${Math.round(vv.offsetTop)}px`;
      } else {
        el.style.height = "";
        el.style.top = "";
      }
      setCompact((phone && vv ? vv.height : window.innerHeight) < 560);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    schedule();
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    mq.addEventListener("change", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      mq.removeEventListener("change", schedule);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && !menuRef.current?.contains(t) && !menuBtnRef.current?.contains(t)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (menuOpen) {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      } else {
        onClose();
      }
      return;
    }
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === root)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !root.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  const lastIndex = messages.length - 1;
  const nearLimit = input.length > CHAT_LIMITS.maxQuestionChars - 80;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal={phone ? true : undefined}
      aria-labelledby={titleId}
      data-chat-window=""
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={`${styles.panel} ${closing ? styles.panelOut : styles.panelIn} fixed top-0 right-0 left-0 z-[65] flex h-[100dvh] flex-col overflow-hidden bg-cream-50 outline-none sm:top-auto sm:right-4 sm:bottom-4 sm:left-auto sm:h-[min(680px,calc(100dvh-2rem))] sm:w-[min(400px,calc(100vw-2rem))] sm:rounded-[1.6rem] sm:border sm:border-white/70 sm:shadow-[0_30px_80px_-24px_rgb(13_95_107/0.55),0_8px_24px_-12px_rgb(13_95_107/0.3)] lg:right-6 lg:bottom-6`}
    >
      {/* ---------- Header: the guide + customer care ---------- */}
      <header className={`${styles.header} relative shrink-0 px-4 pt-[max(0.9rem,env(safe-area-inset-top))] pb-3.5 text-white sm:pt-4`}>
        <div className="flex items-start gap-3">
          <GuideAvatar emotion={emotion} media={config.guideMedia} cutout={config.guideCutout} size={compact ? 52 : 76} name={name} paused={closing} />
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id={titleId} className="truncate font-display text-xl leading-tight font-semibold text-white">
              {name}
            </h2>
            {config.guideRole && <p className="truncate text-[0.82rem] text-white/90">{config.guideRole}</p>}
            <div className="mt-1.5">
              <GuideMoodChip emotion={emotion} />
            </div>
          </div>
          <div className="-mt-1 -mr-1.5 flex shrink-0 items-center">
            <div className="relative">
              <button
                ref={menuBtnRef}
                type="button"
                aria-label="Chat options"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? `${titleId}-menu` : undefined}
                onClick={() => setMenuOpen((o) => !o)}
                className="grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/15"
              >
                <Ellipsis className="h-5 w-5" aria-hidden="true" />
              </button>
              {menuOpen && (
                <div
                  ref={menuRef}
                  id={`${titleId}-menu`}
                  className="absolute top-12 right-0 z-10 w-48 rounded-2xl border border-stone-200 bg-cream-50 p-1.5 text-ink-900 shadow-[var(--shadow-lift)]"
                >
                  <button
                    type="button"
                    onClick={startOver}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold hover:bg-lagoon-100"
                  >
                    <RotateCcw className="h-4 w-4 text-copper-700" aria-hidden="true" /> Start over
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onClose()}
              aria-label="Close chat"
              className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {!compact && (careHref || config.whatsappUrl) && (
          <div className="mt-3 flex items-stretch gap-2">
            {careHref && (
              <a
                href={careHref}
                aria-label={`Call customer care · ${config.careDisplay}`}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-white px-3 py-1.5 text-ink-900 shadow-[0_8px_20px_-12px_rgb(16_48_47/0.6)] hover:bg-cream-100"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e2f4e8] text-[#12603e]">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block text-[0.68rem] font-bold tracking-wide text-copper-700 uppercase">Call customer care</span>
                  <span className="block truncate text-[0.98rem] font-bold">{config.careDisplay}</span>
                </span>
              </a>
            )}
            {config.whatsappUrl && (
              <a
                href={config.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat with our team on WhatsApp (opens WhatsApp)"
                className={
                  careHref
                    ? "grid min-h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#157a40] text-white shadow-[0_8px_20px_-12px_rgb(16_48_47/0.6)] hover:bg-[#12693a]"
                    : "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#157a40] px-4 text-sm font-semibold text-white hover:bg-[#12693a]"
                }
              >
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
                {!careHref && "Chat with our team on WhatsApp"}
              </a>
            )}
          </div>
        )}
        {!compact && careHref && config.careHours && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[0.74rem] text-white/90">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Customer care: {config.careHours}
          </p>
        )}
      </header>

      {/* ---------- Conversation ---------- */}
      <div ref={listRef} onScroll={onScroll} className={`${styles.body} min-h-0 flex-1 overflow-y-auto px-3.5 py-4 sm:px-4`}>
        <div ref={logRef} className="space-y-3.5" role="region" aria-label={`Conversation with ${name}`}>
          <GuideRow look={look}>
            <div className={`${guideBubble} inline-block max-w-[94%] border-stone-200 bg-cream-50`}>
              <span className="sr-only">{name}: </span>
              <RichText text={config.greeting} onNavigate={onNavigate} />
            </div>
            {messages.length === 0 && <SuggestionChips items={config.quickQuestions} onPick={pick} disabled={busy} />}
          </GuideRow>

          {messages.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              shownChars={shown && shown.id === m.id ? shown.n : null}
              look={look}
              showSuggestions={i === lastIndex && !busy}
              busy={busy}
              onSuggestion={pick}
              onNavigate={onNavigate}
            />
          ))}

          {waiting && <TypingBubble look={look} />}
        </div>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announce}
        </p>
      </div>

      {/* ---------- Ask ---------- */}
      <form onSubmit={onSubmit} className="shrink-0 border-t border-stone-200 bg-cream-50 px-3 pt-2.5 pb-[max(0.7rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2 rounded-[1.4rem] border border-stone-300 bg-white p-1.5 pl-3.5 transition focus-within:border-lagoon-500 focus-within:ring-2 focus-within:ring-lagoon-500/25">
          <label htmlFor={inputId} className="sr-only">
            Ask {name} a question
          </label>
          <textarea
            id={inputId}
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={CHAT_LIMITS.maxQuestionChars}
            enterKeyHint="send"
            autoComplete="off"
            placeholder="Ask about dates, seats, prices…"
            onChange={(e) => {
              setInput(e.target.value);
              grow();
              if (e.target.value.trim()) mood.listen(true);
            }}
            onFocus={() => mood.listen(true, true)}
            onBlur={() => {
              if (!input.trim()) mood.listen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            className="max-h-[120px] min-h-10 flex-1 resize-none bg-transparent py-2 text-base leading-6 text-ink-900 placeholder:text-stone-600/80 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={busy ? `${name} is answering` : "Send question"}
            className="btn-sunset h-11 w-11 shrink-0 p-0"
          >
            <SendHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-1 text-[0.72rem] text-stone-600">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-forest-700" aria-hidden="true" />
            Live trip calendar · never share OTPs or payment details here
          </span>
          {nearLimit ? (
            <span aria-live="polite">
              {input.length}/{CHAT_LIMITS.maxQuestionChars}
            </span>
          ) : (
            careHref && (
              <a
                href={careHref}
                aria-label={`Call customer care · ${config.careDisplay}`}
                className="inline-flex min-h-8 items-center gap-1 font-semibold text-forest-900 hover:underline"
              >
                <Phone className="h-3 w-3" aria-hidden="true" /> {config.careDisplay}
              </a>
            )
          )}
        </div>
      </form>
    </div>
  );
}
