import { describe, expect, it } from "vitest";
import {
  buildUpiAppLinks,
  buildUpiUri,
  paymentErrorMessage,
  rupeesForUpi,
  toCustomerPaymentSummary,
  validatePayeeName,
  validateSupportPhone,
  validateUpiId,
  validateUtr,
} from "@/lib/payments/upi";

describe("UPI ID entered by the owner", () => {
  it("accepts real-looking UPI IDs and lower-cases them", () => {
    expect(validateUpiId(" 9876543210@YBL ")).toEqual({ ok: true, value: "9876543210@ybl" });
    expect(validateUpiId("sanchari.trips@okhdfcbank")).toEqual({ ok: true, value: "sanchari.trips@okhdfcbank" });
    expect(validateUpiId("example.business@idfcbank").ok).toBe(true);
  });

  it("explains that a bare phone number is not a UPI ID", () => {
    for (const phone of ["9876543210", "+91 98765 43210", "919876543210"]) {
      const r = validateUpiId(phone);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/phone number, not a UPI ID/);
    }
  });

  it("rejects malformed IDs", () => {
    expect(validateUpiId("sanchari").ok).toBe(false);
    expect(validateUpiId("san chari@ybl").ok).toBe(false);
    expect(validateUpiId("x@1bank").ok).toBe(false);
  });

  it("checks payee name and optional support phone", () => {
    expect(validatePayeeName("  Sanchari   Trips ")).toEqual({ ok: true, value: "Sanchari Trips" });
    expect(validatePayeeName("<script>").ok).toBe(false);
    expect(validateSupportPhone("")).toEqual({ ok: true, value: "" });
    expect(validateSupportPhone("+91 98765-43210")).toEqual({ ok: true, value: "9876543210" });
    expect(validateSupportPhone("12345").ok).toBe(false);
  });
});

describe("UPI reference typed by the customer", () => {
  it("needs exactly 12 digits, spaces allowed", () => {
    expect(validateUtr("4123 5678 9012")).toEqual({ ok: true, value: "412356789012" });
    expect(validateUtr("41235678901").ok).toBe(false);
    expect(validateUtr("T2311151234567890").ok).toBe(false);
    expect(validateUtr("").ok).toBe(false);
  });
});

describe("UPI payment link", () => {
  it("has the exact amount in rupees with paise and no tr parameter", () => {
    const uri = buildUpiUri({
      upiId: "9876543210@ybl",
      payeeName: "Sanchari Trips",
      amountPaise: 1_150_050,
      note: "Sanchari SAN-ABC123",
    });
    expect(uri).toBe("upi://pay?pa=9876543210@ybl&pn=Sanchari%20Trips&am=11500.50&cu=INR&tn=Sanchari%20SAN-ABC123");
    expect(uri).not.toMatch(/[?&]tr=/);
    expect(rupeesForUpi(100)).toBe("1.00");
    expect(() => rupeesForUpi(0)).toThrow();
    expect(() => rupeesForUpi(10.5)).toThrow();
  });

  it("builds iPhone app links from the same query", () => {
    const links = buildUpiAppLinks("upi://pay?pa=a@ybl&am=1.00");
    expect(links.phonepe).toBe("phonepe://pay?pa=a@ybl&am=1.00");
    expect(links.gpay).toBe("gpay://upi/pay?pa=a@ybl&am=1.00");
    expect(links.paytm).toBe("paytmmp://pay?pa=a@ybl&am=1.00");
  });

  it("refuses to build a link for a phone number", () => {
    expect(() =>
      buildUpiUri({ upiId: "9876543210", payeeName: "X Y", amountPaise: 100, note: "n" })
    ).toThrow(/phone number/);
  });
});

describe("messages shown to people", () => {
  it("strips the internal code and maps database index names", () => {
    expect(paymentErrorMessage("UTR_USED: This UPI reference number has already been used for a payment.", "x")).toBe(
      "This UPI reference number has already been used for a payment."
    );
    expect(paymentErrorMessage('duplicate key value violates unique constraint "idx_payments_live_utr"', "x")).toMatch(
      /already been used/
    );
    expect(paymentErrorMessage(null, "fallback")).toBe("fallback");
  });

  it("never shows the full UTR or staff notes on accepted payments to the customer", () => {
    const base = {
      id: "p1",
      bookingId: "b1",
      provider: "upi",
      amountPaise: 100,
      paymentType: "full" as const,
      utr: "412356789012",
      paidToUpiId: "a@ybl",
      paidToName: "A",
      submittedAt: null,
      lateAfterHold: false,
      seatsLost: false,
      reviewedAt: null,
      createdAt: "2026-11-12T00:00:00Z",
    };
    const ok = toCustomerPaymentSummary({ ...base, status: "captured", reviewNote: "internal: matched IDFC SMS" });
    expect(ok.utrMasked).toBe("•••• 9012");
    expect(ok.customerNote).toBeNull();
    const rejected = toCustomerPaymentSummary({ ...base, status: "rejected", reviewNote: "UTR not found in bank" });
    expect(rejected.customerNote).toBe("UTR not found in bank");
  });
});
