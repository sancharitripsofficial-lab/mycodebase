import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/lib/auth";
import { createAtomicBookingHold, getUpiPaymentSettings } from "@/lib/data/repository";
import { getPaymentGatewayStatus } from "@/lib/env";
import { signBookingLookupToken } from "@/lib/lookup-token";
import { getPaymentProvider } from "@/lib/payments/provider";
import { paymentErrorMessage } from "@/lib/payments/upi";
import { buildUpiInstructions } from "@/lib/payments/upi-qr";
import { checkRateLimit } from "@/lib/rate-limit";
import { refreshStorefront } from "@/lib/revalidate";
import { checkoutSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = checkRateLimit(`hold:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many booking attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Please check the booking form fields.",
        issues: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const method = getPaymentGatewayStatus().provider;

  // Never hold seats that cannot be paid for: check the owner's UPI is switched on first.
  const upiSettings = method === "upi" ? await getUpiPaymentSettings() : null;
  if (upiSettings && !upiSettings.isEnabled) {
    return NextResponse.json(
      {
        error:
          "Online payment isn't switched on yet, so seats can't be held right now. Please message us on WhatsApp to book.",
        code: "UPI_DISABLED",
      },
      { status: 503 }
    );
  }

  try {
    const actor = await getAuthenticatedActor();
    const hold = await createAtomicBookingHold({
      departureId: parsed.data.departureId,
      userId: actor && !actor.isDemoAdmin ? actor.userId : null,
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      customerPhone: parsed.data.customerPhone,
      bookingMode: parsed.data.bookingMode,
      seatsRequested: parsed.data.seatsRequested,
      pickupPointId: parsed.data.pickupPointId,
      payDepositOnly: parsed.data.payDepositOnly,
      paymentProvider: method,
      travelers: parsed.data.travelers,
      coTravelerPreference: parsed.data.coTravelerPreference,
      preferenceNotes: parsed.data.preferenceNotes ?? "",
      whatsappOptIn: parsed.data.whatsappOptIn,
      womenOnlyConfirmed: parsed.data.womenOnlyConfirmed,
      preferredSeats: parsed.data.bookingMode === "batch_seats" ? parsed.data.preferredSeats ?? null : null,
      couponCode: parsed.data.couponCode || null,
    });

    refreshStorefront();
    const lookupToken = signBookingLookupToken(hold.bookingReference, parsed.data.customerEmail);
    const base = {
      bookingId: hold.bookingId,
      bookingReference: hold.bookingReference,
      holdExpiresAt: hold.holdExpiresAt,
      amountDuePaise: hold.amountDuePaise,
      seatNumbers: hold.seatNumbers,
      couponDiscountPaise: hold.couponDiscountPaise,
      lookupToken,
    };

    // A coupon covered everything: the booking is already confirmed, no payment step.
    if (hold.bookingStatus === "confirmed") {
      return NextResponse.json({ ...base, paymentMethod: "free", freeConfirmed: true, upi: null, paymentOrder: null });
    }

    if (upiSettings) {
      const upi = await buildUpiInstructions({
        settings: upiSettings,
        amountPaise: hold.amountDuePaise,
        bookingReference: hold.bookingReference,
        holdExpiresAt: hold.holdExpiresAt,
      });
      return NextResponse.json({ ...base, paymentMethod: "upi", upi, paymentOrder: null });
    }

    const paymentOrder = await getPaymentProvider().createOrder({
      bookingId: hold.bookingId,
      bookingReference: hold.bookingReference,
      amountPaise: hold.amountDuePaise,
      currency: "INR",
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
    });
    return NextResponse.json({ ...base, paymentMethod: paymentOrder.provider, upi: null, paymentOrder });
  } catch (err) {
    const raw = err instanceof Error ? err.message : null;
    const message = paymentErrorMessage(raw, "Could not hold seats.");
    const seatTaken = Boolean(raw && raw.startsWith("SEAT_TAKEN"));
    if (raw && raw.startsWith("WOMEN_ONLY")) {
      return NextResponse.json({ error: message, code: "WOMEN_ONLY" }, { status: 400 });
    }
    return NextResponse.json({ error: message, code: seatTaken ? "SEAT_TAKEN" : undefined }, { status: 409 });
  }
}
