import { NextRequest, NextResponse } from "next/server";
import { createCreatorApplication, hasCreatorDatabase } from "@/lib/data/creators";
import { checkRateLimit } from "@/lib/rate-limit";
import { creatorApplySchema } from "@/lib/validation";

/** Creators apply for the Sanchari programme. Staff verify followers before any code is issued. */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = checkRateLimit(`creator-apply:${ip}`, 3, 30 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "You've applied a few times already. We'll be in touch on WhatsApp." }, { status: 429 });
  }
  const parsed = creatorApplySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, { status: 400 });
  }
  if (!hasCreatorDatabase()) {
    return NextResponse.json({ error: "Applications open once the website's database is connected." }, { status: 409 });
  }
  try {
    const d = parsed.data;
    await createCreatorApplication({
      fullName: d.fullName,
      phone: d.phone,
      email: d.email,
      platform: d.platform,
      profileUrl: d.profileUrl,
      followersClaimed: d.followersClaimed,
      message: d.message,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not send." }, { status: 500 });
  }
}
