import type { SiteSettings, TripWithDetails } from "@/lib/types";

/**
 * Trip text shown to visitors, without the set-up tags left over from the first draft
 * ("Sample itinerary:", "Sample:", "Draft policy:", "Draft operational note:") and without notes
 * meant for the owner ("Owner to confirm …"). The owner's saved text in Admin is not changed.
 */
const LEADING_TAG = /^\s*(?:sample(?:\s+itinerary)?|draft(?:\s+(?:policy|operational\s+note|note|itinerary))?)\s*[:：–—-]\s*/i;
const OWNER_NOTE = /(?:^|(?<=[.!?]))\s*Owner to (?:confirm|verify|check)\b[^.!?]*[.!?]?/gi;
/** "[Owner to confirm GST …]" style placeholders. */
const BRACKET_NOTE = /\[[^\]]*\b(?:owner|confirm|tbd|tbc|placeholder)\b[^\]]*\]/gi;
/** "(Sample Hub)", "(Draft)", "(Sample)" tags after a name or time. */
const TRAILING_TAG = /\s*\((?:sample(?:\s+hub)?|draft|tbd|tbc)\)/gi;

export function cleanVisitorText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(LEADING_TAG, "")
    .replace(BRACKET_NOTE, " ")
    .replace(TRAILING_TAG, "")
    .replace(OWNER_NOTE, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function cleanVisitorList(list: string[]): string[] {
  return list.map((s) => cleanVisitorText(s)).filter(Boolean);
}

/** A trip as visitors see it (pages, cards, the chat guide). */
export function cleanTripForVisitors(item: TripWithDetails): TripWithDetails {
  const t = item.trip;
  return {
    ...item,
    trip: {
      ...t,
      tagline: cleanVisitorText(t.tagline),
      summary: cleanVisitorText(t.summary),
      inclusions: cleanVisitorList(t.inclusions),
      exclusions: cleanVisitorList(t.exclusions),
      packingList: cleanVisitorList(t.packingList),
      accommodationNotes: cleanVisitorText(t.accommodationNotes),
      safetyNotes: cleanVisitorText(t.safetyNotes),
      accessibilityNotes: cleanVisitorText(t.accessibilityNotes),
    },
    pickupPoints: item.pickupPoints.map((p) => ({
      ...p,
      name: cleanVisitorText(p.name),
      area: cleanVisitorText(p.area),
      pickupTimeLabel: cleanVisitorText(p.pickupTimeLabel),
    })),
    itinerary: item.itinerary.map((d) => ({
      ...d,
      title: cleanVisitorText(d.title),
      description: cleanVisitorText(d.description),
      travelBufferNotes: cleanVisitorText(d.travelBufferNotes),
      mealsIncluded: cleanVisitorText(d.mealsIncluded),
    })),
  };
}

/** Booking rules as visitors see them: no "Draft:" tags or owner-only placeholders. */
export function cleanSettingsForVisitors(settings: SiteSettings): SiteSettings {
  const b = settings.bookingPolicy;
  return {
    ...settings,
    bookingPolicy: {
      ...b,
      gstIncludedOrNote: cleanVisitorText(b.gstIncludedOrNote),
      roomPolicySummary: cleanVisitorText(b.roomPolicySummary),
      vehiclePolicySummary: cleanVisitorText(b.vehiclePolicySummary),
      cancellationSlabs: b.cancellationSlabs
        .map((slab) => ({ label: cleanVisitorText(slab.label), refundNote: cleanVisitorText(slab.refundNote) }))
        .filter((slab) => slab.label),
    },
  };
}
