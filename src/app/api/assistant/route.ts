import { z } from "zod";
import { answerQuestion } from "@/lib/assistant/engine";
import { loadKnowledgeBase, type KnowledgeBase } from "@/lib/assistant/knowledge";
import { smartAnswersAvailable, streamSmartAnswer, type SmartAnswerFailure } from "@/lib/assistant/llm";
import { displayPhone } from "@/lib/assistant/settings";
import {
  CHAT_LIMITS,
  ENGINE_CONFIDENT,
  type AnswerAction,
  type ChatEvent,
  type ChatTurn,
  type EngineAnswer,
} from "@/lib/assistant/types";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/assistant — the website chat guide.
 *
 * Body: ChatRequest. Answer: a stream of NDJSON ChatEvent lines
 * (meta, text*, cards?, actions?, suggestions?, done). Errors before the stream starts are JSON
 * `{ error: string }` with status 400 / 404 / 429 / 503.
 *
 * Exact answers come from the engine (live trips, seats, prices, policies). Only when the engine
 * is unsure, and the owner allows it, and the server has ANTHROPIC_API_KEY, does Claude answer —
 * grounded in the same live facts. Nothing the visitor types is logged.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_CHARS = 64_000;
/** Earlier guide answers are context only; long ones are cut so a forged history cannot bloat the prompt. */
const MAX_HISTORY_GUIDE_CHARS = 2_000;
const MAX_ACTIONS = 4;
const WORDS_PER_DELTA = 4;
/** The AI must finish within this, or the visitor gets the exact answer / a polite hand-over. */
const AI_DEADLINE_MS = 22_000;
/** Spend ceiling: AI answers per visitor (IP) per hour; after that the exact-answer guide replies alone. */
const AI_PER_IP_PER_HOUR = 12;
/** Spend ceiling per server instance per day (IST); override with ASSISTANT_AI_DAILY_CAP. */
const AI_DAILY_CAP_DEFAULT = 300;

const aiDay = { day: "", count: 0 };
function istDay(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}
function aiDailyCap(): number {
  const n = Number.parseInt(process.env.ASSISTANT_AI_DAILY_CAP ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : AI_DAILY_CAP_DEFAULT;
}
/** True (and counted) when this visitor and this server may spend one more AI answer. */
function takeAiBudget(ip: string): boolean {
  const today = istDay();
  if (aiDay.day !== today) {
    aiDay.day = today;
    aiDay.count = 0;
  }
  if (aiDay.count >= aiDailyCap()) return false;
  if (!checkRateLimit(`assistant-ai:${ip}`, AI_PER_IP_PER_HOUR, 60 * 60_000).allowed) return false;
  aiDay.count += 1;
  return true;
}

const turnSchema = z.object({
  role: z.enum(["user", "guide"]),
  text: z.string(),
});

const bodySchema = z.object({
  messages: z.array(turnSchema).min(1).max(60),
  page: z
    .object({
      path: z.string().max(500).optional(),
      tripSlug: z.string().max(200).nullable().optional(),
    })
    .nullable()
    .optional(),
});

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

/** Drops invisible control characters (keeps tab and new lines). */
function stripControlChars(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) continue;
    out += ch;
  }
  return out;
}

function jsonError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip")?.trim() || "local";
}

/** Splits text into deltas of a few words; joining them gives back the exact text. */
function chunkWords(text: string, size = WORDS_PER_DELTA): string[] {
  const tokens = text.match(/\S+\s*/g);
  if (!tokens) return text ? [text] : [];
  const lead = text.match(/^\s+/)?.[0] ?? "";
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += size) out.push(tokens.slice(i, i + size).join(""));
  if (lead) out[0] = lead + out[0];
  return out;
}

function contactActions(kb: KnowledgeBase): AnswerAction[] {
  const out: AnswerAction[] = [];
  const care = kb.contact.careNumber;
  if (care) out.push({ kind: "call", label: `Call ${displayPhone(care)}`, tel: `tel:+${care}` });
  if (kb.contact.whatsappUrl) out.push({ kind: "whatsapp", label: "WhatsApp us", href: kb.contact.whatsappUrl });
  return out;
}

