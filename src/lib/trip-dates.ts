/**
 * How trip dates are written everywhere on the site, so the home page, trip cards, trip pages,
 * the booking box and My Booking never disagree: "4–5 Dec", "12 Dec", "30 Nov – 2 Dec".
 * Trip dates are calendar days (YYYY-MM-DD); nothing here depends on a time zone.
 */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTHS_LONG = [
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
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface TripDateOptions {
  /** "short" = Dec (default), "long" = December. */
  month?: "short" | "long";
  /** Add the day of the week: "Fri 4 – Sat 5 Dec". */
  weekday?: boolean;
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parse(iso: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

const weekdayOf = (p: Ymd) => DAYS_SHORT[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];

/** One calendar day: "4 Dec" (or "Fri 4 December"). Empty text for a date that cannot be read. */
export function formatTripDay(iso: string, opts: TripDateOptions = {}): string {
  const p = parse(iso);
  if (!p) return "";
  const month = (opts.month === "long" ? MONTHS_LONG : MONTHS_SHORT)[p.m - 1];
  return `${opts.weekday ? `${weekdayOf(p)} ` : ""}${p.d} ${month}`;
}

/**
 * A trip's dates as one label.
 *   same day            → "12 Dec"
 *   same month          → "4–5 Dec"        (with weekday: "Fri 4 – Sat 5 Dec")
 *   two months          → "30 Nov – 2 Dec"
 *   across the new year → "30 Dec 2026 – 2 Jan 2027"
 */
export function formatTripDates(startISO: string, endISO: string | null | undefined, opts: TripDateOptions = {}): string {
  const start = parse(startISO);
  if (!start) return "";
  const end = parse(endISO ?? "") ?? start;
  const months = opts.month === "long" ? MONTHS_LONG : MONTHS_SHORT;
  const sameDay = start.y === end.y && start.m === end.m && start.d === end.d;
  if (sameDay) return formatTripDay(startISO, opts);

  if (start.y !== end.y) {
    return `${formatTripDay(startISO, opts)} ${start.y} – ${formatTripDay(endISO ?? startISO, opts)} ${end.y}`;
  }
  if (start.m !== end.m) {
    return `${formatTripDay(startISO, opts)} – ${formatTripDay(endISO ?? startISO, opts)}`;
  }
  return opts.weekday
    ? `${weekdayOf(start)} ${start.d} – ${weekdayOf(end)} ${end.d} ${months[end.m - 1]}`
    : `${start.d}–${end.d} ${months[end.m - 1]}`;
}

/** "2 days / 1 night", "1 day" (a day trip has no night to count). */
export function formatTripLength(days: number, nights: number): string {
  const d = `${days} ${days === 1 ? "day" : "days"}`;
  if (!nights || nights < 1) return d;
  return `${d} / ${nights} ${nights === 1 ? "night" : "nights"}`;
}

/** Whole days from one calendar date to another (negative when `to` is earlier). */
export function daysBetween(fromISO: string, toISO: string): number {
  const a = parse(fromISO);
  const b = parse(toISO);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}
