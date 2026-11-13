/**
 * Chat guide exact-answer engine: every answer must come from the live data (here the built-in
 * sample store), so expected prices, dates and seat counts are computed from the fixture itself.
 */
import { describe, expect, it } from "vitest";
import type { LiveWeather } from "@/components/living/weather";
import { answerQuestion } from "@/lib/assistant/engine";
import { buildKnowledgeFromData, knowledgeAsText, type KnowledgeBase } from "@/lib/assistant/knowledge";
import { DEFAULT_ASSISTANT_SETTINGS, displayPhone } from "@/lib/assistant/settings";
import { cleanFact, fmtRange, isDraftText, normalize } from "@/lib/assistant/text";
import { GUIDE_EMOTIONS, type ChatTurn, type EngineAnswer } from "@/lib/assistant/types";
import { formatINR } from "@/lib/currency";
import { getDemoState, getDemoTripsWithDetails, resetDemoStateForTests } from "@/lib/data/demo-store";
import type { SiteSettings, TripWithDetails } from "@/lib/types";

resetDemoStateForTests();
const NOW = new Date("2026-11-14T06:00:00.000Z"); // Sat 14 Nov 2026, 11:30 IST
const TRIPS = getDemoTripsWithDetails();
const BASE_SETTINGS = getDemoState().settings;
const CARE = "919876543210";
const WHATSAPP = "919812345678";

function settingsWith(care: string, whatsapp: string): SiteSettings {
  return {
    ...BASE_SETTINGS,
    socialLinks: { ...BASE_SETTINGS.socialLinks, whatsappNumber: whatsapp },
    assistant: { ...DEFAULT_ASSISTANT_SETTINGS, customerCareNumber: care },
  } as SiteSettings;
}

const kb = buildKnowledgeFromData({ trips: TRIPS, settings: settingsWith(CARE, WHATSAPP), now: NOW, payment: { method: "upi", onlineReady: true } });
const kbNoCare = buildKnowledgeFromData({ trips: TRIPS, settings: settingsWith("", ""), now: NOW, payment: { method: "upi", onlineReady: true } });

function ask(q: string, opts: { history?: ChatTurn[]; page?: string; base?: KnowledgeBase } = {}): EngineAnswer {
  return answerQuestion(q, opts.base ?? kb, { history: opts.history, pageTripSlug: opts.page ?? null });
}

/** Ask a conversation; returns every answer. */
function chat(questions: string[], base: KnowledgeBase = kb): EngineAnswer[] {
  const history: ChatTurn[] = [];
  return questions.map((q) => {
    history.push({ role: "user", text: q });
    const a = answerQuestion(q, base, { history: [...history] });
    history.push({ role: "guide", text: a.text });
    return a;
  });
}

const trip = (slug: string): TripWithDetails => {
  const t = TRIPS.find((x) => x.trip.slug === slug);
  if (!t) throw new Error(`fixture trip ${slug} missing`);
  return t;
};
const COORG = trip("coorg-rainforest-slow-drive");
const CKM = trip("chikmagalur-coffee-trails");
const GOK = trip("gokarna-coastal-headlands");
const HAMPI = trip("hampi-boulders-and-ruins");
const today = "2026-11-14";
const upcoming = (t: TripWithDetails) => t.departures.filter((d) => d.status !== "cancelled" && d.status !== "completed" && d.endDate >= today);
const rangeOf = (d: { startDate: string; endDate: string }) => fmtRange(d.startDate, d.endDate);
const depBy = (t: TripWithDetails, start: string) => {
  const d = t.departures.find((x) => x.startDate === start);
  if (!d) throw new Error(`fixture departure ${start} missing`);
  return d;
};

/** Every rupee amount the guide may legitimately say for the fixture. */
function allowedAmounts(trips: TripWithDetails[]): Set<string> {
  const out = new Set<string>();
  for (const { trip: t, departures } of trips) {
    const units = new Set([t.basePricePaise, ...departures.map((d) => d.priceOverridePaise ?? t.basePricePaise)]);
    for (const u of units) {
      for (let n = 1; n <= 6; n++) out.add(formatINR(u * n));
      if (t.privateGroupPricePaise !== null) out.add(formatINR(t.privateGroupPricePaise));
      out.add(formatINR(Math.round(u * 6 * (1 - t.privateDiscountPercent / 100))));
    }
  }
  return out;
}

