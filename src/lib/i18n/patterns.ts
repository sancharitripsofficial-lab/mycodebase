/**
 * Kannada for texts that mix words with live values (seats, dates, prices, names), which a plain
 * dictionary cannot hold. Each rule matches the WHOLE text and rebuilds it in Kannada word order.
 * Numbers, ₹ amounts, codes and phone numbers are kept exactly as they are.
 */

const MONTHS: Record<string, string> = {
  Jan: "ಜನವರಿ", Feb: "ಫೆಬ್ರವರಿ", Mar: "ಮಾರ್ಚ್", Apr: "ಏಪ್ರಿಲ್", May: "ಮೇ", Jun: "ಜೂನ್",
  Jul: "ಜುಲೈ", Aug: "ಆಗಸ್ಟ್", Sep: "ಸೆಪ್ಟೆಂಬರ್", Sept: "ಸೆಪ್ಟೆಂಬರ್", Oct: "ಅಕ್ಟೋಬರ್", Nov: "ನವೆಂಬರ್", Dec: "ಡಿಸೆಂಬರ್",
  January: "ಜನವರಿ", February: "ಫೆಬ್ರವರಿ", March: "ಮಾರ್ಚ್", April: "ಏಪ್ರಿಲ್", June: "ಜೂನ್", July: "ಜುಲೈ",
  August: "ಆಗಸ್ಟ್", September: "ಸೆಪ್ಟೆಂಬರ್", October: "ಅಕ್ಟೋಬರ್", November: "ನವೆಂಬರ್", December: "ಡಿಸೆಂಬರ್",
};
const DAYS: Record<string, string> = {
  Mon: "ಸೋಮ", Tue: "ಮಂಗಳ", Wed: "ಬುಧ", Thu: "ಗುರು", Fri: "ಶುಕ್ರ", Sat: "ಶನಿ", Sun: "ಭಾನು",
  Monday: "ಸೋಮವಾರ", Tuesday: "ಮಂಗಳವಾರ", Wednesday: "ಬುಧವಾರ", Thursday: "ಗುರುವಾರ", Friday: "ಶುಕ್ರವಾರ",
  Saturday: "ಶನಿವಾರ", Sunday: "ಭಾನುವಾರ",
};
const CLOCK: Record<string, string> = { AM: "AM", PM: "PM", am: "AM", pm: "PM", IST: "IST" };
const DATE_WORD = new RegExp(`\\b(${[...Object.keys(MONTHS), ...Object.keys(DAYS)].sort((a, b) => b.length - a.length).join("|")})\\b`, "g");
const ONLY_DATE = new RegExp(
  `^[\\s\\d,–—\\-→·:./()]*(?:(?:${[...Object.keys(MONTHS), ...Object.keys(DAYS), ...Object.keys(CLOCK)].join("|")})\\b[\\s\\d,–—\\-→·:./()]*)+$`,
);

/** "Fri, 27 Nov – Sun, 29 Nov" → Kannada day and month names (digits unchanged). Null if not a date. */
export function translateDate(text: string): string | null {
  if (!ONLY_DATE.test(text)) return null;
  return text.replace(DATE_WORD, (w) => MONTHS[w] ?? DAYS[w] ?? w);
}

/** Dates inside a longer text, for rules below. */
const dateIn = (s: string) => s.replace(DATE_WORD, (w) => MONTHS[w] ?? DAYS[w] ?? w);

type Lookup = (english: string) => string | undefined;
type Rule = [RegExp, (m: RegExpExecArray, t: Lookup) => string];

const seatWord = (n: string) => (n === "1" ? "ಸೀಟು" : "ಸೀಟುಗಳು");
const tr = (t: Lookup, s: string) => t(s) ?? s;
const AMOUNT = "(₹\\s?[\\d,]+(?:\\.\\d+)?)";

