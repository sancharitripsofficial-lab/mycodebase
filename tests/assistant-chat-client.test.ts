import { describe, expect, it } from "vitest";
import {
  LineSplitter,
  buildTurns,
  messagesForSaving,
  nextRevealCount,
  parseEvent,
  restoreMessages,
  tripSlugFromPath,
  type ChatMessageData,
  type GuideMessage,
} from "@/components/assistant/chat-stream";
import { CHAT_LIMITS } from "@/lib/assistant/types";

const guide = (id: string, text: string, extra: Partial<GuideMessage> = {}): GuideMessage => ({
  id,
  role: "guide",
  text,
  cards: [],
  actions: [],
  suggestions: [],
  source: "guide",
  status: "done",
  ...extra,
});

describe("chat guide browser helpers", () => {
  it("finds the trip slug only on a trip page", () => {
    expect(tripSlugFromPath("/trips/coorg-weekend")).toBe("coorg-weekend");
    expect(tripSlugFromPath("/trips/Coorg-Weekend/")).toBe("coorg-weekend");
    expect(tripSlugFromPath("/trips")).toBeNull();
    expect(tripSlugFromPath("/trips/coorg/gallery")).toBeNull();
    expect(tripSlugFromPath("/")).toBeNull();
    expect(tripSlugFromPath(null)).toBeNull();
  });

  it("sends real turns only, newest question last, at most maxTurns", () => {
    const history: ChatMessageData[] = [
      { id: "u1", role: "user", text: "Coorg price?" },
      guide("g1", "₹4,999 per seat."),
      { id: "u2", role: "user", text: "and seats?" },
      guide("g2", "I can't connect right now", { source: "system", status: "error" }),
      guide("g3", "", { status: "done" }),
    ];
    const turns = buildTurns(history, "pickup points?");
    expect(turns).toEqual([
      { role: "user", text: "Coorg price?" },
      { role: "guide", text: "₹4,999 per seat." },
      { role: "user", text: "and seats?" },
      { role: "user", text: "pickup points?" },
    ]);

    const long: ChatMessageData[] = Array.from({ length: 30 }, (_, i) =>
      i % 2 === 0 ? { id: `u${i}`, role: "user", text: `q${i}` } : guide(`g${i}`, `a${i}`),
    );
    const cut = buildTurns(long, "last");
    expect(cut).toHaveLength(CHAT_LIMITS.maxTurns);
    expect(cut[cut.length - 1]).toEqual({ role: "user", text: "last" });
  });

  it("splits NDJSON across chunk boundaries", () => {
    const s = new LineSplitter();
    expect(s.push('{"type":"meta","source":"guide","emotion":"talking"}\n{"type":"te')).toEqual([
      '{"type":"meta","source":"guide","emotion":"talking"}',
    ]);
    expect(s.push('xt","delta":"Hi"}\n\n')).toEqual(['{"type":"text","delta":"Hi"}']);
    expect(s.push('{"type":"done","emotion":"happy"}')).toEqual([]);
    expect(s.flush()).toEqual(['{"type":"done","emotion":"happy"}']);
    expect(s.flush()).toEqual([]);
  });

  it("checks every streamed event", () => {
    expect(parseEvent("not json")).toBeNull();
    expect(parseEvent('{"type":"nope"}')).toBeNull();
    expect(parseEvent('{"type":"text"}')).toBeNull();
    expect(parseEvent('{"type":"text","delta":"Hello"}')).toEqual({ type: "text", delta: "Hello" });
    expect(parseEvent('{"type":"done","emotion":"dancing"}')).toEqual({ type: "done", emotion: "idle" });
    expect(parseEvent('{"type":"meta","source":"ai","emotion":"thinking"}')).toEqual({ type: "meta", source: "ai", emotion: "thinking" });

    const good = {
      kind: "departure",
      tripSlug: "coorg",
      tripTitle: "Coorg",
      theme: "coorg",
      departureId: "d1",
      code: "CRG-01",
      startDate: "2026-11-21",
      endDate: "2026-11-23",
      seatsRemaining: 4,
      maxCapacity: 6,
      pricePaise: 499900,
      womenOnly: false,
      privateCarPossible: false,
    };
    const bad = { ...good, seatsRemaining: "four" };
    const ev = parseEvent(JSON.stringify({ type: "cards", cards: [good, bad, { kind: "other" }] }));
    expect(ev).toEqual({ type: "cards", cards: [good] });

    const actions = parseEvent(
      JSON.stringify({
        type: "actions",
        actions: [
          { kind: "call", label: "Call", tel: "tel:+919876543210" },
          { kind: "link", label: "Book" },
          { kind: "whatsapp", label: "WA", href: "https://wa.me/919876543210" },
        ],
      }),
    );
    expect(actions && actions.type === "actions" ? actions.actions.map((a) => a.kind) : []).toEqual(["call", "whatsapp"]);
  });

  it("keeps finished answers only when saving, and restores safely", () => {
    const list: ChatMessageData[] = [
      { id: "u1", role: "user", text: "Hampi dates?" },
      guide("g1", "Here are the dates."),
      { id: "u2", role: "user", text: "Gokarna?" },
      guide("g2", "Gokarna has", { status: "streaming" }),
    ];
    const saved = messagesForSaving(list);
    expect(saved.map((m) => m.id)).toEqual(["u1", "g1"]);

    const back = restoreMessages(JSON.stringify([...saved, { id: "x", role: "admin", text: "?" }, { role: "user" }]));
    expect(back.map((m) => m.id)).toEqual(["u1", "g1"]);
    expect(restoreMessages("{broken")).toEqual([]);
    expect(restoreMessages(null)).toEqual([]);
    expect(restoreMessages(JSON.stringify([guide("g9", "x", { status: "streaming" })]))[0]).toMatchObject({ status: "done" });
  });

  it("marks unfinished answers and keeps when an answer arrived", () => {
    expect(parseEvent(JSON.stringify({ type: "done", emotion: "sorry", incomplete: true }))).toEqual({ type: "done", emotion: "sorry", incomplete: true });
    expect(parseEvent(JSON.stringify({ type: "done", emotion: "happy", incomplete: "yes" }))).toEqual({ type: "done", emotion: "happy" });

    // An unfinished answer (status error) is shown again after a reload but never sent back as history.
    const at = Date.UTC(2026, 10, 14, 10, 0);
    const back = restoreMessages(JSON.stringify([guide("g1", "Coorg has 3 seats", { at }), guide("g2", "Half an ans", { status: "error" })]));
    expect(back[0]).toMatchObject({ id: "g1", at, status: "done" });
    expect(back[1]).toMatchObject({ id: "g2", status: "error" });
    expect(buildTurns(back, "Next?").map((t) => t.text)).toEqual(["Coorg has 3 seats", "Next?"]);
    expect(restoreMessages(JSON.stringify([{ ...guide("g3", "x"), at: "soon" }]))[0]).not.toHaveProperty("at");
  });

  it("reveals text smoothly and never splits an emoji", () => {
    const text = "a".repeat(1000);
    const first = nextRevealCount(text, 0, false);
    expect(first).toBe(40); // big burst: capped at ~40 a frame
    expect(nextRevealCount("abcdef", 0, false)).toBe(2); // small burst: a couple of letters
    expect(nextRevealCount(text, 0, true)).toBe(1000); // reduced motion: all at once
    expect(nextRevealCount("abc", 3, false)).toBe(3);

    const withEmoji = "ab\u{1F600}cd"; // the emoji is two UTF-16 units at index 2-3
    expect(nextRevealCount(withEmoji, 1, false)).toBe(4);
  });
});
