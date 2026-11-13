import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { deletePromotion, listPromotionsAdmin, savePromotion } from "@/lib/data/promotions";
import { paymentErrorMessage } from "@/lib/payments/upi";
import { refreshStorefront } from "@/lib/revalidate";
import { promotionActionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** All offers (drafts, scheduled, ended) with view/click counts. */
export async function GET() {
  try {
    await requireStaff(["owner", "ops", "support"]);
  } catch {
    return NextResponse.json({ error: "Admin sign-in required." }, { status: 403 });
  }
  try {
    return NextResponse.json({ promotions: await listPromotionsAdmin() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load offers." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let actor;
  try {
    actor = await requireStaff(["owner", "ops"]);
  } catch {
    return NextResponse.json({ error: "Only the owner or operations staff can change offers." }, { status: 403 });
  }
  if (!actor.staffRole) return NextResponse.json({ error: "Staff role required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = promotionActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, { status: 400 });
  }
  const who = { userId: actor.isDemoAdmin ? null : actor.userId, staffRole: actor.staffRole };
  try {
    if (parsed.data.action === "save") {
      const promotion = await savePromotion(parsed.data.promotion, who);
      refreshStorefront();
      return NextResponse.json({ ok: true, promotion });
    }
    await deletePromotion(parsed.data.id, who);
    refreshStorefront();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: paymentErrorMessage(err instanceof Error ? err.message : null, "Could not save the offer.") },
      { status: 400 }
    );
  }
}
