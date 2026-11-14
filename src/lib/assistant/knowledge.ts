/**
 * The chat guide's knowledge base: every fact it may state, built from LIVE site data
 * (published trips, departures with live seats, prices, pickups, itinerary, policies,
 * FAQs, offers, contact, weather). The exact-answer engine and the optional AI layer
 * both read ONLY this, so nothing the visitor is told can drift from the website.
 *
 * buildKnowledgeFromData() is pure (tests use it); loadKnowledgeBase() fetches live data
 * on the server and keeps it for 15 seconds.
 */
import type { LiveWeather } from "@/components/living/weather";
import { calculateBookingPricing, formatINR } from "@/lib/currency";
import { destinationTheme } from "@/lib/destination-theme";
import type { DepartureStatus, DepartureType, SiteSettings, Trip, TripWithDetails } from "@/lib/types";
import { displayPhone, mergeAssistantSettings, type AssistantSettings } from "./settings";
import { cleanFact, fmtDay, fmtInstantIST, fmtRange, isDraftText, IST_TIME_ZONE, istDateISO, normalize, tokenize } from "./text";
import type { CardTheme } from "./types";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface KbDeparture {
  departureId: string;
  code: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  /** Live badge (open / filling_fast / last_seats / sold_out). Cancelled and completed dates are never listed. */
  status: DepartureStatus;
  departureType: DepartureType;
  maxCapacity: number;
  /** Travellers needed for this date to run ("Min batch" on the trip page). */
  minOccupancy: number;
  seatsTaken: number;
  seatsRemaining: number;
  soldOut: boolean;
  womenOnly: boolean;
  /** Price per seat on this date (the date's own price when set, else the trip price). */
  pricePaise: number;
  /** True when this date has its own price, different from the trip price. */
  specialPrice: boolean;
  /** Whole car (all seats, one group) can still be booked: nobody has a seat yet. */
  privateCarPossible: boolean;
  /** Whole-car price on this date, before any tax (same maths as checkout). */
  privateCarPricePaise: number;
  /** Booking still open: cut-off not passed and the trip has not started. */
  bookingOpen: boolean;
  bookingCutoffAt: string;
  /** The trip has already started (end date is today or later). */
  started: boolean;
  /** /trips/<slug>?date=<departureId>#book */
  bookUrl: string;
}

export interface KbDay {
  day: number;
  title: string;
  description: string;
  driveTime: string;
  meals: string;
  bufferNotes: string;
}

export interface KbPickup {
  name: string;
  area: string;
  time: string;
  mapsUrl: string | null;
  confirmed: boolean;
}

export type PrivateCarRule = "fixed" | "discount" | "none";

export interface KbTrip {
  id: string;
  slug: string;
  title: string;
  /** Short place name for chat lines and buttons, e.g. "Coorg", "Hampi". */
  shortName: string;
  destination: string;
  region: string;
  tagline: string;
  summary: string;
  durationDays: number;
  durationNights: number;
  durationLabel: string; // "3D / 2N"
  difficulty: string;
  vibe: string;
  basePricePaise: number;
  privateGroupPricePaise: number | null;
  privateDiscountPercent: number;
  /** Whole-car price at the trip price, before tax. */
  privateCarPricePaise: number;
  /** How the whole-car price is worked out: a fixed price, 6 × seat price minus a %, or plain 6 × seat price. */
  privateCarRule: PrivateCarRule;
  /** Trip's own deposit % (null = use the site rule). */
  tripDepositPercent: number | null;
  /** Deposit % a customer can actually choose at checkout for this trip, null when only full payment. */
  depositPercent: number | null;
  balanceDueDaysBefore: number;
  pickupCity: string;
  imageUrl: string;
  url: string;
  inclusions: string[];
  exclusions: string[];
  accommodationNotes: string;
  packingList: string[];
  safetyNotes: string;
  accessibilityNotes: string;
  isSample: boolean;
  itinerary: KbDay[];
  pickups: KbPickup[];
  /** Upcoming dates only (not cancelled / completed, end date today or later), soonest first. */
  departures: KbDeparture[];
  theme: CardTheme;
  /** Strong names for matching ("coorg", "kodagu", "madikeri", …), normalised. */
  aliases: string[];
  /** Weaker words from the title / web address that belong only to this trip, normalised. */
  keywords: string[];
  /** Everything about the trip as one normalised string (to tell "we pass Mysuru" from "we don't go there"). */
  haystack: string;
  category: string | null;
}