describe("assistant knowledge base", () => {
  it("keeps only upcoming departures, sorted, with live seats and whole-car rule", () => {
    const coorg = kb.trips.find((t) => t.slug === COORG.trip.slug)!;
    expect(coorg.departures.map((d) => d.startDate)).toEqual(upcoming(COORG).map((d) => d.startDate).sort());
    for (const d of coorg.departures) {
      const src = COORG.departures.find((x) => x.departureId === d.departureId)!;
      expect(d.seatsRemaining).toBe(src.seatsRemaining);
      expect(d.privateCarPossible).toBe(src.seatsTaken === 0 && src.maxCapacity === 6);
      expect(d.bookUrl).toBe(`/trips/${COORG.trip.slug}?date=${src.departureId}#book`);
    }
    expect(kb.today).toBe(today);
    expect(kb.contact.careDisplay).toBe(displayPhone(CARE));
    expect(kb.contact.whatsappUrl).toBe(`https://wa.me/${WHATSAPP}`);
    expect(kbNoCare.contact.careNumber).toBe("");
    expect(kbNoCare.contact.careTel).toBeNull();
    expect(kbNoCare.contact.whatsappUrl).toBeNull();
    // Owner placeholders are not facts.
    expect(kb.contact.supportEmail).toBeNull();
    expect(kb.policy.taxNote).toBe("");
  });

  it("drops departures that have already ended", () => {
    const later = buildKnowledgeFromData({ trips: TRIPS, settings: settingsWith(CARE, WHATSAPP), now: new Date("2026-12-05T06:00:00Z") });
    const coorg = later.trips.find((t) => t.slug === COORG.trip.slug)!;
    expect(coorg.departures.some((d) => d.startDate === "2026-11-27")).toBe(false);
    const ckm = later.trips.find((t) => t.slug === CKM.trip.slug)!;
    const dec04 = ckm.departures.find((d) => d.startDate === "2026-12-04");
    expect(dec04?.started).toBe(true);
    expect(dec04?.bookingOpen).toBe(false);
    const a = answerQuestion("chikmagalur dates", later);
    expect(a.text).not.toContain(rangeOf(depBy(CKM, "2026-12-04")));
    expect(a.text).toContain(rangeOf(depBy(CKM, "2026-12-18")));
  });

  it("knowledgeAsText carries every live fact, and no phone number when none is set", () => {
    const text = knowledgeAsText(kb);
    for (const t of TRIPS) {
      expect(text).toContain(t.trip.title);
      expect(text).toContain(formatINR(t.trip.basePricePaise));
      for (const d of upcoming(t)) {
        expect(text).toContain(d.departureCode);
        expect(text).toContain(d.seatsRemaining === 0 ? "SOLD OUT" : `${d.seatsRemaining} of ${d.maxCapacity} seats open`);
      }
      for (const p of t.pickupPoints) expect(text).toContain(p.name);
    }
    expect(text).toContain(displayPhone(CARE));
    expect(text).toContain("Sat 14 Nov 2026");
    const noCare = knowledgeAsText(kbNoCare);
    expect(noCare).toContain("not published");
    expect(noCare).not.toMatch(/\+91\s?\d{5}/);
  });
});

describe("assistant engine — small talk", () => {
  it("greets with a wave", () => {
    const a = ask("Hi!");
    expect(a.intent).toBe("greeting");
    expect(a.emotion).toBe("wave");
    expect(a.confidence).toBeGreaterThanOrEqual(0.9);
    expect(a.text).toContain(kb.assistant.guideName);
  });

  it("thanks and bye", () => {
    expect(ask("thank you so much").emotion).toBe("happy");
    expect(ask("bye").emotion).toBe("wave");
  });

  it("explains who it is and offers a person", () => {
    const a = ask("are you a bot?");
    expect(a.intent).toBe("about");
    expect(a.text).toContain("not a person");
    expect(a.actions.some((x) => x.kind === "call")).toBe(true);
  });
});

describe("assistant engine — trips and prices", () => {
  it("lists every published trip with its real price", () => {
    const a = ask("What trips do you have?");
    expect(a.intent).toBe("list_trips");
    for (const t of TRIPS) {
      expect(a.text).toContain(t.trip.title);
      expect(a.text).toContain(formatINR(t.trip.basePricePaise));
    }
    expect(a.cards.filter((c) => c.kind === "trip")).toHaveLength(TRIPS.length);
    expect(a.emotion).toBe("pointing");
  });

  it("gives the Coorg seat price and whole-car price", () => {
    const a = ask("What does the Coorg trip cost?");
    expect(a.intent).toBe("price");
    expect(a.confidence).toBeGreaterThanOrEqual(0.8);
    expect(a.text).toContain(formatINR(COORG.trip.basePricePaise));
    expect(a.text).toContain(formatINR(COORG.trip.privateGroupPricePaise!));
    expect(a.tripSlugs).toEqual([COORG.trip.slug]);
    expect(a.cards[0]).toMatchObject({ kind: "trip", slug: COORG.trip.slug, pricePaise: COORG.trip.basePricePaise });
  });

  it("multiplies the seat price for a group of 4", () => {
    const a = ask("price for 4 people for hampi");
    expect(a.text).toContain(`4 × ${formatINR(HAMPI.trip.basePricePaise)} = **${formatINR(HAMPI.trip.basePricePaise * 4)}**`);
    expect(a.emotion).toBe("happy");
  });

  it("uses the fixed whole-car price for 6 people and says so", () => {
    const a = ask("for 6 people chikmagalur how much");
    expect(a.text).toContain(formatINR(CKM.trip.privateGroupPricePaise!));
    expect(a.text).toContain("fixed whole-car price");
    expect(a.text).toContain(formatINR(CKM.trip.basePricePaise * 6));
  });

  it("uses 6 × price minus the discount when there is no fixed whole-car price", () => {
    const noFixed = TRIPS.map((t) => (t.trip.slug === HAMPI.trip.slug ? { ...t, trip: { ...t.trip, privateGroupPricePaise: null } } : t));
    const base = buildKnowledgeFromData({ trips: noFixed, settings: settingsWith(CARE, WHATSAPP), now: NOW });
    const a = answerQuestion("whole car price for 6 people hampi", base);
    const expected = Math.round(HAMPI.trip.basePricePaise * 6 * (1 - HAMPI.trip.privateDiscountPercent / 100));
    expect(a.text).toContain(formatINR(expected));
    expect(a.text).toContain(`minus ${HAMPI.trip.privateDiscountPercent}%`);
  });

  it("shows a date's own price when the owner set one", () => {
    const dec18 = depBy(CKM, "2026-12-18");
    const special = TRIPS.map((t) =>
      t.trip.slug === CKM.trip.slug
        ? { ...t, departures: t.departures.map((d) => (d.departureId === dec18.departureId ? { ...d, priceOverridePaise: 999900 } : d)) }
        : t
    );
    const base = buildKnowledgeFromData({ trips: special, settings: settingsWith(CARE, WHATSAPP), now: NOW });
    expect(answerQuestion("chikmagalur price", base).text).toContain("priced differently");
    const onDate = answerQuestion("chikmagalur price on 18 dec", base);
    expect(onDate.text).toContain(formatINR(999900));
  });

  it("finds the cheapest trip from the data", () => {
    const cheapest = [...TRIPS].sort((a, b) => a.trip.basePricePaise - b.trip.basePricePaise)[0];
    const a = ask("which is the cheapest trip?");
    expect(a.text).toContain(cheapest.trip.title);
    expect(a.text).toContain(formatINR(cheapest.trip.basePricePaise));
  });

  it("understands typos and romanised Kannada / Hindi", () => {
    expect(ask("coorg rate eshtu").tripSlugs).toEqual([COORG.trip.slug]);
    expect(ask("coorg rate eshtu").intent).toBe("price");
    expect(ask("gokarna kitna hai").text).toContain(formatINR(GOK.trip.basePricePaise));
    expect(ask("hmapi price").text).toContain(formatINR(HAMPI.trip.basePricePaise));
    expect(ask("ಕೊಡಗು ಬೆಲೆ").text).toContain(formatINR(COORG.trip.basePricePaise));
    const seats = ask("chikmaglur seats left");
    expect(seats.tripSlugs).toEqual([CKM.trip.slug]);
    expect(seats.text).toContain(`${depBy(CKM, "2026-12-04").seatsRemaining} of 6 seats open`);
    expect(ask("hampi yavaga").intent).toBe("dates");
  });
});