const actionKey = (a: AnswerAction) => `${a.kind}:${a.kind === "call" ? a.tel : a.href}`;

/** `first` actions (up to the room left), then every `always` action; no duplicates. */
function mergeActions(first: AnswerAction[], always: AnswerAction[]): AnswerAction[] {
  const alwaysKeys = new Set(always.map(actionKey));
  const seen = new Set<string>();
  const out: AnswerAction[] = [];
  const room = Math.max(0, MAX_ACTIONS - always.length);
  for (const a of first) {
    const key = actionKey(a);
    if (out.length >= room || seen.has(key) || alwaysKeys.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  for (const a of always) {
    const key = actionKey(a);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

function contactTail(kb: KnowledgeBase): string {
  const care = kb.contact.careNumber;
  if (care) return `please call customer care on ${displayPhone(care)}.`;
  if (kb.contact.whatsappUrl) return "please message us on WhatsApp.";
  return "please try again in a moment.";
}

function interruptedLine(kb: KnowledgeBase, reason: SmartAnswerFailure | "failed"): string {
  if (reason === "refused") return `\n\nSorry, I can't help with that one here — ${contactTail(kb)}`;
  return `\n\nSorry, I lost my connection — ${contactTail(kb)}`;
}

/** Used only if the engine itself throws: an honest "I don't know" that hands over to people. */
function emergencyAnswer(kb: KnowledgeBase): EngineAnswer {
  return {
    intent: "unknown",
    confidence: 0,
    text: `Sorry, I couldn't look that up just now — ${contactTail(kb)}`,
    cards: [],
    actions: [],
    suggestions: [],
    emotion: "sorry",
    tripSlugs: [],
  };
}

function failureReason(err: unknown): SmartAnswerFailure {
  if (typeof err === "object" && err !== null && "reason" in err) {
    const reason = (err as { reason: unknown }).reason;
    if (typeof reason === "string") return reason as SmartAnswerFailure;
  }
  return "failed";
}

export async function POST(request: Request): Promise<Response> {
  // 1. Rate limit per visitor (IP) before doing any work.
  const ip = clientIp(request);
  const limit = checkRateLimit(`assistant:${ip}`, CHAT_LIMITS.rateLimitCount, CHAT_LIMITS.rateLimitWindowMs);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    return jsonError(
      429,
      `You're asking faster than I can walk! Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      { "retry-after": String(limit.retryAfterSeconds) },
    );
  }

  // 2. Validate the body.
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return jsonError(400, "Could not read your message. Please try again.");
  }
  if (raw.length > MAX_BODY_CHARS) return jsonError(400, "That message is too long. Please send a shorter question.");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return jsonError(400, "Could not read your message. Please try again.");
  }
  const parsed = bodySchema.safeParse(data);
  if (!parsed.success) return jsonError(400, "Could not read your message. Please try again.");

  const all = parsed.data.messages.map((t) => ({ role: t.role, text: stripControlChars(t.text).trim() }));
  const last = all[all.length - 1];
  if (last.role !== "user" || !last.text) return jsonError(400, "Please type a question.");
  if (last.text.length > CHAT_LIMITS.maxQuestionChars) {
    return jsonError(400, `Please keep your question under ${CHAT_LIMITS.maxQuestionChars} characters.`);
  }
  const question = last.text;
  const history: ChatTurn[] = all
    .slice(-CHAT_LIMITS.maxTurns, -1)
    .filter((t) => t.text.length > 0)
    .map((t) => ({
      role: t.role,
      text: t.text.slice(0, t.role === "user" ? CHAT_LIMITS.maxQuestionChars : MAX_HISTORY_GUIDE_CHARS),
    }));
  const slug = parsed.data.page?.tripSlug;
  const pageTripSlug = slug && SLUG_RE.test(slug) ? slug : null;

  // 3. Live site data.
  let kb: KnowledgeBase;
  try {
    kb = await loadKnowledgeBase();
  } catch {
    console.error("[assistant] could not load the knowledge base");
    return jsonError(503, "The guide is taking a short break. Please try again in a minute.");
  }
  if (!kb.assistant.enabled) return jsonError(404, "Not found");

  // 4. Exact answer first.
  let engine: EngineAnswer;
  try {
    engine = answerQuestion(question, kb, { history, pageTripSlug });
  } catch {
    console.error("[assistant] engine failed");
    engine = emergencyAnswer(kb);
  }
  const contact = contactActions(kb);
  const confident = engine.confidence >= ENGINE_CONFIDENT;
  // Real-time AI for every question when it is switched on and the server has a key. A confident
  // exact answer is handed to the AI as the checked facts it must keep, so the reply is natural
  // and still exactly right; without the AI the exact answer is sent as it is.
  // The spend ceiling is counted only when the AI would really be called.
  const useSmart = kb.assistant.smartAnswers && smartAnswersAvailable() && !request.signal?.aborted && takeAiBudget(ip);

  // 5. Stream the answer as NDJSON.
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const onClientGone = () => abort.abort();
  request.signal?.addEventListener("abort", onClientGone, { once: true });
  if (request.signal?.aborted) abort.abort(); // gone before we started: never call the AI

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: ChatEvent) => {
        if (closed || abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        request.signal?.removeEventListener("abort", onClientGone);
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const sendEngine = () => {
        send({ type: "meta", source: "guide", emotion: engine.emotion === "wave" ? "wave" : "talking" });
        for (const delta of chunkWords(engine.text)) send({ type: "text", delta });
        if (engine.cards.length) send({ type: "cards", cards: engine.cards });
        // An unsure answer always hands over to people (call / WhatsApp) as well.
        const actions = confident ? engine.actions : mergeActions(engine.actions, contact);
        if (actions.length) send({ type: "actions", actions });
        if (engine.suggestions.length) send({ type: "suggestions", items: engine.suggestions });
        send({ type: "done", emotion: engine.emotion });
      };
      /** A half answer that had to stop: say so, hand over to people, and mark it unfinished. */
      const sendInterrupted = (reason: SmartAnswerFailure | "failed") => {
        send({ type: "text", delta: interruptedLine(kb, reason) });
        if (contact.length) send({ type: "actions", actions: contact });
        send({ type: "done", emotion: "sorry", incomplete: true });
      };

      const run = async () => {
        if (!useSmart) {
          sendEngine();
          return;
        }
        let sentText = false;
        // The visitor leaving stops the AI at once; so does the overall deadline.
        const aiSignal = AbortSignal.any([abort.signal, AbortSignal.timeout(AI_DEADLINE_MS)]);
        try {
          for await (const delta of streamSmartAnswer({
            question,
            history,
            kb,
            signal: aiSignal,
            pageTripSlug,
            verifiedAnswer: confident ? engine.text : null,
          })) {
            if (abort.signal.aborted) return;
            if (!delta) continue;
            if (!sentText) send({ type: "meta", source: "ai", emotion: "talking" });
            sentText = true;
            send({ type: "text", delta });
          }
        } catch (err) {
          if (abort.signal.aborted) return;
          if (!sentText) {
            sendEngine(); // nothing shown yet: give the exact (if unsure) answer instead
            return;
          }
          sendInterrupted(failureReason(err));
          return;
        }
        if (abort.signal.aborted) return;
        if (!sentText) {
          sendEngine();
          return;
        }
        const recognisedTrips = engine.tripSlugs.length > 0;
        if ((confident || recognisedTrips) && engine.cards.length) send({ type: "cards", cards: engine.cards });
        const actions = confident ? engine.actions : mergeActions(recognisedTrips ? engine.actions : [], contact);
        if (actions.length) send({ type: "actions", actions });
        if (engine.suggestions.length) send({ type: "suggestions", items: engine.suggestions });
        send({ type: "done", emotion: confident ? engine.emotion : "happy" });
      };

      run()
        .catch(() => {
          console.error("[assistant] answer stream failed");
          send({ type: "error", message: `Sorry, something went wrong — ${contactTail(kb)}` });
        })
        .finally(close);
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
