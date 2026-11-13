"use client";

import {
  ArrowRight,
  CalendarDays,
  Car,
  CircleCheck,
  Clock,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Fragment, memo, type ReactNode } from "react";
import { formatINR } from "@/lib/currency";
import type { AnswerAction, AnswerCard, CardTheme, GuideEmotion } from "@/lib/assistant/types";
import type { ChatMessageData } from "./chat-stream";
import { GuideAvatar } from "./GuideAvatar";
import styles from "./assistant.module.css";

export type { ChatMessageData, GuideMessage, UserMessage } from "./chat-stream";

/* -------------------------------------------------------------------------
 * Small helpers
 * ----------------------------------------------------------------------- */
const THEMES: readonly CardTheme[] = ["coorg", "chikmagalur", "gokarna", "hampi", "brand"];
const themeOf = (t: string) => `theme-${THEMES.includes(t as CardTheme) ? t : "brand"}`;

const DAY_FMT = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
function dayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return DAY_FMT.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)));
}
export function dateRangeLabel(start: string, end: string): string {
  if (!end || end.slice(0, 10) === start.slice(0, 10)) return dayLabel(start);
  return `${dayLabel(start)} – ${dayLabel(end)}`;
}
const TIME_FMT = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
/** Answers older than this show "seats as of …" so a saved chat never passes old seat counts off as live. */
const STALE_AFTER_MS = 15 * 60_000;

const seatsLabel = (left: number, cap: number) =>
  left <= 0 ? "Sold out" : `${left} of ${cap} ${cap === 1 ? "seat" : "seats"} left`;

/** Same-site path only: starts with one "/", never "//" or "/\\" (protocol-relative), no spaces or backslashes. */
const isSitePath = (href: string) => /^\/(?![/\\])[^\s\\]*$/.test(href);
const isHttps = (href: string | null | undefined): href is string => !!href && /^https:\/\//i.test(href);
const isTel = (href: string) => /^tel:\+?[0-9][0-9\s-]{5,19}$/.test(href);
const isWhatsApp = (href: string) => /^https:\/\/(wa\.me|api\.whatsapp\.com|(www\.)?whatsapp\.com)\//i.test(href);
const safeImage = (src: string) => (isSitePath(src) || isHttps(src) ? src : null);

const tripHref = (slug: string) => `/trips/${encodeURIComponent(slug)}`;
const bookHref = (slug: string, departureId: string, wholeCar = false) =>
  `${tripHref(slug)}?date=${encodeURIComponent(departureId)}${wholeCar ? "&mode=private" : ""}#book`;

/* -------------------------------------------------------------------------
 * Light markdown: **bold**, "- " bullets, numbered lines, line breaks and
 * [label](/path) links. No HTML is ever injected.
 * ----------------------------------------------------------------------- */
const INLINE_RE = /\*\*([^*\n]+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

function renderLink(label: string, href: string, raw: string, key: string, onNavigate?: () => void): ReactNode {
  const cls = "font-semibold text-forest-900 underline decoration-copper-600/50 decoration-2 underline-offset-2 hover:decoration-copper-600";
  if (isSitePath(href)) {
    return (
      <Link key={key} href={href} className={cls} onClick={onNavigate}>
        {label}
      </Link>
    );
  }
  if (href.startsWith("#") || isTel(href)) {
    return (
      <a key={key} href={href} className={cls}>
        {label}
      </a>
    );
  }
  return <Fragment key={key}>{raw}</Fragment>; // anything else stays plain text
}

function renderInline(text: string, keyBase: string, onNavigate?: () => void): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const key = `${keyBase}-${i++}`;
    if (m[1] !== undefined) {
      out.push(
        <strong key={key} className="font-semibold text-ink-900">
          {renderInline(m[1], key, onNavigate)}
        </strong>,
      );
    } else {
      out.push(renderLink(m[2] ?? "", m[3] ?? "", m[0], key, onNavigate));
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let newPara = true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
    const listMatch = bullet ?? /^\s*\d{1,2}[.)]\s+(.*)$/.exec(line);
    const lastBlock = blocks[blocks.length - 1];
    if (listMatch) {
      const kind = bullet ? "ul" : "ol";
      const item = listMatch[1] ?? "";
      if (lastBlock && lastBlock.kind === kind && !newPara) lastBlock.items.push(item);
      else blocks.push({ kind, items: [item] });
      newPara = false;
    } else if (!line.trim()) {
      newPara = true;
    } else {
      if (lastBlock && lastBlock.kind === "p" && !newPara) lastBlock.lines.push(line);
      else blocks.push({ kind: "p", lines: [line] });
      newPara = false;
    }
  }
  return blocks;
}

