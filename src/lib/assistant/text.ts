/**
 * Small pure helpers for the chat guide: text normalising, typo-tolerant word matching,
 * date / money formatting and parsing of dates and head counts from a question.
 * No I/O here, so the engine and its tests can use everything directly.
 */
import { addDaysISO } from "@/lib/dates";

export const IST_TIME_ZONE = "Asia/Kolkata";

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** Lower case, no punctuation, "27th" → "27", "4people" → "4 people", "₹" → "rupees". */
export function normalize(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘`´']/g, "")
    .replace(/₹/g, " rupees ")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(norm: string): string[] {
  return norm ? norm.split(" ").filter(Boolean) : [];
}

/** Optimal-string-alignment distance (Levenshtein + swapped neighbours), stops early above `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** How many typos a word of this length may carry and still count as the same word. */
export function allowedTypos(word: string): number {
  if (word.length >= 9) return 2;
  if (word.length >= 5) return 1;
  return 0;
}

/** Same word, allowing a typo or two for longer words (never for short ones). */
export function fuzzyWordEq(token: string, word: string): boolean {
  if (token === word) return true;
  const max = allowedTypos(word);
  if (max === 0 || token.length < 4) return false;
  if (/^\d+$/.test(token) || /^\d+$/.test(word)) return false;
  // Typos almost never change the first letter; requiring it keeps "bangalore" from becoming "mangalore".
  if (token[0] !== word[0]) return false;
  return editDistance(token, word, max) <= max;
}

/** True when `phrase` (already normalised, words separated by spaces) appears as whole words in `norm`. */
export function hasPhrase(norm: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${norm} `.includes(` ${phrase} `);
}

/** Owner placeholders such as "[Owner to verify support email]" are not facts. */
export function isPlaceholder(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  if (!v) return true;
  if (/^\[[^\]]*\]$/.test(v)) return true;
  return false;
}

/**
 * A fact as the visitor should read it: empty when it is only an owner placeholder,
 * "[Owner to …]" pieces removed, and the "DRAFT FOR OWNER REVIEW:" prefix dropped.
 */
export function cleanFact(value: string | null | undefined): string {
  if (!value || isPlaceholder(value)) return "";
  const v = value
    .replace(/\[(?:owner|to be|tbd|todo)[^\]]*\]/gi, "")
    .replace(/^\s*draft for owner review\s*:\s*/i, "")
    // "Draft policy: …", "Draft operational note: …" — the label is for the owner, not the visitor.
    .replace(/^\s*draft\s+(?:policy|operational note|operations note|note)\s*:\s*/i, "")
    // "… Owner to confirm exact vehicle checklist." is a to-do for the owner, never a fact.
    .replace(/(?:^|(?<=[.!?;]\s*))\s*owner to (?:confirm|verify|review|decide|update|add|check|finalise|finalize)\b[^.!?]*[.!?]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(v)) return "";
  return v;
}

/** True when the owner marked this text as a draft. */
export function isDraftText(value: string | null | undefined): boolean {
  return Boolean(
    value &&
      (/draft for owner review/i.test(value) ||
        /^\s*draft\s*:/i.test(value) ||
        /^\s*draft\s+(?:policy|operational note|operations note|note)\s*:/i.test(value) ||
        /\[owner to/i.test(value) ||
        /\bowner to (?:confirm|verify|review|decide|update|add|check|finalise|finalize)\b/i.test(value))
  );
}

/** First sentence (or the whole text when it is short). */
export function firstSentence(text: string, maxChars = 180): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  if (m && m[1].length <= maxChars + 40) return m[1];
  return t;
}

// ---------------------------------------------------------------------------
// Dates (plain YYYY-MM-DD calendar dates, never shifted by time zones)
// ---------------------------------------------------------------------------

export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Today (or `now`) in India as YYYY-MM-DD. */
export function istDateISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function splitISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

export function isoOf(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

export function isValidISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const { y, m, d } = splitISO(iso);
  return isoOf(y, m, d) === iso;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  const { y, m, d } = splitISO(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const addDays = addDaysISO;

export function daysBetween(fromISO: string, toISO: string): number {
  const a = splitISO(fromISO);
  const b = splitISO(toISO);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

export function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "Fri 27 Nov" (or "Fri 27 Nov 2026" with `withYear`). */
export function fmtDay(iso: string, withYear = false): string {
  const { y, m, d } = splitISO(iso);
  return `${WEEKDAYS_SHORT[weekdayOf(iso)]} ${d} ${MONTHS_SHORT[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** "Fri 27 – Sun 29 Nov", or "Mon 30 Nov – Wed 2 Dec" across months. */
export function fmtRange(startISO: string, endISO: string, withYear = false): string {
  if (!endISO || endISO === startISO) return fmtDay(startISO, withYear);
  const s = splitISO(startISO);
  const e = splitISO(endISO);
  if (s.y === e.y && s.m === e.m) {
    return `${WEEKDAYS_SHORT[weekdayOf(startISO)]} ${s.d} – ${fmtDay(endISO, withYear)}`;
  }
  if (s.y === e.y) return `${fmtDay(startISO)} – ${fmtDay(endISO, withYear)}`;
  return `${fmtDay(startISO, true)} – ${fmtDay(endISO, true)}`;
}

/** "Wed 2 Dec 2026, 6:00 PM IST" for a timestamp. Empty when it cannot be read. */
export function fmtInstantIST(isoTimestamp: string): string {
  const t = Date.parse(isoTimestamp);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const day = fmtDay(istDateISO(d), true);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${day}, ${time} IST`;
}

// ---------------------------------------------------------------------------
// Numbers and head counts
// ---------------------------------------------------------------------------

export const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  // Kannada (romanised)
  ondu: 1,
  obba: 1,
  eradu: 2,
  yeradu: 2,
  ibbaru: 2,
  mooru: 3,
  muru: 3,
  naalku: 4,
  nalku: 4,
  aidu: 5,
  aidhu: 5,
  aaru: 6,
  // Hindi (romanised)
  ek: 1,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  saat: 7,
  aath: 8,
  dus: 10,
  das: 10,
};

export function readNumber(token: string | undefined): number | null {
  if (!token) return null;
  if (/^\d{1,3}$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
}

/** Words that name the whole party: "4 people", "3 seats". */
const TOTAL_WORDS = new Set([
  "people",
  "peoples",
  "person",
  "persons",
  "pax",
  "member",
  "members",
  "traveller",
  "travellers",
  "traveler",
  "travelers",
  "guest",
  "guests",
  "seat",
  "seats",
  "ticket",
  "tickets",
  "head",
  "heads",
  "jana",
  "janaru",
  "log",
  "logon",
  "logo",
  "ppl",
  "folks",
]);

/** Words that name part of the party; these add up ("2 adults and 1 kid" = 3). Value = people per unit. */
const PART_WORDS: Record<string, number> = {
  adult: 1,
  adults: 1,
  friend: 1,
  friends: 1,
  colleague: 1,
  colleagues: 1,
  girl: 1,
  girls: 1,
  boy: 1,
  boys: 1,
  guy: 1,
  guys: 1,
  lady: 1,
  ladies: 1,
  woman: 1,
  women: 1,
  men: 1,
  gents: 1,
  kid: 1,
  kids: 1,
  child: 1,
  children: 1,
  infant: 1,
  infants: 1,
  baby: 1,
  babies: 1,
  toddler: 1,
  toddlers: 1,
  teen: 1,
  teens: 1,
  teenager: 1,
  teenagers: 1,
  senior: 1,
  seniors: 1,
  couple: 2,
  couples: 2,
};

/** Child words: each child still takes a seat in the car. */
export const CHILD_WORDS = new Set(["kid", "kids", "child", "children", "infant", "infants", "baby", "babies", "toddler", "toddlers", "teen", "teens", "teenager", "teenagers", "minor", "minors"]);

/**
 * Numbers written ONLY as ordinals in the raw question ("18th", "2nd"): those are dates, never head
 * counts. A number that also appears plain ("for 2 on 2nd") is not in the set.
 */
export function ordinalOnlyNumbers(raw: string): Set<number> {
  const ordinals = new Set<number>();
  for (const m of raw.matchAll(/(?<![\d])(\d{1,2})\s?(?:st|nd|rd|th)\b/gi)) ordinals.add(Number(m[1]));
  const plain = new Set<number>();
  for (const m of raw.matchAll(/(?<![\d])(\d{1,3})(?![\d])(?!\s?(?:st|nd|rd|th)\b)/gi)) plain.add(Number(m[1]));
  for (const n of plain) ordinals.delete(n);
  return ordinals;
}

const NOT_A_HEADCOUNT_AFTER = new Set([
  "days",
  "day",
  "nights",
  "night",
  "am",
  "pm",
  "hrs",
  "hours",
  "hour",
  "km",
  "kms",
  "percent",
  "rupees",
  "rs",
  "k",
  "minutes",
  "mins",
  "weeks",
  "months",
  "years",
  "year",
]);

/**
 * How many travellers the question is about: "for 4 people", "we are 3", "family of 5",
 * "couple" → 2, "solo" → 1. Null when no count is given.
 */
export function parseHeadcount(
  tokens: string[],
  isMonthWord: (t: string) => boolean,
  /** Numbers that were written as ordinals ("18th"): dates, never people. See ordinalOnlyNumbers. */
  notPeople: ReadonlySet<number> = new Set()
): number | null {
  const skip = (i: number) =>
    // "04" or "dec 4 seats" is a date, not a head count; so is "18th".
    /^0\d/.test(tokens[i]) || (i > 0 && isMonthWord(tokens[i - 1])) || (i > 0 && tokens[i - 1] === "day") || (/^\d+$/.test(tokens[i]) && notPeople.has(Number(tokens[i])));

  /** "we are 4", "group of 8", "family of 5", "total 3", "for 4" (not "for 27 Nov", "for 3 days"). */
  const fromContext = (i: number, n: number): boolean => {
    const next = tokens[i + 1];
    const prev = tokens[i - 1];
    const prev2 = tokens[i - 2];
    if (prev && ["are", "were", "of", "total", "team", "group", "batch", "party"].includes(prev)) {
      // "of 4" alone is not enough unless a group word came before it
      const ofOk = prev !== "of" || Boolean(prev2 && ["group", "family", "team", "party", "batch"].includes(prev2));
      if (ofOk && (!next || !NOT_A_HEADCOUNT_AFTER.has(next)) && !(next && isMonthWord(next))) return true;
    }
    return prev === "for" && n <= 20 && (!next || (!NOT_A_HEADCOUNT_AFTER.has(next) && !isMonthWord(next)));
  };

  // Groups add up: "2 adults and 1 kid" = 3, "3 couples" = 6; a total wins when bigger:
  // "4 people, 2 adults 2 kids" = 4, "family of 4 with 2 kids" = 4.
  let total = 0;
  let parts = 0;
  let anyGroup = false;
  let firstContext: number | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const n = readNumber(t);
    const prev = tokens[i - 1];
    if (n === null) {
      // "a couple and 2 kids": a couple without a number is 2 people (not "a couple of days";
      // "trips for couples" is about couples in general, not a head count).
      if (t === "couple" && !(prev && readNumber(prev) !== null) && tokens[i + 1] !== "of") {
        parts += 2;
        anyGroup = true;
      }
      continue;
    }
    if (n < 1 || n > 60 || skip(i)) continue;
    let next = tokens[i + 1];
    let k = i + 1;
    if (next === "more") next = tokens[++k];
    if (next && TOTAL_WORDS.has(next)) {
      total = Math.max(total, n);
      anyGroup = true;
    } else if (next && PART_WORDS[next]) {
      parts += n * PART_WORDS[next];
      anyGroup = true;
    } else if (next === "of" && tokens[k + 1] === "us") {
      total = Math.max(total, n);
      anyGroup = true;
    } else if (fromContext(i, n)) {
      total = Math.max(total, n);
      if (firstContext === null) firstContext = n;
    }
  }
  if (anyGroup) {
    const sum = Math.max(total, parts);
    if (sum >= 1 && sum <= 60) return sum;
  }
  if (firstContext !== null) return firstContext;

  const norm = ` ${tokens.join(" ")} `;
  if (/ (couple|(me and|with) my (wife|husband|partner|girlfriend|boyfriend|friend|sister|brother|mother|father|mom|dad|fiance|fiancee)|two of us|duo|pair) /.test(norm)) return 2;
  if (/ (trio|three of us) /.test(norm)) return 3;
  if (/ (solo|alone|just me|only me|by myself|on my own|single person|one person|myself) /.test(norm)) return 1;
  return null;
}

// ---------------------------------------------------------------------------
// Months and date filters
// ---------------------------------------------------------------------------

const MONTH_TOKENS: Record<string, number> = {
  jan: 1,
  january: 1,
  janvari: 1,
  janaury: 1,
  feb: 2,
  february: 2,
  febuary: 2,
  farvari: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
  decembar: 12,
  disambar: 12,
};

const LONG_MONTH_NAMES = Object.keys(MONTH_TOKENS).filter((k) => k.length >= 6);

/** Month number for a word ("dec", "December", "decmber"), else null. "may" only counts when `allowMay`. */
export function monthOf(token: string, allowMay = true): number | null {
  if (token === "may") return allowMay ? 5 : null;
  if (MONTH_TOKENS[token]) return MONTH_TOKENS[token];
  if (token.length >= 6) {
    for (const name of LONG_MONTH_NAMES) if (fuzzyWordEq(token, name)) return MONTH_TOKENS[name];
  }
  return null;
}

export function isMonthToken(token: string): boolean {
  return token !== "may" && monthOf(token) !== null;
}

export type DateFilter =
  | { kind: "range"; from: string; to: string; label: string }
  /** `fromOrdinal`: only "18th" was written (no month), so the visitor may mean a later 18th. */
  | { kind: "day"; date: string; label: string; fromOrdinal?: boolean };

/** The year a month name refers to: this year, or next year once the month has passed. */
function yearForMonth(month: number, todayISO: string): number {
  const t = splitISO(todayISO);
  return month < t.m ? t.y + 1 : t.y;
}

function monthRange(y: number, m: number, todayISO: string, label?: string): DateFilter {
  const from = isoOf(y, m, 1);
  const to = isoOf(y, m, lastDayOfMonth(y, m));
  return { kind: "range", from: from < todayISO ? todayISO : from, to, label: label ?? `in ${MONTHS_LONG[m - 1]}${y !== splitISO(todayISO).y ? ` ${y}` : ""}` };
}

/** Saturday–Sunday window of the weekend that is `weeksAhead` weekends away (Fri start included). */
function weekendRange(todayISO: string, weeksAhead: number): { from: string; to: string } {
  const wd = weekdayOf(todayISO);
  // Sunday counts as part of the current weekend.
  const toSaturday = wd === 0 ? -1 : 6 - wd;
  const saturday = addDays(todayISO, toSaturday + weeksAhead * 7);
  const friday = addDays(saturday, -1);
  const sunday = addDays(saturday, 1);
  return { from: friday < todayISO ? todayISO : friday, to: sunday };
}

/** Words that may follow a bare ordinal date ("for 18th please", "18th ge"). Anything else ("2nd day", "25th birthday") is not a date. */
const AFTER_BARE_ORDINAL = new Set(["and", "or", "to", "till", "until", "please", "pls", "plz", "ge", "ki", "ko", "ka", "ke", "alli", "ku", "na", "se", "ya", "onwards"]);

/** "18th" on its own → the next 18th of a month (YYYY-MM-DD), else null. */
function bareOrdinalDay(lower: string, todayISO: string): string | null {
  for (const m of lower.matchAll(/(?<![\d])(\d{1,2})\s?(?:st|nd|rd|th)\b/g)) {
    const n = Number(m[1]);
    if (n < 1 || n > 31) continue;
    // Only the words up to the next punctuation mark belong to this date.
    const rest = lower.slice((m.index ?? 0) + m[0].length).split(/[.?!,;:\n]/)[0];
    const words = rest.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
    let monthShift = 0;
    if (words.length) {
      const [w1, w2, w3] = words;
      if (monthOf(w1, false) || (w1 === "of" && w2 && monthOf(w2, true))) continue; // "18th dec" is read elsewhere
      // "18th this month", "18th of next month"
      const [m1, m2] = w1 === "of" ? [w2, w3] : [w1, w2];
      if (m2 === "month" && m1 === "this") monthShift = 0;
      else if (m2 === "month" && (m1 === "next" || m1 === "coming" || m1 === "following")) monthShift = 1;
      else if (!AFTER_BARE_ORDINAL.has(w1)) continue;
    }
    // The word before must not make it something else ("my 25th", "the 2nd day" handled above).
    const before = lower.slice(0, m.index ?? 0).trim().split(/\s+/).pop() ?? "";
    if (["my", "our", "his", "her", "their", "your"].includes(before)) continue;
    const t = splitISO(todayISO);
    let y = t.y;
    let mo = t.m + monthShift;
    if (mo > 12) {
      mo -= 12;
      y += 1;
    }
    if (monthShift === 0 && n < t.d) {
      mo += 1;
      if (mo > 12) {
        mo = 1;
        y += 1;
      }
    }
    // Months without that day (31st in a 30-day month): the next month that has it.
    for (let tries = 0; tries < 3 && n > lastDayOfMonth(y, mo); tries++) {
      mo += 1;
      if (mo > 12) {
        mo = 1;
        y += 1;
      }
    }
    if (n > lastDayOfMonth(y, mo)) continue;
    return isoOf(y, mo, n);
  }
  return null;
}

/**
 * Dates the visitor asked about: a specific day ("27 Nov", "2026-12-04", "4/12"), a month
 * ("in December", "next month"), "this weekend", "next weekend", "this week", "tomorrow".
 */
export function parseDateFilter(raw: string, norm: string, tokens: string[], todayISO: string): DateFilter | null {
  const today = splitISO(todayISO);
  const lower = raw.toLowerCase();

  // 2026-12-04
  const iso = lower.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const d = isoOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (isValidISODate(d)) return { kind: "day", date: d, label: `on ${fmtDay(d)}` };
  }
  // 4/12, 04-12-2026, 4.12.26 (day first, as written in India). Not "we are 3/4 people" (3 or 4 people).
  const dm =
    lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/) ?? lower.match(/\b(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})\b/);
  const peopleAfter = dm
    ? /^\s*(?:more\s+)?(?:people|peoples|persons?|pax|adults?|members?|friends?|of us|seats?|guests?|travell?ers?|ppl|jana|janaru|log|kids|children|couples?|girls|boys|guys|ladies|women|men)\b/.test(
        lower.slice((dm.index ?? 0) + dm[0].length)
      )
    : false;
  if (dm && !peopleAfter) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      let y = dm[3] ? Number(dm[3]) : yearForMonth(month, todayISO);
      if (y < 100) y += 2000;
      const d = isoOf(y, month, day);
      if (isValidISODate(d) && splitISO(d).d === day) {
        // A past day without a year means next year.
        const date = !dm[3] && d < todayISO ? isoOf(y + 1, month, day) : d;
        return { kind: "day", date, label: `on ${fmtDay(date)}` };
      }
    }
  }
  // "27 nov", "nov 27", "27 november 2026"
  for (let i = 0; i < tokens.length; i++) {
    const allowMay = i > 0 && /^\d{1,2}$/.test(tokens[i - 1]);
    const m = monthOf(tokens[i], allowMay || /^\d{1,2}$/.test(tokens[i + 1] ?? ""));
    if (!m) continue;
    const before = tokens[i - 1];
    const after = tokens[i + 1];
    let day: number | null = null;
    let yearTok: string | undefined;
    if (before && /^\d{1,2}$/.test(before)) {
      day = Number(before);
      yearTok = after;
    } else if (before === "of" && /^\d{1,2}$/.test(tokens[i - 2] ?? "")) {
      // "18th of December"
      day = Number(tokens[i - 2]);
      yearTok = after;
    } else if (after && /^\d{1,2}$/.test(after)) {
      day = Number(after);
      yearTok = tokens[i + 2];
    }
    if (day !== null && day >= 1 && day <= 31) {
      const y = yearTok && /^20\d{2}$/.test(yearTok) ? Number(yearTok) : yearForMonth(m, todayISO);
      if (day <= lastDayOfMonth(y, m)) {
        let date = isoOf(y, m, day);
        if (!yearTok && date < todayISO) date = isoOf(y + 1, m, day);
        return { kind: "day", date, label: `on ${fmtDay(date)}` };
      }
    }
  }

  // A bare ordinal day: "any seats for 18th?" = the next 18th (this month, or next month once it has passed).
  const bare = bareOrdinalDay(lower, todayISO);
  if (bare) return { kind: "day", date: bare, label: `on ${fmtDay(bare)}`, fromOrdinal: true };

  if (/\b(today|tonight|indu|aaj)\b/.test(norm)) return { kind: "day", date: todayISO, label: "today" };
  if (/\b(tomorrow|nale|naale|kal)\b/.test(norm)) {
    const d = addDays(todayISO, 1);
    return { kind: "day", date: d, label: `tomorrow (${fmtDay(d)})` };
  }
  if (/\b(day after tomorrow|nadidu|parso)\b/.test(norm)) {
    const d = addDays(todayISO, 2);
    return { kind: "day", date: d, label: `on ${fmtDay(d)}` };
  }
  if (/\b(next|following) weekend\b/.test(norm)) {
    const r = weekendRange(todayISO, 1);
    return { kind: "range", from: r.from, to: r.to, label: `next weekend (${fmtRange(r.from, r.to)})` };
  }
  if (/\b(this|current|coming|the|on|for|over) weekend\b|\bweekend$/.test(norm) && !/\blong weekend\b/.test(norm)) {
    const r = weekendRange(todayISO, 0);
    return { kind: "range", from: r.from, to: r.to, label: `this weekend (${fmtRange(r.from, r.to)})` };
  }
  if (/\bnext week\b/.test(norm)) {
    const wd = weekdayOf(todayISO);
    const monday = addDays(todayISO, ((8 - wd) % 7) || 7);
    return { kind: "range", from: monday, to: addDays(monday, 6), label: `next week (${fmtRange(monday, addDays(monday, 6))})` };
  }
  if (/\bthis week\b/.test(norm)) {
    const wd = weekdayOf(todayISO);
    const sunday = addDays(todayISO, wd === 0 ? 0 : 7 - wd);
    return { kind: "range", from: todayISO, to: sunday, label: "this week" };
  }
  if (/\b(next|coming|following) month\b|\bmundina tingal|\bagle mahine\b/.test(norm)) {
    const m = today.m === 12 ? 1 : today.m + 1;
    const y = today.m === 12 ? today.y + 1 : today.y;
    return monthRange(y, m, todayISO, `next month (${MONTHS_LONG[m - 1]})`);
  }
  if (/\bthis month\b|\bee tingal|\bis mahine\b/.test(norm)) {
    return monthRange(today.y, today.m, todayISO, `this month (${MONTHS_LONG[today.m - 1]})`);
  }
  if (/\b(christmas|xmas)\b/.test(norm)) {
    const y = todayISO > `${today.y}-12-27` ? today.y + 1 : today.y;
    return { kind: "range", from: isoOf(y, 12, 20), to: isoOf(y, 12, 27), label: "around Christmas" };
  }
  if (/\bnew year\b|\bnew years\b/.test(norm)) {
    const y = today.m === 1 && today.d <= 3 ? today.y - 1 : today.y;
    const from = isoOf(y, 12, 27) < todayISO ? todayISO : isoOf(y, 12, 27);
    return { kind: "range", from, to: isoOf(y + 1, 1, 3), label: "around New Year" };
  }

  // Plain month: "december", "in jan", "may 2027", "in may"
  for (let i = 0; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    const mayOk = Boolean(
      (prev && ["in", "during", "for", "this", "next", "of", "from", "till", "until", "by", "early", "late", "mid", "end"].includes(prev)) ||
        (next && /^20\d{2}$/.test(next)) ||
        next === "month"
    );
    const m = monthOf(tokens[i], mayOk);
    if (!m) continue;
    const y = next && /^20\d{2}$/.test(next) ? Number(next) : prev === "next" && m === today.m ? today.y + 1 : yearForMonth(m, todayISO);
    return monthRange(y, m, todayISO);
  }
  return null;
}
