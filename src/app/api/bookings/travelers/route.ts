import { NextRequest, NextResponse } from "next/server";
import { saveCustomerTravelerDetails } from "@/lib/data/repository";
import { paymentErrorMessage } from "@/lib/payments/upi";
import { checkRateLimit } from "@/lib/rate-limit";
import { travelerDetailsSchema } from "@/lib/validation";

/**
 * Step 2 of booking: who is travelling. Sent from My Booking after the seats are reserved,
 * for a booking found by its reference and email (the same proof My Booking itself asks for).
 */
export async function PUT(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = checkRateLimit(`travelers:${ip}`, 12, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many tries. Please wait a minute and save again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = travelerDetailsSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // "travelers.1.ageYears" → the form marks traveller 2's age box.
    const travelerIndex = issue?.path[0] === "travelers" && typeof issue.path[1] === "number" ? issue.path[1] : null;
    return NextResponse.json(
      { error: issue?.message ?? "Please check the traveller details.", travelerIndex, field: issue?.path[2] ?? null },
      { status: 400 }
    );
  }

  try {
    const { saved } = await saveCustomerTravelerDetails({
      bookingReference: parsed.data.bookingReference,
      email: parsed.data.email,
      pickupPointId: parsed.data.pickupPointId,
      travelers: parsed.data.travelers,
      coTravelerPreference: parsed.data.coTravelerPreference,
      preferenceNotes: parsed.data.preferenceNotes,
    });
    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    const raw = err instanceof Error ? err.message : null;
    const code = raw?.match(/^([A-Z_]{4,40}): /)?.[1];
    const status = code === "BOOKING_NOT_FOUND" ? 404 : code === "DETAILS_LOCKED" ? 409 : 400;
    // Database constraint text is never shown; our own "CODE: message" errors are.
    const message = code ? paymentErrorMessage(raw, "Could not save the traveller details.") : "Could not save the traveller details. Please try again.";
    if (!code) console.error("[travelers] save failed:", raw);
    return NextResponse.json({ error: message, code }, { status });
  }
}
