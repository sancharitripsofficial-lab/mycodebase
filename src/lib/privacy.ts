import type { CoTravelerPreference, ComfortResolutionStatus } from "@/lib/types";

/**
 * Converts a private co-traveler preference into a privacy-safe label for customer receipts
 * and general operational summaries without exposing batch gender composition or personal notes.
 */
export function getSafeComfortCustomerLabel(
  pref: CoTravelerPreference,
  resolution: ComfortResolutionStatus
): string {
  if (pref === "open_mixed") {
    return "Open to a mixed group (standard small-batch departure)";
  }

  const prefix =
    pref === "request_women_only"
      ? "Women-only departure preference noted"
      : "Same-gender co-traveler comfort request received";

  switch (resolution) {
    case "accommodated":
      return `${prefix} — confirmed by operations`;
    case "not_feasible_notified":
      return `${prefix} — operator follow-up sent with options`;
    case "customer_accepted_alt":
      return `${prefix} — alternate arrangement accepted`;
    case "customer_rescheduled":
      return `${prefix} — moved to another departure`;
    case "customer_refunded":
      return `${prefix} — refunded per policy`;
    default:
      return `${prefix} — privately queued for operator review`;
  }
}

/**
 * Neutralizes spreadsheet formula injection in CSV exports (OWASP CSV Injection defense).
 */
export function sanitizeCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

