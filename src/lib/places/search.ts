/**
 * Smart search for the trips page: Karnataka places (typo-tolerant, aliases, district names) and
 * the published trips that go to them. Pure functions, no React, no data imports: the place list
 * is passed in, so the trips page can load it lazily.
 *
 * Speed: every place, district and trip is normalised once and kept in a WeakMap keyed by the
 * array / object, so a keystroke only compares strings (well under 2 ms for 250 places).
 */

import type { TripWithDetails } from "@/lib/types";
import type { KarnatakaDistrict, KarnatakaPlace, PlaceCategory } from "./types";

// ---------------------------------------------------------------------------
// Normalising
// ---------------------------------------------------------------------------

/** Lowercase, accents and apostrophes removed, any other punctuation becomes a space, spaces collapsed. */
export function normalize(text: string): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .normalize("NFC"); // Kannada vowel signs back in their usual (composed) form
}

// ---------------------------------------------------------------------------
// Typo distance
// ---------------------------------------------------------------------------

let rowA = new Int32Array(32);
let rowB = new Int32Array(32);
let rowC = new Int32Array(32);

/**
 * Damerau-Levenshtein distance (optimal string alignment: insert, delete, change, swap two
 * neighbours). Stops early and returns max + 1 once the distance must be larger than `max`.
 */
export function typoDistance(a: string, b: string, max = 2, bLength = b.length): number {
  const la = a.length;
  const lb = Math.min(bLength, b.length);
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (rowA.length <= lb) {
    rowA = new Int32Array(lb + 1);
    rowB = new Int32Array(lb + 1);
    rowC = new Int32Array(lb + 1);
  }
  // prev2 = row i-2, prev = row i-1, cur = row i
  let prev2 = rowA;
  let prev = rowB;
  let cur = rowC;
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const bj = b.charCodeAt(j - 1);
      const cost = ai === bj ? 0 : 1;
      let v = prev[j - 1] + cost;
      const del = prev[j] + 1;
      if (del < v) v = del;
      const ins = cur[j - 1] + 1;
      if (ins < v) v = ins;
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj) {
        const swap = prev2[j - 2] + 1;
        if (swap < v) v = swap;
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  return prev[lb];
}

/** Typos allowed for a word of this length: none under 4 letters, 1 for 4-7, 2 for 8 or more. */
export function typoLimit(length: number): number {
  if (length < 4) return 0;
  return length <= 7 ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Match strength, best first. */
export const MATCH_SCORES = {
  exact: 1000,
  prefix: 800,
  wordPrefix: 650,
  substring: 450,
  /** Minus 50 for every typo. */
  typo: 300,
} as const;

export type MatchField = "name" | "alias" | "district" | "districtAlias";

/** How much each field counts: a place's own name beats its district. */
const FIELD_WEIGHT: Record<MatchField, number> = { name: 1, alias: 0.95, district: 0.6, districtAlias: 0.58 };

interface Prepared {
  norm: string;
  compact: string;
  tokens: string[];
  /** Letter sets (see letterMask) of the whole text and of each word, for skipping hopeless typo checks. */
  mask: number;
  tokenMasks: number[];
}

/** One bit per letter a-z, one for digits, a few shared bits for any other letter. Spaces ignored. */
function letterMask(s: string): number {
  let m = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 32) continue;
    if (c >= 97 && c <= 122) m |= 1 << (c - 97);
    else if (c >= 48 && c <= 57) m |= 1 << 26;
    else m |= 1 << (27 + (c % 4));
  }
  return m;
}

