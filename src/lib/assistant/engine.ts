/**
 * Exact-answer engine for the chat guide. Deterministic: it reads ONLY the knowledge base
 * (live trips, departures, seats, prices, pickups, policies, FAQs, offers, contact) and never
 * states a fact that is not there. Understands plain English plus common romanised
 * Kannada / Hindi words, tolerates typos in place names, and follows the conversation
 * ("how much is it?", "and the dates?", "what about Hampi?").
 *
 * When it is not sure (confidence below ENGINE_CONFIDENT) the route may hand the question to
 * the optional AI layer, which is grounded in the same knowledge base.
 */
import { calculateBookingPricing, formatINR } from "@/lib/currency";
import type { KbDeparture, KbTrip, KnowledgeBase } from "./knowledge";
import {
  editDistance,
  firstSentence,
  fmtDay,
  fmtRange,
  fuzzyWordEq,
  hasPhrase,
  isMonthToken,
  normalize,
  ordinalOnlyNumbers,
  parseDateFilter,
  parseHeadcount,
  readNumber,
  splitISO,
  tokenize,
  type DateFilter,
} from "./text";
import { CHAT_LIMITS, type AnswerAction, type AnswerCard, type ChatTurn, type EngineAnswer, type GuideEmotion } from "./types";

// ---------------------------------------------------------------------------
// Intents and the words that point at them
// ---------------------------------------------------------------------------

type Intent =
  | "greeting"
  | "thanks"
  | "bye"
  | "ack"
  | "list_trips"
  | "trip_details"
  | "price"
  | "dates"
  | "seats"
  | "women_only"
  | "private_car"
  | "big_group"
  | "pickup"
  | "itinerary"
  | "inclusions"
  | "meals"
  | "stay"
  | "room_sharing"
  | "vehicle"
  | "packing"
  | "difficulty"
  | "weather"
  | "cancellation"
  | "payment"
  | "how_to_book"
  | "my_booking"
  | "safety"
  | "solo"
  | "coupons"
  | "offers"
  | "contact"
  | "about";

/** [intent, weight, words / phrases]. Phrases match whole words in order; long single words allow typos. */
const RULE_TABLE: Array<[Intent, number, string[]]> = [
  [
    "thanks",
    3,
    ["thanks", "thank you", "thankyou", "thank u", "thx", "tq", "ty", "thanks a lot", "dhanyavada", "dhanyavadagalu", "dhanyavaada", "shukriya", "dhanyavad", "dhanyawad", "much appreciated", "ಧನ್ಯವಾದ", "ಧನ್ಯವಾದಗಳು", "धन्यवाद", "शुक्रिया"],
  ],
  ["bye", 3, ["bye", "goodbye", "good bye", "bye bye", "see you", "see ya", "tata", "cya", "good night", "take care", "alvida"]],
  [
    "list_trips",
    3,
    [
      "which trips",
      "what trips",
      "all trips",
      "all your trips",
      "show trips",
      "show me trips",
      "list trips",
      "list of trips",
      "trip list",
      "trips do you",
      "trips you have",
      "trips you offer",
      "trips available",
      "available trips",
      "your trips",
      "other trips",
      "which places",
      "what places",
      "which destinations",
      "what destinations",
      "destinations",
      "destination",
      "where do you go",
      "where all",
      "where can i go",
      "where can we go",
      "packages",
      "tour packages",
      "trip options",
      "what do you offer",
      "what do you have",
      "yava trip",
      "yav trip",
      "yavu trip",
      "yava place",
      "kaun se trip",
      "kaunsa trip",
      "kaun si jagah",
    ],
  ],
  ["list_trips", 1, ["trips", "tours", "places", "options"]],
  [
    "price",
    3,
    [
      "how much",
      "price",
      "prices",
      "pricing",
      "priced",
      "cost",
      "costs",
      "costing",
      "rate",
      "rates",
      "fare",
      "fares",
      "charge",
      "charges",
      "fee",
      "fees",
      "tariff",
      "per head",
      "per person",
      "per seat",
      "per pax",
      "kitna",
      "kitne",
      "kitni",
      "keemat",
      "kimat",
      "kimmat",
      "daam",
      "bele",
      "dara",
      "ಬೆಲೆ",
      "ದರ",
      "कितना",
      "कीमत",
      "दाम",
    ],
  ],
  ["price", 3, ["cheapest", "cheaper", "costliest", "most expensive", "lowest price", "least expensive", "priciest"]],
  ["price", 2, ["budget", "amount", "cheap", "expensive", "costly", "affordable", "lowest", "rupees", "rs", "inr", "money", "total", "eshtu", "yeshtu", "estu", "yestu", "ಎಷ್ಟು"]],
  [
    "dates",
    3,
    [
      "dates",
      "date",
      "departures",
      "departure",
      "upcoming",
      "coming up",
      "next trip",
      "next departure",
      "next batch",
      "next date",
      "available dates",
      "when is",
      "when are",
      "when does",
      "when do",
      "when can",
      "when will",
      "yavaga",
      "yaavaga",
      "yavag",
      "yavaaga",
      "kab",
      "ಯಾವಾಗ",
      "कब",
      "calendar",
      "start date",
      "starting date",
      "trip dates",
    ],
  ],
  ["dates", 1.5, ["when", "schedule", "batch", "batches", "running", "month", "weekend", "soonest", "earliest", "next"]],
  [
    "seats",
    3.5,
    [
      "seats left",
      "seats available",
      "seat available",
      "seats open",
      "seats free",
      "seats remaining",
      "seat left",
      "how many seats",
      "how many seat",
      "any seats",
      "any seat",
      "seat ide",
      "seat ideya",
      "seats ide",
      "seat idheya",
      "seat hai",
      "seats hai",
      "seat khali",
      "seat baaki",
      "seats baaki",
      "eshtu seat",
      "estu seat",
      "kitne seat",
      "kitni seat",
      "availability",
      "vacancy",
      "vacancies",
      "sold out",
      "is it full",
      "ಸೀಟು",
      "ಸೀಟ್",
      "सीट",
    ],
  ],
  ["seats", 1.5, ["seats", "seat", "available", "spots", "spot", "slots", "slot", "space", "vacant", "full", "left", "remaining"]],
  [
    "women_only",
    3.5,
    [
      "women only",
      "woman only",
      "ladies only",
      "girls only",
      "female only",
      "only women",
      "only ladies",
      "only girls",
      "women batch",
      "ladies batch",
      "womens batch",
      "women trip",
      "ladies trip",
      "girls trip",
      "mahila",
      "mahilaa",
      "hudugiyaru",
      "ಮಹಿಳೆ",
      "ಮಹಿಳೆಯರು",
      "महिला",
    ],
  ],
  ["women_only", 2.5, ["women", "woman", "womens", "ladies", "lady", "female", "females", "girls", "girl"]],
  [
    "private_car",
    4,
    [
      "whole car",
      "entire car",
      "full car",
      "private car",
      "private vehicle",
      "own car",
      "whole vehicle",
      "entire vehicle",
      "full vehicle",
      "whole cab",
      "private cab",
      "book the car",
      "book whole",
      "book entire",
      "all 6 seats",
      "all six seats",
      "all seats",
      "private trip",
      "private group",
      "private booking",
      "private tour",
      "exclusive",
      "charter",
      "chartered",
      "just us",
      "only us",
      "only our group",
      "just our group",
      "only our family",
      "just our family",
      "only our friends",
      "just our friends",
    ],
  ],
  ["private_car", 2, ["private"]],
  [
    "big_group",
    4,
    [
      "more than 6",
      "more than six",
      "over 6",
      "over six",
      "big group",
      "large group",
      "bigger group",
      "two cars",
      "2 cars",
      "multiple cars",
      "corporate",
      "office trip",
      "team outing",
      "office outing",
      "company trip",
      "offsite",
      "off site",
      "college trip",
      "school trip",
      "group booking",
    ],
  ],
  [
    "pickup",
    4,
    [
      "pickup",
      "pick up",
      "pickups",
      "boarding",
      "meeting point",
      "meet point",
      "starting point",
      "start point",
      "start from",
      "starts from",
      "leave from",
      "leaves from",
      "depart from",
      "departs from",
      "from where",
      "where do we start",
      "where does it start",
      "where to board",
      "where to meet",
      "where do we meet",
      "drop",
      "drop off",
      "dropoff",
      "drop point",
      "drop points",
      "reporting time",
      "reporting point",
      "what time",
      "which time",
      "timings",
      "timing",
      "elli inda",
      "elliinda",
      "ellinda",
      "kahan se",
      "kaha se",
      "hubs",
      "hub",
      "ಪಿಕಪ್",
    ],
  ],
  [
    "itinerary",
    4,
    [
      "itinerary",
      "day by day",
      "day wise",
      "daywise",
      "day plan",
      "plan for each day",
      "what will we do",
      "what do we do",
      "what can we do",
      "what will we see",
      "what do we see",
      "what we do",
      "what we see",
      "activities",
      "activity",
      "sightseeing",
      "sight seeing",
      "places covered",
      "places to visit",
      "places we visit",
      "places visited",
      "route",
      "programme",
      "program",
      "agenda",
      "first day",
      "second day",
      "third day",
      "last day",
      "day 1",
      "day 2",
      "day 3",
      "day 4",
      "day 5",
      "day one",
      "day two",
      "day three",
    ],
  ],
  ["itinerary", 1.5, ["plan", "plans"]],
  [
    "inclusions",
    4,
    [
      "included",
      "include",
      "includes",
      "inclusion",
      "inclusions",
      "inclusive",
      "covered",
      "covers",
      "excluded",
      "exclusion",
      "exclusions",
      "not included",
      "exclude",
      "extra cost",
      "extra costs",
      "extras",
      "hidden cost",
      "hidden charges",
      "additional cost",
      "additional charges",
      "entry fee",
      "entry fees",
      "entry ticket",
      "entry tickets",
      "entrance fee",
      "permit",
      "permits",
      "tolls",
      "toll",
    ],
  ],
  ["meals", 3.5, ["meal", "meals", "food", "foods", "breakfast", "lunch", "dinner", "veg", "vegetarian", "non veg", "nonveg", "eat", "eating", "oota", "tindi", "khana", "khaana", "tiffin", "jain food", "ಊಟ", "खाना"]],
  [
    "stay",
    3.5,
    [
      "stay",
      "staying",
      "hotel",
      "hotels",
      "accommodation",
      "accommodations",
      "homestay",
      "home stay",
      "resort",
      "where do we stay",
      "where will we stay",
      "where do we sleep",
      "lodging",
      "lodge",
      "cottage",
      "cottages",
      "guesthouse",
      "guest house",
      "bungalow",
      "night stay",
      "rooms",
      "room type",
      "ac room",
    ],
  ],
  [
    "room_sharing",
    4.5,
    [
      "room sharing",
      "share room",
      "share a room",
      "sharing room",
      "shared room",
      "sharing rooms",
      "roommate",
      "room mate",
      "roommates",
      "same gender",
      "couple room",
      "private room",
      "separate room",
      "own room",
      "single room",
      "room with strangers",
    ],
  ],
  [
    "vehicle",
    3.5,
    ["vehicle", "ertiga", "which car", "what car", "car type", "type of car", "car model", "ac car", "luggage", "baggage", "bag", "bags", "suitcase", "suitcases", "seat belt", "seatbelt", "mpv", "suv", "innova"],
  ],
  ["vehicle", 1.5, ["car", "driver", "drivers"]],
  [
    "packing",
    4,
    [
      "pack",
      "packing",
      "what to bring",
      "what to carry",
      "what to wear",
      "what to pack",
      "what should i bring",
      "what should i carry",
      "what should i wear",
      "what should i pack",
      "should i bring",
      "should i carry",
      "things to bring",
      "things to carry",
      "clothes",
      "clothing",
      "essentials",
      "checklist",
    ],
  ],
  [
    "difficulty",
    3.5,
    [
      "difficult",
      "difficulty",
      "tough",
      "strenuous",
      "fitness",
      "physically",
      "trek",
      "trekking",
      "hike",
      "hiking",
      "climb",
      "climbing",
      "walking",
      "walk",
      "stairs",
      "steps",
      "elderly",
      "senior",
      "seniors",
      "senior citizen",
      "senior citizens",
      "old age",
      "aged",
      "parents",
      "grandparents",
      "grandmother",
      "grandfather",
      "age",
      "age limit",
      "kids",
      "kid",
      "children",
      "child",
      "baby",
      "infant",
      "toddler",
      "pregnant",
      "wheelchair",
      "accessible",
      "accessibility",
      "disabled",
      "disability",
      "mobility",
      "knee",
      "knees",
      "beginner",
      "beginners",
      "year old",
      "years old",
      "yr old",
      "yrs old",
      "old people",
      "elderly parents",
      "my mother",
      "my father",
      "my mom",
      "my dad",
      "my parents",
      "my grandmother",
      "my grandfather",
    ],
  ],
  ["difficulty", 1, ["easy", "hard", "fit"]],
  [
    "weather",
    4,
    ["weather", "temperature", "temp", "rain", "raining", "rainy", "rains", "climate", "humid", "humidity", "sunny", "monsoon", "forecast", "mausam", "havamana", "chali", "thandi", "degrees", "how hot", "how cold", "is it hot", "is it cold", "ಹವಾಮಾನ", "ಮಳೆ", "मौसम", "बारिश"],
  ],
  ["weather", 2, ["best time", "best season", "season", "when to visit", "when to go", "good time to visit"]],
  [
    "cancellation",
    4.5,
    [
      "cancel",
      "cancellation",
      "cancelling",
      "canceling",
      "cancelled",
      "canceled",
      "refund",
      "refunds",
      "refundable",
      "non refundable",
      "money back",
      "reschedule",
      "rescheduling",
      "postpone",
      "change date",
      "change my date",
      "change the date",
      "change booking",
      "change my booking",
      "no show",
      "noshow",
    ],
  ],
  [
    "payment",
    4,
    [
      "pay",
      "paying",
      "payment",
      "payments",
      "upi",
      "gpay",
      "google pay",
      "phonepe",
      "phone pe",
      "paytm",
      "bhim",
      "credit card",
      "debit card",
      "card",
      "net banking",
      "netbanking",
      "emi",
      "cash",
      "deposit",
      "advance",
      "advance payment",
      "balance",
      "part payment",
      "partial payment",
      "pay later",
      "installment",
      "instalment",
      "installments",
      "gst",
      "tax",
      "taxes",
      "invoice",
      "bill",
      "utr",
      "transaction id",
      "qr",
      "qr code",
      "hold",
      "timer",
      "payment method",
      "payment options",
      "ಪಾವತಿ",
      "भुगतान",
    ],
  ],
  [
    "how_to_book",
    4.5,
    [
      "how to book",
      "how do i book",
      "how can i book",
      "how do we book",
      "how can we book",
      "how should i book",
      "how to reserve",
      "booking process",
      "process to book",
      "steps to book",
      "want to book",
      "wanna book",
      "would like to book",
      "like to book",
      "need to book",
      "book now",
      "book a seat",
      "book seats",
      "book my seat",
      "book a trip",
      "book the trip",
      "book this trip",
      "book this",
      "book it",
      "reserve a seat",
      "reserve seats",
      "how to register",
      "how to join",
      "how do i join",
      "sign up",
      "register",
      "registration",
      "enrol",
      "enroll",
      "book maadi",
      "book madodu",
      "book karna",
      "book kaise",
    ],
  ],
  ["how_to_book", 2, ["book", "booking", "reserve", "reservation", "join"]],
  [
    "my_booking",
    4,
    [
      "my booking",
      "my bookings",
      "my reservation",
      "booking status",
      "booking reference",
      "booking ref",
      "booking id",
      "booking number",
      "reference number",
      "ref number",
      "ref no",
      "my ticket",
      "my tickets",
      "my seat",
      "my seats",
      "check my booking",
      "check booking",
      "find my booking",
      "track my booking",
      "track booking",
      "already booked",
      "i booked",
      "i have booked",
      "ive booked",
      "i paid",
      "i have paid",
      "ive paid",
      "payment status",
      "did my payment",
      "payment done",
      "booking confirmed",
      "is my booking",
      "confirm my booking",
      "booking confirmation",
      "booking lookup",
    ],
  ],
  [
    "my_booking",
    5,
    [
      "payment not confirmed",
      "payment is not confirmed",
      "not confirmed yet",
      "payment pending",
      "payment not received",
      "paid but",
      "money deducted",
      "amount deducted",
      "no confirmation",
      "didnt get confirmation",
      "did not get confirmation",
      "not received confirmation",
      "booking not confirmed",
      "seats not confirmed",
    ],
  ],
  [
    "safety",
    4,
    ["safe", "safety", "secure", "security", "safely", "unsafe", "danger", "dangerous", "risk", "risky", "emergency", "first aid", "insurance", "verified driver", "night driving", "police", "accident", "medical", "is it safe"],
  ],
  [
    "solo",
    3.5,
    ["solo", "alone", "single traveller", "single traveler", "by myself", "on my own", "travel alone", "travelling alone", "traveling alone", "just me", "only me", "obbane", "obbale", "akela", "akele", "duo", "trio", "join solo"],
  ],
  [
    "coupons",
    4.5,
    [
      "coupon",
      "coupons",
      "coupon code",
      "promo code",
      "promocode",
      "promo",
      "discount code",
      "voucher",
      "referral",
      "referral code",
      "refer",
      "creator",
      "creators",
      "creator code",
      "influencer",
      "influencers",
      "youtuber",
      "blogger",
      "vlogger",
      "instagrammer",
      "content creator",
      "collab",
      "collaboration",
      "sponsor",
      "sponsored",
      "barter",
      "free trip",
      "free seat",
    ],
  ],
  ["coupons", 1.5, ["code", "codes"]],
  [
    "offers",
    4,
    ["offer", "offers", "deal", "deals", "discount", "discounts", "sale", "promotion", "promotions", "festive offer", "special offer", "special price", "cashback", "student discount", "early bird", "combo"],
  ],
  [
    "contact",
    5,
    [
      "customer care",
      "customer service",
      "customer support",
      "care number",
      "helpline",
      "help line",
      "contact number",
      "phone number",
      "mobile number",
      "whatsapp number",
      "call you",
      "call me",
      "call back",
      "callback",
      "talk to",
      "talk with",
      "speak to",
      "speak with",
      "real person",
      "human",
      "agent",
      "representative",
      "executive",
      "contact",
      "ಸಂಪರ್ಕ",
      "संपर्क",
    ],
  ],
  // Not bare "number" / "address" / "support": "the number of days" is not a contact question.
  [
    "contact",
    3,
    [
      "call",
      "phone",
      "mobile",
      "whatsapp",
      "whats app",
      "email",
      "e mail",
      "mail id",
      "email id",
      "reach you",
      "reach out",
      "office",
      "help desk",
      "your number",
      "number please",
      "give number",
      "share number",
      "send number",
      "number pls",
      "office address",
      "your address",
      "support team",
      "support number",
      "contact support",
      "get support",
      "need support",
    ],
  ],
  [
    "about",
    4,
    [
      "who are you",
      "what are you",
      "are you a bot",
      "are you bot",
      "are you a robot",
      "are you human",
      "are you real",
      "are you ai",
      "are you a person",
      "your name",
      "who is this",
      "about you",
      "about sanchari",
      "what is sanchari",
      "who runs",
      "who owns",
      "about the company",
      "about your company",
      "tell me about yourself",
    ],
  ],
  [
    "trip_details",
    3,
    [
      "tell me about",
      "tell me more",
      "more about",
      "details",
      "detail",
      "information",
      "info",
      "overview",
      "describe",
      "highlights",
      "whats special",
      "what is special",
      "explain",
      "how many days",
      "how many nights",
      "duration",
      "how long",
      "number of days",
      "trip length",
    ],
  ],
];