export interface KbPolicy {
  maxGroupSize: number;
  /** Seats one shared booking can take; booking every seat of the car is the whole-car option. */
  maxSeatsPerBooking: number;
  holdMinutes: number;
  depositAllowed: boolean;
  /** Site-wide deposit % at checkout (null when deposits are off). */
  depositPercent: number | null;
  balanceDueDaysBefore: number;
  taxRatePercent: number;
  /** Owner's tax wording, "" when only a placeholder. */
  taxNote: string;
  cancellationSlabs: { label: string; refundNote: string; confirmed: boolean }[];
  preferenceDecisionHoursBefore: number;
  roomPolicy: string;
  vehiclePolicy: string;
  policyVersion: string;
  /** Owner still marks the policy as a draft. */
  draft: boolean;
}

export interface KbOffer {
  title: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  tripSlug: string | null;
}

export interface KbContact {
  /** Customer care number from Admin → Chat guide, digits with country code. "" = not set (never shown). */
  careNumber: string;
  /** "+91 98765 43210", "" when not set. */
  careDisplay: string;
  /** "tel:+919876543210", null when not set. */
  careTel: string | null;
  /** When customer care answers ("" when no number is set). */
  careHours: string;
  /** https://wa.me/<number> from Website text → Social links, null when not set. */
  whatsappUrl: string | null;
  whatsappChannelUrl: string | null;
  supportEmail: string | null;
  supportHours: string | null;
}

export interface KbPayment {
  /** How checkout takes money right now. */
  method: "upi" | "razorpay" | "sandbox" | "unknown";
  /** False when online payment is switched off (seats cannot be held online); null when unknown. */
  onlineReady: boolean | null;
}

export interface KnowledgeBase {
  /** When these facts were read (ISO timestamp). */
  builtAt: string;
  /** Today in India, YYYY-MM-DD. */
  today: string;
  /** Milliseconds of builtAt (for cut-off checks). */
  nowMs: number;
  brandName: string;
  /** True when the site itself is showing built-in sample data. */
  isSampleData: boolean;
  trips: KbTrip[];
  policy: KbPolicy;
  faqs: { id: string; question: string; answer: string }[];
  legal: { draft: boolean; terms: string; privacy: string; refund: string; safety: string };
  contact: KbContact;
  offers: KbOffer[];
  categories: { id: string; name: string; description: string; tripSlugs: string[] }[];
  /** Live weather by trip slug (only places where the live reading worked). */
  weather: Record<string, LiveWeather>;
  payment: KbPayment;
  /** Owner's line about groups bigger than one car (home page "Friends & teams" card), "" when none. */
  groupNote: string;
  assistant: AssistantSettings;
}

// ---------------------------------------------------------------------------
// Matching words
// ---------------------------------------------------------------------------

/** Well-known names for each place we run to; added only to trips whose own name has that place. */
const PLACE_ALIASES: Array<{ match: RegExp; aliases: string[] }> = [
  {
    match: /coorg|kodagu|madikeri/i,
    aliases: ["coorg", "kodagu", "madikeri", "mercara", "kodava", "virajpet", "kushalnagar", "ಕೊಡಗು", "कूर्ग"],
  },
  {
    match: /chikmagalur|chikkamagaluru|chikmaglur/i,
    aliases: [
      "chikmagalur",
      "chikkamagaluru",
      "chikmaglur",
      "chickmagalur",
      "chikamagalur",
      "chikmagaluru",
      "ckm",
      "mullayanagiri",
      "baba budangiri",
      "bababudangiri",
      "ಚಿಕ್ಕಮಗಳೂರು",
      "चिकमगलूर",
    ],
  },
  {
    match: /gokarna/i,
    aliases: ["gokarna", "gokarn", "om beach", "kudle", "kudle beach", "paradise beach", "half moon beach", "uttara kannada", "ಗೋಕರ್ಣ", "गोकर्ण"],
  },
  {
    match: /hampi/i,
    aliases: ["hampi", "hampe", "vijayanagara", "vijayanagar", "virupaksha", "vittala", "vitthala", "anegundi", "hospet", "hosapete", "ಹಂಪಿ", "हम्पी"],
  },
];

/** Words too common to point at one trip. */
const GENERIC_WORDS = new Set([
  "karnataka",
  "bengaluru",
  "bangalore",
  "trip",
  "trips",
  "tour",
  "tours",
  "drive",
  "drives",
  "slow",
  "quiet",
  "road",
  "trail",
  "trails",
  "and",
  "the",
  "with",
  "from",
  "weekend",
  "western",
  "ghats",
  "india",
  "south",
  "north",
  "east",
  "west",
  "days",
  "nights",
  "micro",
  "sanchari",
  "getaway",
  "escape",
  "special",
  "batch",
  "edition",
]);

