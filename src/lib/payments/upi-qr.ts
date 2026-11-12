import QRCode from "qrcode";
import { buildUpiUri, upiNoteForBooking } from "@/lib/payments/upi";
import type { UpiPaymentInstructions, UpiPaymentSettings } from "@/lib/types";

/**
 * Builds everything the customer needs to pay the owner's UPI ID:
 * the exact amount, the deep link and a scannable QR (PNG data URL, no external service).
 */
export async function buildUpiInstructions(params: {
  settings: UpiPaymentSettings;
  amountPaise: number;
  bookingReference: string;
  holdExpiresAt: string | null;
}): Promise<UpiPaymentInstructions> {
  if (!params.settings.isEnabled || !params.settings.upiId) {
    throw new Error("UPI_DISABLED: UPI payments are switched off. Please contact us.");
  }
  const note = upiNoteForBooking(params.bookingReference);
  const upiUri = buildUpiUri({
    upiId: params.settings.upiId,
    payeeName: params.settings.payeeName,
    amountPaise: params.amountPaise,
    note,
  });
  const qrDataUrl = await QRCode.toDataURL(upiUri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
    color: { dark: "#0B3B5E", light: "#FFFFFF" },
  });

  return {
    upiId: params.settings.upiId,
    payeeName: params.settings.payeeName,
    supportPhone: params.settings.supportPhone || null,
    amountPaise: params.amountPaise,
    note,
    upiUri,
    qrDataUrl,
    holdExpiresAt: params.holdExpiresAt,
  };
}