describe("assistant engine — dates and seats", () => {
  it("lists upcoming departures with live seats", () => {
    const a = ask("Which trips are coming up?");
    expect(a.intent).toBe("dates");
    const all = TRIPS.flatMap((t) => upcoming(t));
    expect(a.cards.filter((c) => c.kind === "departure").length).toBe(Math.min(6, all.length));
    for (const d of all.slice(0, 6)) expect(a.text).toContain(`**${rangeOf(d)}**`);
    expect(a.emotion).toBe("happy");
  });

  it("filters by trip and month", () => {
    const a = ask("cooorg dates in december");
    const dec = upcoming(COORG).filter((d) => d.startDate.startsWith("2026-12"));
    const nov = upcoming(COORG).filter((d) => d.startDate.startsWith("2026-11"));
    for (const d of dec) expect(a.text).toContain(rangeOf(d));
    for (const d of nov) expect(a.text).not.toContain(rangeOf(d));
  });

  it("says plainly when a month has no dates and offers the nearest", () => {
    const a = ask("hampi in december");
    expect(a.emotion).toBe("sorry");
    expect(a.text).toContain("No **Hampi Boulders & Sunrise Ruins** dates in December");
    expect(a.text).toContain(rangeOf(upcoming(HAMPI)[0]));
  });

  it("understands next month and this weekend", () => {
    const next = ask("trips next month");
    const dec = TRIPS.flatMap((t) => upcoming(t)).filter((d) => d.startDate.startsWith("2026-12"));
    expect(next.cards).toHaveLength(dec.length);
    const weekend = ask("anything this weekend?");
    expect(weekend.emotion).toBe("sorry");
    expect(weekend.text).toContain("this weekend");
  });

  it("gives exact seats for a specific date", () => {
    const dec25 = depBy(GOK, "2026-12-25");
    const a = ask("gokarna on 25 dec");
    expect(a.text).toContain(`**${dec25.seatsRemaining} of ${dec25.maxCapacity} seats**`);
    expect(a.actions[0]).toMatchObject({ kind: "link", href: `/trips/${GOK.trip.slug}?date=${dec25.departureId}#book` });
  });

  it("reads a departure code", () => {
    const dec04 = depBy(CKM, "2026-12-04");
    const a = ask(`${dec04.departureCode} seats?`);
    expect(a.text).toContain(`**${dec04.seatsRemaining} of ${dec04.maxCapacity} seats**`);
  });

  it("says sold out with the waitlist and the next open date", () => {
    const nov27 = depBy(COORG, "2026-11-27");
    expect(nov27.seatsRemaining).toBe(0);
    const a = ask("is coorg full on 27 nov?");
    expect(a.text).toContain("sold out");
    expect(a.text).toContain("waitlist");
    expect(a.emotion).toBe("sorry");
    const nextOpen = upcoming(COORG).find((d) => d.seatsRemaining > 0)!;
    expect(a.text).toContain(rangeOf(nextOpen));
  });

  it("lists women-only batches only", () => {
    const a = ask("any women only batches?");
    const women = TRIPS.flatMap((t) => upcoming(t)).filter((d) => d.departureType === "women_only");
    expect(a.cards).toHaveLength(women.length);
    for (const c of a.cards) expect(c.kind === "departure" && c.womenOnly).toBe(true);
    const jan = ask("women only batch in january");
    expect(jan.emotion).toBe("sorry");
    expect(jan.text).toContain("no women-only dates");
  });

  it("offers the whole car only on dates where every seat is free", () => {
    const a = ask("Can I book the whole car?");
    const free = TRIPS.flatMap((t) => upcoming(t)).filter((d) => d.seatsTaken === 0);
    const taken = TRIPS.flatMap((t) => upcoming(t)).filter((d) => d.seatsTaken > 0);
    const ids = a.cards.map((c) => (c.kind === "departure" ? c.departureId : ""));
    for (const d of free) expect(ids).toContain(d.departureId);
    for (const d of taken) expect(ids).not.toContain(d.departureId);
    const gok = ask("whole car for gokarna");
    expect(gok.emotion).toBe("sorry");
    expect(gok.actions.some((x) => x.kind === "link" && x.href === "/#plan")).toBe(true);
  });

  it("sends groups bigger than one car to the enquiry form", () => {
    const a = ask("we are 10 friends, can we come to hampi?");
    expect(a.intent).toBe("big_group");
    expect(a.text).toContain("10 people");
    expect(a.actions.some((x) => x.kind === "link" && x.href === "/#plan")).toBe(true);
  });
});

