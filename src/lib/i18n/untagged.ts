import { cleanVisitorText } from "@/lib/display-text";

/**
 * Visitors never see the first-draft tags ("Sample:", "Draft policy:", "(Sample Hub)", "Owner to
 * confirm …"): cleanVisitorText removes them before trip text is shown. The Kannada was written for
 * the tagged English, so the text on the page had no entry and stayed English in Kannada mode.
 *
 * For each tagged key this adds the English as visitors see it, with the Kannada cleaned the same
 * way, step by step. A pair is added only when every English step has an exact Kannada counterpart
 * and the cleaned English is exactly what cleanVisitorText shows; otherwise it is skipped (the page
 * then stays English for that line, as before). A key that is already there always wins.
 */

// The English tag shapes cleanVisitorText removes (src/lib/display-text.ts). The result is checked
// against cleanVisitorText itself, so if those rules change a pair is skipped, never wrong.
const EN_LEADING = /^\s*(?:sample(?:\s+itinerary)?|draft(?:\s+(?:policy|operational\s+note|note|itinerary))?)\s*[:：–—-]\s*/i;
const EN_BRACKET_NOTE = /\[[^\]]*\b(?:owner|confirm|tbd|tbc|placeholder)\b[^\]]*\]/gi;
const EN_TRAILING = /\s*\((?:sample(?:\s+hub)?|draft|tbd|tbc)\)/gi;
const EN_OWNER_SENTENCE = /^Owner to (?:confirm|verify|check)\b/i;

// The same tags as written in kn.json: "ಮಾದರಿ:" (Sample), "ಮಾದರಿ ಪ್ರವಾಸ ವಿವರ:" (Sample itinerary),
// "ಕರಡು:" (Draft), "ಕರಡು ನೀತಿ:" (Draft policy), "ಕರಡು ಕಾರ್ಯಾಚರಣೆ/ಕಾರ್ಯಾಚರಣಾ ಟಿಪ್ಪಣಿ:" (Draft
// operational note), "(ಕರಡು)" (Draft), "(ಮಾದರಿ ಪಿಕಪ್ ಸ್ಥಳ)" (Sample Hub).
const KN_LEADING =
  /^\s*(?:ಮಾದರಿ(?:\s+ಪ್ರವಾಸ(?:\s+ವಿವರ)?)?|ಕರಡು(?:\s+(?:ನೀತಿ|ಕಾರ್ಯಾಚರಣೆ\s+ಟಿಪ್ಪಣಿ|ಕಾರ್ಯಾಚರಣಾ\s+ಟಿಪ್ಪಣಿ|ಟಿಪ್ಪಣಿ|ಪ್ರವಾಸ(?:\s+ವಿವರ)?))?)\s*[:：–—-]\s*/;
const KN_TRAILING = /\s*\((?:ಮಾದರಿ(?:\s+ಪಿಕಪ್\s+ಸ್ಥಳ)?|ಕರಡು|tbd|tbc)\)/gi;
/** "Owner" (ಮಾಲೀಕರು, ಮಾಲೀಕರಿಂದ …): a Kannada sentence with it must be one the English drops. */
const KN_OWNER = /ಮಾಲೀಕ/;
const ANY_BRACKET = /\[[^\]]*\]/g;

const normalise = (s: string) => s.replace(/\s+/g, " ").trim();
const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;
const sentences = (s: string) => s.split(/(?<=[.!?।])\s+/).filter((p) => p.trim());

/** The English visitors see and its Kannada, or null when the Kannada cannot be cleaned reliably. */
export function untaggedPair(en: string, kn: string): [en: string, kn: string] | null {
  const shown = normalise(cleanVisitorText(en));
  if (!shown || shown === normalise(en)) return null;
  let e = en;
  let k = kn;

  // 1. "Sample:", "Draft policy:" … at the start.
  if (EN_LEADING.test(e)) {
    if (!KN_LEADING.test(k)) return null;
    e = e.replace(EN_LEADING, "");
    k = k.replace(KN_LEADING, "");
  }

  // 2. "[Owner to confirm …]" placeholders: only when every bracket is one and the Kannada has as many.
  const notes = count(e, EN_BRACKET_NOTE);
  if (notes) {
    if (count(e, ANY_BRACKET) !== notes || count(k, ANY_BRACKET) !== notes) return null;
    e = e.replace(EN_BRACKET_NOTE, " ");
    k = k.replace(ANY_BRACKET, " ");
  }

  // 3. "(Draft)", "(Sample Hub)" after a name or time.
  const tags = count(e, EN_TRAILING);
  if (tags) {
    if (count(k, KN_TRAILING) !== tags) return null;
    e = e.replace(EN_TRAILING, "");
    k = k.replace(KN_TRAILING, "");
  }

  // 4. "Owner to confirm …" sentences: drop the Kannada sentence in the same place.
  const enParts = sentences(e);
  const drop = enParts.map((s) => EN_OWNER_SENTENCE.test(s.trim()));
  if (drop.some(Boolean)) {
    const knParts = sentences(k);
    if (knParts.length !== enParts.length) return null;
    if (knParts.some((s, i) => KN_OWNER.test(s) && !drop[i])) return null;
    e = enParts.filter((_, i) => !drop[i]).join(" ");
    k = knParts.filter((_, i) => !drop[i]).join(" ");
  }

  const outEn = normalise(e);
  const outKn = normalise(k);
  // Must be exactly what visitors see, and still say something in Kannada.
  if (outEn !== shown || !outKn || outKn === outEn) return null;
  return [outEn, outKn];
}

/** Adds the untagged English of every tagged key (built-in and the owner's saved Kannada). */
export function addUntaggedKeys<D extends Map<string, string>>(dict: D): D {
  for (const [en, kn] of [...dict]) {
    const pair = untaggedPair(en, kn);
    if (pair && !dict.has(pair[0])) dict.set(pair[0], pair[1]);
  }
  return dict;
}