function distinctiveTokens(text: string, minLen = 4): string[] {
  return tokenize(normalize(text)).filter((t) => t.length >= minLen && !GENERIC_WORDS.has(t) && !/^\d+$/.test(t));
}

function shortNameOf(trip: Trip): string {
  const first = (trip.destination.split(",")[0] ?? trip.destination).trim();
  const inner = first.match(/\(([^)]+)\)/);
  if (inner && inner[1].trim()) return inner[1].trim();
  return first.replace(/\s*\([^)]*\)\s*/g, " ").trim() || trip.title;
}

// ---------------------------------------------------------------------------
// Build (pure)
// ---------------------------------------------------------------------------

export interface KnowledgeInput {
  trips: TripWithDetails[];
  settings: SiteSettings;
  offers?: { title: string; message: string; ctaLabel?: string; ctaUrl?: string; tripId?: string | null }[];
  weather?: Record<string, LiveWeather>;
  payment?: { method: string; onlineReady: boolean | null };
  isSampleData?: boolean;
  now?: Date;
  /**
   * WhatsApp number used when Website text → Social links has none (NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER) —
   * the same fallback the store layout uses for its WhatsApp button, so the guide knows about that button.
   */
  whatsappFallbackNumber?: string | null;
}

const PRIVATE_SEATS = 6;

function privateCarPrice(trip: Trip, unitPricePaise: number, policy: SiteSettings["bookingPolicy"]): number {
  const b = calculateBookingPricing({
    trip: { ...trip, basePricePaise: unitPricePaise },
    priceOverridePaise: null,
    bookingMode: "private_vehicle",
    seatsRequested: PRIVATE_SEATS,
    payDepositOnly: false,
    bookingPolicy: {
      taxRatePercent: 0,
      allowDepositCheckout: policy.allowDepositCheckout,
      depositPercent: policy.depositPercent,
      balanceDueDaysBefore: policy.balanceDueDaysBefore,
    },
  });
  return b.subtotalPaise - b.discountPaise;
}

function privateRuleOf(trip: Trip): PrivateCarRule {
  const full = trip.basePricePaise * PRIVATE_SEATS;
  if (trip.privateGroupPricePaise !== null && trip.privateGroupPricePaise >= 0 && trip.privateGroupPricePaise <= full) return "fixed";
  if (trip.privateDiscountPercent > 0) return "discount";
  return "none";
}

function effectiveDeposit(tripPercent: number | null, policy: SiteSettings["bookingPolicy"]): number | null {
  const p = tripPercent ?? (policy.allowDepositCheckout ? policy.depositPercent : null);
  return p !== null && p >= 10 && p < 100 ? p : null;
}

