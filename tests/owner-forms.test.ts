/** Owner tools: form rules on the server and the WhatsApp messages staff send. */
import { describe, expect, it } from "vitest";
import { balanceReminderText, myBookingUrl, tripDetailsText, waLink, waNumber } from "@/lib/admin/whatsapp";
import { checkoutSchema, enquirySchema, ownerOpsActionSchema } from "@/lib/validation";

const BOOKING = "11111111-1111-4111-8111-111111111111";

describe("owner actions — form rules", () => {
  it("record payment turns rupees into paise and needs a reference and a reason", () => {
    const ok = ownerOpsActionSchema.parse({
      kind: "record_payment",
      bookingId: BOOKING,
      amountRupees: 11500.5,
      method: "cash",
      reference: "RCPT-0042",
      note: "Paid at office",
    });
    expect(ok.kind === "record_payment" && ok.amountRupees).toBe(1150050);
    expect(
      ownerOpsActionSchema.safeParse({ kind: "record_payment", bookingId: BOOKING, amountRupees: 100, method: "cash", reference: "", note: "Paid at office" }).success
    ).toBe(false);
    expect(
      ownerOpsActionSchema.safeParse({ kind: "record_payment", bookingId: BOOKING, amountRupees: 100, method: "cash", reference: "R-1", note: "ok" }).success
    ).toBe(false);
    expect(
      ownerOpsActionSchema.safeParse({ kind: "record_payment", bookingId: BOOKING, amountRupees: -5, method: "cash", reference: "R-1", note: "Paid at office" }).success
    ).toBe(false);
    expect(
      ownerOpsActionSchema.safeParse({ kind: "record_payment", bookingId: BOOKING, amountRupees: 5, method: "cheque", reference: "R-1", note: "Paid at office" }).success
    ).toBe(false);
  });

  it("crew: phone is cleaned to 10 digits, vehicle upper-cased, only real WhatsApp group links", () => {
    const r = ownerOpsActionSchema.parse({
      kind: "save_crew",
      departureId: BOOKING,
      driverName: "Ravi",
      driverPhone: "+91 98450 12345",
      vehicleNumber: "ka 01  ab 1234",
      whatsappGroupUrl: "https://chat.whatsapp.com/AbCdEf123456",
      reportingNote: "Silk Board 5:45 AM",
      operatorNotes: "",
    });
    expect(r.kind === "save_crew" && r.driverPhone).toBe("9845012345");
    expect(r.kind === "save_crew" && r.vehicleNumber).toBe("KA 01 AB 1234");
    for (const bad of ["https://evil.example/chat.whatsapp.com/abc", "http://chat.whatsapp.com/AbCdEf123456", "chat.whatsapp.com/x"]) {
      expect(
        ownerOpsActionSchema.safeParse({
          kind: "save_crew",
          departureId: BOOKING,
          driverName: "",
          driverPhone: "",
          vehicleNumber: "",
          whatsappGroupUrl: bad,
          reportingNote: "",
          operatorNotes: "",
        }).success
      ).toBe(false);
    }
    expect(
      ownerOpsActionSchema.safeParse({
        kind: "save_crew",
        departureId: BOOKING,
        driverName: "",
        driverPhone: "12345",
        vehicleNumber: "",
        whatsappGroupUrl: "",
        reportingNote: "",
        operatorNotes: "",
      }).success
    ).toBe(false);
  });

  it("enquiry: Indian mobile required, hidden bot field must stay empty", () => {
    const base = { kind: "private_date", fullName: "Meera", phone: "098450 12345", email: "", tripId: null, preferredDates: "20 Dec", groupSize: 5, message: "" };
    const ok = enquirySchema.parse(base);
    expect(ok.phone).toBe("9845012345");
    expect(enquirySchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...base, website: "http://spam" }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...base, groupSize: 0 }).success).toBe(false);
  });

  it("checkout: picked seats must match the traveller count and not repeat", () => {
    const traveler = { fullName: "Asha Rao", ageGroup: "adult", emergencyContact: "+919800000000", seatRowRequest: "no_preference", roomPreference: "shared_same_gender" };
    const base = {
      departureId: BOOKING,
      bookingMode: "batch_seats",
      seatsRequested: 2,
      pickupPointId: null,
      customerName: "Asha Rao",
      customerEmail: "asha@example.com",
      customerPhone: "+919800000001",
      payDepositOnly: false,
      travelers: [traveler, { ...traveler, fullName: "Ravi Rao" }],
      coTravelerPreference: "open_mixed",
      preferenceNotes: "",
      whatsappOptIn: false,
      acceptedTermsPrivacy: true,
      acceptedComfortProcessing: true,
    };
    expect(checkoutSchema.safeParse({ ...base, preferredSeats: [2, 3] }).success).toBe(true);
    expect(checkoutSchema.safeParse(base).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...base, preferredSeats: [2] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, preferredSeats: [2, 2] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, preferredSeats: [2, 9] }).success).toBe(false);
  });
});

describe("WhatsApp messages staff send", () => {
  it("builds click-to-chat links only for real Indian mobiles", () => {
    expect(waNumber("+91 98450-12345")).toBe("919845012345");
    expect(waNumber("09845012345")).toBe("919845012345");
    expect(waNumber("12345")).toBeNull();
    expect(waLink("12345", "hi")).toBeNull();
    expect(waLink("9845012345", "a b")).toBe("https://wa.me/919845012345?text=a%20b");
  });

  it("balance reminder carries the amount, the UPI ID and the customer's own booking link", () => {
    const url = myBookingUrl("https://mycodebase-gray.vercel.app/", "SAN-AB12CD", "asha@example.com", "tok");
    expect(url).toBe("https://mycodebase-gray.vercel.app/booking-lookup?ref=SAN-AB12CD&email=asha%40example.com&token=tok");
    const text = balanceReminderText({
      customerName: "Asha Rao",
      tripTitle: "Coorg Rainforest",
      departureCode: "SAN-COORG-DEC06",
      startDate: "2026-12-06",
      amountDuePaise: 805000,
      balanceDueAt: null,
      upiId: "sanchari@okaxis",
      bookingUrl: url,
    });
    expect(text).toContain("Hi Asha");
    expect(text).toContain("₹8,050");
    expect(text).toContain("sanchari@okaxis");
    expect(text).toContain(url);
  });

  it("trip details message lists seats, vehicle, driver and group link, skipping empty parts", () => {
    const text = tripDetailsText({
      customerName: "Asha Rao",
      tripTitle: "Coorg",
      departureCode: "SAN-COORG-DEC06",
      startDate: "2026-12-06",
      seatNumbers: [2, 3],
      pickupName: "Silk Board",
      driverName: "Ravi",
      driverPhone: "9845012345",
      vehicleNumber: "KA 01 AB 1234",
      whatsappGroupUrl: "",
      reportingNote: "",
      bookingUrl: "https://x/booking-lookup",
    });
    expect(text).toContain("Your seats: 2, 3");
    expect(text).toContain("Vehicle: KA 01 AB 1234");
    expect(text).toContain("Driver: Ravi, 9845012345");
    expect(text).not.toContain("Trip group");
  });
});
