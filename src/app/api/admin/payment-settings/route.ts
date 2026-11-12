import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { getUpiPaymentSettings, updateUpiPaymentSettings } from "@/lib/data/repository";
import { paymentErrorMessage, validatePayeeName, validateSupportPhone, validateUpiId } from "@/lib/payments/upi";
import { buildUpiInstructions } from "@/lib/payments/upi-qr";
import type { UpiPaymentSettings } from "@/lib/types";
import { upiSettingsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** ₹1 test QR so the owner can check money really lands in their account before going live. */
async function testQr(settings: UpiPaymentSettings) {
  if (!settings.upiId || !settings.payeeName) return null;
  return buildUpiInstructions({
    settings: { ...settings, isEnabled: true },
    amountPaise: 100,
    bookingReference: "TEST-1RS",
    holdExpiresAt: null,
  });
}

export async function GET() {
  try {
    await requireStaff(["owner", "ops"]);
  } catch {
    return NextResponse.json({ error: "Owner or operations sign-in required." }, { status: 403 });
  }
  const settings = await getUpiPaymentSettings();
  return NextResponse.json({ settings, testQr: await testQr(settings) });
}

/** Only the owner decides where customers' money goes. Every change is audit-logged. */
export async function PUT(request: NextRequest) {
  let actor;
  try {
    actor = await requireStaff(["owner"]);
  } catch {
    return NextResponse.json({ error: "Only the owner can change the UPI receiving account." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = upiSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid UPI settings." }, { status: 400 });
  }

  const wantsUpi = parsed.data.isEnabled || parsed.data.upiId.trim() !== "";
  const upiId = wantsUpi ? validateUpiId(parsed.data.upiId) : { ok: true as const, value: "" };
  if (!upiId.ok) return NextResponse.json({ error: upiId.message, field: "upiId" }, { status: 400 });

  const wantsName = parsed.data.isEnabled || parsed.data.payeeName.trim() !== "";
  const payeeName = wantsName ? validatePayeeName(parsed.data.payeeName) : { ok: true as const, value: "" };
  if (!payeeName.ok) return NextResponse.json({ error: payeeName.message, field: "payeeName" }, { status: 400 });

  const phone = validateSupportPhone(parsed.data.supportPhone);
  if (!phone.ok) return NextResponse.json({ error: phone.message, field: "supportPhone" }, { status: 400 });

  try {
    const settings = await updateUpiPaymentSettings(
      {
        isEnabled: parsed.data.isEnabled,
        upiId: upiId.value,
        payeeName: payeeName.value,
        supportPhone: phone.value,
      },
      { userId: actor.userId, role: actor.staffRole ?? "owner" }
    );
    return NextResponse.json({ ok: true, settings, testQr: await testQr(settings) });
  } catch (err) {
    const raw = err instanceof Error ? err.message : null;
    return NextResponse.json({ error: paymentErrorMessage(raw, "Could not save UPI settings.") }, { status: 409 });
  }
}
