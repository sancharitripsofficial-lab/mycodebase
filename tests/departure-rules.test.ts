import { describe, expect, it } from "vitest";
import { hasStarted, isBookable, isBookingClosed, istTodayISO, withoutStartedDepartures } from "@/lib/departure-rules";
import type { TripWithDetails } from "@/lib/types";

const at = (iso: string) => Date.parse(iso);

const dep = (over: Partial<TripWithDetails["departures"][number]> = {}): TripWithDetails["departures"][number] => ({
  departureId: "d1",
  tripId: "t1",
  departureCode: "SAN-CRG-NOV27",
  startDate: "2026-11-27",
  endDate: "2026-11-29",
  maxCapacity: 6,
  minOccupancy: 3,
  departureType: "open_batch",
  status: "open",
  bookingCutoffAt: "2026-11-25T12:30:00.000Z", // 25 Nov, 6:00 PM IST
  preferenceDeadlineAt: "2026-11-24T12:30:00.000Z",
  priceOverridePaise: null,
  seatsTaken: 0,
  seatsRemaining: 6,
  ...over,
});

describe("which trip dates the website shows and offers", () => {
  it("uses India's date, not the server's UTC date, around midnight", () => {
    // 00:30 IST on 27 Nov is still 26 Nov in UTC.
    expect(istTodayISO(at("2026-11-26T19:00:00Z"))).toBe("2026-11-27");
    expect(istTodayISO(at("2026-11-26T18:29:00Z"))).toBe("2026-11-26"); // 23:59 IST
  });

  it("a trip leaving today or earlier is no longer upcoming", () => {
    expect(hasStarted(dep(), at("2026-11-26T12:00:00Z"))).toBe(false); // 26 Nov IST
    expect(hasStarted(dep(), at("2026-11-26T19:00:00Z"))).toBe(true); // 00:30 IST on 27 Nov
    expect(hasStarted(dep(), at("2026-12-01T05:00:00Z"))).toBe(true);
  });

  it("closes booking at the owner's cut-off time", () => {
    expect(isBookingClosed(dep(), at("2026-11-25T12:29:00Z"))).toBe(false);
    expect(isBookingClosed(dep(), at("2026-11-25T12:30:00Z"))).toBe(true);
    expect(isBookable(dep(), at("2026-11-25T12:29:00Z"))).toBe(true);
    expect(isBookable(dep(), at("2026-11-25T13:00:00Z"))).toBe(false);
    expect(isBookable(dep({ status: "cancelled" }), at("2026-11-20T00:00:00Z"))).toBe(false);
    expect(isBookable(dep({ status: "sold_out", seatsRemaining: 0 }), at("2026-11-20T00:00:00Z"))).toBe(true); // waitlist
  });

  it("leaves dates that have left out of the storefront, keeps future ones", () => {
    const trips = [
      {
        trip: { slug: "coorg" },
        itinerary: [],
        pickupPoints: [],
        departures: [dep(), dep({ departureId: "d2", startDate: "2026-12-11", endDate: "2026-12-13" })],
      },
    ] as unknown as TripWithDetails[];
    const later = withoutStartedDepartures(trips, at("2026-11-28T06:00:00Z"));
    expect(later[0].departures.map((d) => d.departureId)).toEqual(["d2"]);
    expect(trips[0].departures).toHaveLength(2); // the original list is not changed
  });
});
