/**
 * Shared contract for the Sanchari chat guide (website chat assistant).
 *
 *   browser (ChatAssistant) --POST /api/assistant--> route --> engine (exact answers from live data)
 *                                                          \-> llm (optional "smart answers", grounded in the same data)
 *
 * The route answers with a stream of newline-delimited JSON (NDJSON): one ChatEvent per line.
 * Everything here is plain data so client and server can both import it.
 */

/** What the guide character is doing / feeling. Drives the avatar's picture, video and motion. */
export const GUIDE_EMOTIONS = ["idle", "wave", "listening", "thinking", "talking", "happy", "sorry", "pointing"] as const;
export type GuideEmotion = (typeof GUIDE_EMOTIONS)[number];

/** One message in the conversation, as sent by the browser (last 10 turns at most). */
export interface ChatTurn {
  role: "user" | "guide";
  text: string;
}

/** Body of POST /api/assistant. */
export interface ChatRequest {
  messages: ChatTurn[];
  /** Where the visitor is, so "this trip" / "these dates" can be understood. */
  page?: { path: string; tripSlug?: string | null };
}

/** Theme keys match the colour + pattern classes in globals.css (theme-coorg, ...). */
export type CardTheme = "coorg" | "chikmagalur" | "gokarna" | "hampi" | "brand";

export type AnswerCard =
  | {
      kind: "trip";
      slug: string;
      title: string;
      destination: string;
      theme: CardTheme;
      imageUrl: string;
      durationLabel: string; // "3D / 2N"
      difficulty: string;
      pricePaise: number; // per seat
      privatePricePaise: number | null; // whole car
      /** Next date offered; `womenOnly` = only women travellers can book it. */
      next: { departureId: string; startDate: string; endDate: string; seatsRemaining: number; maxCapacity: number; womenOnly?: boolean } | null;
    }
  | {
      kind: "departure";
      tripSlug: string;
      tripTitle: string;
      theme: CardTheme;
      departureId: string;
      code: string;
      startDate: string; // YYYY-MM-DD
      endDate: string;
      seatsRemaining: number;
      maxCapacity: number;
      pricePaise: number;
      womenOnly: boolean;
      privateCarPossible: boolean; // all seats still free
    }
  | {
      kind: "pickup";
      tripSlug: string;
      tripTitle: string;
      name: string;
      area: string;
      time: string;
      mapsUrl: string | null;
      confirmed: boolean;
    };

export type AnswerAction =
  | { kind: "link"; label: string; href: string } // same-site path, e.g. /trips/x?date=y#book
  | { kind: "call"; label: string; tel: string } // tel:+91...
  | { kind: "whatsapp"; label: string; href: string }; // https://wa.me/...

/** Streamed events, one JSON object per line. Order: meta, text*, cards?, actions?, suggestions?, done. */
export type ChatEvent =
  | { type: "meta"; source: "guide" | "ai"; emotion: GuideEmotion }
  | { type: "text"; delta: string }
  | { type: "cards"; cards: AnswerCard[] }
  | { type: "actions"; actions: AnswerAction[] }
  | { type: "suggestions"; items: string[] }
  /** `incomplete`: the answer had to stop part-way (AI refused, timed out or lost connection). */
  | { type: "done"; emotion: GuideEmotion; incomplete?: boolean }
  | { type: "error"; message: string };

/** What the exact-answer engine returns for one question. */
export interface EngineAnswer {
  /** Short machine name of what was understood, e.g. "price", "dates", "pickup", "unknown". */
  intent: string;
  /** 0..1. Below ENGINE_CONFIDENT the route may ask the smart (AI) layer instead. */
  confidence: number;
  /** Plain text with light markdown: **bold**, "- " bullet lines, [label](/path) links. */
  text: string;
  cards: AnswerCard[];
  actions: AnswerAction[];
  suggestions: string[];
  emotion: GuideEmotion;
  /** Trips the question was about (slugs), for context in follow-up questions. */
  tripSlugs: string[];
}

export const ENGINE_CONFIDENT = 0.6;

/** Limits shared by browser and server. */
export const CHAT_LIMITS = {
  maxQuestionChars: 500,
  maxTurns: 10,
  /** Per visitor (IP): this many questions per window. */
  rateLimitCount: 20,
  rateLimitWindowMs: 5 * 60_000,
} as const;
