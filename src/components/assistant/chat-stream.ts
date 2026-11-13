/**
 * Browser-side helpers for the chat guide: message shapes, reading the NDJSON answer stream,
 * the request history, saving the conversation for the visit, and the text reveal speed.
 * Plain functions (no React) so they can be tested on their own.
 */
import {
  CHAT_LIMITS,
  GUIDE_EMOTIONS,
  type AnswerAction,
  type AnswerCard,
  type ChatEvent,
  type ChatTurn,
  type GuideEmotion,
} from "@/lib/assistant/types";

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
}
export interface GuideMessage {
  id: string;
  role: "guide";
  text: string;
  cards: AnswerCard[];
  actions: AnswerAction[];
  suggestions: string[];
  /** guide = exact answer from live data, ai = smart answer, system = the chat's own note (errors). */
  source: "guide" | "ai" | "system";
  /** error = a note from the chat itself, or an answer that stopped part-way (never sent back as history). */
  status: "streaming" | "done" | "error";
  /** When the answer arrived (ms since 1970), so a saved chat can say "seats as of 3:40 PM". */
  at?: number;
}
export type ChatMessageData = UserMessage | GuideMessage;

/** sessionStorage key: the conversation survives page changes and reloads for this visit (tab). */
export const STORE_KEY = "sanchari-guide-chat-v1";
export const MAX_SAVED = 40;
export const MAX_ANSWER_CHARS = 12_000;
const MAX_CARDS = 8;
const MAX_ACTIONS = 6;
const MAX_SUGGESTIONS = 6;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isEmotion = (v: unknown): v is GuideEmotion => isStr(v) && (GUIDE_EMOTIONS as readonly string[]).includes(v);

/** "/trips/coorg-weekend" → "coorg-weekend"; anything else → null. */
export function tripSlugFromPath(path: string | null | undefined): string | null {
  const m = /^\/trips\/([a-z0-9][a-z0-9-]{0,119})\/?$/i.exec(path ?? "");
  return m?.[1] ? m[1].toLowerCase() : null;
}

/** The turns sent with a new question: real questions and finished answers only, newest last. */
export function buildTurns(history: ChatMessageData[], question: string): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of history) {
    if (m.role === "user") turns.push({ role: "user", text: m.text });
    else if (m.status === "done" && m.source !== "system" && m.text.trim()) turns.push({ role: "guide", text: m.text });
  }
  turns.push({ role: "user", text: question });
  return turns.slice(-CHAT_LIMITS.maxTurns);
}

function isCard(v: unknown): v is AnswerCard {
  if (!isObj(v)) return false;
  if (v.kind === "trip") {
    const next = v.next;
    const nextOk =
      next === null ||
      (isObj(next) && isStr(next.departureId) && isStr(next.startDate) && isStr(next.endDate) && isNum(next.seatsRemaining) && isNum(next.maxCapacity));
    return (
      isStr(v.slug) &&
      isStr(v.title) &&
      isStr(v.destination) &&
      isStr(v.theme) &&
      isStr(v.imageUrl) &&
      isStr(v.durationLabel) &&
      isStr(v.difficulty) &&
      isNum(v.pricePaise) &&
      (v.privatePricePaise === null || isNum(v.privatePricePaise)) &&
      nextOk
    );
  }
  if (v.kind === "departure") {
    return (
      isStr(v.tripSlug) &&
      isStr(v.tripTitle) &&
      isStr(v.theme) &&
      isStr(v.departureId) &&
      isStr(v.code) &&
      isStr(v.startDate) &&
      isStr(v.endDate) &&
      isNum(v.seatsRemaining) &&
      isNum(v.maxCapacity) &&
      isNum(v.pricePaise) &&
      isBool(v.womenOnly) &&
      isBool(v.privateCarPossible)
    );
  }
  if (v.kind === "pickup") {
    return (
      isStr(v.tripSlug) &&
      isStr(v.tripTitle) &&
      isStr(v.name) &&
      isStr(v.area) &&
      isStr(v.time) &&
      (v.mapsUrl === null || isStr(v.mapsUrl)) &&
      isBool(v.confirmed)
    );
  }
  return false;
}

function isAction(v: unknown): v is AnswerAction {
  if (!isObj(v) || !isStr(v.label)) return false;
  if (v.kind === "call") return isStr(v.tel);
  if (v.kind === "link" || v.kind === "whatsapp") return isStr(v.href);
  return false;
}