const GREETING_WORDS = new Set([
  "hi",
  "hii",
  "hiii",
  "hiiii",
  "hello",
  "helo",
  "hello",
  "hey",
  "heyy",
  "hai",
  "namaskara",
  "namaskar",
  "namaste",
  "namasthe",
  "vanakkam",
  "hola",
  "yo",
  "greetings",
  "ನಮಸ್ಕಾರ",
  "नमस्ते",
]);
const GREETING_PHRASES = ["good morning", "good afternoon", "good evening", "good day"];
const ACK_WORDS = new Set(["ok", "okay", "k", "kk", "cool", "great", "nice", "fine", "sure", "alright", "perfect", "super", "sari", "seri", "accha", "acha", "got", "it", "hmm", "yes", "yeah", "yep", "no", "nope", "awesome", "wow", "good"]);

/** Ties go to the intent that comes first here. */
const PRIORITY: Intent[] = [
  "my_booking",
  "cancellation",
  "private_car",
  "big_group",
  "women_only",
  "room_sharing",
  "how_to_book",
  "pickup",
  "itinerary",
  "meals",
  "stay",
  "inclusions",
  "packing",
  "weather",
  "difficulty",
  "safety",
  "solo",
  "payment",
  "coupons",
  "offers",
  "seats",
  "dates",
  "price",
  "vehicle",
  "contact",
  "about",
  "trip_details",
  "list_trips",
  "thanks",
  "bye",
  "ack",
  "greeting",
];

/** Questions about these can be asked again for another trip / date ("what about Hampi?"). */
const FOLLOWABLE = new Set<Intent>([
  "price",
  "dates",
  "seats",
  "women_only",
  "private_car",
  "pickup",
  "itinerary",
  "inclusions",
  "meals",
  "stay",
  "packing",
  "difficulty",
  "weather",
  "trip_details",
  "how_to_book",
  "vehicle",
  "safety",
  "room_sharing",
]);

/** Two of these in one question ("price and dates") are both answered. */
const COMBINABLE = new Set<Intent>([
  "price",
  "dates",
  "seats",
  "pickup",
  "itinerary",
  "inclusions",
  "meals",
  "stay",
  "packing",
  "weather",
  "difficulty",
  "women_only",
  "private_car",
  "cancellation",
  "payment",
]);
const FAMILY: Partial<Record<Intent, string>> = { dates: "dep", seats: "dep", inclusions: "inc", meals: "inc", stay: "inc" };

const STOPWORDS = new Set(
  (
    "a an the is are am was were be been being i me my mine we us our ours you your yours u ur it its this that these those there here " +
    "to for of in on at by with and or but so do does did done can could will would shall should may might must have has had " +
    "what whats which who whom when where why how hows wheres any some all please pls plz kindly tell know want need like about also " +
    "just if then than too very much many more ok okay yes no not sir madam mam maam bro dear hi hello hey trip trips get got give show " +
    "let im id ill ive dont isnt doesnt cant wont go going from up out as into now right currently still really actually exactly " +
    "possible guide anna akka ji hai kya ka ki ke se ko mein me nahi na illa ide beku alli enu yenu en yen hege heg maadi madi kodi helri heli " +
    "sanchari sanchari's again one thing things there's theres them they their he she his her"
  ).split(" ")
);

/** Places people ask about that we do not run to (only used when no trip of ours matches). */
const NOT_SERVED_PLACES = [
  "ooty",
  "goa",
  "wayanad",
  "munnar",
  "mysore",
  "mysuru",
  "kodaikanal",
  "pondicherry",
  "puducherry",
  "kerala",
  "alleppey",
  "alappuzha",
  "varkala",
  "kochi",
  "cochin",
  "sakleshpur",
  "dandeli",
  "udupi",
  "murudeshwar",
  "agumbe",
  "badami",
  "nandi hills",
  "bandipur",
  "kabini",
  "shimoga",
  "shivamogga",
  "jog falls",
  "kudremukh",
  "karwar",
  "manali",
  "shimla",
  "ladakh",
  "leh",
  "kashmir",
  "rishikesh",
  "jaipur",
  "rajasthan",
  "himachal",
  "uttarakhand",
  "sikkim",
  "darjeeling",
  "meghalaya",
  "andaman",
  "lakshadweep",
  "tirupati",
  "yercaud",
  "coonoor",
  "horsley hills",
  "skandagiri",
  "dubai",
  "thailand",
  "bali",
  "vietnam",
  "nepal",
  "bhutan",
  "sri lanka",
  "maldives",
  "singapore",
  "europe",
  "kodachadri",
  "gokak",
  "belur",
  "halebidu",
  "shravanabelagola",
  "bidar",
  "bijapur",
  "vijayapura",
  "mangalore",
  "mangaluru",
];

interface CompiledRule {
  intent: Intent;
  weight: number;
  phrases: string[][];
}

const COMPILED: CompiledRule[] = RULE_TABLE.map(([intent, weight, list]) => ({
  intent,
  weight,
  phrases: list.map((s) => tokenize(normalize(s))).filter((p) => p.length > 0),
}));