/** While an answer is still arriving, hide a half-written link or bold marker until it completes. */
function tidyPartial(text: string): string {
  let t = text;
  const lb = t.lastIndexOf("[");
  if (lb >= 0 && t.length - lb < 240 && !/^\[[^\]\n]*\]\([^)\s]*\)/.test(t.slice(lb))) t = t.slice(0, lb);
  const marks = t.match(/\*\*/g)?.length ?? 0;
  if (marks % 2 === 1) {
    const i = t.lastIndexOf("**");
    t = t.slice(0, i) + t.slice(i + 2);
  }
  return t;
}

export function RichText({ text, streaming = false, onNavigate }: { text: string; streaming?: boolean; onNavigate?: () => void }) {
  const blocks = toBlocks(streaming ? tidyPartial(text) : text);
  return (
    <div className="space-y-2 break-words">
      {blocks.map((b, bi) => {
        if (b.kind === "p") {
          return (
            <p key={bi}>
              {b.lines.map((line, li) => (
                <Fragment key={li}>
                  {li > 0 && <br />}
                  {renderInline(line, `${bi}-${li}`, onNavigate)}
                </Fragment>
              ))}
            </p>
          );
        }
        const ListTag = b.kind === "ul" ? "ul" : "ol";
        return (
          <ListTag key={bi} className={`space-y-1 pl-5 ${b.kind === "ul" ? "list-disc marker:text-copper-600" : "list-decimal marker:font-semibold marker:text-forest-900"}`}>
            {b.items.map((item, ii) => (
              <li key={ii}>{renderInline(item, `${bi}-${ii}`, onNavigate)}</li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Answer cards
 * ----------------------------------------------------------------------- */
function SeatDots({ left, capacity }: { left: number; capacity: number }) {
  const cap = Math.max(1, Math.min(12, Math.round(capacity)));
  const free = Math.max(0, Math.min(cap, Math.round(left)));
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: cap }, (_, i) => (
        <span key={i} className={`${styles.seat} ${i < cap - free ? styles.seatTaken : styles.seatFree}`} />
      ))}
    </span>
  );
}

const cardBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold";

function TripCardView({ card, wide, onNavigate }: { card: Extract<AnswerCard, { kind: "trip" }>; wide: boolean; onNavigate?: () => void }) {
  const img = safeImage(card.imageUrl);
  const next = card.next;
  return (
    <article className={`card-theme ${themeOf(card.theme)} flex flex-col ${wide ? "w-full" : "w-[236px] shrink-0"}`}>
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-t-[1.2rem] bg-[linear-gradient(135deg,var(--th-tint),var(--th-tint2))]">
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/92 px-2.5 py-1 text-[0.72rem] font-bold text-ink-900 shadow-sm">
          <Clock className="h-3.5 w-3.5 th-accent" aria-hidden="true" />
          {card.durationLabel}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div>
          <h4 className="font-display text-base leading-snug font-semibold th-text">{card.title}</h4>
          <p className="mt-0.5 text-xs text-stone-600">
            {card.destination}
            {card.difficulty ? ` · ${card.difficulty}` : ""}
          </p>
        </div>
        <p className="text-sm text-ink-900">
          <span className="text-lg font-bold">{formatINR(card.pricePaise)}</span>
          <span className="text-stone-600"> / seat</span>
          {card.privatePricePaise !== null && (
            <span className="block text-xs text-stone-600">
              Whole car (6 seats): <span className="font-semibold text-ink-900">{formatINR(card.privatePricePaise)}</span>
            </span>
          )}
        </p>
        {next ? (
          <div className="rounded-xl bg-white/75 px-2.5 py-2 text-xs text-ink-900">
            <p className="flex items-center gap-1.5 font-semibold">
              <CalendarDays className="h-3.5 w-3.5 th-accent" aria-hidden="true" />
              Next: {dateRangeLabel(next.startDate, next.endDate)}
            </p>
            {next.womenOnly && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#f3c0c9] bg-[#fff1f3] px-2 py-0.5 text-[0.68rem] font-bold text-[#a3263a]">
                <Users className="h-3 w-3" aria-hidden="true" /> Women-only batch
              </p>
            )}
            <p className="mt-1 flex items-center gap-2">
              <SeatDots left={next.seatsRemaining} capacity={next.maxCapacity} />
              <span className={next.seatsRemaining > 0 ? "font-semibold th-text" : "font-semibold text-[#a3263a]"}>
                {seatsLabel(next.seatsRemaining, next.maxCapacity)}
              </span>
            </p>
          </div>
        ) : (
          <p className="text-xs font-semibold text-stone-600">New dates coming soon</p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Link href={tripHref(card.slug)} onClick={onNavigate} className={`btn-ocean ${cardBtn}`}>
            See trip <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {next && next.seatsRemaining > 0 && (
            <Link href={bookHref(card.slug, next.departureId)} onClick={onNavigate} className={`${cardBtn} th-chip`}>
              Reserve
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function DepartureCardView({
  card,
  wide,
  onNavigate,
}: {
  card: Extract<AnswerCard, { kind: "departure" }>;
  wide: boolean;
  onNavigate?: () => void;
}) {
  const soldOut = card.seatsRemaining <= 0;
  return (
    <article className={`card-theme ${themeOf(card.theme)} flex flex-col gap-2 p-3.5 pt-4 ${wide ? "w-full" : "w-[236px] shrink-0"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.72rem] font-bold tracking-wide uppercase th-text">{card.tripTitle}</p>
        {card.womenOnly && (
          <span className="tile-rose inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-bold text-[#a3263a]">
            <Users className="h-3 w-3" aria-hidden="true" /> Women only
          </span>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-[0.95rem] font-bold text-ink-900">
        <CalendarDays className="h-4 w-4 th-accent" aria-hidden="true" />
        {dateRangeLabel(card.startDate, card.endDate)}
      </p>
      <p className="flex items-center gap-2 text-xs">
        <SeatDots left={card.seatsRemaining} capacity={card.maxCapacity} />
        <span className={soldOut ? "font-semibold text-[#a3263a]" : "font-semibold th-text"}>
          {seatsLabel(card.seatsRemaining, card.maxCapacity)}
        </span>
      </p>
      <p className="text-sm text-ink-900">
        <span className="text-lg font-bold">{formatINR(card.pricePaise)}</span>
        <span className="text-stone-600"> / seat</span>
        {card.code && <span className="ml-2 text-[0.68rem] text-stone-600">Batch {card.code}</span>}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Link href={bookHref(card.tripSlug, card.departureId)} onClick={onNavigate} className={`${soldOut ? "btn-ocean" : "btn-sunset"} ${cardBtn}`}>
          {soldOut ? "See waitlist" : "Reserve seats"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        {card.privateCarPossible && !soldOut && (
          <Link href={bookHref(card.tripSlug, card.departureId, true)} onClick={onNavigate} className={`${cardBtn} th-chip`}>
            <Car className="h-4 w-4" aria-hidden="true" /> Book whole car
          </Link>
        )}
      </div>
    </article>
  );
}

function PickupCardView({ card }: { card: Extract<AnswerCard, { kind: "pickup" }> }) {
  const maps = isHttps(card.mapsUrl) ? card.mapsUrl : null;
  return (
    <li className="card-theme theme-brand flex items-start gap-3 p-3 pt-3.5">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#b5e2e2] bg-[linear-gradient(150deg,#d9f2f2,#f2fbfb)]">
        <MapPin className="h-4 w-4 text-forest-900" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-900">{card.name}</p>
        <p className="text-xs text-stone-600">
          {[card.area, card.tripTitle].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {card.time && (
            <span className="inline-flex items-center gap-1 font-semibold text-ink-900">
              <Clock className="h-3.5 w-3.5 text-copper-700" aria-hidden="true" />
              {card.time}
            </span>
          )}
          <span className={card.confirmed ? "font-semibold text-[#1d6b40]" : "text-stone-600"}>
            {card.confirmed ? "Confirmed" : "Time to be confirmed"}
          </span>
        </p>
      </div>
      {maps && (
        <a
          href={maps}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 self-center rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-forest-900 hover:border-forest-700/40"
          aria-label={`Open ${card.name} in Maps (opens in a new tab)`}
        >
          Map <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      )}
    </li>
  );
}

export function AnswerCards({ cards, onNavigate }: { cards: AnswerCard[]; onNavigate?: () => void }) {
  const pickups = cards.filter((c): c is Extract<AnswerCard, { kind: "pickup" }> => c.kind === "pickup");
  const others = cards.filter((c) => c.kind !== "pickup");
  const wide = others.length === 1;
  return (
    <div className="mt-2.5 space-y-2.5">
      {others.length > 0 && (
        <div
          className={wide ? "" : `${styles.rail} -mx-1 flex gap-2.5 overflow-x-auto px-1 pt-0.5 pb-2`}
          {...(wide ? {} : { role: "list", "aria-label": "Trips and dates" })}
        >
          {others.map((c) => (
            <div key={c.kind === "trip" ? `t:${c.slug}` : c.kind === "departure" ? `d:${c.departureId}` : "x"} role={wide ? undefined : "listitem"} className={wide ? "" : "flex"}>
              {c.kind === "trip" ? (
                <TripCardView card={c} wide={wide} onNavigate={onNavigate} />
              ) : c.kind === "departure" ? (
                <DepartureCardView card={c} wide={wide} onNavigate={onNavigate} />
              ) : null}
            </div>
          ))}
        </div>
      )}
      {pickups.length > 0 && (
        <ul className="space-y-2" aria-label="Pickup points">
          {pickups.map((p, i) => (
            <PickupCardView key={`${p.tripSlug}:${p.name}:${i}`} card={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Action buttons + suggestion chips
 * ----------------------------------------------------------------------- */
export function AnswerActions({ actions, onNavigate }: { actions: AnswerAction[]; onNavigate?: () => void }) {
  const items = actions
    .map((a, i) => {
      const key = `${a.kind}-${i}`;
      if (a.kind === "call" && isTel(a.tel)) {
        return (
          <a key={key} href={a.tel} className={`${cardBtn} bg-[#e2f4e8] text-[#12603e] ring-1 ring-[#b9e3c6] hover:bg-[#d4efdd]`}>
            <Phone className="h-4 w-4" aria-hidden="true" /> {a.label}
          </a>
        );
      }
      if (a.kind === "whatsapp" && isWhatsApp(a.href)) {
        return (
          <a
            key={key}
            href={a.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${cardBtn} bg-[#157a40] text-white hover:bg-[#12693a]`}
            aria-label={`${a.label} (opens WhatsApp)`}
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> {a.label}
          </a>
        );
      }
      if (a.kind === "link" && isSitePath(a.href)) {
        return (
          <Link key={key} href={a.href} onClick={onNavigate} className={`${cardBtn} border border-forest-700/25 bg-white text-forest-900 hover:border-forest-700/50 hover:bg-lagoon-100`}>
            {a.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        );
      }
      return null;
    })
    .filter(Boolean);
  if (items.length === 0) return null;
  return <div className="mt-2.5 flex flex-wrap gap-2">{items}</div>;
}

export function SuggestionChips({ items, onPick, disabled }: { items: string[]; onPick: (q: string) => void; disabled?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Suggested questions">
      {items.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          className="min-h-11 rounded-full border border-[#b5e2e2] bg-white px-3.5 py-2 text-left text-[0.82rem] leading-snug font-semibold text-forest-900 shadow-[0_1px_2px_rgb(13_95_107/0.06)] hover:border-lagoon-500 hover:bg-lagoon-100 disabled:opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Bubbles
 * ----------------------------------------------------------------------- */
export interface GuideLook {
  guideName: string;
  media: Partial<Record<GuideEmotion, string>>;
}

export const guideBubble =
  "rounded-[1.15rem] rounded-bl-md border px-3.5 py-2.5 text-[0.93rem] leading-relaxed text-ink-900 shadow-[0_1px_2px_rgb(13_95_107/0.05),0_8px_20px_-14px_rgb(13_95_107/0.35)]";

export function GuideRow({ look, children }: { look: GuideLook; children: ReactNode }) {
  return (
    <div className={`${styles.msgIn} flex items-start gap-2`}>
      <GuideAvatar mini size={30} emotion="idle" media={look.media} name={look.guideName} className="mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function TypingBubble({ look }: { look: GuideLook }) {
  return (
    <GuideRow look={look}>
      <div className={`${guideBubble} inline-flex items-center gap-2.5 border-stone-200 bg-cream-50`}>
        <span className={styles.typing} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="text-[0.85rem] text-stone-600">{look.guideName} is checking the live calendar…</span>
      </div>
    </GuideRow>
  );
}

/** One message. Memoised: while an answer is being written only that bubble re-renders. */
export const ChatMessage = memo(function ChatMessage({
  message,
  shownChars,
  look,
  showSuggestions,
  busy,
  onSuggestion,
  onNavigate,
}: {
  message: ChatMessageData;
  /** How much of a guide answer is on screen while it is being written; null = all of it. */
  shownChars: number | null;
  look: GuideLook;
  showSuggestions: boolean;
  busy: boolean;
  onSuggestion: (q: string) => void;
  onNavigate?: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className={`${styles.msgIn} flex justify-end`}>
        <p className="max-w-[85%] rounded-[1.15rem] rounded-br-md border border-[#ffc89f] bg-[linear-gradient(135deg,#ffeadb,#ffd9bd)] px-3.5 py-2.5 text-[0.93rem] leading-relaxed whitespace-pre-wrap break-words text-ink-900">
          <span className="sr-only">You: </span>
          {message.text}
        </p>
      </div>
    );
  }

  const writing = shownChars !== null;
  const text = writing ? message.text.slice(0, shownChars) : message.text;
  const complete = !writing && message.status !== "streaming";
  const isError = message.status === "error";
  const checkedAt = message.at ? TIME_FMT.format(message.at) : null;
  const stale = message.at ? Date.now() - message.at > STALE_AFTER_MS : false;

  return (
    <GuideRow look={look}>
      {(text || writing) && (
        <div className={`${guideBubble} max-w-[94%] ${isError ? "border-[#f6c1c8] bg-[#fff6f7]" : "border-stone-200 bg-cream-50"} inline-block`}>
          <span className="sr-only">{look.guideName}: </span>
          <RichText text={text} streaming={writing} onNavigate={onNavigate} />
          {writing && <span className={styles.caret} aria-hidden="true" />}
        </div>
      )}
      {complete && message.cards.length > 0 && <AnswerCards cards={message.cards} onNavigate={onNavigate} />}
      {complete && <AnswerActions actions={message.actions} onNavigate={onNavigate} />}
      {complete && message.source !== "system" && !isError && (
        <p className="mt-1.5 flex items-center gap-1 text-[0.7rem] text-stone-600">
          {message.source === "ai" ? (
            <>
              <Sparkles className="h-3 w-3 text-saffron-500" aria-hidden="true" /> Smart answer from our live trip data — the trip page has the final word
            </>
          ) : stale && checkedAt ? (
            <>
              <Clock className="h-3 w-3 text-copper-700" aria-hidden="true" /> Seats and prices as of {checkedAt} — ask again for the latest
            </>
          ) : (
            <>
              <CircleCheck className="h-3 w-3 text-[#2f9e5b]" aria-hidden="true" /> From the live trip calendar{checkedAt ? ` · ${checkedAt}` : ""}
            </>
          )}
        </p>
      )}
      {complete && showSuggestions && <SuggestionChips items={message.suggestions} onPick={onSuggestion} disabled={busy} />}
    </GuideRow>
  );
});
