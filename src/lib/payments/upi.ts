/**
 * Direct-to-UPI payments (same concept as Grain Bazar):
 * the customer pays the owner's own UPI ID, types the 12-digit UPI reference number (UTR),
 * and staff confirm after seeing the money in their bank / UPI app.
 *
 * Pure helpers only (safe for client and server). QR generation lives in upi-qr.ts.
 */

import type { CustomerPaymentSummary, PaymentRecord } from "@/lib/types";

export const UTR_PATTERN = /^[0-9]{12}$/;
export const UPI_ID_PATTERN = /^[a-z0-9._-]{2,200}@[a-z][a-z0-9.-]{1,63}$/;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };

export function normalizeUtr(raw: string): string {
  return (raw ?? "").replace(/\s+/g, "").trim();
}

export function validateUtr(raw: string): ValidationResult<string> {
  const utr = normalizeUtr(raw);
  if (!utr) {
    return { ok: false, message: "Enter the 12-digit UPI reference number (UTR) from your payment." };
  }
  if (/[^0-9]/.test(utr)) {
    return {
      ok: false,
      message:
        "Use the 12-digit UPI Ref No. / UTR (numbers only). The app's own transaction ID with letters is a different number.",
    };
  }
  if (!UTR_PATTERN.test(utr)) {
    return {
      ok: false,
      message: `The UPI reference number has exactly 12 digits. You entered ${utr.length}.`,
    };
  }
  return { ok: true, value: utr };
}

export function normalizeUpiId(raw: string): string {
  return (raw ?? "").trim().toLowerCase();
}

export function validateUpiId(raw: string): ValidationResult<string> {
  const upiId = normalizeUpiId(raw);
  const digitsOnly = upiId.replace(/[\s+-]/g, "");
  if (!upiId) {
    return { ok: false, message: "Enter the UPI ID where you want to receive money." };
  }
  if (/^(91)?[6-9][0-9]{9}$/.test(digitsOnly)) {
    return {
      ok: false,
      message:
        "That is a phone number, not a UPI ID. Open your UPI app → Profile and copy the UPI ID shown there, for example 9876543210@ybl (PhonePe) or yourname@okhdfcbank (Google Pay).",
    };
  }
  if (!upiId.includes("@")) {
    return {
      ok: false,
      message: "A UPI ID looks like name@bank, for example 9876543210@ybl. Copy it from your UPI app's profile.",
    };
  }
  if (!UPI_ID_PATTERN.test(upiId)) {
    return {
      ok: false,
      message:
        "That UPI ID doesn't look right. Use only letters, numbers, dot, dash or underscore before the @, and the bank handle after it (for example @ybl, @okaxis, @paytm).",
    };
  }
  return { ok: true, value: upiId };
}

export function validatePayeeName(raw: string): ValidationResult<string> {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) {
    return { ok: false, message: "Enter the account holder / business name (2–60 characters)." };
  }
  if (!/^[A-Za-z0-9 .&'()-]+$/.test(name)) {
    return {
      ok: false,
      message: "Use letters, numbers, spaces and . & ' ( ) - only in the payee name.",
    };
  }
  return { ok: true, value: name };
}

export function validateSupportPhone(raw: string): ValidationResult<string> {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return { ok: true, value: "" };
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!/^[6-9][0-9]{9}$/.test(local)) {
    return { ok: false, message: "Enter a 10-digit Indian mobile number, or leave it empty." };
  }
  return { ok: true, value: local };
}

/** UPI apps expect rupees with two decimals, e.g. 11500.00 */
export function rupeesForUpi(amountPaise: number): string {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error("UPI amount must be a positive whole number of paise.");
  }
  return (amountPaise / 100).toFixed(2);
}

function encodeUpiParam(value: string): string {
  // Keep '@' readable in the payee address; every UPI app accepts it unescaped.
  return encodeURIComponent(value).replace(/%40/g, "@");
}

export function upiNoteForBooking(bookingReference: string): string {
  return `Sanchari ${bookingReference}`.slice(0, 50);
}

/**
 * Standard UPI deep link. No `tr` parameter on purpose: some apps (Paytm) refuse
 * person-to-person links that carry a merchant transaction reference ("UPI risk policy").
 */
export function buildUpiUri(params: {
  upiId: string;
  payeeName: string;
  amountPaise: number;
  note: string;
}): string {
  const upiId = validateUpiId(params.upiId);
  if (!upiId.ok) throw new Error(upiId.message);
  const query = [
    `pa=${encodeUpiParam(upiId.value)}`,
    `pn=${encodeUpiParam(params.payeeName.trim())}`,
    `am=${rupeesForUpi(params.amountPaise)}`,
    "cu=INR",
    `tn=${encodeUpiParam(params.note.trim())}`,
  ].join("&");
  return `upi://pay?${query}`;
}

/** App-specific links for iPhone, where the generic upi:// link does not open a chooser. */
export function buildUpiAppLinks(upiUri: string): { gpay: string; phonepe: string; paytm: string } {
  const query = upiUri.slice(upiUri.indexOf("?"));
  return {
    gpay: `gpay://upi/pay${query}`,
    phonepe: `phonepe://pay${query}`,
    paytm: `paytmmp://pay${query}`,
  };
}

/** Database / store errors are "CODE: Human message." — show only the human part. */
export function paymentErrorMessage(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (raw.includes("idx_payments_live_utr")) {
    return "This UPI reference number has already been used for a payment.";
  }
  if (raw.includes("idx_payments_one_waiting_per_booking")) {
    return "A payment for this booking is already waiting for our check.";
  }
  const match = raw.match(/^[A-Z_]{4,40}: (.+)$/s);
  return match ? match[1] : raw;
}

export function maskUtr(utr: string | null): string | null {
  if (!utr) return null;
  return `•••• ${utr.slice(-4)}`;
}

/** What the customer may see about a payment: UTR masked, only a rejection reason as a note. */
export function toCustomerPaymentSummary(row: PaymentRecord): CustomerPaymentSummary {
  return {
    id: row.id,
    amountPaise: row.amountPaise,
    paymentType: row.paymentType,
    status: row.status,
    utrMasked: maskUtr(row.utr),
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
    customerNote: row.status === "rejected" ? row.reviewNote : null,
    seatsLost: row.seatsLost,
  };
}
