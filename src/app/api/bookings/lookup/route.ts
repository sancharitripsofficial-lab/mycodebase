import { NextRequest, NextResponse } from "next/server";
import { lookupCustomerBooking, requestCustomerBookingChange } from "@/lib/data/repository";
import { verifyBookingLookupToken } from "@/lib/lookup-token";
import { buildCustomerPaymentView } from "@/lib/payments/customer-view";
import { checkRateLimit } from "@/lib/rate-limit";
import { bookingLookupSchema, cancellationRequestSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = checkRateLimit(`lookup:${ip}`, 15, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many lookup attempts. Please wait a minute." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = bookingLookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter booking reference and email." },
      { status: 400 }
    );
  }

  const optionalToken =
    typeof (body as Record<string, unknown>)?.token === "string"
      ? String((body as Record<string, unknown>).token)
      : null;

  if (optionalToken) {
    const validToken = verifyBookingLookupToken(
      parsed.data.bookingReference,
      parsed.data.email,
      optionalToken
    );
    if (!validToken) {
      return NextResponse.json({ error: "Invalid receipt token." }, { status: 403 });
    }
  }

  const result = await lookupCustomerBooking(parsed.data.bookingReference, parsed.data.email);
  if (!result) {
    return NextResponse.json(
      { error: "No matching booking found for that reference and email." },
      { status: 404 }
    );
  }

  const payment = await buildCustomerPaymentView(result.booking);
  return NextResponse.json({ bookingView: result, payment });
}

export async function PATCH(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = checkRateLimit(`lookup-change:${ip}`, 8, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = cancellationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request details." },
      { status: 400 }
    );
  }

  try {
    const { outcome } = await requestCustomerBookingChange(parsed.data);
    return NextResponse.json({
      ok: true,
      outcome,
      message:
        outcome === "cancelled_unpaid"
          ? "Booking cancelled. Nothing was paid, so there is nothing to refund and the seats are free again."
          : "Your request has been logged for operations review.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not record request." },
      { status: 404 }
    );
  }
}

