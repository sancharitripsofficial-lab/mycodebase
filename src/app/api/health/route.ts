import { NextResponse } from "next/server";
import {
  getPaymentGatewayStatus,
  getWhatsAppIntegrationStatus,
  isServiceRoleConfigured,
  isSupabaseConfigured,
} from "@/lib/env";

export async function GET() {
  const payment = getPaymentGatewayStatus();
  const whatsapp = getWhatsAppIntegrationStatus();

  return NextResponse.json({
    ok: true,
    supabaseConfigured: isSupabaseConfigured(),
    supabaseServiceRoleConfigured: isServiceRoleConfigured(),
    paymentProvider: payment.provider,
    isLivePaymentConfigured: payment.isLiveGatewayConfigured,
    whatsappCloudApiConfigured: whatsapp.isCloudApiConfigured,
    whatsappFallbackConfigured: Boolean(whatsapp.supportNumber),
  });
}

