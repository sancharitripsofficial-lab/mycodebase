import { describe, expect, it, beforeEach } from "vitest";
import { calculateBookingPricing } from "@/lib/currency";
import {
  computePublicAvailabilityDemo,
  confirmPaymentDemo,
  getDemoState,
  resetDemoStateForTests,
  reserveSeatsDemo,
} from "@/lib/data/demo-store";

describe("6-seat capacity & atomic booking invariants", () => {
  beforeEach(() => {
    resetDemoStateForTests();
  });

  it("prevents overbooking beyond 6 seats when reserving remaining capacity", () => {
    // SAN-GOK-DEC25 has 5 seats blocked, 1 seat remaining
    const departureId = "22222222-2222-4222-8222-222222222204";

    const first = reserveSeatsDemo({
      departureId,
      userId: null,
      customerName: "Asha Rao",
      customerEmail: "asha@example.com",
      customerPhone: "+919800000001",
      bookingMode: "batch_seats",
      seatsRequested: 1,
      pickupPointId: null,
      payDepositOnly: false,
      paymentProvider: "sandbox",
      travelers: [
        {
          fullName: "Asha Rao",
          ageGroup: "adult",
          emergencyContact: "+919800000002",
          seatRowRequest: "no_preference",
          roomPreference: "shared_same_gender",
        },
      ],
      coTravelerPreference: "open_mixed",
      preferenceNotes: "",
      whatsappOptIn: false,
    });

    expect(first.assignedSeats).toEqual([6]);

    // Second concurrent attempt for the final seat must fail
    expect(() =>
      reserveSeatsDemo({
        departureId,
        userId: null,
        customerName: "Vikram Nair",
        customerEmail: "vikram@example.com",
        customerPhone: "+919800000003",
        bookingMode: "batch_seats",
        seatsRequested: 1,
        pickupPointId: null,
        payDepositOnly: false,
        paymentProvider: "sandbox",
        travelers: [
          {
            fullName: "Vikram Nair",
            ageGroup: "adult",
            emergencyContact: "+919800000004",
            seatRowRequest: "no_preference",
            roomPreference: "shared_same_gender",
          },
        ],
        coTravelerPreference: "open_mixed",
        preferenceNotes: "",
        whatsappOptIn: false,
      })
    ).toThrow(/Insufficient seats|not open/i);
  });

  it("allows private 6-seat vehicle only when 0 seats are occupied", () => {
    // SAN-CKM-DEC04 has 3/6 taken
    expect(() =>
      reserveSeatsDemo({
        departureId: "22222222-2222-4222-8222-222222222201",
        userId: null,
        customerName: "Kiran",
        customerEmail: "kiran@example.com",
        customerPhone: "+919800000010",
        bookingMode: "private_vehicle",
        seatsRequested: 6,
        pickupPointId: null,
        payDepositOnly: false,
        paymentProvider: "sandbox",
        travelers: Array.from({ length: 6 }, (_, i) => ({
          fullName: `Friend ${i + 1}`,
          ageGroup: "adult",
          emergencyContact: "+919800000011",
          seatRowRequest: "no_preference",
          roomPreference: "couple_friends_room_request",
        })),
        coTravelerPreference: "open_mixed",
        preferenceNotes: "",
        whatsappOptIn: false,
      })
    ).toThrow(/requires all 6 seats/i);

    // SAN-CKM-DEC18 has 0/6 taken
    const charter = reserveSeatsDemo({
      departureId: "22222222-2222-4222-8222-222222222202",
      userId: null,
      customerName: "Kiran",
      customerEmail: "kiran@example.com",
      customerPhone: "+919800000010",
      bookingMode: "private_vehicle",
      seatsRequested: 6,
      pickupPointId: null,
      payDepositOnly: false,
      paymentProvider: "sandbox",
      travelers: Array.from({ length: 6 }, (_, i) => ({
        fullName: `Friend ${i + 1}`,
        ageGroup: "adult",
        emergencyContact: "+919800000011",
        seatRowRequest: "no_preference",
        roomPreference: "couple_friends_room_request",
      })),
      coTravelerPreference: "open_mixed",
      preferenceNotes: "",
      whatsappOptIn: false,
    });

    expect(charter.assignedSeats).toEqual([1, 2, 3, 4, 5, 6]);
    expect(charter.booking.totalPaise).toBe(6200000);
  });

  it("expires abandoned holds and frees seats for subsequent customers", () => {
    const state = getDemoState();
    const depId = "22222222-2222-4222-8222-222222222204"; // 5/6 taken, 1 left

    const held = reserveSeatsDemo(
      {
        departureId: depId,
        userId: null,
        customerName: "Abandoning User",
        customerEmail: "abandon@example.com",
        customerPhone: "+919800000020",
        bookingMode: "batch_seats",
        seatsRequested: 1,
        pickupPointId: null,
        payDepositOnly: false,
        paymentProvider: "sandbox",
        travelers: [
          {
            fullName: "Abandoning User",
            ageGroup: "adult",
            emergencyContact: "+919800000021",
            seatRowRequest: "no_preference",
            roomPreference: "shared_same_gender",
          },
        ],
        coTravelerPreference: "open_mixed",
        preferenceNotes: "",
        whatsappOptIn: false,
      },
      state
    );

    // Simulate hold expiration in the past
    const past = new Date(Date.now() - 60_000).toISOString();
    held.booking.holdExpiresAt = past;
    for (const sa of state.seatAllocations) {
      if (sa.bookingId === held.booking.id) sa.holdExpiresAt = past;
    }

    const availBefore = computePublicAvailabilityDemo(state).find((d) => d.departureId === depId);
    expect(availBefore?.seatsRemaining).toBe(1);

    const next = reserveSeatsDemo(
      {
        departureId: depId,
        userId: null,
        customerName: "Next Traveler",
        customerEmail: "next@example.com",
        customerPhone: "+919800000022",
        bookingMode: "batch_seats",
        seatsRequested: 1,
        pickupPointId: null,
        payDepositOnly: false,
        paymentProvider: "sandbox",
        travelers: [
          {
            fullName: "Next Traveler",
            ageGroup: "adult",
            emergencyContact: "+919800000023",
            seatRowRequest: "no_preference",
            roomPreference: "shared_same_gender",
          },
        ],
        coTravelerPreference: "open_mixed",
        preferenceNotes: "",
        whatsappOptIn: false,
      },
      state
    );

    expect(held.booking.status).toBe("expired");
    expect(next.assignedSeats).toEqual([6]);
  });

  it("computes integer paise totals accurately for batch, private, and deposit modes", () => {
    const pricing = calculateBookingPricing({
      trip: {
        basePricePaise: 1150000,
        privateGroupPricePaise: 6200000,
        privateDiscountPercent: 10,
        depositPercent: 30,
        balanceDueDaysBefore: 7,
      },
      priceOverridePaise: null,
      bookingMode: "private_vehicle",
      seatsRequested: 6,
      payDepositOnly: true,
      bookingPolicy: {
        taxRatePercent: 5,
        allowDepositCheckout: true,
        depositPercent: 30,
        balanceDueDaysBefore: 7,
      },
    });

    expect(pricing.subtotalPaise).toBe(6900000);
    expect(pricing.discountPaise).toBe(700000);
    expect(pricing.taxPaise).toBe(310000);
    expect(pricing.totalPaise).toBe(6510000);
    expect(pricing.payNowPaise).toBe(1953000);
    expect(pricing.balanceLaterPaise).toBe(4557000);
  });

  it("processes payment confirmation idempotently", () => {
    const { booking } = reserveSeatsDemo({
      departureId: "22222222-2222-4222-8222-222222222202",
      userId: null,
      customerName: "Meera",
      customerEmail: "meera@example.com",
      customerPhone: "+919800000030",
      bookingMode: "batch_seats",
      seatsRequested: 2,
      pickupPointId: null,
      payDepositOnly: false,
      paymentProvider: "sandbox",
      travelers: [
        {
          fullName: "Meera",
          ageGroup: "adult",
          emergencyContact: "+919800000031",
          seatRowRequest: "no_preference",
          roomPreference: "shared_same_gender",
        },
        {
          fullName: "Diya",
          ageGroup: "adult",
          emergencyContact: "+919800000031",
          seatRowRequest: "no_preference",
          roomPreference: "shared_same_gender",
        },
      ],
      coTravelerPreference: "prefer_same_gender",
      preferenceNotes: "Quiet estate room preferred",
      whatsappOptIn: false,
    });

    const first = confirmPaymentDemo({
      bookingId: booking.id,
      provider: "sandbox",
      providerOrderId: "order_1",
      providerPaymentId: "pay_1",
      idempotencyKey: "idem_1",
      amountPaise: booking.totalPaise,
    });
    expect(first.bookingStatus).toBe("confirmed");
    expect(first.alreadyProcessed).toBe(false);

    const replay = confirmPaymentDemo({
      bookingId: booking.id,
      provider: "sandbox",
      providerOrderId: "order_1",
      providerPaymentId: "pay_1",
      idempotencyKey: "idem_1",
      amountPaise: booking.totalPaise,
    });
    expect(replay.alreadyProcessed).toBe(true);
    expect(booking.amountPaidPaise).toBe(booking.totalPaise);
  });
});