export function buildKnowledgeFromData(input: KnowledgeInput): KnowledgeBase {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const today = istDateISO(now);
  const settings = input.settings;
  const policyRaw = settings.bookingPolicy;
  const assistant = mergeAssistantSettings((settings as { assistant?: unknown }).assistant);
  const categoriesRaw = settings.homePage?.categories ?? [];

  const trips: KbTrip[] = input.trips
    .filter((t) => t.trip.isPublished !== false)
    .map(({ trip, itinerary, pickupPoints, departures }) => {
      const nameText = `${trip.slug} ${trip.title} ${trip.destination}`;
      const aliases = new Set<string>();
      for (const group of PLACE_ALIASES) {
        if (group.match.test(nameText)) for (const a of group.aliases) aliases.add(normalize(a));
      }
      const destFirst = (trip.destination.split(",")[0] ?? "").replace(/[()]/g, " ");
      for (const t of distinctiveTokens(destFirst, 4)) aliases.add(t);
      const shortName = shortNameOf(trip);
      for (const t of distinctiveTokens(shortName, 4)) aliases.add(t);

      const theme = destinationTheme(trip.slug, trip.title, trip.destination) as CardTheme;
      const upcoming: KbDeparture[] = departures
        .filter((d) => d.status !== "cancelled" && d.status !== "completed" && d.endDate >= today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.departureCode.localeCompare(b.departureCode))
        .map((d) => {
          const pricePaise = d.priceOverridePaise ?? trip.basePricePaise;
          const cutoff = Date.parse(d.bookingCutoffAt);
          const started = d.startDate <= today;
          const bookingOpen = !started && (Number.isFinite(cutoff) ? cutoff > nowMs : true);
          const seatsRemaining = Math.max(0, d.seatsRemaining);
          return {
            departureId: d.departureId,
            code: d.departureCode,
            startDate: d.startDate,
            endDate: d.endDate,
            status: seatsRemaining === 0 ? "sold_out" : d.status,
            departureType: d.departureType,
            maxCapacity: d.maxCapacity,
            minOccupancy: Number.isFinite(d.minOccupancy) && d.minOccupancy > 0 ? d.minOccupancy : 1,
            seatsTaken: d.seatsTaken,
            seatsRemaining,
            soldOut: seatsRemaining === 0,
            womenOnly: d.departureType === "women_only",
            pricePaise,
            specialPrice: d.priceOverridePaise !== null && d.priceOverridePaise !== trip.basePricePaise,
            privateCarPossible: d.seatsTaken === 0 && d.maxCapacity === PRIVATE_SEATS,
            privateCarPricePaise: privateCarPrice(trip, pricePaise, policyRaw),
            bookingOpen,
            bookingCutoffAt: d.bookingCutoffAt,
            started,
            bookUrl: `/trips/${trip.slug}?date=${encodeURIComponent(d.departureId)}#book`,
          };
        });

      const category = categoriesRaw.find((c) => c.tripSlugs.includes(trip.slug))?.name ?? null;
      const haystack = normalize(
        [
          trip.title,
          trip.destination,
          trip.region,
          trip.tagline,
          trip.summary,
          trip.accommodationNotes,
          ...itinerary.map((i) => `${i.title} ${i.description}`),
          ...pickupPoints.map((p) => `${p.name} ${p.area}`),
        ].join(" ")
      );

      return {
        id: trip.id,
        slug: trip.slug,
        title: trip.title,
        shortName,
        destination: trip.destination,
        region: trip.region,
        tagline: trip.tagline,
        summary: trip.summary,
        durationDays: trip.durationDays,
        durationNights: trip.durationNights,
        durationLabel: `${trip.durationDays}D / ${trip.durationNights}N`,
        difficulty: trip.difficulty,
        vibe: trip.vibe,
        basePricePaise: trip.basePricePaise,
        privateGroupPricePaise: trip.privateGroupPricePaise,
        privateDiscountPercent: trip.privateDiscountPercent,
        privateCarPricePaise: privateCarPrice(trip, trip.basePricePaise, policyRaw),
        privateCarRule: privateRuleOf(trip),
        tripDepositPercent: trip.depositPercent,
        depositPercent: effectiveDeposit(trip.depositPercent, policyRaw),
        balanceDueDaysBefore: trip.balanceDueDaysBefore,
        pickupCity: trip.pickupCity,
        imageUrl: trip.heroImageUrl,
        url: `/trips/${trip.slug}`,
        inclusions: trip.inclusions.map((s) => s.trim()).filter(Boolean),
        exclusions: trip.exclusions.map((s) => s.trim()).filter(Boolean),
        accommodationNotes: cleanFact(trip.accommodationNotes),
        packingList: trip.packingList.map((s) => s.trim()).filter(Boolean),
        safetyNotes: cleanFact(trip.safetyNotes),
        accessibilityNotes: cleanFact(trip.accessibilityNotes),
        isSample: trip.isSampleDemo,
        itinerary: [...itinerary]
          .sort((a, b) => a.dayNumber - b.dayNumber)
          .map((i) => ({
            day: i.dayNumber,
            title: i.title,
            description: i.description,
            driveTime: i.driveTimeEstimate,
            meals: i.mealsIncluded,
            bufferNotes: i.travelBufferNotes,
          })),
        pickups: [...pickupPoints]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((p) => ({ name: p.name, area: p.area, time: p.pickupTimeLabel, mapsUrl: p.mapsUrl, confirmed: p.isConfirmed })),
        departures: upcoming,
        theme,
        aliases: [...aliases],
        keywords: distinctiveTokens(`${trip.title} ${trip.slug.replace(/-/g, " ")}`, 5),
        haystack,
        category,
      };
    });

  // A keyword shared by two trips points at neither.
  const kwCount = new Map<string, number>();
  for (const t of trips) for (const k of new Set(t.keywords)) kwCount.set(k, (kwCount.get(k) ?? 0) + 1);
  for (const t of trips) t.keywords = [...new Set(t.keywords)].filter((k) => kwCount.get(k) === 1 && !t.aliases.includes(k));

  const slabs = (policyRaw.cancellationSlabs ?? []).map((s) => {
    const note = cleanFact(s.refundNote);
    const label = (cleanFact(s.label) || s.label).replace(/^\s*draft\s*:\s*/i, "").trim();
    return { label: label || s.label, refundNote: note, confirmed: Boolean(note) };
  });
  const policy: KbPolicy = {
    maxGroupSize: policyRaw.maxGroupSize,
    maxSeatsPerBooking: Math.max(1, Math.min(5, policyRaw.maxGroupSize - 1)),
    holdMinutes: policyRaw.holdMinutes,
    depositAllowed: effectiveDeposit(null, policyRaw) !== null,
    depositPercent: effectiveDeposit(null, policyRaw),
    balanceDueDaysBefore: policyRaw.balanceDueDaysBefore,
    taxRatePercent: Math.max(0, policyRaw.taxRatePercent),
    taxNote: cleanFact(policyRaw.gstIncludedOrNote),
    cancellationSlabs: slabs,
    preferenceDecisionHoursBefore: policyRaw.preferenceDecisionHoursBefore,
    roomPolicy: cleanFact(policyRaw.roomPolicySummary),
    vehiclePolicy: cleanFact(policyRaw.vehiclePolicySummary),
    policyVersion: policyRaw.policyVersion,
    draft:
      /draft|review/i.test(policyRaw.policyVersion ?? "") ||
      (policyRaw.cancellationSlabs ?? []).some((s) => isDraftText(s.label) || isDraftText(s.refundNote)),
  };

  const legalRaw = settings.legalDrafts;
  const legal = {
    draft: Boolean(legalRaw?.ownerReviewRequired),
    terms: cleanFact(legalRaw?.termsSummary),
    privacy: cleanFact(legalRaw?.privacySummary),
    refund: cleanFact(legalRaw?.refundSummary),
    safety: cleanFact(legalRaw?.safetySummary),
  };

  const careNumber = assistant.customerCareNumber.replace(/\D/g, "");
  // Same order as the store layout: the admin's number first, then the environment fallback.
  const waDigits = (settings.socialLinks?.whatsappNumber ?? "").replace(/\D/g, "") || (input.whatsappFallbackNumber ?? "").replace(/\D/g, "");
  const channel = (settings.socialLinks?.whatsappChannelUrl ?? "").trim();
  const email = cleanFact(settings.brandIdentity?.supportEmail);
  const contact: KbContact = {
    careNumber,
    careDisplay: careNumber ? displayPhone(careNumber) : "",
    careTel: careNumber ? `tel:+${careNumber}` : null,
    careHours: careNumber ? cleanFact(assistant.customerCareHours) : "",
    whatsappUrl: /^\d{8,15}$/.test(waDigits) ? `https://wa.me/${waDigits}` : null,
    whatsappChannelUrl: /^https:\/\//i.test(channel) ? channel : null,
    supportEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    supportHours: cleanFact(settings.brandIdentity?.supportHours) || null,
  };

  const idToSlug = new Map(trips.map((t) => [t.id, t.slug]));
  const offers: KbOffer[] = (input.offers ?? [])
    .filter((o) => cleanFact(o.title) || cleanFact(o.message))
    .map((o) => ({
      title: cleanFact(o.title),
      message: cleanFact(o.message),
      ctaLabel: cleanFact(o.ctaLabel ?? ""),
      ctaUrl: (o.ctaUrl ?? "").trim(),
      tripSlug: o.tripId ? idToSlug.get(o.tripId) ?? null : null,
    }));

  const weather: Record<string, LiveWeather> = {};
  for (const [slug, w] of Object.entries(input.weather ?? {})) if (w && w.live) weather[slug] = w;

  const method = input.payment?.method;
  const payment: KbPayment = {
    method: method === "upi" || method === "razorpay" || method === "sandbox" ? method : "unknown",
    onlineReady: input.payment ? input.payment.onlineReady : null,
  };

  const groupCard = (settings.homePage?.travellerCards ?? []).find((c) => (c.href ?? "").includes("#plan"));

  return {
    builtAt: now.toISOString(),
    today,
    nowMs,
    brandName: cleanFact(settings.brandIdentity?.brandName) || "Sanchari",
    isSampleData: Boolean(input.isSampleData),
    trips,
    policy,
    faqs: (settings.faqs ?? [])
      .filter((f) => cleanFact(f.question) && cleanFact(f.answer))
      .map((f) => ({ id: f.id, question: cleanFact(f.question), answer: cleanFact(f.answer) })),
    legal,
    contact,
    offers,
    categories: categoriesRaw.map((c) => ({ id: c.id, name: c.name, description: c.description, tripSlugs: [...c.tripSlugs] })),
    weather,
    payment,
    groupNote: groupCard ? cleanFact(groupCard.body) : "",
    assistant,
  };
}