const cleanSuggestions = (items: unknown[]): string[] =>
  items.filter((s): s is string => isStr(s) && s.trim().length > 0).map((s) => s.trim().slice(0, 140)).slice(0, MAX_SUGGESTIONS);

/** One NDJSON line → a checked ChatEvent, or null when it is not one. */
export function parseEvent(line: string): ChatEvent | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObj(v) || !isStr(v.type)) return null;
  switch (v.type) {
    case "meta":
      return { type: "meta", source: v.source === "ai" ? "ai" : "guide", emotion: isEmotion(v.emotion) ? v.emotion : "talking" };
    case "text":
      return isStr(v.delta) ? { type: "text", delta: v.delta } : null;
    case "cards":
      return Array.isArray(v.cards) ? { type: "cards", cards: v.cards.filter(isCard).slice(0, MAX_CARDS) } : null;
    case "actions":
      return Array.isArray(v.actions) ? { type: "actions", actions: v.actions.filter(isAction).slice(0, MAX_ACTIONS) } : null;
    case "suggestions":
      return Array.isArray(v.items) ? { type: "suggestions", items: cleanSuggestions(v.items) } : null;
    case "done":
      return { type: "done", emotion: isEmotion(v.emotion) ? v.emotion : "idle", ...(v.incomplete === true ? { incomplete: true } : {}) };
    case "error":
      return { type: "error", message: isStr(v.message) ? v.message.trim().slice(0, 600) : "" };
    default:
      return null;
  }
}

/** Splits streamed text into complete lines (NDJSON). */
export class LineSplitter {
  private buf = "";
  push(chunk: string): string[] {
    this.buf += chunk;
    const parts = this.buf.split("\n");
    this.buf = parts.pop() ?? "";
    return parts.map((s) => s.trim()).filter(Boolean);
  }
  flush(): string[] {
    const rest = this.buf.trim();
    this.buf = "";
    return rest ? [rest] : [];
  }
}

/** Saved copy → checked messages (anything odd is dropped). */
export function restoreMessages(raw: string | null): ChatMessageData[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: ChatMessageData[] = [];
  for (const v of data) {
    if (!isObj(v) || !isStr(v.id) || !isStr(v.text)) continue;
    if (v.role === "user") {
      const text = v.text.slice(0, CHAT_LIMITS.maxQuestionChars);
      if (text.trim()) out.push({ id: v.id, role: "user", text });
    } else if (v.role === "guide") {
      out.push({
        id: v.id,
        role: "guide",
        text: v.text.slice(0, MAX_ANSWER_CHARS),
        cards: Array.isArray(v.cards) ? v.cards.filter(isCard).slice(0, MAX_CARDS) : [],
        actions: Array.isArray(v.actions) ? v.actions.filter(isAction).slice(0, MAX_ACTIONS) : [],
        suggestions: Array.isArray(v.suggestions) ? cleanSuggestions(v.suggestions) : [],
        source: v.source === "ai" ? "ai" : v.source === "system" ? "system" : "guide",
        status: v.status === "error" ? "error" : "done",
        ...(isNum(v.at) && v.at > 0 ? { at: v.at } : {}),
      });
    }
  }
  return out.slice(-MAX_SAVED);
}

/** What is worth keeping: finished answers only, never a half-written one or an unanswered question. */
export function messagesForSaving(messages: ChatMessageData[]): ChatMessageData[] {
  const kept = messages.filter((m) => m.role === "user" || (m.status !== "streaming" && (m.text.trim() || m.cards.length > 0)));
  while (kept.length > 0 && kept[kept.length - 1]?.role === "user") kept.pop();
  return kept.slice(-MAX_SAVED);
}

/**
 * How many characters of an answer to show on the next frame. Small bursts appear a couple of
 * letters at a time; a big burst catches up quickly (at most ~40 characters a frame) so long
 * answers still read like someone typing, never like a wall of text dropping in.
 */
export function nextRevealCount(text: string, shown: number, instant: boolean): number {
  const backlog = text.length - shown;
  if (backlog <= 0) return text.length;
  const step = instant ? backlog : Math.min(40, Math.max(2, Math.ceil(backlog / 8)));
  let n = Math.min(text.length, shown + step);
  const code = text.charCodeAt(n - 1);
  if (n < text.length && code >= 0xd800 && code <= 0xdbff) n += 1; // never split an emoji
  return n;
}
