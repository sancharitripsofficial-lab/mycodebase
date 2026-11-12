import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { getAdminPayments, getUpiPaymentSettings, reviewUpiPayment } from "@/lib/data/repository";
import { paymentErrorMessage } from "@/lib/payments/upi";
import { upiReviewSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Payment queue + current UPI receiving account (all staff may look; support cannot act). */
export async function GET() {
  try {
    const actor = await requireStaff(["owner", "ops", "support"]);
    const [payments, upiSettings] = await Promise.all([getAdminPayments(), getUpiPaymentSettings()]);
    return NextResponse.json({ actorRole: actor.staffRole, payments, upiSettings });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED_STAFF") {
      return NextResponse.json({ error: "Admin sign-in required." }, { status: 403 });
    }
    return NextResponse.json({ error: "Could not load payments." }, { status: 500 });
  }
}

/** Owner / ops decision after looking at the bank or UPI app. */
export async function POST(request: NextRequest) {
  let actor;
  try {
    actor = await requireStaff(["owner", "ops"]);
  } catch {
    return NextResponse.json({ error: "Only the owner or operations staff can review payments." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = upiReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid decision." }, { status: 400 });
  }

  try {
    const result = await reviewUpiPayment({
      paymentId: parsed.data.paymentId,
      decision: parsed.data.decision,
      note: parsed.data.note,
      actorUserId: actor.userId,
      actorRole: actor.staffRole ?? "ops",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const raw = err instanceof Error ? err.message : null;
    return NextResponse.json({ error: paymentErrorMessage(raw, "Could not save the decision.") }, { status: 409 });
  }
}