describe("women-only batches", () => {
  beforeEach(() => {
    resetDemoStateForTests();
  });

  const WOMEN_ONLY_DEPARTURE = "22222222-2222-4222-8222-222222222203"; // SAN-CRG-DEC11
  const OPEN_DEPARTURE = "22222222-2222-4222-8222-222222222201";
  const hold = (departureId: string, womenOnlyConfirmed?: boolean) =>
    reserveSeatsDemo({
      departureId,
      userId: null,
      customerName: "Meera Iyer",
      customerEmail: "meera@example.com",
      customerPhone: "+919800000011",
      bookingMode: "batch_seats",
      seatsRequested: 1,
      pickupPointId: null,
      payDepositOnly: false,
      paymentProvider: "sandbox",
      travelers: [
        {
          fullName: "Meera Iyer",
          ageGroup: "adult",
          emergencyContact: "+919800000012",
          seatRowRequest: "no_preference",
          roomPreference: "shared_same_gender",
        },
      ],
      coTravelerPreference: "open_mixed",
      preferenceNotes: "",
      whatsappOptIn: false,
      womenOnlyConfirmed,
    });

  it("refuses a women-only date unless the booker confirms every traveller is a woman", () => {
    expect(() => hold(WOMEN_ONLY_DEPARTURE)).toThrow(/^WOMEN_ONLY: .*women-only batch/);
    expect(() => hold(WOMEN_ONLY_DEPARTURE, false)).toThrow(/WOMEN_ONLY/);
    // Nothing was held by the refused attempts.
    expect(getDemoState().bookings.filter((b) => b.departureId === WOMEN_ONLY_DEPARTURE)).toHaveLength(0);
  });

  it("holds the seat once confirmed, and records it as a women-only request", () => {
    const { booking } = hold(WOMEN_ONLY_DEPARTURE, true);
    expect(booking.status).toBe("pending_payment");
    const pref = getDemoState().comfortPreferences.find((p) => p.bookingId === booking.id);
    expect(pref?.coTravelerPreference).toBe("request_women_only");
    expect(pref?.resolutionStatus).toBe("pending_review");
  });

  it("does not ask for the confirmation on other dates", () => {
    const { booking } = hold(OPEN_DEPARTURE);
    const pref = getDemoState().comfortPreferences.find((p) => p.bookingId === booking.id);
    expect(pref?.coTravelerPreference).toBe("open_mixed");
  });
});