// ---------------------------------------------------------------------------
// Live load (server only)
// ---------------------------------------------------------------------------

const CACHE_MS = 15_000;
let cached: { at: number; kb: KnowledgeBase } | null = null;
let inflight: Promise<KnowledgeBase> | null = null;

async function loadPayment(): Promise<{ method: string; onlineReady: boolean | null }> {
  try {
    const { getPaymentGatewayStatus } = await import("@/lib/env");
    const method = getPaymentGatewayStatus().provider;
    if (method !== "upi") return { method, onlineReady: true };
    const { getUpiPaymentSettings } = await import("@/lib/data/repository");
    const upi = await getUpiPaymentSettings();
    return { method, onlineReady: upi.isEnabled };
  } catch {
    return { method: "unknown", onlineReady: null };
  }
}

/** Live facts for the chat guide (server only). Cached in memory for 15 seconds. */
export async function loadKnowledgeBase(): Promise<KnowledgeBase> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.kb;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [repo, promos, weatherMod] = await Promise.all([
        import("@/lib/data/repository"),
        import("@/lib/data/promotions"),
        import("@/lib/weather-server"),
      ]);
      const tripsP = repo.getPublishedTripsWithDetails({ includeStarted: true });
      const weatherP = tripsP.then(async ({ trips }) => {
        const entries = await Promise.all(
          trips.map(async ({ trip }) => {
            const w = await weatherMod.getDestinationWeather(trip.slug, trip.region, { timeoutMs: 2000 }).catch(() => null);
            return [trip.slug, w] as const;
          })
        );
        const out: Record<string, LiveWeather> = {};
        for (const [slug, w] of entries) if (w && w.live) out[slug] = w;
        return out;
      });
      const [tripsRes, settingsRes, offers, weather, payment, whatsappFallbackNumber] = await Promise.all([
        tripsP,
        repo.getSiteSettings(),
        promos.getLivePromotions().catch(() => []),
        weatherP.catch(() => ({}) as Record<string, LiveWeather>),
        loadPayment(),
        import("@/lib/env").then((env) => env.getWhatsAppIntegrationStatus().supportNumber).catch(() => null),
      ]);
      const kb = buildKnowledgeFromData({
        trips: tripsRes.trips,
        settings: settingsRes.settings,
        offers,
        weather,
        payment,
        isSampleData: tripsRes.isDemoFallback,
        whatsappFallbackNumber,
      });
      cached = { at: Date.now(), kb };
      return kb;
    } catch (err) {
      console.error("[assistant] knowledge load failed:", err instanceof Error ? err.message : "unknown error");
      if (cached) return cached.kb;
      throw err;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Forget the cached facts (tests, or right after an admin save). */
export function clearKnowledgeCache(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// As text, for the AI layer (its ONLY ground truth)
// ---------------------------------------------------------------------------

/** "11:30 AM" in India for a moment (ms). */
function istTime(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: IST_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms));
}

