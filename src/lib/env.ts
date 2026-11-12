export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project-ref")
  );
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(
    isSupabaseConfigured() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.SUPABASE_SERVICE_ROLE_KEY.includes("your-supabase-service-role")
  );
}

export interface PaymentGatewayStatus {
  provider: "razorpay" | "upi" | "sandbox";
  isLiveGatewayConfigured: boolean;
  razorpayKeyId: string | null;
  reason: string;
}

/**
 * How customers pay:
 *  - "upi" (default): straight to the owner's UPI ID set in Admin → UPI Settings; the customer
 *    sends the 12-digit UPI reference and staff confirm after seeing the money.
 *  - "razorpay": only when PAYMENT_PROVIDER=razorpay AND all three Razorpay secrets are set.
 *  - "sandbox": fake payments for local development only (PAYMENT_PROVIDER=sandbox, never in production).
 */
export function getPaymentGatewayStatus(): PaymentGatewayStatus {
  const requested = (process.env.PAYMENT_PROVIDER ?? "upi").toLowerCase();
  const hasRazorpayKeys = Boolean(
    process.env.RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_SECRET &&
      process.env.RAZORPAY_WEBHOOK_SECRET
  );

  if (requested === "razorpay" && hasRazorpayKeys) {
    return {
      provider: "razorpay",
      isLiveGatewayConfigured: true,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID!,
      reason: "Razorpay credentials and webhook secret configured.",
    };
  }

  if (requested === "sandbox" && process.env.NODE_ENV !== "production") {
    return {
      provider: "sandbox",
      isLiveGatewayConfigured: false,
      razorpayKeyId: null,
      reason: "Development-only sandbox payments (no real money).",
    };
  }

  return {
    provider: "upi",
    isLiveGatewayConfigured: false,
    razorpayKeyId: null,
    reason:
      requested === "razorpay"
        ? "Razorpay selected, but its keys are not all set, so customers pay by direct UPI."
        : "Customers pay straight to the owner's UPI ID; staff confirm each payment.",
  };
}

export interface WhatsAppIntegrationStatus {
  isCloudApiConfigured: boolean;
  supportNumber: string | null;
}

export function getWhatsAppIntegrationStatus(): WhatsAppIntegrationStatus {
  const supportNumber = (process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER ?? "").replace(/\D/g, "") || null;
  const isCloudApiConfigured = Boolean(
    process.env.WHATSAPP_CLOUD_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
  );
  return {
    isCloudApiConfigured,
    supportNumber,
  };
}

export function getBookingLookupSecret(): string {
  const configured = process.env.BOOKING_LOOKUP_SECRET;
  if (configured && configured.length >= 16) {
    return configured;
  }
  // Safe deterministic fallback ONLY for local non-production demo mode.
  if (process.env.NODE_ENV === "production") {
    throw new Error("BOOKING_LOOKUP_SECRET must be configured in production.");
  }
  return "sanchari-local-dev-lookup-secret-change-me";
}