describe("assistant engine — trip details", () => {
  it("lists pickup points with times for a trip", () => {
    const a = ask("Where are the pickup points for Hampi?");
    expect(a.intent).toBe("pickup");
    expect(a.emotion).toBe("pointing");
    expect(a.cards.filter((c) => c.kind === "pickup")).toHaveLength(HAMPI.pickupPoints.length);
    for (const p of HAMPI.pickupPoints) {
      expect(a.text).toContain(p.name);
      expect(a.text).toContain(p.pickupTimeLabel);
    }
  });

  it("lists every pickup hub when no trip is named", () => {
    const a = ask("Where are the pickup points?");
    for (const t of TRIPS) for (const p of t.pickupPoints) expect(a.text).toContain(p.name);
  });

  it("gives the itinerary and a single day", () => {
    const it1 = ask("gokarna itinerary");
    for (const d of GOK.itinerary) expect(it1.text).toContain(d.title);
    const d2 = HAMPI.itinerary.find((d) => d.dayNumber === 2)!;
    const day2 = ask("day 2 of hampi");
    expect(day2.text).toContain(d2.title);
    expect(day2.text).toContain(d2.driveTimeEstimate);
  });

  it("asks which trip when none is known", () => {
    const a = ask("itinerary");
    expect(a.intent).toBe("ask_trip");
    expect(a.cards).toHaveLength(TRIPS.length);
  });

  it("lists inclusions and exclusions", () => {
    const a = ask("what's included in coorg?");
    for (const x of COORG.trip.inclusions) expect(a.text).toContain(x);
    for (const x of COORG.trip.exclusions) expect(a.text).toContain(x);
  });

  it("answers difficulty and does not invent an age rule", () => {
    const a = ask("are kids allowed on the hampi trip?");
    expect(a.text).toContain(HAMPI.trip.difficulty);
    expect(a.text).toContain("don't have an age rule");
    expect(a.text).toContain(displayPhone(CARE));
  });

  it("gives live weather only when the reading is live", () => {
    const w: LiveWeather = {
      live: true,
      place: "Hampi",
      condition: "clear",
      label: "clear",
      tempC: 31,
      windKmh: 12,
      windFromDeg: 90,
      windFrom: "E",
      isDay: true,
      humidity: 40,
      cloudCover: 5,
      precipMm: 0,
    };
    const base = buildKnowledgeFromData({ trips: TRIPS, settings: settingsWith(CARE, WHATSAPP), now: NOW, weather: { [HAMPI.trip.slug]: w, [GOK.trip.slug]: { ...w, live: false } } });
    expect(answerQuestion("weather in hampi", base).text).toContain("31°C");
    const gok = answerQuestion("weather in gokarna", base);
    expect(gok.text).toContain("isn't available");
    expect(gok.text).not.toContain("°C");
  });
});

