import { getWhatsAppIntegrationStatus } from "@/lib/env";

/**
 * Generates a click-to-WhatsApp link ONLY when an owner support number is configured.
 * Never embeds sensitive co-traveler comfort preferences or personal traveler rosters.
 */
export function buildClickToWhatsAppUrl(message: string): string | null {
  const { supportNumber } = getWhatsAppIntegrationStatus();
  if (!supportNumber) {
    return null;
  }
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${supportNumber}?text=${encoded}`;
}

export interface WhatsAppReceiptPayload {
  toPhone: string;
  bookingReference: string;
  tripTitle: string;
  departureDates: string;
  whatsappOptIn: boolean;
}

export async function sendConsentedWhatsAppUpdate(
  payload: WhatsAppReceiptPayload
): Promise<{ sent: boolean; mode: "cloud_api" | "fallback_disabled"; note: string }> {
  if (!payload.whatsappOptIn) {
    return {
      sent: false,
      mode: "fallback_disabled",
      note: "Skipped: customer did not opt in to WhatsApp updates.",
    };
  }

  const { isCloudApiConfigured } = getWhatsAppIntegrationStatus();
  if (!isCloudApiConfigured) {
    return {
      sent: false,
      mode: "fallback_disabled",
      note: "WhatsApp Cloud API credentials/templates not configured yet; click-to-WhatsApp fallback active.",
    };
  }

  // Official Meta WhatsApp Cloud API call (requires owner-approved template before enabling)
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN!;
  const normalizedPhone = payload.toPhone.replace(/\D/g, "");

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizedPhone,
      type: "template",
      template: {
        name: "sanchari_booking_update",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: payload.bookingReference },
              { type: "text", text: payload.tripTitle },
              { type: "text", text: payload.departureDates },
            ],
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    return {
      sent: false,
      mode: "cloud_api",
      note: `WhatsApp Cloud API returned ${res.status}`,
    };
  }

  return {
    sent: true,
    mode: "cloud_api",
    note: "Consented WhatsApp template message dispatched.",
  };
}

