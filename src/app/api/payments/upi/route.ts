import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findBookingByReferenceAndEmail, submitUpiPayment } from "@/lib/data/repository";
import { paymentErrorMessage, validateUtr } from "@/lib/payments/upi";
import { checkRateLimit } from "@/lib/rate-limit";

const submitSchema = z.object({
  bookingReference: z.string().trim().min(5).max(40),
  email: z.string().trim().email().max(160),
  utr: z.string().max(40),
});

/**
 * Customer says "I have paid": records the 12-digit UPI reference against the booking.
 * The amount is never taken from the browser — the database uses the booking's amount due.
 * Staff then confirm or reject after checking their bank / UPI app.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = checkRateLimit(`upi-submit:${ip}`, 8, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Booking reference, email and UPI reference are needed." }, { status: 400 });
  }

  const utr = validateUtr(parsed.data.utr);
  if (!utr.ok) {
    return NextResponse.json({ error: utr.message }, { status: 400 });
  }

  const booking = await findBookingByReferenceAndEmail(parsed.data.bookingReference, parsed.data.email);
  if (!booking) {
    return NextResponse.json({ error: "No booking matches that reference and email." }, { status: 404 });
  }

  try {
    const result = await submitUpiPayment(booking.id, utr.value);
    return NextResponse.json({ ok: true, bookingReference: booking.bookingReference, ...result });
  } catch (err) {
    const raw = err instanceof Error ? err.message : null;
    return NextResponse.json(
      { error: paymentErrorMessage(raw, "Could not record your payment. Please try again or contact us.") },
      { status: 409 }
    );
  }
}
