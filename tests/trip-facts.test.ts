import { describe, expect, it } from "vitest";
import { daysBetween, formatTripDates, formatTripDay, formatTripLength } from "@/lib/trip-dates";
import {
  departureCodeAgrees,
  inclusionHighlights,
  nextListedDeparture,
  nextOpenDeparture,
  seatSummary,
  suggestedDepartureCode,
  visibleDepartureCode,
  wholeCarOpen,
  wholeCarPricePaise,
} from "@/lib/trip-facts";
import { calculateBookingPricing } from "@/lib/currency";
import type { PublicDepartureAvailability } from "@/lib/types";

/** 26 Nov 2026, 5 pm in India. */
const NOW = Date.parse("2026-11-26T17:00:00+05:30");
const POLICY = { allowDepositCheckout: false, depositPercent: 30, balanceDueDaysBefore: 7, taxRatePercent: 0 };

function dep(over: Partial<PublicDepartureAvailability>): PublicDepartureAvailability {
  return {
    departureId: "d1",
    tripId: "t1",
    departureCode: "SAN-CKM-DEC04",
    startDate: "2026-12-04",
    endDate: "2026-12-05",
    maxCapacity: 6,
    minOccupancy: 3,
    departureType: "open_batch",
    status: "open",
    bookingCutoffAt: "2026-12-02T12:30:00+00:00",
    preferenceDeadlineAt: "2026-12-01T12:30:00+00:00",
    priceOverridePaise: null,
    seatsTaken: 0,
    seatsRemaining: 6,
    ...over,
  };
}