describe("assistant engine — policies and booking", () => {
  it("shows every cancellation slab and the My Booking link", () => {
    const a = ask("What is the cancellation policy?");
    expect(a.intent).toBe("cancellation");
    for (const s of BASE_SETTINGS.bookingPolicy.cancellationSlabs) expect(a.text).toContain(s.label.replace(/^Draft:\s*/, ""));
    // Placeholder refund notes are not shown as facts.
    expect(a.text).not.toContain("[Owner");
    expect(a.actions.some((x) => x.kind === "link" && x.href === "/booking-lookup")).toBe(true);
  });

  it("explains payment from the policy", () => {
    const a = ask("how do I pay?");
    expect(a.intent).toBe("payment");
    expect(a.text).toContain(`${BASE_SETTINGS.bookingPolicy.holdMinutes} minutes`);
    expect(a.text).toContain("UPI");
    expect(a.text).toContain("no deposit option");
  });

  it("says so when online payment is switched off", () => {
    const off = buildKnowledgeFromData({ trips: TRIPS, settings: settingsWith(CARE, WHATSAPP), now: NOW, payment: { method: "upi", onlineReady: false } });
    const a = answerQuestion("how do I book coorg?", off);
    expect(a.text).toContain("isn't switched on");
    expect(a.emotion).toBe("sorry");
  });

  it("gives booking steps with a deep link to the asked date", () => {
    const dec11 = depBy(COORG, "2026-12-11");
    const a = ask("book coorg for 2 on 11 dec");
    expect(a.intent).toBe("how_to_book");
    expect(a.actions[0]).toMatchObject({ kind: "link", href: `/trips/${COORG.trip.slug}?date=${dec11.departureId}#book` });
    expect(a.emotion).toBe("happy");
  });

  it("points to My Booking for an existing booking", () => {
    const a = ask("check my booking status");
    expect(a.intent).toBe("my_booking");
    expect(a.actions[0]).toMatchObject({ kind: "link", href: "/booking-lookup" });
    expect(ask("my payment is not confirmed yet").intent).toBe("my_booking");
  });

  it("answers tax questions from the policy, not the inclusions list", () => {
    const a = ask("is gst included?");
    expect(a.intent).toBe("payment");
    expect(a.text).toContain(BASE_SETTINGS.bookingPolicy.taxRatePercent > 0 ? `${BASE_SETTINGS.bookingPolicy.taxRatePercent}% tax` : "No tax is added");
  });

  it("gives the trip length from the data", () => {
    const a = ask("how many days is the hampi trip?");
    expect(a.text).toContain(`${HAMPI.trip.durationDays}D / ${HAMPI.trip.durationNights}N`);
    expect(a.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("never reveals coupon codes", () => {
    const a = ask("give me a coupon code");
    expect(a.intent).toBe("coupons");
    expect(a.text).toContain("checkout");
    expect(a.actions.some((x) => x.kind === "link" && x.href === "/creators")).toBe(true);
  });

  it("shows live offers only when there are some", () => {
    expect(ask("any offers?").text).toContain("no special offers");
    const base = buildKnowledgeFromData({
      trips: TRIPS,
      settings: settingsWith(CARE, WHATSAPP),
      now: NOW,
      offers: [{ title: "Monsoon offer", message: "₹1,000 off Coorg", ctaLabel: "See Coorg", ctaUrl: "/trips/coorg-rainforest-slow-drive" }],
    });
    const a = answerQuestion("any offers?", base);
    expect(a.text).toContain("Monsoon offer");
    expect(a.actions[0]).toMatchObject({ kind: "link", href: "/trips/coorg-rainforest-slow-drive" });
  });

  it("answers from the owner's FAQ", () => {
    const faq = BASE_SETTINGS.faqs.find((f) => f.id === "faq-six-cap")!;
    const a = ask("Why are departures capped at six travelers?");
    expect(a.intent).toBe("faq");
    expect(a.text).toBe(faq.answer);
  });
});

describe("assistant engine — customer care", () => {
  it("shows the care number, call and WhatsApp actions when set", () => {
    const a = ask("customer care number please");
    expect(a.intent).toBe("contact");
    expect(a.text).toContain(displayPhone(CARE));
    expect(a.actions).toContainEqual(expect.objectContaining({ kind: "call", tel: `tel:+${CARE}` }));
    expect(a.actions).toContainEqual(expect.objectContaining({ kind: "whatsapp", href: `https://wa.me/${WHATSAPP}` }));
  });

  it("hides any number when the owner has not set one", () => {
    const a = ask("customer care number please", { base: kbNoCare });
    expect(a.text).not.toMatch(/\+91|\d{10}/);
    expect(a.actions.some((x) => x.kind === "call" || x.kind === "whatsapp")).toBe(false);
    expect(a.text).toContain("enquiry form");
  });

  it("unknown questions get low confidence, an apology and the care number", () => {
    const a = ask("can I bring my dog?");
    expect(a.confidence).toBeLessThan(0.3);
    expect(a.emotion).toBe("sorry");
    expect(a.text).toContain(displayPhone(CARE));
    const b = ask("can I bring my dog?", { base: kbNoCare });
    expect(b.confidence).toBeLessThan(0.3);
    expect(b.text).not.toMatch(/\+91|\d{10}/);
  });

  it("does not invent a trip it does not run", () => {
    const a = ask("Do you have a trip to Ooty?");
    expect(a.intent).toBe("not_served");
    expect(a.text).toContain("don't run a trip to **Ooty**");
    for (const t of TRIPS) expect(a.text).toContain(t.trip.title);
    expect(a.cards.every((c) => c.kind === "trip")).toBe(true);
  });

  it("never mistakes Bengaluru (where trips start) for a place we don't go", () => {
    const a = ask("weekend trips from bangalore");
    expect(a.intent).not.toBe("not_served");
    expect(a.text).not.toContain("Mangalore");
    expect(ask("trip to mangalore").intent).toBe("not_served");
  });

  it("knows a place that only appears inside a trip plan", () => {
    const a = ask("do you go to mysore?");
    expect(a.intent).toBe("place_on_route");
    expect(a.tripSlugs).toEqual([COORG.trip.slug]);
  });
});

describe("assistant engine — conversation context", () => {
  it("follows up on the trip from earlier turns", () => {
    const [price, dates, hampi, four] = chat(["how much is coorg", "and the dates?", "what about hampi?", "for 4 people?"]);
    expect(price.tripSlugs).toEqual([COORG.trip.slug]);
    expect(dates.intent).toBe("dates");
    expect(dates.tripSlugs).toEqual([COORG.trip.slug]);
    for (const d of upcoming(COORG)) expect(dates.text).toContain(rangeOf(d));
    expect(hampi.intent).toBe("dates");
    expect(hampi.tripSlugs).toEqual([HAMPI.trip.slug]);
    expect(four.intent).toBe("price");
    expect(four.text).toContain(formatINR(HAMPI.trip.basePricePaise * 4));
  });

  it("uses the trip page the visitor is on", () => {
    const a = ask("how much is it?", { page: GOK.trip.slug });
    expect(a.intent).toBe("price");
    expect(a.text).toContain(formatINR(GOK.trip.basePricePaise));
    const d = ask("when are the dates?", { page: HAMPI.trip.slug });
    expect(d.tripSlugs).toEqual([HAMPI.trip.slug]);
    // "all trips" questions ignore the page.
    expect(ask("which trips are coming up?", { page: HAMPI.trip.slug }).tripSlugs.length).toBeGreaterThan(1);
  });

  it("answers two asks in one question, in the order asked", () => {
    const a = ask("price and pickup for hampi");
    const priceAt = a.text.indexOf(formatINR(HAMPI.trip.basePricePaise));
    const pickupAt = a.text.indexOf(HAMPI.pickupPoints[0].name);
    expect(priceAt).toBeGreaterThanOrEqual(0);
    expect(pickupAt).toBeGreaterThan(priceAt);
  });
});

describe("assistant engine — answer shape and no invented facts", () => {
  const QUESTIONS = [
    "hi",
    "Which trips are coming up?",
    "How many seats are left?",
    "What does the Coorg trip cost?",
    "Where are the pickup points?",
    "Can I book the whole car?",
    "What is the cancellation policy?",
    "price for 3 people for gokarna",
    "for 6 people coorg",
    "price and dates for chikmagalur",
    "tell me about hampi",
    "is breakfast included in chikmagalur",
    "what to pack for coorg",
    "is it safe for solo female travellers",
    "how difficult is gokarna",
    "how do I book?",
    "trip to goa",
    "asdkjh qwe",
  ];

  it("keeps every answer well formed", () => {
    for (const q of QUESTIONS) {
      const a = ask(q);
      expect(GUIDE_EMOTIONS, q).toContain(a.emotion);
      expect(a.text.length, q).toBeGreaterThan(0);
      expect(a.suggestions.length, q).toBeGreaterThanOrEqual(2);
      expect(a.suggestions.length, q).toBeLessThanOrEqual(4);
      expect(a.confidence, q).toBeGreaterThanOrEqual(0);
      expect(a.confidence, q).toBeLessThanOrEqual(1);
      for (const s of a.suggestions) expect(normalize(s), q).not.toBe(normalize(q));
      for (const x of a.actions) {
        if (x.kind === "link") expect(x.href.startsWith("/"), q).toBe(true);
        if (x.kind === "call") expect(x.tel).toBe(`tel:+${CARE}`);
      }
    }
  });

  it("only ever states rupee amounts that come from the data", () => {
    const allowed = allowedAmounts(TRIPS);
    for (const q of QUESTIONS) {
      const amounts = ask(q).text.match(/₹[\d,]+(?:\.\d+)?/g) ?? [];
      for (const m of amounts) expect(allowed.has(m), `${q}: ${m}`).toBe(true);
    }
  });

  it("only ever states departure dates that are on the calendar", () => {
    const real = new Set(TRIPS.flatMap((t) => t.departures.map((d) => rangeOf(d))));
    for (const q of ["How many seats are left?", "Can I book the whole car?", "any women only batches?", "coorg dates", "next month trips", "hampi in december"]) {
      const ranges = ask(q).text.match(/\*\*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}(?: [A-Z][a-z]{2})? – (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2})\*\*/g) ?? [];
      expect(ranges.length, q).toBeGreaterThan(0);
      for (const r of ranges) expect(real.has(r.replace(/\*\*/g, "")), `${q}: ${r}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Regression tests for the answer-accuracy review (14 Nov 2026). Each uses the review's own question.
// ---------------------------------------------------------------------------

const bookHrefs = (a: EngineAnswer) => a.actions.flatMap((x) => (x.kind === "link" && x.href.endsWith("#book") ? [x.href] : []));

describe("review #1 — women-only dates are labelled, and never offered to men", () => {
  const dec11 = depBy(COORG, "2026-12-11");
  const dec11Book = `/trips/${COORG.trip.slug}?date=${dec11.departureId}#book`;

  it("fixture: Coorg 11 Dec is the women-only batch", () => {
    expect(dec11.departureType).toBe("women_only");
  });

  it("two guys asking to join the women-only date are told it is women-only and get no Book button for it", () => {
    const a = ask("We are 2 guys, can we join Coorg on 11 Dec?");
    expect(a.text).toContain("women-only");
    expect(a.text).toContain("only women");
    expect(bookHrefs(a)).not.toContain(dec11Book);
    expect(a.text).not.toMatch(/6 of 6 seats open at/);
  });

  it("labels the women-only date in the price, whole-car, trip and list answers", () => {
    const four = ask("How much is Coorg for 4 people?");
    expect(four.text).toMatch(/Fri 11 Dec \(6 left · women-only\)/);
    const six = ask("We are 6 friends, want coorg");
    expect(six.text).toMatch(/Fri 11 Dec \(women-only\)/);
    const about = ask("Tell me about Coorg");
    expect(about.text).toContain("women-only");
    const list = ask("What trips do you have?");
    const coorgLine = list.text.split("\n").find((l) => l.includes(COORG.trip.title))!;
    expect(coorgLine).toContain("women-only");
  });

  it("trip cards say when their next date is women-only", () => {
    const card = ask("Tell me about Coorg").cards.find((c) => c.kind === "trip");
    expect(card && card.kind === "trip" && card.next?.womenOnly).toBe(true);
    const hampi = ask("Tell me about Hampi").cards.find((c) => c.kind === "trip");
    expect(hampi && hampi.kind === "trip" && hampi.next?.womenOnly).toBe(false);
  });

  it("leaves women-only dates out of date and price lists for men, and says why", () => {
    for (const q of ["we are 2 boys coorg dates", "me and my husband coorg price for 2", "we are 3 couples, coorg price?"]) {
      const a = ask(q);
      expect(bookHrefs(a), q).not.toContain(dec11Book);
      expect(a.cards.some((c) => c.kind === "departure" && c.departureId === dec11.departureId), q).toBe(false);
      expect(a.text, q).toContain("only women travellers can book");
    }
    // A man named earlier in the chat still counts.
    const [, dates] = chat(["we are 2 guys", "coorg dates?"]);
    expect(bookHrefs(dates)).not.toContain(dec11Book);
  });

  it("calling the guide 'sir' or 'bro' is politeness, not a male traveller: women-only dates stay listed", () => {
    for (const q of ["sir, coorg price for 4 people?", "bro coorg dates?"]) {
      const a = ask(q);
      expect(a.text, q).toContain("women-only");
      expect(a.text, q).not.toContain("only women travellers can book");
    }
  });

  it("still lists women-only batches when that is the question", () => {
    const a = ask("any women only batches?");
    expect(a.cards.some((c) => c.kind === "departure" && c.departureId === dec11.departureId)).toBe(true);
  });
});

describe("review #2 — ordinal dates are dates, never head counts", () => {
  it("'any seats for 18th?' is about the 18th, not 18 people", () => {
    const a = ask("any seats for 18th?");
    expect(a.intent).not.toBe("big_group");
    expect(a.text).not.toContain("18 people");
    expect(a.text).toContain("Wed 18 Nov");
  });

  it("'trip for 12th?' and 'is there a trip for 4th?'", () => {
    const twelve = ask("trip for 12th?");
    expect(twelve.text).not.toContain("12 people");
    expect(twelve.text).toContain("Sat 12 Dec");
    const fourth = ask("is there a trip for 4th?");
    expect(fourth.text).not.toContain("4 people");
    expect(fourth.text).toContain(rangeOf(depBy(CKM, "2026-12-04")));
  });

  it("a bare 25th with no trip also offers a trip that starts on a later 25th", () => {
    const a = ask("any trip on 25th?");
    expect(a.text).toContain("Wed 25 Nov");
    expect(a.text).toContain(rangeOf(depBy(GOK, "2026-12-25")));
  });

  it("'18th of december' is 18 Dec", () => {
    expect(ask("18th of december chikmagalur").text).toContain(rangeOf(depBy(CKM, "2026-12-18")));
  });
});

describe("review #3/#4 — families and couples are counted in full", () => {
  it("adds kids to adults", () => {
    const a = ask("price for 2 adults and 1 kid coorg");
    expect(a.text).toContain(`3 × ${formatINR(COORG.trip.basePricePaise)} = **${formatINR(COORG.trip.basePricePaise * 3)}**`);
    expect(a.text).toContain("each child as one seat");
  });

  it("counts couples twice, and a family total over its kids", () => {
    const a = ask("we are 3 couples, coorg price?");
    expect(a.text).toContain("**6 people**");
    expect(a.text).toContain(formatINR(COORG.trip.privateGroupPricePaise!));
    expect(ask("family of 4 with 2 kids gokarna price").text).toContain("**4 people**");
  });

  it("a family price question with kids keeps the price and adds the age note", () => {
    const a = ask("price for 2 adults 2 kids hampi");
    expect(a.intent).toBe("price");
    expect(a.text).toContain(`4 × ${formatINR(HAMPI.trip.basePricePaise)} = **${formatINR(HAMPI.trip.basePricePaise * 4)}**`);
    expect(a.text).toContain("age rule");
  });

  it("'3/4 people' is a head count, not 3 April", () => {
    const a = ask("we are 3/4 people coorg price");
    expect(a.text).not.toContain("Apr");
    expect(a.text).toContain("**4 people**");
  });
});

describe("review #5/#6/#16 — wording that must not mislead", () => {
  it("the safety answer never turns the solo FAQ into a bare 'Yes.'", () => {
    const a = ask("Is it safe for a solo female traveller?");
    expect(a.text.split("\n")).not.toContain("Yes.");
    expect(a.text).toContain("single seat");
  });

  it("meal answers list plural exclusions (lunches, dinners)", () => {
    const gok = ask("dinner gokarna");
    const gokExc = GOK.trip.exclusions.find((x) => /dinners/i.test(x))!;
    expect(gok.text).toContain(`Not included: ${gokExc}`);
    const coorg = ask("lunch included in coorg?");
    const coorgExc = COORG.trip.exclusions.find((x) => /lunches/i.test(x))!;
    expect(coorg.text).toContain(coorgExc);
  });

  it("drops the owner's 'Draft …:' labels and 'Owner to confirm' to-dos", () => {
    const a = ask("is hampi safe");
    expect(a.text).not.toMatch(/draft operational note/i);
    expect(a.text).not.toMatch(/owner to confirm/i);
    expect(cleanFact("Draft operational note: Daytime driving only. Owner to confirm exact vehicle checklist.")).toBe("Daytime driving only.");
    expect(isDraftText("Draft policy: Small homestay.")).toBe(true);
    expect(isDraftText("Rest breaks. Owner to confirm the checklist.")).toBe(true);
  });
});

describe("review #7/#8/#9 — picking the right question", () => {
  it("'which trips in <month>' answers that month's dates", () => {
    const dec = ask("which trips are there in december");
    expect(dec.intent).toBe("dates");
    for (const d of upcoming(HAMPI)) expect(dec.text).not.toContain(rangeOf(d));
    const jan = ask("what trips do you have in january");
    expect(jan.intent).toBe("dates");
    expect(jan.text).toContain(rangeOf(depBy(HAMPI, "2027-01-08")));
    expect(jan.text).not.toContain(rangeOf(depBy(CKM, "2026-12-04")));
    expect(ask("nale yava trip ide").intent).toBe("dates");
    expect(ask("december alli yava trip ide").intent).toBe("dates");
  });

  it("'number of days' is not a customer-care question", () => {
    const a = ask("What is the number of days for the hampi trip?");
    expect(a.intent).not.toBe("contact");
    expect(a.text).toContain(`${HAMPI.trip.durationDays}D / ${HAMPI.trip.durationNights}N`);
    expect(ask("number?").intent).toBe("contact");
  });

  it("never calls an ordinary word a place we don't go to", () => {
    const a = ask("I want a trip to remember with my wife");
    expect(a.text).not.toContain("Remember");
    expect(a.confidence).toBeLessThan(0.6);
    expect(ask("planning a trip to celebrate my birthday").text).not.toContain("Celebrate");
    const guessed = ask("trip to kemmangundi");
    expect(guessed.intent).toBe("not_served");
    expect(guessed.confidence).toBeLessThan(0.6);
  });

  it("weak one-word guesses stay below the confident line", () => {
    expect(ask("can I smoke in the car").confidence).toBeLessThan(0.6);
    expect(ask("Can couples book?").confidence).toBeLessThan(0.6);
  });

  it("'why only 6 people' gets the owner's FAQ, not a price table", () => {
    const faq = BASE_SETTINGS.faqs.find((f) => f.id === "faq-six-cap")!;
    const a = ask("why only 6 people");
    expect(a.intent).toBe("faq");
    expect(a.text).toBe(faq.answer);
  });
});

describe("review #10/#11/#17 — dates and whole-car prices", () => {
  it("explains the whole-car price per date when a date's own price changes the rule", () => {
    const dec11 = depBy(COORG, "2026-12-11");
    const jan15 = {
      ...dec11,
      departureId: "33333333-3333-4333-8333-333333333301",
      departureCode: "SAN-CRG-JAN15",
      startDate: "2027-01-15",
      endDate: "2027-01-17",
      departureType: "open_batch" as const,
      bookingCutoffAt: "2027-01-13T12:30:00.000Z",
      preferenceDeadlineAt: "2027-01-12T12:30:00.000Z",
      priceOverridePaise: 1_000_000,
    };
    const trips = TRIPS.map((t) => (t.trip.slug === COORG.trip.slug ? { ...t, departures: [...t.departures, jan15] } : t));
    const base = buildKnowledgeFromData({ trips, settings: settingsWith(CARE, WHATSAPP), now: NOW });
    const a = answerQuestion("can i book whole car for coorg?", base);
    const janLine = a.text.split("\n").find((l) => l.includes("Fri 15 – Sun 17 Jan"))!;
    const decLine = a.text.split("\n").find((l) => l.includes("Fri 11 – Sun 13 Dec"))!;
    expect(janLine).toContain(`minus ${COORG.trip.privateDiscountPercent}%`);
    expect(decLine).toContain("fixed whole-car price");
    expect(a.text).not.toContain("That's the fixed whole-car price");
  });

  it("a trip that starts today is 'under way', not 'no dates'", () => {
    const at0030 = buildKnowledgeFromData({ trips: TRIPS, settings: settingsWith(CARE, WHATSAPP), now: new Date("2026-11-26T19:00:00.000Z") });
    expect(at0030.today).toBe("2026-11-27");
    const a = answerQuestion("is the coorg trip on 27 nov full?", at0030);
    expect(a.text).toContain("under way");
    expect(a.text).not.toContain("No Kodagu");
  });

  it("a single day means trips starting that day; a trip already running is labelled", () => {
    const a = ask("trip on 5 Dec");
    expect(a.text).toContain("No trip starts on Sat 5 Dec");
    expect(a.text).toContain("already running");
    expect(a.text).not.toMatch(/on \*\*Fri 4 – Sun 6 Dec\*\*: \*\*3 of 6 seats\*\*/);
  });
});

describe("review #12 — follow-ups keep the dates and head count", () => {
  it("'Any trips in December?' → 'for 4 people?' stays in December, per trip", () => {
    const [, four] = chat(["Any trips in December?", "for 4 people?"]);
    expect(four.text).toContain("in December");
    const hampiLine = four.text.split("\n").find((l) => l.includes(HAMPI.trip.title))!;
    expect(hampiLine).toContain("no date in December has 4 seats free");
  });

  it("'and for 3 people?' → 'what about Gokarna?' keeps the 3", () => {
    const [, , gok] = chat(["How much is Hampi?", "and for 3 people?", "what about Gokarna?"]);
    expect(gok.text).toContain(`3 × ${formatINR(GOK.trip.basePricePaise)}`);
  });

  it("multi-trip price lists say when a trip has no date for the group", () => {
    const a = ask("price for 4 people");
    const gokLine = a.text.split("\n").find((l) => l.includes(GOK.trip.title))!;
    expect(gokLine).toContain("no date has 4 seats free");
  });
});

describe("review #13/#15 + UX #8 — facts the guide must know", () => {
  it("knowledgeAsText has the time now and each date's minimum batch", () => {
    const text = knowledgeAsText(kb);
    expect(text).toContain("Now: 11:30 AM IST");
    const dec11 = depBy(COORG, "2026-12-11");
    const line = text.split("\n").find((l) => l.includes(dec11.departureCode))!;
    expect(line).toContain(`runs with at least ${dec11.minOccupancy} travellers booked`);
  });

  it("with online payment off, no Book buttons and a line on how to book", () => {
    const off = buildKnowledgeFromData({ trips: TRIPS, settings: settingsWith(CARE, WHATSAPP), now: NOW, payment: { method: "upi", onlineReady: false } });
    for (const q of ["sold out coorg 27 nov", "How much is Coorg for 4 people?", "Which trips are coming up?"]) {
      const a = answerQuestion(q, off);
      expect(bookHrefs(a), q).toHaveLength(0);
      expect(a.text, q).toContain("isn't switched on");
    }
  });

  it("knows the WhatsApp number the site falls back to when Social links has none", () => {
    const fallback = buildKnowledgeFromData({ trips: TRIPS, settings: settingsWith(CARE, ""), now: NOW, whatsappFallbackNumber: "919800000000" });
    expect(fallback.contact.whatsappUrl).toBe("https://wa.me/919800000000");
    expect(knowledgeAsText(fallback)).toContain("WhatsApp chat: available");
    const own = buildKnowledgeFromData({ trips: TRIPS, settings: settingsWith(CARE, WHATSAPP), now: NOW, whatsappFallbackNumber: "919800000000" });
    expect(own.contact.whatsappUrl).toBe(`https://wa.me/${WHATSAPP}`);
  });
});
