/**
 * Calendar-date helpers that never shift a day because of time zones.
 * Dates are plain "YYYY-MM-DD" strings (what the database stores for trip dates).
 */

/** Today (or `d`) on the user's own clock — in India, IST — as YYYY-MM-DD. */
export function localISODate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Add whole days to a YYYY-MM-DD date (pure calendar arithmetic, no time zone involved). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A trip of `durationDays` starting on `startDate` ends on start + (days − 1). */
export function tripEndDate(startDate: string, durationDays: number): string {
  return addDaysISO(startDate, Math.max(0, durationDays - 1));
}

/** The instant `hh:mm` IST on a given calendar date, as an ISO timestamp. */
export function istInstant(isoDate: string, hhmm = "18:00"): string {
  return new Date(`${isoDate}T${hhmm}:00+05:30`).toISOString();
}
