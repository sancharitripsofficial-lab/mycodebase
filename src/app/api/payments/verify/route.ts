import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmBookingPayment, getBookingByIdForServer } from "@/lib/data/repository";
import {
  getPaymentProvider,
  signSandboxCompletion,
  verifySandboxOrderToken,
} from "@/lib/payments/provider";

const verifySchema = z.object({
  bookingId: z.string().uuid(),
  provider: z.enum(["razorpay", "sandbox"]),
  orderId: z.string().min(4),
  paymentId: z.string().optional(),
  signature: z.string().optional(),
  sandboxOrderSignature: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment verification payload." }, { status: 400 });
  }

  const booking = await getBookingByIdForServer(parsed.data.bookingId);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.status === "expired" || booking.status === "cancelled" || booking.status === "refunded") {
    return NextResponse.json(
      { error: "This booking hold has expired, been cancelled, or was refunded. Please check availability again." },
      { status: 409 }
    );
  }
  if (
    booking.status === "pending_payment" &&
    booking.holdExpiresAt &&
    Date.parse(booking.holdExpiresAt) <= Date.now()
  ) {
    return NextResponse.json(
      { error: "Your temporary seat hold expired before payment verification. Please recheck live availability." },
      { status: 409 }
    );
  }

  const activeProvider = getPaymentProvider();

  if (parsed.data.provider === "razorpay") {
    if (activeProvider.name !== "razorpay") {
      return NextResponse.json(
        { error: "Razorpay gateway is not enabled on the server." },
        { status: 503 }
      );
    }
    if (!parsed.data.paymentId || !parsed.data.signature) {
      return NextResponse.json(
        { error: "Missing Razorpay payment ID or signature." },
        { status: 400 }
      );
    }
    const valid = activeProvider.verifyClientCallback({
      orderId: parsed.data.orderId,
      paymentId: parsed.data.paymentId,
      signature: parsed.data.signature,
    });
    if (!valid) {
      return NextResponse.json(
        { error: "Payment signature verification failed." },
        { status: 403 }
      );
    }

    const result = await confirmBookingPayment({
      bookingId: booking.id,
      provider: "razorpay",
      providerOrderId: parsed.data.orderId,
      providerPaymentId: parsed.data.paymentId,
      idempotencyKey: `rzp:${parsed.data.paymentId}`,
      amountPaise: booking.amountDuePaise,
      rawPayload: { verifiedVia: "client_callback_hmac", orderId: parsed.data.orderId },
    });

    return NextResponse.json({
      verified: true,
      mode: "razorpay",
      bookingReference: booking.bookingReference,
      bookingStatus: result.bookingStatus,
      alreadyProcessed: result.alreadyProcessed,
    });
  }

  // Sandbox mode: strictly gated by server-configured provider AND HMAC-signed order token
  if (activeProvider.name !== "sandbox") {
    return NextResponse.json(
      { error: "Sandbox payment verification is disabled when live Razorpay is active." },
      { status: 403 }
    );
  }

  if (
    !parsed.data.sandboxOrderSignature ||
    !verifySandboxOrderToken(
      parsed.data.orderId,
      booking.id,
      booking.amountDuePaise,
      parsed.data.sandboxOrderSignature
    )
  ) {
    return NextResponse.json(
      { error: "Invalid server sandbox order token." },
      { status: 403 }
    );
  }

  const sandboxPaymentId = `pay_sandbox_${booking.bookingReference}`;
  const completionSig = signSandboxCompletion(parsed.data.orderId, sandboxPaymentId);
  if (
    !activeProvider.verifyClientCallback({
      orderId: parsed.data.orderId,
      paymentId: sandboxPaymentId,
      signature: completionSig,
    })
  ) {
    return NextResponse.json({ error: "Sandbox verification failed." }, { status: 403 });
  }

  const result = await confirmBookingPayment({
    bookingId: booking.id,
    provider: "sandbox",
    providerOrderId: parsed.data.orderId,
    providerPaymentId: sandboxPaymentId,
    idempotencyKey: `sandbox:${parsed.data.orderId}`,
    amountPaise: booking.amountDuePaise,
    rawPayload: { verifiedVia: "sandbox_server_hmac", demoOnly: true },
  });

  return NextResponse.json({
    verified: true,
    mode: "sandbox",
    bookingReference: booking.bookingReference,
    bookingStatus: result.bookingStatus,
    alreadyProcessed: result.alreadyProcessed,
  });
}