function phraseAt(tokens: string[], phrase: string[], i: number): boolean {
  if (i + phrase.length > tokens.length) return false;
  if (phrase.length === 1) {
    const w = phrase[0];
    const t = tokens[i];
    return t === w || (w.length >= 8 && fuzzyWordEq(t, w));
  }
  for (let k = 0; k < phrase.length; k++) if (tokens[i + k] !== phrase[k]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Reading a question
// ---------------------------------------------------------------------------

interface Flags {
  cheapest: boolean;
  priciest: boolean;
  drop: boolean;
  kids: boolean;
  seniors: boolean;
  bestTime: boolean;
  veg: boolean;
  creator: boolean;
  otherPayment: boolean;
  luggage: boolean;
  tickets: boolean;
  women: boolean;
  /** A man is in the party ("2 guys", "me and my wife", "couple"): women-only dates are not for them. */
  male: boolean;
  solo: boolean;
  allScope: boolean;
  wantsNext: boolean;
  followUpShape: boolean;
  greeting: boolean;
  onlyAck: boolean;
}

interface Parsed {
  raw: string;
  norm: string;
  tokens: string[];
  scores: Map<Intent, number>;
  covered: Set<number>;
  mentioned: KbTrip[];
  /** A place we do not run a trip to, and where our trip plans mention it (if they do). */
  unknownPlace: { name: string; seenIn: Array<{ trip: KbTrip; where: string }>; guessed?: boolean } | null;
  /** Intent → the phrases that matched it (to tell "kids" from "trekking" for difficulty). */
  matched: Map<Intent, string[]>;
  /** Where in the question each intent was first named (for answering two things in the asked order). */
  firstPos: Map<Intent, number>;
  people: number | null;
  dateFilter: DateFilter | null;
  codeMatch: { trip: KbTrip; dep: KbDeparture } | null;
  dayNumber: number | null;
  flags: Flags;
}

function matchTrips(norm: string, tokens: string[], kb: KnowledgeBase, covered?: Set<number>): KbTrip[] {
  const scored: Array<{ trip: KbTrip; score: number }> = [];
  for (const trip of kb.trips) {
    let best = 0;
    for (const alias of trip.aliases) {
      const parts = alias.split(" ");
      if (parts.length > 1) {
        if (hasPhrase(norm, alias)) {
          best = Math.max(best, 1);
          if (covered) {
            for (let i = 0; i + parts.length <= tokens.length; i++) {
              if (parts.every((p, k) => tokens[i + k] === p)) for (let k = 0; k < parts.length; k++) covered.add(i + k);
            }
          }
        }
        continue;
      }
      tokens.forEach((t, i) => {
        if (t === alias) {
          best = Math.max(best, 1);
          covered?.add(i);
        } else if (alias.length >= 5 && fuzzyWordEq(t, alias)) {
          best = Math.max(best, 0.85);
          covered?.add(i);
        }
      });
    }
    tokens.forEach((t, i) => {
      if (trip.keywords.includes(t)) {
        best = Math.max(best, 0.6);
        covered?.add(i);
      }
    });
    if (best > 0) scored.push({ trip, score: best });
  }
  if (scored.length === 0) return [];
  const top = Math.max(...scored.map((s) => s.score));
  const cut = top >= 0.85 ? 0.85 : 0.6;
  return scored.filter((s) => s.score >= cut).map((s) => s.trip);
}

/** Where every trip starts; never a "place we don't go". */
const HOME_WORDS = new Set(["bangalore", "bengaluru", "bangaluru", "bengalooru", "blr", "karnataka", "india"]);

/**
 * A man is travelling ("2 guys", "me and my wife", "with my husband", "couple"). Women-only dates are then
 * left out of date lists and Book buttons (and the answer says so, in case the guess is wrong).
 */
const MALE_WORDS = new Set(
  (
    "guy guys boy boys men male males gents gentleman gentlemen husband hubby wife boyfriend couple couples brother brothers " +
    "father dad son sons uncle grandfather hudugaru huduga hudga ladke ladka mard"
  ).split(" ")
);

/** Difficulty words that are only about age (kids, parents). A price question with these is still a price question. */
const AGE_PHRASES = new Set(
  [
    "elderly",
    "senior",
    "seniors",
    "senior citizen",
    "senior citizens",
    "old age",
    "aged",
    "parents",
    "grandparents",
    "grandmother",
    "grandfather",
    "age",
    "age limit",
    "kids",
    "kid",
    "children",
    "child",
    "baby",
    "infant",
    "toddler",
    "year old",
    "years old",
    "yr old",
    "yrs old",
    "old people",
    "elderly parents",
    "my mother",
    "my father",
    "my mom",
    "my dad",
    "my parents",
    "my grandmother",
    "my grandfather",
  ].map((s) => tokenize(normalize(s)).join(" "))
);

/** Old and new spellings of the same place. */
const PLACE_VARIANTS: Record<string, string[]> = {
  mysore: ["mysore", "mysuru"],
  mysuru: ["mysore", "mysuru"],
  mangalore: ["mangalore", "mangaluru"],
  mangaluru: ["mangalore", "mangaluru"],
  shimoga: ["shimoga", "shivamogga"],
  shivamogga: ["shimoga", "shivamogga"],
  bijapur: ["bijapur", "vijayapura"],
  vijayapura: ["bijapur", "vijayapura"],
  pondicherry: ["pondicherry", "puducherry"],
  puducherry: ["pondicherry", "puducherry"],
  alleppey: ["alleppey", "alappuzha"],
  alappuzha: ["alleppey", "alappuzha"],
  kochi: ["kochi", "cochin"],
  cochin: ["kochi", "cochin"],
};

const titleCase = (s: string) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** Places named in the question that are not one of our trips (and where, if anywhere, our plans mention them). */
function findUnknownPlace(raw: string, norm: string, tokens: string[], kb: KnowledgeBase): Parsed["unknownPlace"] {
  for (const place of NOT_SERVED_PLACES) {
    const hit = place.includes(" ")
      ? hasPhrase(norm, place)
      : tokens.some((t) => t === place || (place.length >= 6 && !HOME_WORDS.has(t) && fuzzyWordEq(t, place) && editDistance(t, place, 1) <= 1));
    if (!hit) continue;
    const variants = PLACE_VARIANTS[place] ?? [place];
    if (kb.trips.some((t) => variants.some((v) => t.aliases.includes(v)))) continue;
    const seenIn: Array<{ trip: KbTrip; where: string }> = [];
    for (const t of kb.trips) {
      const d = t.itinerary.find((x) => variants.some((v) => hasPhrase(normalize(`${x.title} ${x.description}`), v)));
      if (d) seenIn.push({ trip: t, where: `Day ${d.day}: ${d.title}` });
    }
    // Named somewhere else on a trip (e.g. a pickup on "Mysore Road"): not a place question we can call wrong.
    if (!seenIn.length && kb.trips.some((t) => variants.some((v) => hasPhrase(t.haystack, v)))) continue;
    return { name: titleCase(place), seenIn };
  }
  // "trip to Kemmangundi": only a word that looks like a place name (written with a capital letter, or
  // ending like a Karnataka place name), never "a trip to remember" / "trip to celebrate". It is a guess,
  // so the answer stays below ENGINE_CONFIDENT and the AI layer (when on) may answer instead.
  const m = norm.match(/\b(?:trip|trips|tour|tours|package|travel|travelling|traveling|go|going|visit|visiting|ride|drive)\s+to\s+([a-z]{4,})\b/);
  if (m) {
    const word = m[1];
    const generic =
      STOPWORDS.has(word) ||
      isMonthToken(word) ||
      readNumber(word) !== null ||
      COMPILED.some((r) => r.phrases.some((p) => p.includes(word))) ||
      kb.trips.some((t) => t.aliases.includes(word) || t.keywords.includes(word)) ||
      NOT_PLACE_WORDS.has(word);
    const capitalised = new RegExp(`\\bto\\s+${word.charAt(0).toUpperCase()}${word.slice(1)}\\b`).test(raw);
    const placeLike = PLACE_ENDINGS.test(word);
    if (!generic && (capitalised || placeLike)) {
      // "trip to Chitradurga": not a trip of ours, but our Hampi and Gokarna drives pass through it.
      const seenIn: Array<{ trip: KbTrip; where: string }> = [];
      for (const t of kb.trips) {
        const d = t.itinerary.find((x) => hasPhrase(normalize(`${x.title} ${x.description}`), word));
        if (d) seenIn.push({ trip: t, where: `Day ${d.day}: ${d.title}` });
      }
      if (seenIn.length) return { name: titleCase(word), seenIn };
      if (!kb.trips.some((t) => hasPhrase(t.haystack, word))) return { name: titleCase(word), seenIn: [], guessed: true };
    }
  }
  return null;
}

/** Words that follow "trip to" / "go to" but are not places. */
const NOT_PLACE_WORDS = new Set(
  (
    "book pay join reach know see check start stay explore enjoy travel relax chill places place somewhere anywhere nature hills beach beaches " +
    "mountains mountain temple temples forest forests coast remember celebrate unwind escape refresh relaxing celebrating spend make take have " +
    "meet visit watch learn feel experience discover remember forget bring carry with along your their friends family office work home ask"
  ).split(" ")
);

/** Endings common in South Indian place names (Chitradurga, Kemmangundi, Sakleshpur, Tumkur, Madikeri…). */
const PLACE_ENDINGS = /(?:pura|puram|pur|halli|giri|betta|kere|nagar|nagara|abad|gudi|gundi|gad|garh|kote|pete|palya|hatti|wada|durga|durg|ghat|ghats|bad|ooru|uru|kal|patna|patnam|ambur)$/;

function parseQuestion(raw: string, kb: KnowledgeBase): Parsed {
  const norm = normalize(raw);
  const tokens = tokenize(norm);
  const covered = new Set<number>();
  const scores = new Map<Intent, number>();
  const firstPos = new Map<Intent, number>();
  const matched = new Map<Intent, string[]>();

  for (const rule of COMPILED) {
    let hits = 0;
    for (const phrase of rule.phrases) {
      for (let i = 0; i < tokens.length; i++) {
        if (phraseAt(tokens, phrase, i)) {
          hits++;
          for (let k = 0; k < phrase.length; k++) covered.add(i + k);
          if (!firstPos.has(rule.intent) || i < (firstPos.get(rule.intent) ?? Infinity)) firstPos.set(rule.intent, i);
          matched.set(rule.intent, [...(matched.get(rule.intent) ?? []), phrase.join(" ")]);
        }
      }
    }
    if (hits > 0) {
      const score = rule.weight + Math.min(1, 0.3 * (hits - 1));
      scores.set(rule.intent, Math.max(scores.get(rule.intent) ?? 0, score));
    }
  }
  // A very short "number?" / "your address" is about contacting us.
  if (!scores.size && tokens.length <= 3) {
    tokens.forEach((t, i) => {
      if (t === "number" || t === "address" || t === "support") {
        scores.set("contact", 3);
        covered.add(i);
      }
    });
  }

  // "how much walking / time / luggage" is not about money.
  if (/\bhow much (walk|walking|time|luggage|baggage|bag|bags|drive|driving|distance|km|hours?|rain|trek|trekking|weight|space)\b/.test(norm)) {
    const p = (scores.get("price") ?? 0) - 3;
    if (p > 0) scores.set("price", p);
    else scores.delete("price");
  }
  // "what time" is about pickup only when no other topic explains it.
  if (scores.has("pickup") && /\bwhat time\b|\bwhich time\b|\btimings?\b/.test(norm) && !/\b(pick ?up|pickup|leave|start|board|reporting|depart)\w*/.test(norm)) {
    const others = [...scores.entries()].filter(([k, v]) => k !== "pickup" && v >= 3);
    if (others.length) scores.set("pickup", 1);
  }

  const mentioned = matchTrips(norm, tokens, kb, covered);
  const people = parseHeadcount(tokens, isMonthToken, ordinalOnlyNumbers(raw));
  const dateFilter = parseDateFilter(raw, norm, tokens, kb.today);
  if (dateFilter) {
    scores.set("dates", (scores.get("dates") ?? 0) + 1.5);
    tokens.forEach((t, i) => {
      if (isMonthToken(t) || /^\d{1,4}$/.test(t) || ["weekend", "week", "month", "today", "tomorrow", "christmas", "xmas", "new", "year", "next", "this", "coming", "may"].includes(t)) {
        covered.add(i);
      }
    });
  }
  if (people !== null) {
    tokens.forEach((t, i) => {
      if (
        readNumber(t) !== null ||
        ["people", "persons", "person", "pax", "adults", "adult", "members", "family", "group", "couple", "couples", "friends", "us", "of", "seats", "travellers", "travelers", "solo", "alone", "wife", "husband", "partner", "girlfriend", "boyfriend", "fiance", "fiancee", "duo", "trio", "pair", "guys", "boys", "girls", "ladies", "gents", "men", "women", "kids", "kid", "children", "child", "infant", "baby", "colleagues"].includes(t)
      ) {
        covered.add(i);
      }
    });
  }

  let greeting = false;
  tokens.forEach((t, i) => {
    if (GREETING_WORDS.has(t)) {
      greeting = true;
      covered.add(i);
    }
  });
  for (const g of GREETING_PHRASES) if (hasPhrase(norm, g)) greeting = true;
  const name = normalize(kb.assistant.guideName);
  tokens.forEach((t, i) => {
    if (t === name || HOME_WORDS.has(t)) covered.add(i);
  });

  // Departure code typed in ("SAN-CKM-DEC04")
  let codeMatch: Parsed["codeMatch"] = null;
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const trip of kb.trips) {
    for (const dep of trip.departures) {
      const code = dep.code.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (code.length >= 6 && compact.includes(code)) codeMatch = { trip, dep };
    }
  }

  let dayNumber: number | null = null;
  const dm = norm.match(/\bday (\d{1,2}|one|two|three|four|five|six)\b/);
  if (dm) dayNumber = readNumber(dm[1]);
  else if (/\bfirst day\b/.test(norm)) dayNumber = 1;
  else if (/\bsecond day\b/.test(norm)) dayNumber = 2;
  else if (/\bthird day\b/.test(norm)) dayNumber = 3;
  else if (/\blast day\b/.test(norm)) dayNumber = -1;

  const has = (re: RegExp) => re.test(norm);
  const flags: Flags = {
    cheapest: has(/\b(cheapest|cheaper|lowest|least expensive|budget|affordable|low cost|cheap)\b/),
    priciest: has(/\b(most expensive|costliest|priciest|highest price)\b/),
    drop: has(/\bdrop/),
    kids: has(/\b(kids?|children|child|baby|babies|infants?|toddlers?|age|age limit|minor|minors|years old|year old)\b/),
    seniors: has(/\b(seniors?|elderly|old age|aged|parents|grandparents?|grandmother|grandfather|senior citizens?)\b/),
    bestTime: has(/\b(best time|best season|season|when to visit|when to go|good time to visit|ideal time)\b/),
    veg: has(/\b(veg|vegetarian|vegan|jain|non veg|nonveg|allergy|allergies|gluten)\b/),
    creator: has(/\b(creators?|influencers?|youtuber|blogger|vlogger|instagrammer|collab|collaboration|sponsor|sponsored|barter|free trip|free seat)\b/),
    otherPayment: has(/\b(emi|cash|credit card|debit card|card|cards|net banking|netbanking|cheque|installments?|instalments?)\b/),
    luggage: has(/\b(luggage|baggage|bags?|suitcases?)\b/),
    tickets: has(/\b(entry|tickets?|entrance|fees?|permits?|tolls?)\b/),
    women: scores.has("women_only"),
    male: tokens.some((t) => MALE_WORDS.has(t)),
    solo: scores.has("solo") || people === 1,
    allScope: has(/\b(all trips|all your trips|all the trips|every trip|any trip|other trips|which trips|what trips|all places|all destinations|trips are coming|trips coming|each trip)\b/),
    wantsNext: has(/\b(next|soonest|earliest|nearest|upcoming|coming up|first available)\b/),
    followUpShape: /^(and|also|what about|how about|same for|then|for|in|on|plus|ok and|okay and|but)\b/.test(norm) || tokens.length <= 3,
    greeting,
    onlyAck: tokens.length > 0 && tokens.length <= 4 && tokens.every((t) => ACK_WORDS.has(t)),
  };

  return {
    raw,
    norm,
    tokens,
    scores,
    covered,
    mentioned,
    unknownPlace: mentioned.length === 0 ? findUnknownPlace(raw, norm, tokens, kb) : null,
    matched,
    firstPos,
    people,
    dateFilter,
    codeMatch,
    dayNumber,
    flags,
  };
}

function rankIntents(p: Parsed): Array<{ intent: Intent; score: number }> {
  return [...p.scores.entries()]
    .map(([intent, score]) => ({ intent, score }))
    .sort((a, b) => b.score - a.score || PRIORITY.indexOf(a.intent) - PRIORITY.indexOf(b.intent));
}

/** Words the engine did not understand, as a share of the meaningful words (1 = understood everything). */
function coverage(p: Parsed): { ratio: number; content: number; unknown: string[] } {
  const unknown: string[] = [];
  let content = 0;
  p.tokens.forEach((t, i) => {
    if (STOPWORDS.has(t)) return;
    content++;
    if (!p.covered.has(i)) unknown.push(t);
  });
  return { ratio: content === 0 ? 1 : (content - unknown.length) / content, content, unknown };
}

// ---------------------------------------------------------------------------
// FAQ matching
// ---------------------------------------------------------------------------

/** Words that mean the same thing in a FAQ question ("6 people" vs "six travelers"). */
const SAME_WORD: Record<string, string> = {
  people: "people",
  person: "people",
  persons: "people",
  pax: "people",
  traveller: "people",
  travellers: "people",
  traveler: "people",
  travelers: "people",
  guests: "people",
};

function stem(t: string): string {
  if (SAME_WORD[t]) return SAME_WORD[t];
  const n = readNumber(t);
  if (n !== null) return String(n);
  if (t.length > 4 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

function contentStems(tokens: string[]): string[] {
  return [...new Set(tokens.filter((t) => !STOPWORDS.has(t) || ["why", "solo", "alone"].includes(t)).map(stem))];
}

function bestFaq(p: Parsed, kb: KnowledgeBase): { faq: KnowledgeBase["faqs"][number]; dice: number } | null {
  const q = contentStems(p.tokens);
  if (q.length === 0) return null;
  let best: { faq: KnowledgeBase["faqs"][number]; dice: number } | null = null;
  for (const faq of kb.faqs) {
    const f = contentStems(tokenize(normalize(faq.question)));
    if (f.length === 0) continue;
    let matched = 0;
    for (const w of q) if (f.some((x) => x === w || (x.length >= 5 && editDistance(x, w, 1) <= 1))) matched++;
    const dice = (2 * matched) / (q.length + f.length);
    if (!best || dice > best.dice) best = { faq, dice };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Conversation context
// ---------------------------------------------------------------------------

function priorTurns(history: ChatTurn[] | undefined, question: string): ChatTurn[] {
  const turns = (history ?? []).filter((t) => t && typeof t.text === "string").slice(-CHAT_LIMITS.maxTurns);
  const last = turns[turns.length - 1];
  if (last && last.role === "user" && normalize(last.text) === normalize(question)) turns.pop();
  return turns;
}

function tripsFromHistory(turns: ChatTurn[], kb: KnowledgeBase): KbTrip[] {
  for (let i = turns.length - 1, seen = 0; i >= 0 && seen < 8; i--, seen++) {
    const turn = turns[i];
    const norm = normalize(turn.text);
    const found = matchTrips(norm, tokenize(norm), kb);
    if (turn.role === "user" && found.length > 0) return found;
    if (turn.role === "guide" && found.length === 1) return found;
  }
  return [];
}

function previousIntent(turns: ChatTurn[], kb: KnowledgeBase): Intent | null {
  let checked = 0;
  for (let i = turns.length - 1; i >= 0 && checked < 3; i--) {
    if (turns[i].role !== "user") continue;
    checked++;
    const p = parseQuestion(turns[i].text.slice(0, CHAT_LIMITS.maxQuestionChars), kb);
    const top = rankIntents(p)[0];
    // "which trips are there in December" was a dates question.
    if (top && top.intent === "list_trips" && p.dateFilter) return "dates";
    if (top && top.score >= 1.5 && FOLLOWABLE.has(top.intent)) return top.intent;
    if (p.people !== null && !top) return "price";
  }
  return null;
}

/** Follow-ups that keep the earlier head count / dates. */
const CARRY_PEOPLE = new Set<Intent>(["price", "dates", "seats", "private_car", "how_to_book"]);
const CARRY_DATES = new Set<Intent>(["price", "dates", "seats", "private_car", "women_only", "how_to_book"]);

/** Head count and dates from the visitor's last two messages (newest first). */
function previousSlots(turns: ChatTurn[], kb: KnowledgeBase): { people: number | null; dateFilter: DateFilter | null } {
  let people: number | null = null;
  let dateFilter: DateFilter | null = null;
  let checked = 0;
  for (let i = turns.length - 1; i >= 0 && checked < 2; i--) {
    if (turns[i].role !== "user") continue;
    checked++;
    const q = parseQuestion(turns[i].text.slice(0, CHAT_LIMITS.maxQuestionChars), kb);
    if (people === null && q.people !== null) people = q.people;
    if (!dateFilter && q.dateFilter) dateFilter = q.dateFilter;
  }
  return { people, dateFilter };
}

/** The visitor said a man is travelling in one of their last three messages. */
function previousMale(turns: ChatTurn[]): boolean {
  let checked = 0;
  for (let i = turns.length - 1; i >= 0 && checked < 3; i--) {
    if (turns[i].role !== "user") continue;
    checked++;
    if (tokenize(normalize(turns[i].text.slice(0, CHAT_LIMITS.maxQuestionChars))).some((t) => MALE_WORDS.has(t))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Facts → words
// ---------------------------------------------------------------------------

const PRIVATE_SEATS = 6;

interface Ctx {
  kb: KnowledgeBase;
  p: Parsed;
  /** Trips the question is about (named, from the conversation, or the page). Empty = all / none. */
  trips: KbTrip[];
  tripSource: "question" | "history" | "page" | "none";
}

interface Draft {
  text: string;
  cards?: AnswerCard[];
  actions?: AnswerAction[];
  suggestions?: string[];
  emotion: GuideEmotion;
  confidence: number;
  intent?: string;
  tripSlugs?: string[];
}

function money(paise: number): string {
  return formatINR(paise);
}

/** Show the year only when a date is far enough away to be confused with this year's. */
function needsYear(kb: KnowledgeBase, iso: string): boolean {
  const t = splitISO(kb.today);
  const d = splitISO(iso);
  return d.y !== t.y && (d.m >= t.m || d.y > t.y + 1);
}

function day(kb: KnowledgeBase, iso: string): string {
  return fmtDay(iso, needsYear(kb, iso));
}

function range(kb: KnowledgeBase, dep: KbDeparture): string {
  return fmtRange(dep.startDate, dep.endDate, needsYear(kb, dep.endDate));
}

function seatsText(dep: KbDeparture): string {
  if (dep.soldOut) return "sold out (waitlist open)";
  if (dep.seatsRemaining === 1) return "only 1 seat left";
  if (dep.seatsRemaining === 2) return "only 2 seats left";
  return `${dep.seatsRemaining} of ${dep.maxCapacity} seats open`;
}

function quote(kb: KnowledgeBase, trip: KbTrip, unitPaise: number, mode: "batch_seats" | "private_vehicle", seats: number) {
  return calculateBookingPricing({
    trip: {
      basePricePaise: unitPaise,
      privateGroupPricePaise: trip.privateGroupPricePaise,
      privateDiscountPercent: trip.privateDiscountPercent,
      depositPercent: trip.tripDepositPercent,
      balanceDueDaysBefore: trip.balanceDueDaysBefore,
    },
    priceOverridePaise: null,
    bookingMode: mode,
    seatsRequested: mode === "private_vehicle" ? PRIVATE_SEATS : seats,
    payDepositOnly: false,
    bookingPolicy: {
      taxRatePercent: kb.policy.taxRatePercent,
      allowDepositCheckout: kb.policy.depositAllowed,
      depositPercent: kb.policy.depositPercent ?? 0,
      balanceDueDaysBefore: kb.policy.balanceDueDaysBefore,
    },
  });
}

/** "₹66,900 (fixed whole-car price; 6 seats separately: ₹74,400)" — says exactly how the price is made. */
function privateExplain(trip: KbTrip, unitPaise: number): string {
  const full = unitPaise * PRIVATE_SEATS;
  if (trip.privateGroupPricePaise !== null && trip.privateGroupPricePaise >= 0 && trip.privateGroupPricePaise <= full) {
    return `fixed whole-car price; 6 seats separately would be ${money(full)}`;
  }
  if (trip.privateDiscountPercent > 0) return `6 × ${money(unitPaise)} = ${money(full)}, minus ${trip.privateDiscountPercent}% for the whole car`;
  return `6 × ${money(unitPaise)}`;
}

function taxLine(kb: KnowledgeBase, taxPaise: number, totalPaise: number): string {
  if (kb.policy.taxRatePercent <= 0 || taxPaise <= 0) return "";
  return ` + ${money(taxPaise)} tax (${kb.policy.taxRatePercent}%) = **${money(totalPaise)}**`;
}

/** Next date to offer. `male`: women-only dates are not offered (a man is in the party). */
function nextDeparture(trip: KbTrip, male = false): KbDeparture | null {
  const ok = (d: KbDeparture) => !(male && d.womenOnly);
  return trip.departures.find((d) => d.bookingOpen && !d.soldOut && ok(d)) ?? trip.departures.find((d) => !d.started && ok(d)) ?? null;
}

/** " · women-only" after a date that only women can book. */
function womenTag(dep: KbDeparture, text = " · women-only"): string {
  return dep.womenOnly ? text : "";
}

/** Can this party book this date? Women-only dates are not for a party with a man in it. */
function joinable(c: Ctx, dep: KbDeparture): boolean {
  return !(dep.womenOnly && c.p.flags.male);
}

/** "**Fri 11 Dec** (Coorg) is a women-only batch, so only women can book it." */
function womenLeftOut(kb: KnowledgeBase, left: Pick[]): string {
  const list = uniq(left, (x) => x.dep.departureId);
  if (!list.length) return "";
  const names = list.slice(0, 3).map((x) => `**${day(kb, x.dep.startDate)}** (${x.trip.shortName})`).join(", ");
  return list.length === 1
    ? `${names} is a women-only batch, so only women travellers can book it.`
    : `${names} are women-only batches, so only women travellers can book them.`;
}

/** "next Fri 11 Dec (6 of 6 seats open · women-only)", or why there is none for this party. */
function nextDateText(c: Ctx, t: KbTrip): string {
  const { kb } = c;
  const male = c.p.flags.male;
  const open = t.departures.find((d) => d.bookingOpen && !d.soldOut && !(male && d.womenOnly));
  if (!open && male && t.departures.some((d) => d.bookingOpen && !d.soldOut && d.womenOnly)) return "only women-only dates open right now";
  const next = open ?? nextDeparture(t, male);
  if (next) return `next ${day(kb, next.startDate)} (${seatsText(next).replace(" (waitlist open)", ", waitlist open")}${womenTag(next)})`;
  return "no dates open right now";
}

function tripCard(trip: KbTrip, male = false): AnswerCard {
  const next = nextDeparture(trip, male);
  return {
    kind: "trip",
    slug: trip.slug,
    title: trip.title,
    destination: trip.destination,
    theme: trip.theme,
    imageUrl: trip.imageUrl,
    durationLabel: trip.durationLabel,
    difficulty: trip.difficulty,
    pricePaise: trip.basePricePaise,
    privatePricePaise: trip.privateCarPricePaise,
    next: next
      ? {
          departureId: next.departureId,
          startDate: next.startDate,
          endDate: next.endDate,
          seatsRemaining: next.seatsRemaining,
          maxCapacity: next.maxCapacity,
          womenOnly: next.womenOnly,
        }
      : null,
  };
}

function depCard(trip: KbTrip, dep: KbDeparture): AnswerCard {
  return {
    kind: "departure",
    tripSlug: trip.slug,
    tripTitle: trip.title,
    theme: trip.theme,
    departureId: dep.departureId,
    code: dep.code,
    startDate: dep.startDate,
    endDate: dep.endDate,
    seatsRemaining: dep.seatsRemaining,
    maxCapacity: dep.maxCapacity,
    pricePaise: dep.pricePaise,
    womenOnly: dep.womenOnly,
    privateCarPossible: dep.privateCarPossible && dep.bookingOpen,
  };
}

function careLine(kb: KnowledgeBase, lead = "For help"): string {
  const c = kb.contact;
  if (c.careNumber) return `${lead}, call customer care on **${c.careDisplay}**${c.careHours ? ` (${c.careHours})` : ""}.`;
  if (c.whatsappUrl) return `${lead}, message us on WhatsApp.`;
  return `${lead}, send us a note through the [enquiry form](/#plan).`;
}

function careActions(kb: KnowledgeBase): AnswerAction[] {
  const out: AnswerAction[] = [];
  if (kb.contact.careTel) out.push({ kind: "call", label: `Call ${kb.contact.careDisplay}`, tel: kb.contact.careTel });
  if (kb.contact.whatsappUrl) out.push({ kind: "whatsapp", label: "Chat on WhatsApp", href: kb.contact.whatsappUrl });
  return out;
}

function bookAction(kb: KnowledgeBase, dep: KbDeparture): AnswerAction {
  return { kind: "link", label: `Book ${day(kb, dep.startDate)}${dep.womenOnly ? " (women-only)" : ""}`, href: dep.bookUrl };
}

type Pick = { trip: KbTrip; dep: KbDeparture };

/** A day means trips that START that day (a trip already running cannot be joined midway); a range means start dates in it. */
function inFilter(dep: KbDeparture, f: DateFilter | null): boolean {
  if (!f) return true;
  if (f.kind === "day") return dep.startDate === f.date;
  return dep.startDate >= f.from && dep.startDate <= f.to;
}

/** "st", "nd", "rd", "th" for a day of the month. */
function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
}

/** Trips running (not starting) on the asked day: "Chikmagalur Fri 4 – Sun 6 Dec is already running on Sat 5 Dec". */
function runningOn(trips: KbTrip[], f: DateFilter | null): Pick[] {
  if (!f || f.kind !== "day") return [];
  const out: Pick[] = [];
  for (const trip of trips) for (const dep of trip.departures) if (dep.startDate < f.date && f.date <= dep.endDate) out.push({ trip, dep });
  return out;
}

/** Upcoming (not yet started) departures of these trips, soonest first. */
function departuresOf(trips: KbTrip[], filter: DateFilter | null = null): Pick[] {
  const out: Pick[] = [];
  for (const trip of trips) for (const dep of trip.departures) if (!dep.started && inFilter(dep, filter)) out.push({ trip, dep });
  return out.sort((a, b) => a.dep.startDate.localeCompare(b.dep.startDate) || a.trip.title.localeCompare(b.trip.title));
}

function depBullet(kb: KnowledgeBase, x: Pick, withTrip: boolean, extra = ""): string {
  const bits = [seatsText(x.dep)];
  if (x.dep.womenOnly) bits.push("women-only");
  if (x.dep.specialPrice) bits.push(`${money(x.dep.pricePaise)} per seat`);
  if (!x.dep.bookingOpen && !x.dep.soldOut) bits.push("online booking closed");
  return `- **${range(kb, x.dep)}**${withTrip ? ` · ${x.trip.shortName}` : ""}: ${bits.join(" · ")}${extra}`;
}

function uniq<T>(list: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function tripLabel(trips: KbTrip[]): string {
  return trips.length === 1 ? trips[0].shortName : "";
}

function askWhichTrip(c: Ctx, topic: string, suggestionFor: (t: KbTrip) => string): Draft {
  const { kb } = c;
  if (kb.trips.length === 0) return noTrips(kb);
  return {
    intent: "ask_trip",
    text: `Which trip would you like the ${topic} for?\n${kb.trips.map((t) => `- **${t.title}** (${t.shortName})`).join("\n")}`,
    cards: kb.trips.slice(0, 6).map((x) => tripCard(x, c.p.flags.male)),
    suggestions: kb.trips.slice(0, 4).map(suggestionFor),
    emotion: "pointing",
    confidence: 0.75,
  };
}

function noTrips(kb: KnowledgeBase): Draft {
  return {
    intent: "no_trips",
    text: `No trips are published on the website right now.\n${careLine(kb)}`,
    actions: careActions(kb),
    suggestions: ["Talk to customer care", "How do I plan a private trip?"],
    emotion: "sorry",
    confidence: 0.85,
  };
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

function answerGreeting(c: Ctx): Draft {
  const { kb } = c;
  return {
    text: `Namaskara! I'm ${kb.assistant.guideName}. Ask me about our trips, dates, seats left, prices, pickup points or booking — I answer from the live calendar.`,
    suggestions: kb.assistant.quickQuestions.slice(0, 4),
    emotion: "wave",
    confidence: 0.95,
  };
}

function answerThanks(c: Ctx, kind: "thanks" | "bye" | "ack"): Draft {
  const { kb } = c;
  if (kind === "bye") {
    return { text: "Bye for now — have a lovely day! I'm here whenever you want to plan a trip.", emotion: "wave", confidence: 0.95, suggestions: kb.assistant.quickQuestions.slice(0, 2) };
  }
  return {
    text: kind === "thanks" ? "You're welcome! Anything else about the trips I can check for you?" : "Sure! Anything else about the trips I can check for you?",
    suggestions: kb.assistant.quickQuestions.slice(0, 3),
    emotion: "happy",
    confidence: kind === "thanks" ? 0.95 : 0.7,
  };
}

function answerAbout(c: Ctx): Draft {
  const { kb } = c;
  const role = kb.assistant.guideRole.trim();
  const roleText = role ? `, ${role.charAt(0).toLowerCase()}${role.slice(1)}` : "";
  return {
    text: `I'm **${kb.assistant.guideName}**${roleText}. I'm the website's chat guide, not a person — I answer from our live trip calendar: trips, dates, seats, prices, pickup points and policies.\n${careLine(kb, "To talk to a person")}`,
    actions: careActions(kb),
    suggestions: ["Which trips are coming up?", "How do I book?", ...kb.assistant.quickQuestions.slice(0, 2)],
    emotion: "wave",
    confidence: 0.85,
  };
}

function answerListTrips(c: Ctx): Draft {
  const { kb } = c;
  if (kb.trips.length === 0) return noTrips(kb);
  const city = kb.trips[0].pickupCity;
  const lines = kb.trips.slice(0, 6).map((t) => `- **${t.title}** — ${t.durationLabel}, ${t.difficulty}, ${money(t.basePricePaise)} per seat · ${nextDateText(c, t)}`);
  return {
    intent: "list_trips",
    text: `We run ${kb.trips.length} ${kb.trips.length === 1 ? "trip" : "trips"} from ${city}:\n${lines.join("\n")}`,
    cards: kb.trips.slice(0, 6).map((x) => tripCard(x, c.p.flags.male)),
    actions: [{ kind: "link", label: "See all trips", href: "/trips" }],
    suggestions: [`${kb.trips[0].shortName} dates`, "Can I book the whole car?", "Where are the pickup points?", "How do I book?"],
    emotion: "pointing",
    confidence: 0.9,
    tripSlugs: [],
  };
}

function answerTripDetails(c: Ctx): Draft {
  const { kb } = c;
  const trips = c.trips;
  if (trips.length === 0) return answerListTrips(c);
  if (trips.length > 1) {
    const lines = trips.slice(0, 4).map((t) => `- **${t.title}**: ${t.durationLabel}, ${t.difficulty}, ${money(t.basePricePaise)} per seat · ${nextDateText(c, t)}`);
    return {
      text: `Here's how they compare:\n${lines.join("\n")}`,
      cards: trips.slice(0, 4).map((x) => tripCard(x, c.p.flags.male)),
      suggestions: trips.slice(0, 2).map((t) => `What's included in ${t.shortName}?`).concat([`${trips[0].shortName} itinerary`]),
      emotion: "pointing",
      confidence: 0.8,
    };
  }
  const t = trips[0];
  const next = nextDeparture(t, c.p.flags.male);
  const womenOnlyNext = !next && c.p.flags.male ? nextDeparture(t) : null;
  const lines = [
    `**${t.title}** — ${t.destination}`,
    t.tagline ? t.tagline : "",
    `- ${t.durationLabel} · ${t.difficulty} · **${money(t.basePricePaise)} per seat** (whole car ${money(t.privateCarPricePaise)})`,
    next
      ? `- Next date: **${range(kb, next)}** — ${seatsText(next)}${womenTag(next, " · women-only batch (only women can book it)")}`
      : womenOnlyNext
        ? `- The only open date, **${range(kb, womenOnlyNext)}**, is a women-only batch (only women can book it).`
        : "- No upcoming dates are open right now.",
  ].filter(Boolean);
  const actions: AnswerAction[] = [{ kind: "link", label: "Open trip page", href: t.url }];
  if (next && next.bookingOpen && !next.soldOut) actions.unshift(bookAction(kb, next));
  return {
    text: lines.join("\n"),
    cards: [tripCard(t, c.p.flags.male)],
    actions,
    suggestions: [`${t.shortName} itinerary`, `What's included in ${t.shortName}?`, `Pickup points for ${t.shortName}`, `All ${t.shortName} dates`],
    emotion: "pointing",
    confidence: 0.85,
  };
}

function answerPrice(c: Ctx): Draft {
  const { kb, p } = c;
  if (kb.trips.length === 0) return noTrips(kb);
  let trips = c.trips.length ? c.trips : kb.trips;
  const N = p.people;
  const maxBooking = kb.policy.maxSeatsPerBooking;

  if (!c.trips.length && (p.flags.cheapest || p.flags.priciest) && kb.trips.length > 1) {
    const sorted = [...kb.trips].sort((a, b) => a.basePricePaise - b.basePricePaise);
    const pick = p.flags.priciest ? sorted[sorted.length - 1] : sorted[0];
    const same = sorted.filter((t) => t.basePricePaise === pick.basePricePaise);
    trips = same;
  }

  const dep: Pick | null =
    p.codeMatch && trips.includes(p.codeMatch.trip)
      ? p.codeMatch
      : trips.length === 1 && p.dateFilter?.kind === "day"
        ? departuresOf(trips, p.dateFilter)[0] ?? null
        : null;

  const lines: string[] = [];
  const actions: AnswerAction[] = [];
  let emotion: GuideEmotion = "talking";

  if (N !== null && N > kb.policy.maxGroupSize) {
    return answerBigGroup(c);
  }

  const bullet = trips.length > 1 ? "- " : "";
  const multi = trips.length > 1;
  // Dates asked about ("in December", carried from earlier in the chat) narrow the dates that fit.
  const asked = dep ? null : p.dateFilter;
  const askedLabel = asked ? ` ${asked.label}` : "";
  const leftOut: Pick[] = [];
  /** Dates of `t` that pass `test` and the asked dates; women-only ones are set aside for a party with a man. */
  const fitting = (t: KbTrip, test: (d: KbDeparture) => boolean): KbDeparture[] => {
    const all = t.departures.filter((d) => d.bookingOpen && test(d) && inFilter(d, asked));
    for (const d of all) if (!joinable(c, d)) leftOut.push({ trip: t, dep: d });
    return all.filter((d) => joinable(c, d));
  };
  /** What to say about a date that is women-only. */
  const womenDateNote = (d: KbDeparture) =>
    !d.womenOnly ? "" : joinable(c, d) ? " It's a women-only batch (only women travellers)." : " It's a women-only batch, so only women travellers can book it.";

  for (const t of trips.slice(0, 4)) {
    const unit = dep && dep.trip === t ? dep.dep.pricePaise : t.basePricePaise;
    const when = dep && dep.trip === t ? ` on ${day(kb, dep.dep.startDate)}` : "";
    const extra: string[] = [];
    const onDate = dep && dep.trip === t ? dep.dep : null;
    const canBook = (d: KbDeparture) => joinable(c, d);
    if (N === null) {
      const priv = onDate ? onDate.privateCarPricePaise : t.privateCarPricePaise;
      lines.push(`${bullet}**${t.title}**${when}: **${money(unit)} per seat** · whole car (all 6 seats) ${money(priv)}`);
      if (onDate) {
        extra.push(`That date: ${seatsText(onDate)}${onDate.bookingOpen ? "" : " (online booking closed)"}.${womenDateNote(onDate)}`);
        if (onDate.bookingOpen && !onDate.soldOut && canBook(onDate)) {
          actions.push(bookAction(kb, onDate));
          emotion = "happy";
        }
      } else {
        const specials = t.departures.filter((d) => !d.started && d.specialPrice).slice(0, 3);
        if (specials.length) {
          extra.push(
            `Some ${t.shortName} dates are priced differently: ${specials.map((d) => `${day(kb, d.startDate)} ${money(d.pricePaise)}${womenTag(d, " (women-only)")}`).join(", ")}.`
          );
        }
      }
    } else if (N <= maxBooking && onDate) {
      const b = quote(kb, t, unit, "batch_seats", N);
      lines.push(`${bullet}**${t.title}**${when}: for **${N} ${N === 1 ? "person" : "people"}**, ${N} × ${money(unit)} = **${money(b.subtotalPaise)}**${taxLine(kb, b.taxPaise, b.totalPaise)}`);
      if (onDate.bookingOpen && onDate.seatsRemaining >= N) {
        extra.push(`That date has ${onDate.seatsRemaining} of ${onDate.maxCapacity} seats free.${womenDateNote(onDate)}`);
        if (canBook(onDate)) {
          actions.push(bookAction(kb, onDate));
          emotion = "happy";
        } else emotion = "sorry";
      } else if (onDate.soldOut) extra.push("That date is sold out (waitlist open on the trip page).");
      else if (!onDate.bookingOpen) extra.push("Online booking for that date has closed.");
      else extra.push(`That date has only ${onDate.seatsRemaining} ${onDate.seatsRemaining === 1 ? "seat" : "seats"} left.${womenDateNote(onDate)}`);
    } else if (N > maxBooking && onDate) {
      const priv = quote(kb, t, unit, "private_vehicle", PRIVATE_SEATS);
      lines.push(
        `${bullet}**${t.title}**${when}: for **${N} people** book the whole car — **${money(priv.subtotalPaise - priv.discountPaise)}** (${privateExplain(t, unit)})${taxLine(kb, priv.taxPaise, priv.totalPaise)}`
      );
      if (onDate.bookingOpen && onDate.privateCarPossible) {
        extra.push(`The whole car is still free on that date.${womenDateNote(onDate)}`);
        if (canBook(onDate)) {
          actions.push(bookAction(kb, onDate));
          emotion = "happy";
        } else emotion = "sorry";
      } else extra.push("The whole car isn't free on that date (some seats are taken or booking has closed).");
    } else if (N <= maxBooking) {
      const b = quote(kb, t, unit, "batch_seats", N);
      lines.push(`${bullet}**${t.title}**${when}: for **${N} ${N === 1 ? "person" : "people"}**, ${N} × ${money(unit)} = **${money(b.subtotalPaise)}**${taxLine(kb, b.taxPaise, b.totalPaise)}`);
      const fit = fitting(t, (d) => d.seatsRemaining >= N);
      if (fit.length) {
        if (!multi) {
          extra.push(`Dates with ${N}+ seats free${askedLabel}: ${fit.slice(0, 3).map((d) => `${day(kb, d.startDate)} (${d.seatsRemaining} left${womenTag(d)})`).join(", ")}.`);
          actions.push(bookAction(kb, fit[0]));
        } else lines[lines.length - 1] += ` · ${N}+ seats free on ${fit.slice(0, 2).map((d) => `${day(kb, d.startDate)}${womenTag(d, " (women-only)")}`).join(", ")}`;
        emotion = "happy";
      } else if (!multi) extra.push(`No ${t.shortName} date${askedLabel} has ${N} seats free right now.`);
      else lines[lines.length - 1] += ` · no date${askedLabel} has ${N} seats free right now`;
    } else {
      // A full car: the whole-car option.
      const priv = quote(kb, t, unit, "private_vehicle", PRIVATE_SEATS);
      lines.push(
        `${bullet}**${t.title}**${when}: for **${N} people** book the whole car — **${money(priv.subtotalPaise - priv.discountPaise)}** (${privateExplain(t, unit)})${taxLine(kb, priv.taxPaise, priv.totalPaise)}`
      );
      const free = fitting(t, (d) => d.privateCarPossible);
      if (free.length) {
        if (!multi) {
          extra.push(`Dates with the whole car free${askedLabel}: ${free.slice(0, 3).map((d) => `${day(kb, d.startDate)}${womenTag(d, " (women-only)")}`).join(", ")}.`);
          actions.push(bookAction(kb, free[0]));
        } else lines[lines.length - 1] += ` · whole car free on ${free.slice(0, 2).map((d) => `${day(kb, d.startDate)}${womenTag(d, " (women-only)")}`).join(", ")}`;
        emotion = "happy";
      } else if (!multi) extra.push(`No ${t.shortName} date${askedLabel} has all 6 seats free right now.`);
      else lines[lines.length - 1] += ` · no date${askedLabel} has the whole car free right now`;
    }
    if (!onDate && N !== null) {
      const specials = t.departures.filter((d) => !d.started && d.specialPrice).slice(0, 3);
      if (specials.length) {
        extra.push(
          `That uses the usual seat price; some dates differ: ${specials.map((d) => `${day(kb, d.startDate)} ${money(d.pricePaise)} per seat${womenTag(d, " (women-only)")}`).join(", ")}.`
        );
      }
    }
    if (!multi) lines.push(...extra);
    else if (!onDate && t.departures.some((d) => !d.started && d.specialPrice)) lines[lines.length - 1] += " (some dates are priced differently)";
  }
  if (trips.length > 4) lines.push(`- …and ${trips.length - 4} more on the [trips page](/trips).`);
  const left = womenLeftOut(kb, leftOut);
  if (left) lines.push(left);

  const header =
    !c.trips.length && p.flags.cheapest && kb.trips.length > 1
      ? "Our lowest seat price:"
      : !c.trips.length && p.flags.priciest && kb.trips.length > 1
        ? "Our highest seat price:"
        : multi
          ? N === null
            ? "Prices per seat:"
            : `For ${N} ${N === 1 ? "person" : "people"}${askedLabel}:`
          : "";
  if (kb.policy.taxRatePercent > 0 && N === null) lines.push(`Checkout adds ${kb.policy.taxRatePercent}% tax.`);
  // Families: every traveller takes a seat, and there is no age rule on record to quote.
  if (p.flags.kids && N !== null) lines.push("I've counted each child as one seat — there's no separate child price on record.");
  if (p.flags.kids || p.flags.seniors) {
    lines.push(`I don't have an age rule on record — please check before booking. ${careLine(kb)}`);
    actions.push(...careActions(kb));
  }
  if (trips.length === 1) actions.push({ kind: "link", label: "Open trip page", href: trips[0].url });

  const t0 = trips[0];
  return {
    text: [header, ...lines].filter(Boolean).join("\n"),
    cards: trips.slice(0, 4).map((x) => tripCard(x, c.p.flags.male)),
    actions,
    suggestions:
      trips.length === 1
        ? [`${t0.shortName} dates`, N === null ? "Price for 4 people?" : "Whole car price?", `What's included in ${t0.shortName}?`, "How do I book?"]
        : ["Price for 4 people?", "Can I book the whole car?", "Which dates have seats?", "What is included?"],
    emotion,
    confidence: 0.9,
    tripSlugs: trips.map((t) => t.slug),
  };
}

function answerDepartures(c: Ctx, mode: "dates" | "seats"): Draft {
  const { kb, p } = c;
  if (kb.trips.length === 0) return noTrips(kb);
  const trips = p.codeMatch ? [p.codeMatch.trip] : c.trips.length ? c.trips : kb.trips;
  const multi = trips.length > 1;
  const N = p.people;
  if (N !== null && N > kb.policy.maxGroupSize) return answerBigGroup(c);

  let picks = p.codeMatch ? [{ trip: p.codeMatch.trip, dep: p.codeMatch.dep }] : departuresOf(trips, p.dateFilter);
  const label = p.dateFilter ? ` ${p.dateFilter.label}` : "";
  const who = trips.length === 1 ? trips[0].title : "";
  let needNote = "";
  if (N !== null && N > kb.policy.maxSeatsPerBooking) {
    picks = picks.filter((x) => x.dep.privateCarPossible && x.dep.bookingOpen);
    needNote = ` with the whole car free for ${N}`;
  } else if (N !== null && N > 1) {
    picks = picks.filter((x) => x.dep.seatsRemaining >= N);
    needNote = ` with ${N}+ seats free`;
  }
  // A party with a man in it: women-only dates are not offered (and the answer says which were left out).
  const leftOut = p.codeMatch ? [] : picks.filter((x) => !joinable(c, x.dep));
  if (leftOut.length) picks = picks.filter((x) => joinable(c, x.dep));

  if (picks.length === 0) {
    const all = departuresOf(trips);
    const alt = all
      .filter((x) => !x.dep.soldOut && x.dep.bookingOpen && joinable(c, x.dep) && (N === null || x.dep.seatsRemaining >= Math.min(N, PRIVATE_SEATS)))
      .slice(0, 3);
    const lines: string[] = [];
    // Asked about one day: a trip that already started that day, or one that is running (started earlier).
    const asked = p.dateFilter?.kind === "day" ? p.dateFilter.date : null;
    const underWay = asked ? trips.flatMap((t) => t.departures.filter((d) => d.started && d.startDate <= asked && asked <= d.endDate).map((d) => ({ trip: t, dep: d }))) : [];
    const running = runningOn(trips, p.dateFilter).filter((x) => !x.dep.started);
    // A trip does start that day, just without room for this group.
    const sameDay = asked && N !== null ? departuresOf(trips, p.dateFilter).filter((x) => joinable(c, x.dep)) : [];
    if (underWay.length) {
      for (const x of underWay.slice(0, 2)) {
        lines.push(`**${x.trip.title}** (**${range(kb, x.dep)}**) is already under way — it started on ${day(kb, x.dep.startDate)}, so it can't be booked now.`);
      }
    } else if (sameDay.length && N !== null) {
      for (const x of sameDay.slice(0, 2)) {
        const has = x.dep.soldOut ? "is sold out" : `has only ${x.dep.seatsRemaining} ${x.dep.seatsRemaining === 1 ? "seat" : "seats"} left`;
        lines.push(
          N > kb.policy.maxSeatsPerBooking
            ? `**${x.trip.title}** on **${range(kb, x.dep)}** doesn't have the whole car free (${seatsText(x.dep)}), sorry.`
            : `**${x.trip.title}** on **${range(kb, x.dep)}** ${has}, not ${N}, sorry.`
        );
      }
    } else if (all.length === 0) {
      lines.push(`There are no upcoming dates${who ? ` for **${who}**` : ""} on the calendar right now.`);
      lines.push(`You can ask for your own date through the [enquiry form](/#plan). ${careLine(kb)}`);
    } else {
      lines.push(`No ${who ? `**${who}** ` : ""}${asked ? "trip starts" : "dates"}${label}${needNote}${leftOut.length ? " that your group can book" : ""}, sorry.`);
    }
    for (const x of running.slice(0, 2)) {
      lines.push(`**${x.trip.title}** runs **${range(kb, x.dep)}** — it's already running ${p.dateFilter?.label ?? "then"}, so you'd join from its start on ${day(kb, x.dep.startDate)}.`);
    }
    if (leftOut.length) lines.push(womenLeftOut(kb, leftOut));
    // Only "25th" was written: a trip starting on a later 25th is probably what they meant.
    const nth = p.dateFilter?.kind === "day" && p.dateFilter.fromOrdinal ? splitISO(p.dateFilter.date).d : null;
    const laterNth =
      nth !== null && asked
        ? all
            .filter((x) => splitISO(x.dep.startDate).d === nth && x.dep.startDate > asked && !x.dep.soldOut && x.dep.bookingOpen && joinable(c, x.dep))
            .filter((x) => N === null || x.dep.seatsRemaining >= Math.min(N, PRIVATE_SEATS))
            .slice(0, 2)
        : [];
    if (laterNth.length) {
      lines.push(`Starting on a later ${nth}${ordinalSuffix(nth ?? 0)}:`);
      for (const x of laterNth) lines.push(depBullet(kb, x, multi));
      const ids = new Set(laterNth.map((x) => x.dep.departureId));
      alt.splice(0, alt.length, ...[...laterNth, ...alt.filter((x) => !ids.has(x.dep.departureId))].slice(0, 3));
    }
    const restAlt = alt.filter((x) => !laterNth.includes(x));
    if (all.length) {
      if (restAlt.length) {
        lines.push(laterNth.length ? "Other open dates:" : "The nearest open dates:");
        for (const x of restAlt) lines.push(depBullet(kb, x, multi));
      } else if (!laterNth.length) lines.push(careLine(kb));
    } else if (underWay.length) lines.push(`No later dates are on the calendar yet. ${careLine(kb)}`);
    return {
      intent: mode,
      text: lines.join("\n"),
      cards: alt.map((x) => depCard(x.trip, x.dep)),
      actions: alt.length ? [bookAction(kb, alt[0].dep), ...careActions(kb)] : [{ kind: "link", label: "Plan your own date", href: "/#plan" }, ...careActions(kb)],
      suggestions: trips.length === 1 ? [`Price for ${trips[0].shortName}?`, "Which trips are coming up?", "Talk to customer care"] : ["Which trips are coming up?", "Can I book the whole car?", "Talk to customer care"],
      emotion: "sorry",
      confidence: 0.9,
      tripSlugs: trips.map((t) => t.slug),
    };
  }

  const shown = picks.slice(0, 6);
  const lines: string[] = [];
  if (shown.length === 1 && (mode === "seats" || p.dateFilter?.kind === "day" || p.codeMatch)) {
    const x = shown[0];
    if (x.dep.soldOut) {
      lines.push(`**${x.trip.title}** on **${range(kb, x.dep)}** is **sold out** — you can join the waitlist on the trip page.`);
      const alt = x.trip.departures.find((d) => d.departureId !== x.dep.departureId && d.bookingOpen && !d.soldOut && joinable(c, d));
      if (alt) {
        lines.push(`Next open ${x.trip.shortName} date: **${range(kb, alt)}** (${seatsText(alt)}${alt.womenOnly ? ", women-only batch" : ""}).`);
        shown.push({ trip: x.trip, dep: alt });
      } else {
        const womenAlt = x.trip.departures.find((d) => d.departureId !== x.dep.departureId && d.bookingOpen && !d.soldOut);
        if (womenAlt) lines.push(womenLeftOut(kb, [{ trip: x.trip, dep: womenAlt }]));
        lines.push(`No other ${x.trip.shortName} date is open ${womenAlt ? "for your group " : ""}right now. ${careLine(kb)}`);
      }
    } else {
      lines.push(
        `**${x.trip.title}** on **${range(kb, x.dep)}**: **${x.dep.seatsRemaining} of ${x.dep.maxCapacity} seats** open at ${money(x.dep.pricePaise)} per seat${x.dep.womenOnly ? " (women-only batch)" : ""}.`
      );
      if (!joinable(c, x.dep)) lines.push("Only women travellers can book this date.");
      else if (!x.dep.bookingOpen) lines.push("Online booking for this date has closed.");
      else if (x.dep.privateCarPossible) lines.push(`All seats are still free, so the whole car can be booked too (${money(x.dep.privateCarPricePaise)}).`);
    }
  } else {
    const head =
      trips.length === 1
        ? `**${who}** — upcoming dates${label}${needNote}:`
        : p.flags.wantsNext && !p.dateFilter
          ? `Next departures${needNote}:`
          : `Upcoming departures${label}${needNote}:`;
    lines.push(head);
    for (const x of shown) lines.push(depBullet(kb, x, multi));
    if (picks.length > shown.length) lines.push(`…and ${picks.length - shown.length} more on the [trips page](/trips).`);
  }
  if (leftOut.length) lines.push(womenLeftOut(kb, leftOut));

  const firstOpen = picks.find((x) => x.dep.bookingOpen && !x.dep.soldOut && joinable(c, x.dep));
  const bookable = firstOpen ?? shown.find((x) => x.dep.bookingOpen && !x.dep.soldOut && joinable(c, x.dep));
  const actions: AnswerAction[] = [];
  if (bookable) actions.push(bookAction(kb, bookable.dep));
  if (trips.length === 1) actions.push({ kind: "link", label: "Open trip page", href: trips[0].url });
  else actions.push({ kind: "link", label: "See all trips", href: "/trips" });

  const anyOpen = Boolean(firstOpen);
  const s = tripLabel(trips);
  return {
    intent: mode,
    text: lines.join("\n"),
    cards: shown.map((x) => depCard(x.trip, x.dep)),
    actions,
    suggestions: s
      ? [`Price for ${s}?`, `Pickup points for ${s}`, `What's included in ${s}?`, "How do I book?"]
      : ["Can I book the whole car?", "Any women-only batches?", "Where are the pickup points?", "How do I book?"],
    emotion: anyOpen ? "happy" : "sorry",
    confidence: 0.9,
    tripSlugs: uniq(picks.map((x) => x.trip.slug), (x) => x),
  };
}

function answerWomenOnly(c: Ctx): Draft {
  const { kb, p } = c;
  const trips = c.trips.length ? c.trips : kb.trips;
  const picks = departuresOf(trips, p.dateFilter).filter((x) => x.dep.womenOnly);
  const label = p.dateFilter ? ` ${p.dateFilter.label}` : "";
  const who = c.trips.length === 1 ? ` for **${c.trips[0].title}**` : "";
  if (picks.length === 0) {
    return {
      intent: "women_only",
      text: `There are no women-only dates${who}${label} on the calendar right now. ${careLine(kb, "To ask about one")}`,
      actions: [{ kind: "link", label: "Women-only trips", href: "/trips?mode=women" }, ...careActions(kb)],
      suggestions: ["Which trips are coming up?", "Is it safe for solo travellers?", "How do room shares work?"],
      emotion: "sorry",
      confidence: 0.9,
    };
  }
  const shown = picks.slice(0, 5);
  const firstOpen = picks.find((x) => x.dep.bookingOpen && !x.dep.soldOut);
  return {
    intent: "women_only",
    text: [`Women-only batches (only women travellers)${who}${label}:`, ...shown.map((x) => depBullet(kb, x, trips.length > 1).replace(" · women-only", ""))].join("\n"),
    cards: shown.map((x) => depCard(x.trip, x.dep)),
    actions: [...(firstOpen ? [bookAction(kb, firstOpen.dep)] : []), { kind: "link", label: "All women-only dates", href: "/trips?mode=women" }],
    suggestions: [`Price for ${shown[0].trip.shortName}?`, `Pickup points for ${shown[0].trip.shortName}`, "How do room shares work?", "How do I book?"],
    emotion: firstOpen ? "happy" : "sorry",
    confidence: 0.9,
    tripSlugs: uniq(shown.map((x) => x.trip.slug), (x) => x),
  };
}

function answerPrivateCar(c: Ctx): Draft {
  const { kb, p } = c;
  if (kb.trips.length === 0) return noTrips(kb);
  if (p.people !== null && p.people > kb.policy.maxGroupSize) return answerBigGroup(c);
  const trips = c.trips.length ? c.trips : kb.trips;
  const free = departuresOf(trips, p.dateFilter).filter((x) => x.dep.privateCarPossible && x.dep.bookingOpen);
  const leftOut = free.filter((x) => !joinable(c, x.dep));
  const picks = free.filter((x) => joinable(c, x.dep));
  const label = p.dateFilter ? ` ${p.dateFilter.label}` : "";
  const intro = `You can book the **whole car** (all ${PRIVATE_SEATS} seats, just your group) on any date where nobody has booked a seat yet.`;
  if (picks.length === 0) {
    const who = c.trips.length === 1 ? ` **${c.trips[0].shortName}**` : "";
    const left = womenLeftOut(kb, leftOut);
    return {
      intent: "private_car",
      text: `${intro}\nRight now no${who} date${label} has all ${PRIVATE_SEATS} seats free${left ? " for your group" : ""}.${left ? ` ${left}` : ""} You can ask for your own date through the [enquiry form](/#plan) (choose "Private car, my date"). ${careLine(kb)}`,
      actions: [{ kind: "link", label: "Ask for my own date", href: "/#plan" }, ...careActions(kb)],
      suggestions: ["Which trips are coming up?", "Price for 4 people?", "Talk to customer care"],
      emotion: "sorry",
      confidence: 0.9,
      tripSlugs: trips.map((t) => t.slug),
    };
  }
  const shown = picks.slice(0, 5);
  const lines = [intro, `Dates with the whole car free${label}:`];
  const tripsShown = uniq(shown.map((x) => x.trip), (t) => t.slug);
  // How each price is made. One trip and one rule → said once below; otherwise on every date (a date with
  // its own seat price can fall under a different rule, e.g. 6 × seat price minus % instead of the fixed price).
  const explains = shown.map((x) => privateExplain(x.trip, x.dep.pricePaise));
  const oneRule = tripsShown.length === 1 && explains.every((e) => e === explains[0]);
  shown.forEach((x, i) => {
    lines.push(
      `- **${range(kb, x.dep)}** · ${x.trip.shortName}: **${money(x.dep.privateCarPricePaise)}** for the car${oneRule ? "" : ` (${explains[i]})`}${x.dep.womenOnly ? " · women-only date" : ""}`
    );
  });
  if (picks.length > shown.length) lines.push(`…and ${picks.length - shown.length} more on the [whole-car list](/trips?mode=private).`);
  if (oneRule) lines.push(`That's the ${explains[0]}.`);
  const left = womenLeftOut(kb, leftOut);
  if (left) lines.push(left);
  if (kb.policy.taxRatePercent > 0) lines.push(`Checkout adds ${kb.policy.taxRatePercent}% tax.`);
  return {
    intent: "private_car",
    text: lines.join("\n"),
    cards: shown.map((x) => depCard(x.trip, x.dep)),
    actions: [bookAction(kb, shown[0].dep), { kind: "link", label: "All whole-car dates", href: "/trips?mode=private" }],
    suggestions: [`What's included in ${shown[0].trip.shortName}?`, `Pickup points for ${shown[0].trip.shortName}`, "We are more than 6 people", "How do I book?"],
    emotion: "happy",
    confidence: 0.9,
    tripSlugs: tripsShown.map((t) => t.slug),
  };
}

function answerBigGroup(c: Ctx): Draft {
  const { kb, p } = c;
  const n = p.people;
  const lines = [
    `One car takes up to **${kb.policy.maxGroupSize} travellers**.`,
    `${n !== null && n > kb.policy.maxGroupSize ? `For **${n} people**, send` : "For a bigger group, send"} your plan through the [group enquiry form](/#plan) (choose "Bigger group") and the team will reply with options.`,
  ];
  if (kb.groupNote) lines.push(kb.groupNote);
  if (c.trips.length === 1) lines.push(`For reference, ${c.trips[0].shortName} is ${money(c.trips[0].basePricePaise)} per seat.`);
  lines.push(careLine(kb, "To talk it through"));
  return {
    intent: "big_group",
    text: lines.join("\n"),
    actions: [{ kind: "link", label: "Group enquiry", href: "/#plan" }, ...careActions(kb)],
    suggestions: ["Can I book the whole car?", "Which trips are coming up?", "Talk to customer care"],
    emotion: "talking",
    confidence: 0.9,
  };
}

function answerPickup(c: Ctx): Draft {
  const { kb, p } = c;
  if (kb.trips.length === 0) return noTrips(kb);
  const dropNote = p.flags.drop ? `\nDrop-off points aren't listed separately. ${careLine(kb, "To confirm the drop")}` : "";
  if (c.trips.length === 0) {
    const hubs = new Map<string, { area: string; times: string[] }>();
    for (const t of kb.trips) {
      for (const pk of t.pickups) {
        const h = hubs.get(pk.name) ?? { area: pk.area, times: [] };
        h.times.push(`${t.shortName} ${pk.time}${pk.confirmed ? "" : " (not confirmed yet)"}`);
        hubs.set(pk.name, h);
      }
    }
    if (hubs.size === 0) {
      return { text: `Pickup points aren't listed yet. ${careLine(kb)}`, actions: careActions(kb), emotion: "sorry", confidence: 0.85, suggestions: ["Which trips are coming up?"] };
    }
    const lines = [`Pickup points in ${kb.trips[0].pickupCity} (times differ by trip):`];
    for (const [name, h] of [...hubs.entries()].slice(0, 6)) lines.push(`- **${name}**, ${h.area} — ${h.times.join("; ")}`);
    return {
      intent: "pickup",
      text: lines.join("\n") + dropNote,
      suggestions: kb.trips.slice(0, 4).map((t) => `Pickup points for ${t.shortName}`),
      actions: p.flags.drop ? careActions(kb) : [],
      emotion: "pointing",
      confidence: 0.85,
    };
  }
  const lines: string[] = [];
  const cards: AnswerCard[] = [];
  let missing = false;
  for (const t of c.trips.slice(0, 2)) {
    if (t.pickups.length === 0) {
      lines.push(`Pickup points for **${t.title}** aren't listed yet.`);
      missing = true;
      continue;
    }
    lines.push(`**Pickup points — ${t.title}** (${t.pickupCity}):`);
    for (const pk of t.pickups) {
      lines.push(`- **${pk.name}**, ${pk.area} — ${pk.time}${pk.confirmed ? "" : " (not confirmed yet)"}`);
      cards.push({ kind: "pickup", tripSlug: t.slug, tripTitle: t.title, name: pk.name, area: pk.area, time: pk.time, mapsUrl: pk.mapsUrl, confirmed: pk.confirmed });
    }
    if (t.pickups.some((pk) => !pk.confirmed)) lines.push("Times marked *not confirmed yet* may still change before the trip.");
  }
  if (missing) lines.push(careLine(kb));
  const s = c.trips[0].shortName;
  return {
    intent: "pickup",
    text: lines.join("\n") + dropNote,
    cards: cards.slice(0, 6),
    actions: missing || p.flags.drop ? careActions(kb) : [{ kind: "link", label: "Open trip page", href: c.trips[0].url }],
    suggestions: [`${s} dates`, `${s} itinerary`, `Price for ${s}?`, "How do I book?"],
    emotion: missing ? "sorry" : "pointing",
    confidence: 0.9,
    tripSlugs: c.trips.slice(0, 2).map((t) => t.slug),
  };
}

function answerItinerary(c: Ctx): Draft {
  const { kb, p } = c;
  if (c.trips.length === 0) {
    if (kb.trips.length === 1) return answerItinerary({ ...c, trips: kb.trips });
    return askWhichTrip(c, "day-by-day plan", (t) => `${t.shortName} itinerary`);
  }
  const t = c.trips[0];
  if (t.itinerary.length === 0) {
    return { text: `The day-by-day plan for **${t.title}** isn't published yet. ${careLine(kb)}`, actions: careActions(kb), emotion: "sorry", confidence: 0.85, tripSlugs: [t.slug] };
  }
  if (p.dayNumber !== null) {
    const d = p.dayNumber === -1 ? t.itinerary[t.itinerary.length - 1] : t.itinerary.find((x) => x.day === p.dayNumber);
    if (!d) {
      return {
        text: `**${t.title}** has ${t.itinerary.length} days in its plan (${t.durationLabel}), so there's no day ${p.dayNumber}.`,
        suggestions: [`${t.shortName} itinerary`, `Day 1 of ${t.shortName}`],
        emotion: "sorry",
        confidence: 0.85,
        tripSlugs: [t.slug],
      };
    }
    const lines = [`**${t.title} — Day ${d.day}: ${d.title}**`, d.description];
    if (d.driveTime) lines.push(`- Drive: ${d.driveTime}`);
    if (d.meals) lines.push(`- Meals: ${d.meals}`);
    if (d.bufferNotes) lines.push(`- Note: ${d.bufferNotes}`);
    const nextDay = t.itinerary.find((x) => x.day === d.day + 1);
    return {
      text: lines.join("\n"),
      cards: [tripCard(t, c.p.flags.male)],
      suggestions: [nextDay ? `Day ${nextDay.day} of ${t.shortName}` : `${t.shortName} itinerary`, `What's included in ${t.shortName}?`, `${t.shortName} dates`],
      emotion: "pointing",
      confidence: 0.9,
      tripSlugs: [t.slug],
    };
  }
  const lines = [`**${t.title}** (${t.durationLabel}), day by day:`];
  for (const d of t.itinerary) lines.push(`- **Day ${d.day} · ${d.title}**: ${firstSentence(d.description)}`);
  return {
    text: lines.join("\n"),
    cards: [tripCard(t, c.p.flags.male)],
    actions: [{ kind: "link", label: "Full plan on the trip page", href: t.url }],
    suggestions: [`Day 1 of ${t.shortName}`, `What's included in ${t.shortName}?`, `Pickup points for ${t.shortName}`, `${t.shortName} dates`],
    emotion: "pointing",
    confidence: 0.9,
    tripSlugs: [t.slug],
  };
}

const MEAL_RE = /\b(breakfasts?|lunch(es)?|dinners?|meals?|food|refreshments?|tea|coffee tastings?|brunch(es)?|snacks?)\b/i;
const STAY_RE = /\b(night|nights|stay|homestay|room|rooms|hotel|cottage|cottages|bungalow|guesthouse|guest house|accommodation)\b/i;
const TICKET_RE = /\b(entry|ticket|tickets|fee|fees|permit|permits|toll|tolls|parking|jeep)\b/i;
const VEHICLE_RE = /\b(transport|travel|mpv|ertiga|car|vehicle|driver|tolls?|parking)\b/i;

function answerInclusions(c: Ctx, focus: "all" | "meals" | "stay" | "tickets"): Draft {
  const { kb, p } = c;
  const topic = focus === "meals" ? "meal details" : focus === "stay" ? "stay details" : "inclusions";
  if (c.trips.length === 0) {
    if (kb.trips.length === 1) return answerInclusions({ ...c, trips: kb.trips }, focus);
    return askWhichTrip(c, topic, (t) => (focus === "meals" ? `Meals on ${t.shortName}` : focus === "stay" ? `Stay on ${t.shortName}` : `What's included in ${t.shortName}?`));
  }
  const t = c.trips[0];
  const s = t.shortName;
  const lines: string[] = [];
  let unsure = false;
  if (focus === "meals") {
    lines.push(`**Meals — ${t.title}:**`);
    const days = t.itinerary.filter((d) => d.meals.trim());
    for (const d of days) lines.push(`- Day ${d.day}: ${d.meals}`);
    const inc = t.inclusions.filter((x) => MEAL_RE.test(x));
    const exc = t.exclusions.filter((x) => MEAL_RE.test(x));
    if (inc.length) lines.push(`Included: ${inc.join("; ")}`);
    if (exc.length) lines.push(`Not included: ${exc.join("; ")}`);
    if (!days.length && !inc.length && !exc.length) {
      lines.push("Meal details aren't listed for this trip yet.");
      unsure = true;
    }
    if (p.flags.veg) {
      lines.push(`Food preferences (veg, allergies) aren't listed here. ${careLine(kb, "To check yours")}`);
      unsure = true;
    }
  } else if (focus === "stay") {
    lines.push(`**Stay — ${t.title}:**`);
    if (t.accommodationNotes) lines.push(t.accommodationNotes);
    const inc = t.inclusions.filter((x) => STAY_RE.test(x));
    for (const x of inc) lines.push(`- ${x}`);
    if (kb.policy.roomPolicy) lines.push(`Rooms: ${kb.policy.roomPolicy}`);
    if (!t.accommodationNotes && !inc.length) {
      lines.push("Stay details aren't listed for this trip yet.");
      unsure = true;
    }
  } else if (focus === "tickets") {
    const inc = t.inclusions.filter((x) => TICKET_RE.test(x));
    const exc = t.exclusions.filter((x) => TICKET_RE.test(x));
    lines.push(`**Entry fees & tickets — ${t.title}:**`);
    if (inc.length) lines.push(`Included: ${inc.join("; ")}`);
    if (exc.length) lines.push(`Not included: ${exc.join("; ")}`);
    if (!inc.length && !exc.length) {
      lines.push("Entry fees and tickets aren't mentioned in this trip's inclusions.");
      unsure = true;
    }
  } else {
    lines.push(`**Included — ${t.title}:**`);
    if (t.inclusions.length) for (const x of t.inclusions.slice(0, 8)) lines.push(`- ${x}`);
    else lines.push("- Not listed yet.");
    if (t.exclusions.length) {
      lines.push("**Not included:**");
      for (const x of t.exclusions.slice(0, 6)) lines.push(`- ${x}`);
    }
    if (!t.inclusions.length) unsure = true;
  }
  if (unsure && !lines.some((l) => l.includes("customer care") || l.includes("WhatsApp") || l.includes("enquiry form"))) lines.push(careLine(kb));
  return {
    text: lines.join("\n"),
    cards: [tripCard(t, c.p.flags.male)],
    actions: unsure ? careActions(kb) : [{ kind: "link", label: "Open trip page", href: t.url }],
    suggestions: [`Price for ${s}?`, `${s} itinerary`, focus === "meals" ? `Stay on ${s}` : `Meals on ${s}`, `${s} dates`],
    emotion: unsure ? "sorry" : "talking",
    confidence: 0.9,
    tripSlugs: [t.slug],
  };
}

function answerRoomSharing(c: Ctx): Draft {
  const { kb } = c;
  const lines: string[] = [];
  if (kb.policy.roomPolicy) lines.push(kb.policy.roomPolicy);
  if (c.trips.length === 1 && c.trips[0].accommodationNotes) lines.push(`${c.trips[0].shortName}: ${c.trips[0].accommodationNotes}`);
  if (kb.policy.preferenceDecisionHoursBefore > 0) {
    lines.push(`Room and co-traveller comfort requests are made at checkout and decided ${kb.policy.preferenceDecisionHoursBefore} hours before departure.`);
  }
  if (lines.length === 0) lines.push("Room-sharing rules aren't published yet.");
  lines.push(careLine(kb, "For a specific request"));
  return {
    text: lines.join("\n"),
    actions: [{ kind: "link", label: "Read the policies", href: "/policies" }, ...careActions(kb)],
    suggestions: ["Is it safe for solo travellers?", "Any women-only batches?", "Can I book the whole car?"],
    emotion: "talking",
    confidence: 0.85,
  };
}

function answerVehicle(c: Ctx): Draft {
  const { kb, p } = c;
  const lines: string[] = [];
  if (kb.policy.vehiclePolicy) lines.push(kb.policy.vehiclePolicy);
  lines.push(`Each car takes up to ${kb.policy.maxGroupSize} travellers.`);
  if (c.trips.length === 1) {
    const inc = c.trips[0].inclusions.filter((x) => VEHICLE_RE.test(x));
    if (inc.length) lines.push(`Included on ${c.trips[0].shortName}: ${inc.join("; ")}`);
  }
  if (p.flags.luggage && !/luggage|baggage/i.test(kb.policy.vehiclePolicy)) lines.push(`The luggage allowance isn't listed. ${careLine(kb, "To check")}`);
  else if (p.flags.luggage) lines.push(careLine(kb, "For exact luggage limits"));
  return {
    text: lines.join("\n"),
    actions: p.flags.luggage ? careActions(kb) : [],
    suggestions: ["Can I book the whole car?", "Where are the pickup points?", "Is it safe for solo travellers?"],
    emotion: "talking",
    confidence: 0.85,
    tripSlugs: c.trips.map((t) => t.slug),
  };
}

function answerPacking(c: Ctx): Draft {
  const { kb } = c;
  if (c.trips.length === 0) {
    if (kb.trips.length === 1) return answerPacking({ ...c, trips: kb.trips });
    return askWhichTrip(c, "packing list", (t) => `Packing list for ${t.shortName}`);
  }
  const t = c.trips[0];
  if (t.packingList.length === 0) {
    return { text: `A packing list for **${t.title}** isn't published yet. ${careLine(kb)}`, actions: careActions(kb), emotion: "sorry", confidence: 0.85, tripSlugs: [t.slug] };
  }
  const w = kb.weather[t.slug];
  const lines = [`**Packing list — ${t.title}:**`, ...t.packingList.slice(0, 8).map((x) => `- ${x}`)];
  if (w) lines.push(`Right now at ${w.place}: ${w.tempC}°C, ${w.label}.`);
  return {
    text: lines.join("\n"),
    cards: [tripCard(t, c.p.flags.male)],
    suggestions: [`Weather in ${t.shortName}`, `${t.shortName} itinerary`, `What's included in ${t.shortName}?`],
    emotion: "talking",
    confidence: 0.9,
    tripSlugs: [t.slug],
  };
}

function longestDrive(t: KbTrip): string {
  const withDrive = t.itinerary.filter((d) => d.driveTime.trim());
  if (!withDrive.length) return "";
  return withDrive.map((d) => `Day ${d.day} ${d.driveTime}`).join("; ");
}

function answerDifficulty(c: Ctx): Draft {
  const { kb, p } = c;
  if (kb.trips.length === 0) return noTrips(kb);
  const lines: string[] = [];
  let unsure = false;
  if (c.trips.length === 0) {
    lines.push("Difficulty of each trip:");
    for (const t of kb.trips.slice(0, 6)) lines.push(`- **${t.shortName}**: ${t.difficulty}`);
    lines.push("Ask me about one trip for its walking and access notes.");
  } else {
    for (const t of c.trips.slice(0, 2)) {
      lines.push(`**${t.title}** is rated **${t.difficulty}**.`);
      if (t.accessibilityNotes) lines.push(t.accessibilityNotes);
      const drive = longestDrive(t);
      if (drive) lines.push(`Drive times: ${drive}.`);
    }
  }
  if (p.flags.kids || p.flags.seniors) {
    lines.push(`I don't have an age rule on record for ${c.trips.length === 1 ? "this trip" : "our trips"} — please check before booking. ${careLine(kb)}`);
    unsure = true;
  }
  return {
    text: lines.join("\n"),
    cards: c.trips.slice(0, 2).map((x) => tripCard(x, c.p.flags.male)),
    actions: unsure ? careActions(kb) : [],
    suggestions: c.trips.length ? [`${c.trips[0].shortName} itinerary`, `Packing list for ${c.trips[0].shortName}`, `${c.trips[0].shortName} dates`] : kb.trips.slice(0, 3).map((t) => `How hard is ${t.shortName}?`),
    emotion: "talking",
    confidence: unsure ? 0.75 : 0.9,
    tripSlugs: c.trips.map((t) => t.slug),
  };
}

function answerWeather(c: Ctx): Draft {
  const { kb, p } = c;
  if (kb.trips.length === 0) return noTrips(kb);
  const trips = c.trips.length ? c.trips : kb.trips;
  const lines: string[] = [];
  if (p.flags.bestTime) lines.push("I don't have season advice on record — here's the live weather right now:");
  let anyLive = false;
  for (const t of trips.slice(0, 4)) {
    const w = kb.weather[t.slug];
    if (w) {
      anyLive = true;
      lines.push(`- **${w.place}** (${t.shortName}): ${w.tempC}°C, ${w.label}, wind ${w.windKmh} km/h from ${w.windFrom}, humidity ${w.humidity}%`);
    } else lines.push(`- **${t.shortName}**: live weather isn't available right now`);
  }
  if (anyLive && !p.flags.bestTime) lines.unshift("Live weather right now:");
  return {
    text: lines.join("\n"),
    suggestions: trips.length === 1 ? [`Packing list for ${trips[0].shortName}`, `${trips[0].shortName} dates`] : ["Which trips are coming up?", "What should I pack?"],
    emotion: anyLive ? "talking" : "sorry",
    confidence: anyLive ? (p.flags.bestTime ? 0.7 : 0.9) : 0.7,
    tripSlugs: trips.map((t) => t.slug),
  };
}

function answerCancellation(c: Ctx): Draft {
  const { kb } = c;
  const pol = kb.policy;
  const draft = pol.draft || kb.legal.draft;
  const lines: string[] = [];
  if (pol.cancellationSlabs.length) {
    lines.push(`**Cancellation & refunds**${draft ? " (our policy is still marked draft)" : ""}:`);
    for (const s of pol.cancellationSlabs) lines.push(`- ${s.label}: ${s.confirmed ? s.refundNote : "refund amount not published yet"}`);
  } else lines.push("The cancellation slabs aren't published yet.");
  if (kb.legal.refund && !kb.legal.draft) lines.push(firstSentence(kb.legal.refund, 220));
  lines.push("To cancel or change your date, open [My Booking](/booking-lookup) and send a request.");
  if (draft || pol.cancellationSlabs.some((s) => !s.confirmed) || !pol.cancellationSlabs.length) lines.push(careLine(kb, "To confirm the exact refund"));
  return {
    text: lines.join("\n"),
    actions: [{ kind: "link", label: "My Booking", href: "/booking-lookup" }, { kind: "link", label: "Full policies", href: "/policies" }, ...careActions(kb)],
    suggestions: ["How do I pay?", "Can I reschedule?", "Talk to customer care"],
    emotion: "talking",
    confidence: 0.9,
  };
}

function answerPayment(c: Ctx): Draft {
  const { kb, p } = c;
  const pol = kb.policy;
  const t = c.trips.length === 1 ? c.trips[0] : null;
  const lines: string[] = [];
  let off = false;
  if (kb.payment.method === "upi" && kb.payment.onlineReady === false) {
    off = true;
    lines.push(`Online payment isn't switched on right now, so seats can't be held online. ${careLine(kb, "To book")}`);
  } else if (kb.payment.method === "upi") {
    lines.push("You pay by **UPI** (any UPI app) straight to our UPI ID, then enter the 12-digit UPI reference (UTR) — the team confirms once the money arrives.");
  } else if (kb.payment.method === "razorpay") {
    lines.push("You pay online at checkout through Razorpay.");
  } else {
    lines.push("You pay online at checkout.");
  }
  if (!off) lines.push(`Your seats are held for **${pol.holdMinutes} minutes** while you pay.`);
  const dep = t ? t.depositPercent : pol.depositPercent;
  const balanceDays = t ? t.balanceDueDaysBefore : pol.balanceDueDaysBefore;
  lines.push(
    dep !== null
      ? `You can pay a **${dep}% deposit** now and the balance ${balanceDays} days before the trip.`
      : `Full payment is taken at booking${t ? ` for ${t.shortName}` : ""} (no deposit option).`
  );
  lines.push(pol.taxRatePercent > 0 ? `Checkout adds ${pol.taxRatePercent}% tax.` : "No tax is added on top of the listed price.");
  if (pol.taxNote) lines.push(`Tax note: ${pol.taxNote}`);
  if (p.flags.otherPayment && kb.payment.method === "upi") lines.push(`Card, EMI or cash payments aren't listed as options. ${careLine(kb, "To ask")}`);
  lines.push(
    dep !== null || kb.trips.some((x) => x.depositPercent !== null)
      ? "Check payments or pay a balance in [My Booking](/booking-lookup)."
      : "Check your payment status any time in [My Booking](/booking-lookup)."
  );
  return {
    text: lines.join("\n"),
    actions: [{ kind: "link", label: "My Booking", href: "/booking-lookup" }, ...(off || p.flags.otherPayment ? careActions(kb) : [])],
    suggestions: ["What is the cancellation policy?", "How do I book?", "Do you have offers?"],
    emotion: off ? "sorry" : "talking",
    confidence: 0.9,
    tripSlugs: t ? [t.slug] : [],
  };
}

function answerHowToBook(c: Ctx): Draft {
  const { kb, p } = c;
  if (kb.trips.length === 0) return noTrips(kb);
  if (p.people !== null && p.people > kb.policy.maxGroupSize) return answerBigGroup(c);
  const t = p.codeMatch ? p.codeMatch.trip : c.trips.length === 1 ? c.trips[0] : null;
  const N = p.people;
  const lines: string[] = [];
  const actions: AnswerAction[] = [];
  let emotion: GuideEmotion = "happy";

  let dep: KbDeparture | null = p.codeMatch ? p.codeMatch.dep : null;
  if (!dep && t && p.dateFilter) dep = departuresOf([t], p.dateFilter)[0]?.dep ?? null;
  if (t && dep) {
    if (dep.soldOut) {
      lines.push(`**${t.title}** on **${range(kb, dep)}** is sold out — you can join its waitlist on the trip page.`);
      emotion = "sorry";
    } else if (!dep.bookingOpen) {
      lines.push(`Online booking for **${t.title}** on **${range(kb, dep)}** has closed.`);
      emotion = "sorry";
    } else if (!joinable(c, dep)) {
      lines.push(`**${t.title}** on **${range(kb, dep)}** is a **women-only batch**, so only women travellers can book it.`);
      const other = t.departures.find((d) => d.departureId !== dep!.departureId && d.bookingOpen && !d.soldOut && joinable(c, d));
      if (other) {
        lines.push(`Next ${t.shortName} date your group can book: **${range(kb, other)}** (${seatsText(other)}).`);
        actions.push(bookAction(kb, other));
      } else lines.push(`No other ${t.shortName} date is open for your group right now. ${careLine(kb)}`);
      emotion = "sorry";
    } else if (N !== null && N <= kb.policy.maxSeatsPerBooking && dep.seatsRemaining < N) {
      lines.push(`**${range(kb, dep)}** has only ${dep.seatsRemaining} ${dep.seatsRemaining === 1 ? "seat" : "seats"} left, not ${N}.`);
      emotion = "sorry";
    } else {
      lines.push(`**${t.title}** on **${range(kb, dep)}**: ${seatsText(dep)} at ${money(dep.pricePaise)} per seat${dep.womenOnly ? " (women-only batch — only women travellers)" : ""}.`);
      actions.push(bookAction(kb, dep));
    }
  } else if (t) {
    const fit = t.departures.find(
      (d) => d.bookingOpen && joinable(c, d) && (N === null ? !d.soldOut : N > kb.policy.maxSeatsPerBooking ? d.privateCarPossible : d.seatsRemaining >= N)
    );
    if (fit) actions.push(bookAction(kb, fit));
  }

  if (kb.payment.method === "upi" && kb.payment.onlineReady === false) {
    lines.push(`Online payment isn't switched on right now, so bookings are taken by our team. ${careLine(kb, "To book")}`);
    return {
      text: lines.join("\n"),
      actions: careActions(kb),
      suggestions: ["Which trips are coming up?", "Talk to customer care"],
      emotion: "sorry",
      confidence: 0.9,
      tripSlugs: t ? [t.slug] : [],
    };
  }

  lines.push("How to book:");
  lines.push(`1. Open ${t ? `[${t.title}](${t.url})` : "a trip on the [Trips page](/trips)"} and pick a date.`);
  lines.push(`2. Choose seats on the live car map (1–${kb.policy.maxSeatsPerBooking}), or the whole car when all ${PRIVATE_SEATS} are free.`);
  lines.push("3. Add traveller details and your pickup point.");
  lines.push(`4. Pay within ${kb.policy.holdMinutes} minutes — your seats are held meanwhile.`);
  lines.push("5. Track it any time in [My Booking](/booking-lookup).");
  if (!t) actions.push({ kind: "link", label: "See all trips", href: "/trips" });
  else actions.push({ kind: "link", label: "Open trip page", href: t.url });
  return {
    text: lines.join("\n"),
    cards: t ? [tripCard(t, c.p.flags.male)] : [],
    actions,
    suggestions: t ? [`${t.shortName} dates`, `Price for ${t.shortName}?`, "How do I pay?"] : ["Which trips are coming up?", "How do I pay?", "What is the cancellation policy?"],
    emotion,
    confidence: 0.9,
    tripSlugs: t ? [t.slug] : [],
  };
}

function answerMyBooking(c: Ctx): Draft {
  const { kb } = c;
  return {
    text: `Open [My Booking](/booking-lookup) and enter your **booking reference** and the **email** you booked with. You'll see its status, payments and pickup, and can ask to cancel or reschedule there.\nI can't see bookings from this chat. ${careLine(kb, "If something looks wrong")}`,
    actions: [{ kind: "link", label: "Open My Booking", href: "/booking-lookup" }, ...careActions(kb)],
    suggestions: ["What is the cancellation policy?", "How do I pay?", "Talk to customer care"],
    emotion: "pointing",
    confidence: 0.9,
  };
}

function soloFaq(kb: KnowledgeBase): string {
  const f = kb.faqs.find((x) => /\bsolo\b/i.test(x.question));
  return f ? f.answer : "";
}

function womenLine(kb: KnowledgeBase, trips: KbTrip[]): string {
  const w = departuresOf(trips.length ? trips : kb.trips).filter((x) => x.dep.womenOnly && x.dep.bookingOpen);
  if (!w.length) return "There are no women-only dates on the calendar right now.";
  const first = w[0];
  return `Women-only batches: ${w.length} on the calendar — next **${range(kb, first.dep)}** (${first.trip.shortName}, ${seatsText(first.dep)}).`;
}

function answerSafety(c: Ctx, focus: "safety" | "solo"): Draft {
  const { kb, p } = c;
  const lines: string[] = [];
  const t = c.trips.length === 1 ? c.trips[0] : null;
  if (focus === "safety") {
    if (t && t.safetyNotes) lines.push(`**${t.shortName}:** ${t.safetyNotes}`);
    else if (kb.legal.safety && !kb.legal.draft) lines.push(firstSentence(kb.legal.safety, 220));
    if (kb.policy.vehiclePolicy) lines.push(firstSentence(kb.policy.vehiclePolicy, 200));
    lines.push(`Groups are small: at most ${kb.policy.maxGroupSize} travellers per car. Details are on our [Safety page](/safety).`);
  }
  if (focus === "solo" || p.flags.solo) {
    // Under a safety question never shorten the solo FAQ ("Yes." would read as a safety promise):
    // say only the booking fact.
    if (focus === "safety") {
      lines.push(`Solo travellers can book a single seat (one booking takes 1–${kb.policy.maxSeatsPerBooking} seats).`);
    } else {
      const faq = soloFaq(kb);
      lines.push(faq || `Yes — you can book a single seat; one booking takes 1–${kb.policy.maxSeatsPerBooking} seats.`);
    }
    if (kb.policy.roomPolicy) lines.push(firstSentence(kb.policy.roomPolicy, 220));
  }
  if (p.flags.women || focus === "solo") lines.push(womenLine(kb, c.trips));
  if (focus === "safety") lines.push(careLine(kb, "For anything specific"));
  return {
    text: lines.join("\n"),
    actions: [{ kind: "link", label: focus === "safety" ? "Safety page" : "Women-only dates", href: focus === "safety" ? "/safety" : "/trips?mode=women" }, ...(focus === "safety" ? careActions(kb) : [])],
    suggestions: ["Any women-only batches?", "How do room shares work?", "Which trips are coming up?"],
    emotion: "talking",
    confidence: 0.85,
    tripSlugs: t ? [t.slug] : [],
  };
}

function answerCoupons(c: Ctx): Draft {
  const { kb, p } = c;
  const lines = [
    "Have a coupon or creator code? Type it at checkout — it's checked and applied there before you pay.",
    "I can't share or look up codes in this chat.",
  ];
  if (p.flags.creator) lines.push("Travel creators can apply on the [Creators page](/creators) for a personal code.");
  if (kb.offers.length) lines.push(`Live offer right now: **${kb.offers[0].title || kb.offers[0].message}**`);
  const actions: AnswerAction[] = [{ kind: "link", label: "Creators programme", href: "/creators" }];
  return {
    text: lines.join("\n"),
    actions,
    suggestions: ["Do you have offers?", "How do I book?", "How do I pay?"],
    emotion: "talking",
    confidence: 0.9,
  };
}

function answerOffers(c: Ctx): Draft {
  const { kb } = c;
  const slugs = new Set(c.trips.map((t) => t.slug));
  const offers = kb.offers.filter((o) => !c.trips.length || !o.tripSlug || slugs.has(o.tripSlug));
  if (!offers.length) {
    return {
      text: "There are no special offers running right now — the prices on the site are the current prices.\nIf you have a coupon or creator code, you can enter it at checkout.",
      actions: [{ kind: "link", label: "See all trips", href: "/trips" }],
      suggestions: ["Which trips are coming up?", "Price for 4 people?", "Can I book the whole car?"],
      emotion: "sorry",
      confidence: 0.9,
    };
  }
  const lines = ["Offers live right now:"];
  for (const o of offers.slice(0, 4)) {
    const trip = o.tripSlug ? kb.trips.find((t) => t.slug === o.tripSlug) : null;
    lines.push(`- **${o.title || "Offer"}**${o.message ? ` — ${o.message}` : ""}${trip ? ` (${trip.shortName})` : ""}`);
  }
  const actions: AnswerAction[] = offers
    .filter((o) => o.ctaUrl.startsWith("/") && !o.ctaUrl.startsWith("//"))
    .slice(0, 2)
    .map((o) => ({ kind: "link" as const, label: o.ctaLabel || "See offer", href: o.ctaUrl }));
  return {
    text: lines.join("\n"),
    actions,
    suggestions: ["Which trips are coming up?", "How do I book?", "Do you have coupon codes?"],
    emotion: "happy",
    confidence: 0.9,
  };
}

function answerContact(c: Ctx): Draft {
  const { kb } = c;
  const k = kb.contact;
  const lines: string[] = [];
  if (k.careNumber) lines.push(`Call our customer care on **${k.careDisplay}**${k.careHours ? ` (${k.careHours})` : ""}.`);
  if (k.whatsappUrl) lines.push(k.careNumber ? "Or chat with us on WhatsApp." : "Chat with us on WhatsApp.");
  if (k.supportEmail) lines.push(`Email: ${k.supportEmail}`);
  if (!k.careNumber && !k.whatsappUrl) {
    lines.push("Our customer care number isn't listed here yet. Send your question through the [enquiry form](/#plan) or the [Contact page](/contact) and the team will get back to you.");
  }
  return {
    text: lines.join("\n"),
    actions: [...careActions(kb), ...(k.careNumber || k.whatsappUrl ? [] : [{ kind: "link" as const, label: "Contact page", href: "/contact" }])],
    suggestions: ["Which trips are coming up?", "Check my booking", "What is the cancellation policy?"],
    emotion: "talking",
    confidence: 0.95,
  };
}

function answerNotServed(c: Ctx, found: NonNullable<Parsed["unknownPlace"]>): Draft {
  const { kb } = c;
  const place = found.name;
  if (found.seenIn.length) {
    const lines = [`We don't run a separate trip to **${place}**, but it comes up in our trip plans:`];
    for (const s of found.seenIn.slice(0, 3)) lines.push(`- **${s.trip.title}** — ${s.where}`);
    lines.push("Ask me about that trip for dates and prices.");
    const t0 = found.seenIn[0].trip;
    return {
      intent: "place_on_route",
      text: lines.join("\n"),
      cards: found.seenIn.slice(0, 3).map((s) => tripCard(s.trip, c.p.flags.male)),
      actions: [{ kind: "link", label: "Open trip page", href: t0.url }],
      suggestions: [`${t0.shortName} itinerary`, `${t0.shortName} dates`, `Price for ${t0.shortName}?`],
      emotion: "pointing",
      confidence: 0.75,
      tripSlugs: found.seenIn.map((s) => s.trip.slug),
    };
  }
  const lines = [`We don't run a trip to **${place}** right now. Here's where we go:`];
  for (const t of kb.trips.slice(0, 6)) lines.push(`- **${t.title}** — ${t.durationLabel}, ${money(t.basePricePaise)} per seat`);
  if (!kb.trips.length) lines.push("- No trips are published at the moment.");
  lines.push('Want a custom trip? Send your plan through the [enquiry form](/#plan) (choose "Custom trip").');
  return {
    intent: "not_served",
    text: lines.join("\n"),
    cards: kb.trips.slice(0, 6).map((x) => tripCard(x, c.p.flags.male)),
    actions: [{ kind: "link", label: "Ask for a custom trip", href: "/#plan" }],
    suggestions: ["Which trips are coming up?", ...kb.trips.slice(0, 2).map((t) => `${t.shortName} dates`)],
    emotion: "sorry",
    // A word we only guessed is a place stays below ENGINE_CONFIDENT, so the AI layer may answer instead.
    confidence: found.guessed ? 0.55 : 0.85,
  };
}

function answerFaq(c: Ctx, faq: KnowledgeBase["faqs"][number], dice: number): Draft {
  return {
    intent: "faq",
    text: faq.answer,
    suggestions: ["Which trips are coming up?", "How do I book?", ...c.kb.assistant.quickQuestions.slice(0, 2)],
    emotion: "talking",
    confidence: dice >= 0.6 ? 0.85 : 0.6,
  };
}

function answerUnknown(c: Ctx): Draft {
  const { kb } = c;
  return {
    intent: "unknown",
    text: `Sorry, I don't have an answer for that on our site. I can help with trips, dates, seats left, prices, pickup points, what's included and booking.\n${careLine(kb, "For anything else")}`,
    actions: careActions(kb),
    suggestions: kb.assistant.quickQuestions.slice(0, 4),
    emotion: "sorry",
    confidence: 0.2,
  };
}

function render(c: Ctx, intent: Intent): Draft {
  switch (intent) {
    case "greeting":
      return answerGreeting(c);
    case "thanks":
    case "bye":
    case "ack":
      return answerThanks(c, intent);
    case "about":
      return answerAbout(c);
    case "list_trips":
      return answerListTrips(c);
    case "trip_details":
      return answerTripDetails(c);
    case "price":
      return answerPrice(c);
    case "dates":
      return answerDepartures(c, "dates");
    case "seats":
      return answerDepartures(c, "seats");
    case "women_only":
      return answerWomenOnly(c);
    case "private_car":
      return answerPrivateCar(c);
    case "big_group":
      return answerBigGroup(c);
    case "pickup":
      return answerPickup(c);
    case "itinerary":
      return answerItinerary(c);
    case "inclusions":
      return answerInclusions(c, /\b(entry|tickets?|entrance|permits?|tolls?|parking)\b/.test(c.p.norm) ? "tickets" : "all");
    case "meals":
      return answerInclusions(c, "meals");
    case "stay":
      return answerInclusions(c, "stay");
    case "room_sharing":
      return answerRoomSharing(c);
    case "vehicle":
      return answerVehicle(c);
    case "packing":
      return answerPacking(c);
    case "difficulty":
      return answerDifficulty(c);
    case "weather":
      return answerWeather(c);
    case "cancellation":
      return answerCancellation(c);
    case "payment":
      return answerPayment(c);
    case "how_to_book":
      return answerHowToBook(c);
    case "my_booking":
      return answerMyBooking(c);
    case "safety":
      return answerSafety(c, "safety");
    case "solo":
      return answerSafety(c, "solo");
    case "coupons":
      return answerCoupons(c);
    case "offers":
      return answerOffers(c);
    case "contact":
      return answerContact(c);
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/** Answers that offer dates or prices; with online payment off they must say how to book instead. */
const OFFERS_DATES = new Set(["price", "dates", "seats", "private_car", "women_only", "trip_details", "list_trips", "how_to_book", "ask_trip", "place_on_route", "not_served"]);

function finish(intent: string, d: Draft, fallbackTrips: KbTrip[], kb: KnowledgeBase, question: string): EngineAnswer {
  const cards = uniq(d.cards ?? [], (x) => (x.kind === "trip" ? `t:${x.slug}` : x.kind === "departure" ? `d:${x.departureId}` : `p:${x.tripSlug}:${x.name}`)).slice(0, 8);
  let rawActions = d.actions ?? [];
  // Online payment switched off: seats cannot be held online, so no "Book" buttons, and say how to book.
  if (kb.payment.method === "upi" && kb.payment.onlineReady === false) {
    const hadBook = rawActions.some((a) => a.kind === "link" && /#book$/.test(a.href));
    rawActions = rawActions.filter((a) => !(a.kind === "link" && /#book$/.test(a.href)));
    if ((hadBook || OFFERS_DATES.has(d.intent ?? intent)) && !/isn't switched on/.test(d.text)) {
      d = { ...d, text: `${d.text}\nOnline booking isn't switched on right now, so seats can't be held online. ${careLine(kb, "To book")}` };
      rawActions = [...careActions(kb), ...rawActions];
    }
  }
  const actions = uniq(rawActions, (a) => (a.kind === "call" ? a.tel : a.href)).slice(0, 4);
  const qn = normalize(question);
  let suggestions = uniq(
    (d.suggestions ?? []).map((s) => s.trim()).filter((s) => s && normalize(s) !== qn),
    (s) => normalize(s)
  ).slice(0, 4);
  if (suggestions.length < 2) {
    const fill = [...kb.assistant.quickQuestions, "Which trips are coming up?", "How do I book?", "Talk to customer care"];
    suggestions = uniq([...suggestions, ...fill.filter((s) => normalize(s) !== qn)], (s) => normalize(s)).slice(0, Math.max(2, suggestions.length));
  }
  const text = d.text.replace(/\n{3,}/g, "\n\n").trim();
  return {
    intent: d.intent ?? intent,
    confidence: Math.max(0, Math.min(1, Math.round(d.confidence * 100) / 100)),
    text,
    cards,
    actions,
    suggestions,
    emotion: d.emotion,
    tripSlugs: d.tripSlugs ?? fallbackTrips.map((t) => t.slug),
  };
}

function combine(a: Draft, b: Draft): Draft {
  return {
    intent: a.intent,
    text: `${a.text}\n\n${b.text}`,
    cards: [...(a.cards ?? []), ...(b.cards ?? [])],
    actions: [...(a.actions ?? []), ...(b.actions ?? [])],
    suggestions: a.suggestions,
    emotion: a.emotion,
    confidence: Math.min(a.confidence, b.confidence),
    tripSlugs: uniq([...(a.tripSlugs ?? []), ...(b.tripSlugs ?? [])], (x) => x),
  };
}

/**
 * Answer one visitor question from the knowledge base only.
 * `ctx.history` is the conversation so far (the current question may or may not be its last entry);
 * `ctx.pageTripSlug` is the trip page the visitor is on, if any.
 */
export function answerQuestion(
  question: string,
  kb: KnowledgeBase,
  ctx: { history?: ChatTurn[]; pageTripSlug?: string | null } = {}
): EngineAnswer {
  const raw = String(question ?? "").slice(0, CHAT_LIMITS.maxQuestionChars).trim();
  const p = parseQuestion(raw, kb);
  const turns = priorTurns(ctx.history, raw);
  const pageTrip = ctx.pageTripSlug ? kb.trips.find((t) => t.slug === ctx.pageTripSlug) ?? null : null;

  // Which trips: named > code typed > conversation > the page the visitor is on.
  let trips: KbTrip[] = p.mentioned;
  let tripSource: Ctx["tripSource"] = trips.length ? "question" : "none";
  if (!trips.length && p.codeMatch) {
    trips = [p.codeMatch.trip];
    tripSource = "question";
  }
  if (!trips.length && !p.flags.allScope) {
    const fromHistory = tripsFromHistory(turns, kb);
    if (fromHistory.length) {
      trips = fromHistory;
      tripSource = "history";
    } else if (pageTrip) {
      trips = [pageTrip];
      tripSource = "page";
    }
  }
  const c: Ctx = { kb, p, trips, tripSource };

  if (!raw) return finish("greeting", answerGreeting(c), [], kb, raw);

  const ranked = rankIntents(p);
  let best: { intent: Intent; score: number } | null = ranked.length ? ranked[0] : null;
  let inherited = false;

  // Small talk only when nothing else was asked.
  const strongOther = ranked.find((r) => !["thanks", "bye", "list_trips"].includes(r.intent) && r.score >= 2.5);
  if (best && (best.intent === "thanks" || best.intent === "bye") && (strongOther || p.mentioned.length)) {
    best = strongOther ?? null;
  }
  if (!best && p.flags.onlyAck) return finish("ack", answerThanks(c, "ack"), [], kb, raw);
  if (!best && p.flags.greeting && !p.mentioned.length && p.people === null && !p.dateFilter) {
    const rest = p.tokens.filter((t) => !GREETING_WORDS.has(t) && !STOPWORDS.has(t) && t !== normalize(kb.assistant.guideName));
    if (rest.length <= 1) return finish("greeting", answerGreeting(c), [], kb, raw);
  }

  // Follow-ups: "and for 4 people?", "what about Hampi?", "in January?"
  let fromHeadcount = false;
  if ((!best || best.score < 1.5) && (p.mentioned.length || p.people !== null || p.dateFilter || p.codeMatch || p.flags.followUpShape)) {
    const prev = p.people !== null && !p.dateFilter ? null : previousIntent(turns, kb);
    if (prev) {
      best = { intent: prev, score: 3 };
      inherited = true;
    } else if (p.people !== null) {
      // "and for 4 people?" — the price answer also lists dates with that many seats free.
      best = { intent: "price", score: 3 };
      fromHeadcount = true;
      inherited = turns.length > 0 && !p.mentioned.length;
    } else if (p.dateFilter || p.codeMatch) best = { intent: "dates", score: 3 };
    else if (p.mentioned.length) best = { intent: "trip_details", score: 3 };
  }

  // A follow-up keeps the head count and dates asked a moment ago ("Any trips in December?" → "for 4 people?"
  // → December for 4; "Hampi for 3?" → "what about Gokarna?" → Gokarna for 3).
  if (inherited && best) {
    const prevSlots = previousSlots(turns, kb);
    if (p.people === null && prevSlots.people !== null && CARRY_PEOPLE.has(best.intent)) p.people = prevSlots.people;
    if (!p.dateFilter && prevSlots.dateFilter && CARRY_DATES.has(best.intent)) p.dateFilter = prevSlots.dateFilter;
  }
  // A man named earlier in the chat ("we are 2 guys") is still travelling.
  if (!p.flags.male && previousMale(turns)) p.flags.male = true;

  // A place we don't go to.
  if (p.unknownPlace && !p.mentioned.length && !p.codeMatch) {
    const general = new Set<Intent>(["contact", "cancellation", "payment", "my_booking", "about", "coupons", "offers", "thanks", "bye", "how_to_book"]);
    if (!best || !general.has(best.intent)) {
      return finish("not_served", answerNotServed(c, p.unknownPlace), [], kb, raw);
    }
  }

  // Owner's FAQ, when it fits better than a data answer.
  const faq = bestFaq(p, kb);
  const DATA = new Set<Intent>(["price", "dates", "seats", "pickup", "itinerary", "inclusions", "meals", "stay", "women_only", "private_car", "weather", "packing", "contact"]);
  if (faq && faq.dice >= 0.45) {
    const why = p.tokens.includes("why");
    const faqScore = faq.dice * 5 + (why ? 0.5 : 0);
    // "Why only 6 people?" is a why-question, not a price question: the price guess came only from "6 people".
    const beats = !best || (why && fromHeadcount) || (faqScore > best.score + 1 && (!DATA.has(best.intent) || faq.dice >= 0.85));
    if (beats) return finish("faq", answerFaq(c, faq.faq, faq.dice), trips, kb, raw);
  }

  if (!best) {
    if (faq && faq.dice >= 0.35) return finish("faq", answerFaq(c, faq.faq, 0.5), trips, kb, raw);
    return finish("unknown", answerUnknown(c), [], kb, raw);
  }

  // Sharpen the pick.
  let intent = best.intent;
  const sc = (i: Intent) => p.scores.get(i) ?? 0;
  // "which trips are there in December" asks for dates, not the whole list.
  if (intent === "list_trips" && p.dateFilter) intent = "dates";
  // "price for 2 adults 2 kids": the kids make it a family price question, not a difficulty question.
  const ageOnlyDifficulty = sc("difficulty") > 0 && (p.matched.get("difficulty") ?? []).every((ph) => AGE_PHRASES.has(ph));
  if (intent === "difficulty" && ageOnlyDifficulty && sc("price") >= 3) intent = "price";
  if ((intent === "inclusions" || intent === "price") && /\b(gst|tax|taxes)\b/.test(p.norm)) intent = "payment";
  if (intent === "inclusions" && sc("meals") >= 3.5) intent = "meals";
  else if (intent === "inclusions" && sc("stay") >= 3.5) intent = "stay";
  if (intent === "dates" && sc("seats") >= 3.5) intent = "seats";
  if ((intent === "dates" || intent === "seats" || intent === "price") && sc("women_only") >= 2.5) intent = "women_only";
  if ((intent === "price" || intent === "dates" || intent === "seats" || intent === "how_to_book") && sc("private_car") >= 2) intent = "private_car";
  if (intent === "solo" && sc("safety") > 0) intent = "safety";
  if (
    p.people !== null &&
    p.people > kb.policy.maxGroupSize &&
    !["contact", "cancellation", "payment", "my_booking", "coupons", "offers", "pickup", "itinerary", "inclusions", "meals", "stay", "packing", "weather"].includes(intent)
  ) {
    intent = "big_group";
  }

  let draft = render(c, intent);

  // "price and dates" → answer both.
  if (!inherited && /\b(and|also|plus|with)\b|,|&/.test(raw.toLowerCase())) {
    const second = ranked.find(
      (r) =>
        r.intent !== best!.intent &&
        r.intent !== intent &&
        r.score >= 3 &&
        COMBINABLE.has(r.intent) &&
        COMBINABLE.has(intent) &&
        (FAMILY[r.intent] ?? r.intent) !== (FAMILY[intent] ?? intent) &&
        // the price answer already carries the age note
        !(intent === "price" && r.intent === "difficulty" && ageOnlyDifficulty)
    );
    if (second && !(intent === "private_car" && second.intent === "price") && !(intent === "women_only" && (second.intent === "dates" || second.intent === "seats"))) {
      const other = render(c, second.intent);
      const posFirst = p.firstPos.get(intent) ?? p.firstPos.get(best.intent) ?? 0;
      const posSecond = p.firstPos.get(second.intent) ?? Infinity;
      draft = posSecond < posFirst ? { ...combine(other, draft), emotion: draft.emotion, intent: draft.intent } : combine(draft, other);
    }
  }

  // Confidence: inherited follow-ups are a little less sure; questions with many words we
  // did not understand go to the smart layer when it is on.
  let confidence = draft.confidence;
  if (inherited) confidence = Math.min(confidence, 0.8);
  // A weak, single-word guess ("can I smoke in the car" → vehicle, "Can couples book?" → booking steps)
  // stays below ENGINE_CONFIDENT so the AI layer, when on, answers the actual question.
  else if (best.score < 2.5 && !p.mentioned.length && !p.dateFilter && !p.codeMatch && tripSource !== "page" && !(intent === "big_group" && p.people !== null)) {
    confidence = Math.min(confidence, 0.55);
  }
  const cov = coverage(p);
  if ((cov.content >= 3 && cov.ratio < 0.5) || (cov.unknown.length >= 2 && cov.ratio <= 0.6)) confidence = Math.min(confidence, 0.55);
  // Only a head count was understood ("a trip to remember with my wife"): a price list is a guess.
  if (fromHeadcount && !inherited && !p.mentioned.length && !p.dateFilter && cov.unknown.length > 0) confidence = Math.min(confidence, 0.55);
  if (intent === "trip_details" && cov.unknown.length > 0 && !inherited && sc("trip_details") === 0) {
    confidence = Math.min(confidence, 0.45);
    draft = { ...draft, text: `${draft.text}\nI'm not sure about the rest of your question. ${careLine(kb, "For that")}`, actions: [...(draft.actions ?? []), ...careActions(kb)] };
  }

  return finish(intent, { ...draft, confidence }, trips, kb, raw);
}