function seatsPhrase(d: KbDeparture): string {
  if (d.soldOut) return `SOLD OUT (0 of ${d.maxCapacity} seats open; waitlist open on the trip page)`;
  return `${d.seatsRemaining} of ${d.maxCapacity} seats open`;
}

function privateRuleText(t: KbTrip): string {
  const full = formatINR(t.basePricePaise * PRIVATE_SEATS);
  if (t.privateCarRule === "fixed") return `fixed whole-car price; 6 × ${formatINR(t.basePricePaise)} would be ${full}`;
  if (t.privateCarRule === "discount") return `6 × ${formatINR(t.basePricePaise)} = ${full} minus ${t.privateDiscountPercent}%`;
  return `6 × ${formatINR(t.basePricePaise)}, no whole-car discount`;
}

function departureLine(d: KbDeparture): string {
  const parts = [
    `${fmtRange(d.startDate, d.endDate, true)} (code ${d.code})`,
    seatsPhrase(d),
    `${formatINR(d.pricePaise)} per seat${d.specialPrice ? " (special price for this date)" : ""}`,
    d.womenOnly ? "WOMEN-ONLY batch (only women travellers can book it)" : d.departureType === "private_charter" ? "private charter date" : "open batch (anyone can join)",
    `runs with at least ${d.minOccupancy} ${d.minOccupancy === 1 ? "traveller" : "travellers"} booked (minimum batch)`,
  ];
  if (d.privateCarPossible) parts.push(`whole car possible on this date: ${formatINR(d.privateCarPricePaise)} for all ${PRIVATE_SEATS} seats`);
  else parts.push("whole car not possible (some seats already taken)");
  if (d.started) parts.push("trip already under way, booking closed");
  else if (!d.bookingOpen) parts.push("online booking closed (cut-off passed)");
  else {
    const cut = fmtInstantIST(d.bookingCutoffAt);
    if (cut) parts.push(`booking closes ${cut}`);
  }
  parts.push(`book: ${d.bookUrl}`);
  return `  - ${parts.join("; ")}`;
}

