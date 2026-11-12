import { NextRequest, NextResponse } from "next/server";
import { confirmBookingPayment, getBookingByIdForServer } from "@/lib/data/repository";
import { getPaymentProvider } from "@/lib/payments/provider";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  const provider = getPaymentProvider();

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: {
        entity?: {
          id?: string;
          order_id?: string;
          amount?: number;
          notes?: { booking_id?: string };
        };
      };
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (event.event !== "payment.captured" && event.event !== "order.paid") {
    return NextResponse.json({ received: true, ignoredEvent: event.event ?? "unknown" });
  }

  const paymentEntity = event.payload?.payment?.entity;
  const bookingId = paymentEntity?.notes?.booking_id;
  const paymentId = paymentEntity?.id;
  const orderId = paymentEntity?.order_id ?? "";
  const amount = paymentEntity?.amount;

  if (!bookingId || !paymentId || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json(
      { error: "Webhook missing required booking_id, payment id, or valid positive amount." },
      { status: 400 }
    );
  }

  const booking = await getBookingByIdForServer(bookingId);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (booking.status === "cancelled" || booking.status === "refunded" || booking.status === "expired") {
    return NextResponse.json(
      {
        error: `Cannot automatically confirm webhook for ${booking.status} booking; manual ops reconciliation/refund required.`,
      },
      { status: 409 }
    );
  }

  if (booking.amountDuePaise > 0 && amount !== booking.amountDuePaise) {
    return NextResponse.json(
      { error: "Captured webhook amount does not match booking amount due." },
      { status: 400 }
    );
  }

  try {
    const result = await confirmBookingPayment({
      bookingId: booking.id,
      provider: provider.name,
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      idempotencyKey: `webhook:${provider.name}:${paymentId}`,
      amountPaise: amount,
      rawPayload: { event: event.event, paymentId, orderId, amount },
    });

    return NextResponse.json({
      received: true,
      bookingStatus: result.bookingStatus,
      alreadyProcessed: result.alreadyProcessed,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook confirmation error." },
      { status: 409 }
    );
  }
}