describe("trip dates are written one way everywhere", () => {
  it("joins days of the same month, keeps both months when they differ", () => {
    expect(formatTripDates("2026-12-04", "2026-12-05")).toBe("4–5 Dec");
    expect(formatTripDates("2026-12-04", "2026-12-06", { month: "long" })).toBe("4–6 December");
    expect(formatTripDates("2026-11-30", "2026-12-02")).toBe("30 Nov – 2 Dec");
    expect(formatTripDates("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
  });

  it("a one-day trip shows one date, not '12 Dec – 12 Dec'", () => {
    expect(formatTripDates("2026-12-12", "2026-12-12")).toBe("12 Dec");
    expect(formatTripDates("2026-12-12", null)).toBe("12 Dec");
    expect(formatTripDates("2026-12-12", "2026-12-12", { weekday: true })).toBe("Sat 12 Dec");
  });

  it("adds the right day of the week (4 Dec 2026 is a Friday)", () => {
    expect(formatTripDates("2026-12-04", "2026-12-05", { weekday: true })).toBe("Fri 4 – Sat 5 Dec");
    expect(formatTripDay("2026-12-04", { weekday: true, month: "long" })).toBe("Fri 4 December");
    expect(formatTripDay("2026-11-27")).toBe("27 Nov");
  });

  it("never shifts a day for a time zone, and shows nothing for rubbish", () => {
    // A timestamp at midnight UTC still reads as its own calendar day.
    expect(formatTripDay("2026-12-04T00:00:00+00:00")).toBe("4 Dec");
    expect(formatTripDates("", "2026-12-05")).toBe("");
    expect(formatTripDay("not a date")).toBe("");
  });

  it("writes trip lengths in words", () => {
    expect(formatTripLength(2, 1)).toBe("2 days / 1 night");
    expect(formatTripLength(3, 2)).toBe("3 days / 2 nights");
    expect(formatTripLength(1, 0)).toBe("1 day");
    expect(daysBetween("2026-11-26", "2026-12-04")).toBe(8);
    expect(daysBetween("2026-12-04", "2026-11-27")).toBe(-7);
  });
});

describe("the next date and the seat count are picked the same way on every page", () => {
  const full = dep({ departureId: "full", startDate: "2026-12-01", endDate: "2026-12-02", bookingCutoffAt: "2026-11-29T12:30:00+00:00", seatsTaken: 6, seatsRemaining: 0, status: "sold_out" });
  const open = dep({ departureId: "open", startDate: "2026-12-04" });
  const later = dep({ departureId: "later", startDate: "2026-12-18", endDate: "2026-12-19", bookingCutoffAt: "2026-12-16T12:30:00+00:00" });
  const closed = dep({ departureId: "closed", startDate: "2026-11-28", endDate: "2026-11-29", bookingCutoffAt: "2026-11-26T06:30:00+00:00" });
  const cancelled = dep({ departureId: "cancelled", startDate: "2026-11-30", bookingCutoffAt: "2026-11-28T12:30:00+00:00", status: "cancelled" });

  it("next open date: the earliest one that takes bookings and has a seat, whatever the list order", () => {
    expect(nextOpenDeparture([later, cancelled, closed, full, open], NOW)?.departureId).toBe("open");
    expect(nextOpenDeparture([closed, cancelled, full], NOW)).toBeNull();
    expect(nextOpenDeparture([], NOW)).toBeNull();
  });

  it("with every seat taken, the earliest date still booking is listed for the waitlist", () => {
    expect(nextListedDeparture([closed, cancelled, full], NOW)?.departureId).toBe("full");
    expect(nextListedDeparture([full, later], NOW)?.departureId).toBe("later");
    expect(nextListedDeparture([closed, cancelled], NOW)).toBeNull();
  });

  it("says how many seats are open in plain words", () => {
    expect(seatSummary({ seatsRemaining: 6, maxCapacity: 6 })).toEqual({ tone: "open", label: "6 of 6 seats open" });
    expect(seatSummary({ seatsRemaining: 3, maxCapacity: 6 })).toEqual({ tone: "open", label: "3 of 6 seats open" });
    expect(seatSummary({ seatsRemaining: 2, maxCapacity: 6 })).toEqual({ tone: "few", label: "Last 2 seats" });
    expect(seatSummary({ seatsRemaining: 1, maxCapacity: 6 })).toEqual({ tone: "few", label: "Last seat" });
    expect(seatSummary({ seatsRemaining: 0, maxCapacity: 6 })).toEqual({ tone: "full", label: "Sold out" });
    expect(seatSummary({ seatsRemaining: -1, maxCapacity: 6 }).tone).toBe("full");
  });

  it("the whole car is open only while nobody has a seat and the date still books", () => {
    expect(wholeCarOpen(open, NOW)).toBe(true);
    expect(wholeCarOpen(dep({ seatsTaken: 1, seatsRemaining: 5 }), NOW)).toBe(false);
    expect(wholeCarOpen(closed, NOW)).toBe(false);
    expect(wholeCarOpen(dep({ maxCapacity: 5, seatsRemaining: 5 }), NOW)).toBe(false);
  });
});

describe("date codes that disagree with their date", () => {
  it("spots a code that names another day (the live Kodagu date: NOV27 on a trip leaving 4 Dec)", () => {
    expect(departureCodeAgrees("SAN-CRG-NOV27", "2026-12-04")).toBe(false);
    expect(departureCodeAgrees("SAN-CKM-DEC04", "2026-12-04")).toBe(true);
    expect(departureCodeAgrees("SAN-KUM-DEC12", "2026-12-12")).toBe(true);
    expect(departureCodeAgrees("san-hmp-jan8", "2027-01-08")).toBe(true);
    expect(departureCodeAgrees("SAN-MUR-DEC-11", "2026-12-11")).toBe(true);
  });

  it("cannot judge a code with no month and day in it", () => {
    expect(departureCodeAgrees("T-9F3A21BC", "2026-12-04")).toBeNull();
    expect(departureCodeAgrees("SAN-COORG-A", "2026-12-04")).toBeNull();
    expect(departureCodeAgrees("", "2026-12-04")).toBeNull();
    // "DECADE" is a word, not December.
    expect(departureCodeAgrees("SAN-DECADE-1", "2026-12-04")).toBeNull();
  });

  it("suggests the code staff should rename it to, keeping everything else", () => {
    expect(suggestedDepartureCode("SAN-CRG-NOV27", "2026-12-04")).toBe("SAN-CRG-DEC04");
    expect(suggestedDepartureCode("SAN-MUR-DEC-11", "2027-01-08")).toBe("SAN-MUR-JAN-08");
    expect(suggestedDepartureCode("SAN-CKM-DEC04", "2026-12-04")).toBeNull();
    expect(suggestedDepartureCode("T-9F3A21BC", "2026-12-04")).toBeNull();
  });

  it("visitors are never shown a code that contradicts the date beside it", () => {
    expect(visibleDepartureCode({ departureCode: "SAN-CRG-NOV27", startDate: "2026-12-04" })).toBeNull();
    expect(visibleDepartureCode({ departureCode: "SAN-CKM-DEC04", startDate: "2026-12-04" })).toBe("SAN-CKM-DEC04");
    expect(visibleDepartureCode({ departureCode: "T-9F3A21BC", startDate: "2026-12-04" })).toBe("T-9F3A21BC");
  });
});

describe("the whole-car price shown is the price charged", () => {
  it("matches what the booking box and the server work out, for both live pricing styles", () => {
    // Chikmagalur: a fixed whole-car price below six seats.
    const chikmagalur = { basePricePaise: 419_900, privateGroupPricePaise: 2_299_900, privateDiscountPercent: 10, depositPercent: 30, balanceDueDaysBefore: 7 };
    expect(wholeCarPricePaise(chikmagalur, { priceOverridePaise: 499_900 }, POLICY)).toBe(2_299_900);
    // Kodagu: its fixed whole-car price is above six seats at the date's price, so the percentage applies.
    const kodagu = { basePricePaise: 599_900, privateGroupPricePaise: 2_999_900, privateDiscountPercent: 10, depositPercent: 30, balanceDueDaysBefore: 7 };
    const shown = wholeCarPricePaise(kodagu, { priceOverridePaise: 399_900 }, POLICY);
    expect(shown).toBe(2_159_460);
    const charged = calculateBookingPricing({ trip: kodagu, priceOverridePaise: 399_900, bookingMode: "private_vehicle", seatsRequested: 6, payDepositOnly: false, bookingPolicy: POLICY });
    expect(shown).toBe(charged.totalPaise);
  });
});

describe("what a trip card says is included", () => {
  it("uses the owner's own first lines, word for word, minus bracketed asides", () => {
    const got = inclusionHighlights([
      "6-seat Ertiga-class AC transport from Bengaluru & back",
      "1 night at an estate homestay (room basis subject to confirmation)",
      "Estate breakfast & Malnad dinner as listed in itinerary",
      "Guided coffee plantation walk & driver allowances",
    ]);
    expect(got).toEqual({ shown: ["6-seat Ertiga-class AC transport from Bengaluru & back", "1 night at an estate homestay"], more: 2 });
  });

  it("copes with short lists, stray punctuation and empty lines", () => {
    expect(inclusionHighlights(["Morning breakfast.", " ", "Lunch;"], 3)).toEqual({ shown: ["Morning breakfast", "Lunch"], more: 0 });
    expect(inclusionHighlights([])).toEqual({ shown: [], more: 0 });
  });
});