const RULES: Rule[] = [
  // Seats
  [/^(\d+) of (\d+) seats? left$/, (m) => `${m[2]} ರಲ್ಲಿ ${m[1]} ${seatWord(m[1])} ಉಳಿದಿವೆ`],
  [/^(\d+) of (\d+) seats? open$/, (m) => `${m[2]} ರಲ್ಲಿ ${m[1]} ${seatWord(m[1])} ಖಾಲಿ`],
  [/^(\d+) of (\d+) seats? taken$/, (m) => `${m[2]} ರಲ್ಲಿ ${m[1]} ${seatWord(m[1])} ಬುಕ್ ಆಗಿವೆ`],
  [/^(\d+) of (\d+) seats? open \((\d+) selected\)$/, (m) => `${m[2]} ರಲ್ಲಿ ${m[1]} ${seatWord(m[1])} ಖಾಲಿ (${m[3]} ಆಯ್ಕೆ ಮಾಡಲಾಗಿದೆ)`],
  [/^(\d+) seats? left$/, (m) => `${m[1]} ${seatWord(m[1])} ಉಳಿದಿವೆ`],
  [/^(\d+) left$/, (m) => `${m[1]} ಉಳಿದಿವೆ`],
  [/^(\d+) open$/, (m) => `${m[1]} ಖಾಲಿ`],
  [/^(\d+) \/ (\d+) (?:open|seats open)$/, (m) => `${m[2]} ರಲ್ಲಿ ${m[1]} ಖಾಲಿ`],
  [/^\/ seat$/, () => "/ ಸೀಟು"],
  [/^\/ person$/, () => "/ ವ್ಯಕ್ತಿ"],
  [/^per seat$/i, () => "ಪ್ರತಿ ಸೀಟಿಗೆ"],
  [/^(\d+) open · (.+)$/, (m) => `${m[1]} ಖಾಲಿ · ${dateIn(m[2])}`],
  [/^Last (\d+) seats?$/, (m) => `ಕೊನೆಯ ${m[1]} ${seatWord(m[1])}`],
  [/^Filling fast • (\d+) left$/, (m) => `ಬೇಗ ಭರ್ತಿಯಾಗುತ್ತಿದೆ • ${m[1]} ಉಳಿದಿವೆ`],
  [/^Open • (\d+) of (\d+) seats$/, (m) => `ಖಾಲಿ • ${m[2]} ರಲ್ಲಿ ${m[1]} ಸೀಟುಗಳು`],
  [/^All (\d+) places allocated \(Sold out\)$/, (m) => `ಎಲ್ಲಾ ${m[1]} ಸೀಟುಗಳು ಭರ್ತಿ`],
  [/^all (\d+) seats are yours$/, (m) => `ಎಲ್ಲಾ ${m[1]} ಸೀಟುಗಳು ನಿಮ್ಮವು`],
  [/^you picked (\d+)$/, (m) => `ನೀವು ${m[1]} ಆಯ್ಕೆ ಮಾಡಿದ್ದೀರಿ`],
  [/^Only (\d+) seats? (?:is|are) open on this date\.$/, (m) => `ಈ ದಿನಾಂಕದಲ್ಲಿ ${m[1]} ${seatWord(m[1])} ಮಾತ್ರ ಖಾಲಿ ಇವೆ.`],
  [/^Seats? ([\d, ]+) (?:was|were) just taken by someone else\. Please pick again\.$/, (m) => `ಸೀಟು ${m[1]} ಈಗಷ್ಟೇ ಬೇರೆಯವರು ಬುಕ್ ಮಾಡಿದ್ದಾರೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಆಯ್ಕೆ ಮಾಡಿ.`],
  [/^\(seats? ([\d, ]+)\)$/, (m) => `(ಸೀಟು ${m[1]})`],
  [/^Seats? ([\d, ]+)$/, (m) => `ಸೀಟು ${m[1]}`],
  [/^Seats held (.+)$/, (m) => `ಸೀಟುಗಳನ್ನು ಹಿಡಿದಿಡಲಾಗಿದೆ ${m[1]}`],
  [/^Hold (\d+) Seats? & Continue to Payment$/, (m) => `${m[1]} ${m[1] === "1" ? "ಸೀಟನ್ನು" : "ಸೀಟುಗಳನ್ನು"} ಹಿಡಿದಿಟ್ಟು ಪಾವತಿಗೆ ಮುಂದುವರಿಯಿರಿ`],
  [/^(\d+) (?:people|persons|travellers|travelers)$/, (m) => `${m[1]} ಜನ`],
  [/^(\d+) (?:person|traveller|traveler)$/, (m) => `${m[1]} ಜನ`],
  // Trip length and days
  [/^Day (\d+)$/, (m) => `ದಿನ ${m[1]}`],
  [/^(\d+) days?$/i, (m) => `${m[1]} ದಿನ${m[1] === "1" ? "" : "ಗಳು"}`],
  [/^(\d+) nights?$/i, (m) => `${m[1]} ರಾತ್ರಿ${m[1] === "1" ? "" : "ಗಳು"}`],
  [/^(\d+)D \/ (\d+)N$/, (m) => `${m[1]} ದಿನ / ${m[2]} ರಾತ್ರಿ`],
  [/^(\d+) days? \/ (\d+) nights?$/i, (m) => `${m[1]} ದಿನ / ${m[2]} ರಾತ್ರಿ`],
  // Payments
  [new RegExp(`^Check the amount is ${AMOUNT} and the name is (.+), then pay\\.$`), (m) => `ಮೊತ್ತ ${m[1]} ಮತ್ತು ಹೆಸರು ${m[2]} ಎಂದು ಪರಿಶೀಲಿಸಿ, ನಂತರ ಪಾವತಿಸಿ.`],
  [new RegExp(`^UPI QR code to pay ${AMOUNT} to (.+)$`), (m) => `${m[2]} ಅವರಿಗೆ ${m[1]} ಪಾವತಿಸಲು UPI QR ಕೋಡ್`],
  [/^The UPI reference number has exactly 12 digits\. You entered (\d+)\.$/, (m) => `UPI ರೆಫರೆನ್ಸ್ ಸಂಖ್ಯೆಯಲ್ಲಿ ನಿಖರವಾಗಿ 12 ಅಂಕಿಗಳಿರುತ್ತವೆ. ನೀವು ${m[1]} ಅಂಕಿಗಳನ್ನು ನಮೂದಿಸಿದ್ದೀರಿ.`],
  [new RegExp(`^(.+) — you save ${AMOUNT}\\.$`), (m) => `${m[1]} — ನೀವು ${m[2]} ಉಳಿಸುತ್ತೀರಿ.`],
  [/^(.+) — this booking is free\. Your seats are confirmed as soon as you continue\.$/, (m) => `${m[1]} — ಈ ಬುಕಿಂಗ್ ಉಚಿತ. ನೀವು ಮುಂದುವರಿದ ತಕ್ಷಣ ನಿಮ್ಮ ಸೀಟುಗಳು ಖಚಿತವಾಗುತ್ತವೆ.`],
  [/^• UPI ref (.+)$/, (m) => `• UPI ರೆಫ್ ${m[1]}`],
  [/^Batch (\S+)$/, (m) => `ಬ್ಯಾಚ್ ${m[1]}`],
  // Photos, offers, maps
  [/^Photo (\d+) of (\d+)$/, (m) => `ಫೋಟೋ ${m[1]} / ${m[2]}`],
  [/^Open photo (\d+) of (\d+) full screen$/, (m) => `ಫೋಟೋ ${m[1]} / ${m[2]} ಪೂರ್ಣ ಪರದೆಯಲ್ಲಿ ತೆರೆಯಿರಿ`],
  [/^Show photo (\d+)$/, (m) => `ಫೋಟೋ ${m[1]} ತೋರಿಸಿ`],
  [/^Offer (\d+) of (\d+)$/, (m) => `ಆಫರ್ ${m[1]} / ${m[2]}`],
  [/^(.+) photo (\d+)$/, (m, t) => `${tr(t, m[1])} ಫೋಟೋ ${m[2]}`],
  [/^Play video: (.+)$/, (m, t) => `ವೀಡಿಯೊ ಪ್ಲೇ ಮಾಡಿ: ${tr(t, m[1])}`],
  [/^Open (.+) in Maps \(opens in a new tab\)$/, (m, t) => `${tr(t, m[1])} ಅನ್ನು ಮ್ಯಾಪ್‌ನಲ್ಲಿ ತೆರೆಯಿರಿ (ಹೊಸ ಟ್ಯಾಬ್)`],
  [/^Road trip route: (.+)$/, (m, t) => `ಪ್ರವಾಸ ಮಾರ್ಗ: ${m[1].split(" to ").map((p) => tr(t, p)).join(" → ")}`],
  [/^Live route map: (.+)$/, (m, t) => `ಲೈವ್ ಮಾರ್ಗ ನಕ್ಷೆ: ${m[1].split(" to ").map((p) => tr(t, p)).join(" → ")}`],
  [/^(.+) → (.+)$/, (m, t) => (t(m[1]) || t(m[2]) ? `${tr(t, m[1])} → ${tr(t, m[2])}` : "")],
  [/^Ask us about (.+)$/, (m, t) => `${tr(t, m[1])} ಬಗ್ಗೆ ನಮ್ಮನ್ನು ಕೇಳಿ`],
  [/^Next: (.+)$/, (m) => `ಮುಂದಿನದು: ${dateIn(m[1])}`],
  [/^Book (.+)$/, (m) => (translateDate(m[1]) ? `ಬುಕ್ ಮಾಡಿ: ${dateIn(m[1])}` : "")],
  // Chat guide
  [/^Ask (.+) — live trip answers from your Sanchari guide$/, (m, t) => `${tr(t, m[1])} ಅವರನ್ನು ಕೇಳಿ — ನಿಮ್ಮ ಸಂಚಾರಿ ಗೈಡ್‌ನಿಂದ ಲೈವ್ ಪ್ರವಾಸ ಉತ್ತರಗಳು`],
  [/^Ask (\S+) a question$/, (m, t) => `${tr(t, m[1])} ಅವರಿಗೆ ಪ್ರಶ್ನೆ ಕೇಳಿ`],
  [/^Chat with (.+)$/, (m, t) => `${tr(t, m[1])} ಜೊತೆ ಚಾಟ್ ಮಾಡಿ`],
  [/^Hide (.+)'s message$/, (m, t) => `${tr(t, m[1])} ಅವರ ಸಂದೇಶ ಮರೆಮಾಡಿ`],
  [/^Conversation with (.+)$/, (m, t) => `${tr(t, m[1])} ಜೊತೆಗಿನ ಸಂಭಾಷಣೆ`],
  [/^(.+), your Sanchari guide$/, (m, t) => `${tr(t, m[1])}, ನಿಮ್ಮ ಸಂಚಾರಿ ಗೈಡ್`],
  [/^(.+) is checking the live calendar…$/, (m, t) => `${tr(t, m[1])} ಲೈವ್ ಕ್ಯಾಲೆಂಡರ್ ಪರಿಶೀಲಿಸುತ್ತಿದ್ದಾರೆ…`],
  [/^(.+) is answering$/, (m, t) => `${tr(t, m[1])} ಉತ್ತರಿಸುತ್ತಿದ್ದಾರೆ`],
  [/^Call customer care · (.+)$/, (m) => `ಗ್ರಾಹಕ ಸೇವೆಗೆ ಕರೆ ಮಾಡಿ · ${m[1]}`],
  [/^Call (\+?[\d ]{6,})$/, (m) => `ಕರೆ ಮಾಡಿ ${m[1]}`],
  [/^(.+) \(opens WhatsApp\)$/, (m, t) => `${tr(t, m[1])} (WhatsApp ತೆರೆಯುತ್ತದೆ)`],
  [/^Customer care: (.+)$/, (m, t) => `ಗ್ರಾಹಕ ಸೇವೆ: ${tr(t, m[1])}`],
  [/^From the live trip calendar · (.+)$/, (m) => `ಲೈವ್ ಪ್ರವಾಸ ಕ್ಯಾಲೆಂಡರ್‌ನಿಂದ · ${m[1]}`],
  [/^Seats and prices as of (.+) — ask again for the latest$/, (m) => `${m[1]} ರ ಪ್ರಕಾರ ಸೀಟುಗಳು ಮತ್ತು ಬೆಲೆಗಳು — ಇತ್ತೀಚಿನದಕ್ಕೆ ಮತ್ತೆ ಕೇಳಿ`],
];

/** Kannada for a whole text with live values in it, or null when no rule fits. */
export function translatePattern(text: string, lookup: Lookup): string | null {
  const date = translateDate(text);
  if (date !== null && date !== text) return date;
  for (const [re, build] of RULES) {
    const m = re.exec(text);
    if (m) {
      const out = build(m, lookup);
      if (out) return out;
    }
  }
  return null;
}