function bitCount(n: number): number {
  let v = n - ((n >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Letters of `q` that `c` does not have at all: each needs at least one typo. */
const missingLetters = (qMask: number, cMask: number) => bitCount(qMask & ~cMask);

function prepare(text: string): Prepared {
  const norm = normalize(text);
  const tokens = norm ? norm.split(" ") : [];
  return { norm, compact: norm.replace(/ /g, ""), tokens, mask: letterMask(norm), tokenMasks: tokens.map(letterMask) };
}

/** Score of one text for the query (0 = no match), before the field weight. */
export function scoreText(query: string, text: string): number {
  return scorePrepared(prepare(query), prepare(text));
}

function scorePrepared(q: Prepared, c: Prepared): number {
  if (!q.norm || !c.norm) return 0;
  if (c.norm === q.norm) return MATCH_SCORES.exact;
  if (c.compact === q.compact) return MATCH_SCORES.exact - 10;
  // Inside a tier, texts with fewer extra words come first ("Abbey Falls" before "Onake Abbi Falls").
  const extra = Math.min(20, 2 * Math.max(0, c.tokens.length - q.tokens.length));
  if (c.norm.startsWith(q.norm)) return MATCH_SCORES.prefix - extra;
  if (c.compact.startsWith(q.compact)) return MATCH_SCORES.prefix - 10 - extra;
  // Every typed word starts a word of the text ("falls ab" → "Abbey Falls").
  if (q.tokens.every((qt) => c.tokens.some((t) => t.startsWith(qt)))) return MATCH_SCORES.wordPrefix - extra;
  if (q.compact.length >= 3 && (c.norm.includes(q.norm) || c.compact.includes(q.compact))) return MATCH_SCORES.substring - extra;
  if (q.compact.length < 4) return 0;
  const typos = typoCount(q, c);
  return typos === null ? 0 : MATCH_SCORES.typo - 50 * typos - extra;
}

/** Smallest number of typos that explains the query, or null if too many. */
function typoCount(q: Prepared, c: Prepared): number | null {
  let best = Infinity;
  // Whole text ("abby falls" ~ "abbey falls").
  const whole = typoLimit(q.compact.length);
  const wholeHope = missingLetters(q.mask, c.mask) <= whole;
  const dWhole = wholeHope ? typoDistance(q.norm, c.norm, whole) : whole + 1;
  if (dWhole <= whole) best = dWhole;
  // Still typing: the start of the text ("chikkamagal" ~ "chikkamagaluru").
  if (wholeHope && best > 0 && c.norm.length > q.norm.length) {
    const dStart = typoDistance(q.norm, c.norm, whole, q.norm.length);
    if (dStart <= whole && dStart < best) best = dStart;
  }
  if (best <= 1) return best;
  // Word by word ("kudremuk peak" ~ "kudremukh peak").
  let sum = 0;
  for (let i = 0; i < q.tokens.length; i++) {
    const qt = q.tokens[i];
    const isLast = i === q.tokens.length - 1;
    const lim = typoLimit(qt.length);
    const qMask = q.tokenMasks[i];
    let tokenBest = Infinity;
    for (let j = 0; j < c.tokens.length; j++) {
      const t = c.tokens[j];
      if (t === qt || (isLast && t.startsWith(qt))) {
        tokenBest = 0;
        break;
      }
      if (lim === 0 || missingLetters(qMask, c.tokenMasks[j]) > lim) continue;
      const d = typoDistance(qt, t, lim);
      if (d < tokenBest) tokenBest = d;
      if (isLast && t.length > qt.length) {
        const dp = typoDistance(qt, t, lim, qt.length);
        if (dp < tokenBest) tokenBest = dp;
      }
    }
    if (tokenBest > lim) {
      sum = Infinity;
      break;
    }
    sum += tokenBest;
  }
  if (sum < best) best = sum;
  return Number.isFinite(best) ? best : null;
}

// ---------------------------------------------------------------------------
// Place index (built once per place list)
// ---------------------------------------------------------------------------

interface Candidate extends Prepared {
  field: MatchField;
  text: string;
}

interface PlaceEntry {
  place: KarnatakaPlace;
  index: number;
  /** The place's own name and aliases. */
  candidates: Candidate[];
  /** Its district's name and aliases (shared by every place in the district, scored once per search). */
  districtKey: string;
  districtCandidates: Candidate[];
}

interface DistrictEntry {
  district: KarnatakaDistrict;
  candidates: Candidate[];
  /** Normalised name + aliases of 3+ letters, longest first, for finding the district in a text. */
  needles: string[];
}

const districtIndexCache = new WeakMap<readonly KarnatakaDistrict[], Map<string, DistrictEntry>>();
const placeIndexCache = new WeakMap<readonly KarnatakaPlace[], WeakMap<readonly KarnatakaDistrict[], PlaceEntry[]>>();

function candidateList(items: { field: MatchField; text: string }[]): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const { field, text } of items) {
    const p = prepare(text);
    if (!p.norm || seen.has(p.norm)) continue;
    seen.add(p.norm);
    out.push({ field, text, ...p });
  }
  return out;
}

function districtIndex(districts: readonly KarnatakaDistrict[]): Map<string, DistrictEntry> {
  let idx = districtIndexCache.get(districts);
  if (!idx) {
    idx = new Map();
    for (const d of districts) {
      const candidates = candidateList([
        { field: "district", text: d.name },
        ...(d.aliases ?? []).map((text) => ({ field: "districtAlias" as const, text })),
      ]);
      const needles = candidates
        .map((c) => c.norm)
        .filter((n) => n.length >= 3)
        .sort((a, b) => b.length - a.length);
      idx.set(d.name, { district: d, candidates, needles });
    }
    districtIndexCache.set(districts, idx);
  }
  return idx;
}

function placeIndex(places: readonly KarnatakaPlace[], districts: readonly KarnatakaDistrict[]): PlaceEntry[] {
  let byDistricts = placeIndexCache.get(places);
  if (!byDistricts) {
    byDistricts = new WeakMap();
    placeIndexCache.set(places, byDistricts);
  }
  let entries = byDistricts.get(districts);
  if (!entries) {
    const dIdx = districtIndex(districts);
    const unknownDistricts = new Map<string, Candidate[]>();
    entries = places.map((place, index) => {
      const candidates = candidateList([
        { field: "name", text: place.name },
        ...(place.aliases ?? []).map((text) => ({ field: "alias" as const, text })),
      ]);
      let districtCandidates = dIdx.get(place.district)?.candidates;
      if (!districtCandidates) {
        districtCandidates = unknownDistricts.get(place.district) ?? candidateList([{ field: "district", text: place.district ?? "" }]);
        unknownDistricts.set(place.district, districtCandidates);
      }
      return { place, index, candidates, districtKey: place.district, districtCandidates };
    });
    byDistricts.set(districts, entries);
  }
  return entries;
}

export interface PlaceHit {
  place: KarnatakaPlace;
  score: number;
  /** Which field matched best, and its text (e.g. the alias "Abbi Falls"). */
  field: MatchField;
  matched: string;
}

interface Best {
  score: number;
  c: Candidate | null;
}

function bestOf(q: Prepared, candidates: readonly Candidate[], start: Best): Best {
  let { score, c: bestC } = start;
  for (const c of candidates) {
    const weight = FIELD_WEIGHT[c.field];
    if (MATCH_SCORES.exact * weight <= score) continue; // cannot beat what we have
    const s = scorePrepared(q, c) * weight;
    if (s > score) {
      score = s;
      bestC = c;
    }
  }
  return { score, c: bestC };
}

/** Places for a typed text, best first (ties keep the list's own order). */
export function searchPlaces(
  query: string,
  places: readonly KarnatakaPlace[],
  districts: readonly KarnatakaDistrict[],
  limit = 30,
): PlaceHit[] {
  const q = prepare(query);
  if (!q.norm) return [];
  const hits: (PlaceHit & { index: number })[] = [];
  const byDistrict = new Map<string, Best>();
  const none: Best = { score: 0, c: null };
  for (const entry of placeIndex(places, districts)) {
    let best = bestOf(q, entry.candidates, none);
    if (best.score < MATCH_SCORES.exact * FIELD_WEIGHT.district) {
      let d = byDistrict.get(entry.districtKey);
      if (!d) {
        d = bestOf(q, entry.districtCandidates, none);
        byDistrict.set(entry.districtKey, d);
      }
      if (d.score > best.score) best = d;
    }
    if (best.c && best.score > 0) {
      hits.push({ place: entry.place, score: best.score, field: best.c.field, matched: best.c.text, index: entry.index });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.index - b.index);
  return hits.slice(0, Math.max(0, limit)).map(({ index: _index, ...h }) => h);
}

/** True when the hit is a strong one (exact, start or word start of the place's own name or alias). */
export function isStrongHit(hit: PlaceHit): boolean {
  return (hit.field === "name" || hit.field === "alias") && hit.score >= (MATCH_SCORES.wordPrefix - 20) * FIELD_WEIGHT.alias;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export interface CategoryGroup<T> {
  category: PlaceCategory;
  items: T[];
}

const placeOf = (item: KarnatakaPlace | PlaceHit): KarnatakaPlace => ("place" in item ? item.place : item);

/**
 * Results grouped by each place's main category, groups in `order` (categories missing from
 * `order` come last), items keeping their rank inside a group. Empty groups are left out.
 */
export function groupByCategory<T extends KarnatakaPlace | PlaceHit>(
  results: readonly T[],
  order: readonly PlaceCategory[],
): CategoryGroup<T>[] {
  const groups = new Map<PlaceCategory, T[]>();
  for (const item of results) {
    const cat = placeOf(item).categories[0];
    if (!cat) continue;
    const list = groups.get(cat);
    if (list) list.push(item);
    else groups.set(cat, [item]);
  }
  const rank = (c: PlaceCategory) => {
    const i = order.indexOf(c);
    return i === -1 ? order.length : i;
  };
  return [...groups.entries()]
    .map(([category, items], firstSeen) => ({ category, items, firstSeen }))
    .sort((a, b) => rank(a.category) - rank(b.category) || a.firstSeen - b.firstSeen)
    .map(({ category, items }) => ({ category, items }));
}

/** Categories in the order their best result appears (for "best match first" grouping). */
export function categoryOrderByRank(results: readonly (KarnatakaPlace | PlaceHit)[]): PlaceCategory[] {
  const out: PlaceCategory[] = [];
  for (const r of results) {
    const c = placeOf(r).categories[0];
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Districts and trips
// ---------------------------------------------------------------------------

const pad = (s: string) => ` ${s} `;

/** The district a text talks about ("Kodagu (Coorg)", "Chikmagalur hills"), by name or alias; earliest mention wins. */
export function resolveDistrict(text: string, districts: readonly KarnatakaDistrict[]): KarnatakaDistrict | null {
  const hay = pad(normalize(text));
  if (hay.length <= 2) return null;
  let best: { d: KarnatakaDistrict; at: number; len: number } | null = null;
  for (const entry of districtIndex(districts).values()) {
    for (const n of entry.needles) {
      const at = hay.indexOf(pad(n));
      if (at === -1) continue;
      if (!best || at < best.at || (at === best.at && n.length > best.len)) best = { d: entry.district, at, len: n.length };
      break; // needles are longest first; the first hit is this district's best
    }
  }
  return best?.d ?? null;
}

interface TripText {
  /** Title + destination (where the trip itself is named). */
  head: string;
  /** Head + region + vibe + itinerary titles and descriptions. */
  body: string;
  /** Body + tagline, for free-text search. */
  all: string;
  words: string[];
}

const tripTextCache = new WeakMap<TripWithDetails, TripText>();

function tripText(item: TripWithDetails): TripText {
  let t = tripTextCache.get(item);
  if (!t) {
    const trip = item.trip;
    const head = [trip.title, trip.destination].map(normalize);
    const rest = [trip.region, trip.vibe, ...(item.itinerary ?? []).flatMap((d) => [d.title, d.description])].map(normalize);
    const join = (parts: string[]) => pad(parts.filter(Boolean).join(" | "));
    const all = join([...head, ...rest, normalize(trip.tagline)]);
    t = {
      head: join(head),
      body: join([...head, ...rest]),
      all,
      words: [...new Set(all.split(" ").filter((w) => w.length >= 3 && w !== "|"))],
    };
    tripTextCache.set(item, t);
  }
  return t;
}

const placeNeedleCache = new WeakMap<KarnatakaPlace, string[]>();

function placeNeedles(place: KarnatakaPlace): string[] {
  let n = placeNeedleCache.get(place);
  if (!n) {
    n = [...new Set([place.name, ...(place.aliases ?? [])].map(normalize))].filter((s) => s.length >= 3);
    placeNeedleCache.set(place, n);
  }
  return n;
}

/** Does this trip's text name the place (whole words)? `headOnly` looks at the title and destination only. */
export function tripMentionsPlace(item: TripWithDetails, place: KarnatakaPlace, headOnly = false): boolean {
  const t = tripText(item);
  const hay = headOnly ? t.head : t.body;
  return placeNeedles(place).some((n) => hay.includes(pad(n)));
}

/**
 * Published trips that go to the place: the trip's title, destination, region, vibe or any
 * itinerary day names the place (or an alias), or the trip's destination is in the same district.
 * Places in the pickup city's district (Bengaluru) only count when the title or destination
 * names them, so "leave Bengaluru at 6 AM" in an itinerary does not make every trip a Bengaluru trip.
 */
export function placeTripMatches(
  place: KarnatakaPlace,
  trips: readonly TripWithDetails[],
  districts: readonly KarnatakaDistrict[],
): TripWithDetails[] {
  return trips.filter((item) => {
    if (!item.trip.isPublished) return false;
    const { pickup, destination } = tripDistricts(item, districts);
    if (tripMentionsPlace(item, place, pickup === place.district)) return true;
    return destination !== null && destination === place.district;
  });
}

const tripDistrictCache = new WeakMap<TripWithDetails, WeakMap<readonly KarnatakaDistrict[], { pickup: string | null; destination: string | null }>>();

/** District names of the trip's pickup city and destination (worked out once per trip). */
function tripDistricts(item: TripWithDetails, districts: readonly KarnatakaDistrict[]) {
  let byList = tripDistrictCache.get(item);
  if (!byList) {
    byList = new WeakMap();
    tripDistrictCache.set(item, byList);
  }
  let v = byList.get(districts);
  if (!v) {
    v = {
      pickup: item.trip.pickupCity ? resolveDistrict(item.trip.pickupCity, districts)?.name ?? null : null,
      destination: resolveDistrict(item.trip.destination, districts)?.name ?? null,
    };
    byList.set(districts, v);
  }
  return v;
}

/**
 * Free-text match for a trip card: every typed word starts a word somewhere in the trip's title,
 * destination, region, vibe, tagline or itinerary (a typo or two allowed in longer words).
 */
export function tripMatchesQuery(item: TripWithDetails, query: string): boolean {
  const q = prepare(query);
  if (!q.norm) return true;
  const t = tripText(item);
  if (t.all.includes(pad(q.norm).trimEnd())) return true;
  return q.tokens.every((qt, i) => {
    if (t.all.includes(` ${qt}`)) return true;
    const lim = typoLimit(qt.length);
    if (lim === 0) return false;
    const isLast = i === q.tokens.length - 1;
    return t.words.some(
      (w) => typoDistance(qt, w, lim) <= lim || (isLast && w.length > qt.length && typoDistance(qt, w, lim, qt.length) <= lim),
    );
  });
}

// ---------------------------------------------------------------------------
// Highlighting
// ---------------------------------------------------------------------------

export interface TextPart {
  text: string;
  match: boolean;
}

/** Splits a display text so the typed words can be bold ("Abbey Falls" + "ab" → [Ab][bey Falls]). */
export function highlightParts(text: string, query: string): TextPart[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (!text || tokens.length === 0) return [{ text, match: false }];
  // Same length as the text (one letter per letter), accents dropped, so positions line up.
  const safeLower = Array.from(text, (ch) => {
    const plain = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return plain.length === ch.length ? plain : ch;
  }).join("");
  const mask = new Array<boolean>(text.length).fill(false);
  const isWordChar = (ch: string | undefined) => Boolean(ch && /[\p{L}\p{N}]/u.test(ch));
  for (const token of tokens) {
    let at = -1;
    for (let i = safeLower.indexOf(token); i !== -1; i = safeLower.indexOf(token, i + 1)) {
      if (!isWordChar(safeLower[i - 1])) {
        at = i;
        break;
      }
    }
    if (at === -1 && token.length >= 3) at = safeLower.indexOf(token);
    if (at === -1) continue;
    for (let i = at; i < at + token.length && i < mask.length; i++) mask[i] = true;
  }
  const parts: TextPart[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.match === mask[i]) last.text += text[i];
    else parts.push({ text: text[i], match: mask[i] });
  }
  return parts;
}