/** Every fact, compact and unambiguous. This is the only ground truth the AI layer sees. */
export function knowledgeAsText(kb: KnowledgeBase): string {
  const L: string[] = [];
  const p = kb.policy;
  L.push(`${kb.brandName.toUpperCase()} — LIVE WEBSITE FACTS`);
  L.push(`Today in India: ${fmtDay(kb.today, true)} (${kb.today}). Now: ${istTime(kb.nowMs)} IST. Money is Indian rupees.`);
  if (kb.isSampleData) L.push("Note: the website is currently showing built-in SAMPLE trips and dates, not confirmed real departures.");
  L.push(
    `Cars: one car seats up to ${p.maxGroupSize} travellers. A shared booking takes 1–${p.maxSeatsPerBooking} seats. Booking all ${PRIVATE_SEATS} seats (just your group) is the "whole car" option, possible only on a date where every seat is still free.`
  );
  L.push(
    p.taxRatePercent > 0
      ? `Prices below are before tax; checkout adds ${p.taxRatePercent}% tax.${p.taxNote ? ` Tax note: ${p.taxNote}` : ""}`
      : `Checkout adds no tax on top of the prices below.${p.taxNote ? ` Tax note: ${p.taxNote}` : ""}`
  );
  L.push("");

  kb.trips.forEach((t, i) => {
    L.push(`TRIP ${i + 1}: ${t.title} — page ${t.url}${t.isSample ? " (sample listing)" : ""}`);
    L.push(`- Place: ${t.destination}; region ${t.region}; short name ${t.shortName}${t.category ? `; category ${t.category}` : ""}`);
    L.push(`- Duration ${t.durationDays} days / ${t.durationNights} nights; difficulty ${t.difficulty}; vibe: ${t.vibe}; starts from ${t.pickupCity}`);
    L.push(`- Price: ${formatINR(t.basePricePaise)} per seat. Whole car (all ${PRIVATE_SEATS} seats): ${formatINR(t.privateCarPricePaise)} (${privateRuleText(t)}).`);
    L.push(
      t.depositPercent !== null
        ? `- Payment: ${t.depositPercent}% deposit allowed at checkout, balance due ${t.balanceDueDaysBefore} days before the trip.`
        : "- Payment: full amount at booking (no deposit option)."
    );
    if (t.tagline) L.push(`- Tagline: ${t.tagline}`);
    if (t.summary) L.push(`- Summary: ${t.summary}`);
    if (t.departures.length === 0) L.push("- Upcoming departures: none scheduled right now.");
    else {
      L.push("- Upcoming departures (live seats):");
      for (const d of t.departures) L.push(departureLine(d));
    }
    if (t.pickups.length === 0) L.push("- Pickup points: not listed yet.");
    else {
      L.push(`- Pickup points (${t.pickupCity}):`);
      for (const pk of t.pickups) {
        L.push(`  - ${pk.name}, ${pk.area}, ${pk.time}${pk.confirmed ? ", confirmed" : ", not yet confirmed"}${pk.mapsUrl ? `, map ${pk.mapsUrl}` : ""}`);
      }
    }
    if (t.itinerary.length) {
      L.push("- Itinerary:");
      for (const d of t.itinerary) {
        const bits = [d.description];
        if (d.driveTime) bits.push(`Drive: ${d.driveTime}.`);
        if (d.meals) bits.push(`Meals: ${d.meals}.`);
        if (d.bufferNotes) bits.push(`Buffer: ${d.bufferNotes}`);
        L.push(`  - Day ${d.day}: ${d.title}. ${bits.join(" ")}`);
      }
    }
    if (t.inclusions.length) L.push(`- Included: ${t.inclusions.join("; ")}`);
    if (t.exclusions.length) L.push(`- Not included: ${t.exclusions.join("; ")}`);
    if (t.accommodationNotes) L.push(`- Stay: ${t.accommodationNotes}`);
    if (t.packingList.length) L.push(`- Packing list: ${t.packingList.join("; ")}`);
    if (t.safetyNotes) L.push(`- Safety: ${t.safetyNotes}`);
    if (t.accessibilityNotes) L.push(`- Walking / accessibility: ${t.accessibilityNotes}`);
    const w = kb.weather[t.slug];
    if (w) {
      L.push(`- Live weather now at ${w.place}: ${w.tempC}°C, ${w.label}, wind ${w.windKmh} km/h from ${w.windFrom}, humidity ${w.humidity}%.`);
    }
    L.push("");
  });
  if (kb.trips.length === 0) {
    L.push("TRIPS: none published right now.");
    L.push("");
  }

  L.push("BOOKING AND PAYMENT");
  L.push(`- How to book: open the trip page, pick a date, choose seats on the live car map (or the whole car), add traveller details and pickup point, then pay. Direct link per date is listed above.`);
  L.push(`- Seats are held for ${p.holdMinutes} minutes while you pay; unpaid holds free up automatically.`);
  if (kb.payment.method === "upi") {
    L.push(
      kb.payment.onlineReady === false
        ? "- Payment: online payment is switched OFF right now, so seats cannot be held online; visitors should contact customer care / WhatsApp to book."
        : "- Payment: by UPI straight to Sanchari's UPI ID; after paying, the customer enters the 12-digit UPI reference (UTR) and staff confirm once the money is seen."
    );
  } else if (kb.payment.method === "razorpay") {
    L.push("- Payment: online through Razorpay checkout.");
  }
  L.push(
    p.depositPercent !== null
      ? `- Deposit: ${p.depositPercent}% deposit allowed (unless a trip says otherwise); balance due ${p.balanceDueDaysBefore} days before the trip.`
      : "- Deposit: not offered site-wide; full payment at booking (unless a trip lists its own deposit)."
  );
  L.push("- Coupon or creator codes are typed at checkout and checked there. Never share or guess codes.");
  L.push("- Check a booking, pay a balance, or ask to cancel / reschedule: My Booking at /booking-lookup (booking reference + email).");
  L.push(`- Groups bigger than ${p.maxGroupSize}: send the plan through the enquiry form at /#plan.${kb.groupNote ? ` Site says: "${kb.groupNote}"` : ""}`);
  L.push("");

  L.push(`POLICIES${p.draft || kb.legal.draft ? " (owner still marks these as DRAFT — confirm with customer care)" : ""}`);
  if (p.cancellationSlabs.length) {
    L.push("- Cancellation / refund slabs:");
    for (const s of p.cancellationSlabs) L.push(`  - ${s.label}: ${s.confirmed ? s.refundNote : "refund amount not published yet"}`);
  } else L.push("- Cancellation slabs: not published.");
  if (kb.legal.refund) L.push(`- Refunds: ${kb.legal.refund}`);
  if (p.roomPolicy) L.push(`- Rooms: ${p.roomPolicy}`);
  if (p.vehiclePolicy) L.push(`- Vehicle: ${p.vehiclePolicy}`);
  if (p.preferenceDecisionHoursBefore) {
    L.push(`- Co-traveller / room comfort requests are decided ${p.preferenceDecisionHoursBefore} hours before departure.`);
  }
  if (kb.legal.safety) L.push(`- Safety: ${kb.legal.safety}`);
  if (kb.legal.privacy) L.push(`- Privacy: ${kb.legal.privacy}`);
  if (kb.legal.terms) L.push(`- Terms: ${kb.legal.terms}`);
  L.push("- Full pages: /policies, /safety.");
  L.push("");

  if (kb.faqs.length) {
    L.push("FAQS");
    for (const f of kb.faqs) L.push(`- Q: ${f.question}\n  A: ${f.answer}`);
    L.push("");
  }

  L.push("OFFERS LIVE NOW");
  if (kb.offers.length === 0) L.push("- None right now.");
  for (const o of kb.offers) {
    const trip = o.tripSlug ? kb.trips.find((t) => t.slug === o.tripSlug)?.title : null;
    L.push(`- ${[o.title, o.message].filter(Boolean).join(": ")}${trip ? ` (for ${trip})` : ""}${o.ctaUrl ? ` — link ${o.ctaUrl}` : ""}`);
  }
  L.push("");

  L.push("CONTACT");
  const c = kb.contact;
  L.push(c.careNumber ? `- Customer care phone: ${c.careDisplay}${c.careHours ? ` (${c.careHours})` : ""}` : "- Customer care phone: not published (never give any phone number).");
  L.push(c.whatsappUrl ? "- WhatsApp chat: available (button in the chat)." : "- WhatsApp chat: not set.");
  if (c.supportEmail) L.push(`- Email: ${c.supportEmail}`);
  if (c.supportHours) L.push(`- Support hours: ${c.supportHours}`);
  L.push("- Enquiry form: /#plan. Contact page: /contact. Creators programme: /creators.");
  L.push("");

  L.push("USEFUL LINKS: all trips /trips; whole-car dates /trips?mode=private; women-only dates /trips?mode=women; group enquiry /#plan; My Booking /booking-lookup; policies /policies; safety /safety; creators /creators.");
  return L.join("\n");
}
