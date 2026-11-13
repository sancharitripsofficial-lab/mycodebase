import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import {
  approveCreator,
  deleteTier,
  getCreatorAdminData,
  rejectCreator,
  saveCoupon,
  saveTier,
} from "@/lib/data/creators";
import { paymentErrorMessage } from "@/lib/payments/upi";
import { creatorAdminActionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Follower ranges, creator applications and all coupons (with how often each was used). */
export async function GET() {
  try {
    await requireStaff(["owner", "ops", "support"]);
  } catch {
    return NextResponse.json({ error: "Admin sign-in required." }, { status: 403 });
  }
  return NextResponse.json(await getCreatorAdminData(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  let actor;
  try {
    actor = await requireStaff(["owner", "ops"]);
  } catch {
    return NextResponse.json({ error: "Only the owner or operations staff can change coupons." }, { status: 403 });
  }
  if (!actor.staffRole) return NextResponse.json({ error: "Staff role required." }, { status: 403 });
  const parsed = creatorAdminActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, { status: 400 });
  }
  const who = { userId: actor.isDemoAdmin ? null : actor.userId, staffRole: actor.staffRole };
  const a = parsed.data;
  try {
    switch (a.action) {
      case "save_tier":
        await saveTier(a.tier, who);
        return NextResponse.json({ ok: true });
      case "delete_tier":
        await deleteTier(a.id, who);
        return NextResponse.json({ ok: true });
      case "approve":
        return NextResponse.json({ ok: true, result: await approveCreator(a, who) });
      case "reject":
        await rejectCreator(a, who);
        return NextResponse.json({ ok: true });
      case "save_coupon":
        await saveCoupon(a.coupon, who);
        return NextResponse.json({ ok: true });
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : null;
    return NextResponse.json(
      { error: paymentErrorMessage(raw, "That did not work.") },
      { status: raw?.startsWith("NEEDS_DATABASE") ? 409 : raw?.startsWith("NOT_ALLOWED") ? 403 : 400 }
    );
  }
}
