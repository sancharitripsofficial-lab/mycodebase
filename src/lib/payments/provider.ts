import crypto from "node:crypto";
import { getBookingLookupSecret, getPaymentGatewayStatus } from "@/lib/env";

export interface PaymentOrderRequest {
  bookingId: string;
  bookingReference: string;
  amountPaise: number;
  currency: "INR";
  customerName: string;
  customerEmail: string;
}

export interface PaymentOrderResult {
  provider: "razorpay" | "sandbox";
  orderId: string;
  amountPaise: number;
  currency: "INR";
  keyId: string | null;
  sandboxSignature: string | null;
  isLiveGateway: boolean;
}

export interface PaymentProvider {
  name: "razorpay" | "upi" | "sandbox";
  createOrder(req: PaymentOrderRequest): Promise<PaymentOrderResult>;
  verifyClientCallback(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
}

class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = "razorpay" as const;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string
  ) {}

  async createOrder(req: PaymentOrderRequest): Promise<PaymentOrderResult> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: req.amountPaise,
        currency: req.currency,
        receipt: req.bookingReference,
        notes: {
          booking_id: req.bookingId,
          booking_reference: req.bookingReference,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Razorpay order creation failed (${response.status}): ${errorText}`);
    }

    const order = (await response.json()) as { id: string; amount: number; currency: "INR" };
    return {
      provider: "razorpay",
      orderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
      keyId: this.keyId,
      sandboxSignature: null,
      isLiveGateway: true,
    };
  }

  verifyClientCallback(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    const expected = crypto
      .createHmac("sha256", this.keySecret)
      .update(`${params.orderId}|${params.paymentId}`)
      .digest("hex");
    return timingSafeEqualHex(expected, params.signature);
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader) return false;
    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("hex");
    return timingSafeEqualHex(expected, signatureHeader);
  }
}

/**
 * Server-signed Sandbox provider used only when live Razorpay credentials are not yet configured.
 * Still enforces server-side HMAC verification and idempotency rather than trusting raw client flags.
 */
class SandboxPaymentProvider implements PaymentProvider {
  readonly name = "sandbox" as const;

  async createOrder(req: PaymentOrderRequest): Promise<PaymentOrderResult> {
    const orderId = `order_sandbox_${req.bookingId.slice(0, 8)}_${Date.now()}`;
    const sandboxSignature = crypto
      .createHmac("sha256", getBookingLookupSecret())
      .update(`${orderId}:${req.bookingId}:${req.amountPaise}`)
      .digest("hex");

    return {
      provider: "sandbox",
      orderId,
      amountPaise: req.amountPaise,
      currency: "INR",
      keyId: null,
      sandboxSignature,
      isLiveGateway: false,
    };
  }

  verifyClientCallback(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    // Expects `signature` computed by server `signSandboxPaymentToken` or webhook secret
    const expected = signSandboxCompletion(params.orderId, params.paymentId);
    return timingSafeEqualHex(expected, params.signature);
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader) return false;
    const expected = crypto
      .createHmac("sha256", getBookingLookupSecret())
      .update(rawBody)
      .digest("hex");
    return timingSafeEqualHex(expected, signatureHeader);
  }
}

export function signSandboxCompletion(orderId: string, paymentId: string): string {
  return crypto
    .createHmac("sha256", getBookingLookupSecret())
    .update(`sandbox_confirm:${orderId}:${paymentId}`)
    .digest("hex");
}

export function verifySandboxOrderToken(
  orderId: string,
  bookingId: string,
  amountPaise: number,
  signature: string
): boolean {
  const expected = crypto
    .createHmac("sha256", getBookingLookupSecret())
    .update(`${orderId}:${bookingId}:${amountPaise}`)
    .digest("hex");
  return timingSafeEqualHex(expected, signature);
}

function timingSafeEqualHex(expectedHex: string, receivedHex: string): boolean {
  const a = Buffer.from(expectedHex.trim(), "utf8");
  const b = Buffer.from(receivedHex.trim(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Direct UPI has no gateway callback: money is confirmed by staff through
 * review_upi_payment. This placeholder makes sure gateway-only routes
 * (/api/payments/verify, /api/payments/webhook) refuse everything in UPI mode.
 */
class DirectUpiProvider implements PaymentProvider {
  readonly name = "upi" as const;

  async createOrder(): Promise<PaymentOrderResult> {
    throw new Error("Direct UPI does not create gateway orders.");
  }

  verifyClientCallback(): boolean {
    return false;
  }

  verifyWebhookSignature(): boolean {
    return false;
  }
}

export function getPaymentProvider(): PaymentProvider {
  const status = getPaymentGatewayStatus();
  if (status.provider === "upi") {
    return new DirectUpiProvider();
  }
  if (
    status.provider === "razorpay" &&
    status.isLiveGatewayConfigured &&
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAY_WEBHOOK_SECRET
  ) {
    return new RazorpayPaymentProvider(
      process.env.RAZORPAY_KEY_ID,
      process.env.RAZORPAY_KEY_SECRET,
      process.env.RAZORPAY_WEBHOOK_SECRET
    );
  }
  return new SandboxPaymentProvider();
}

