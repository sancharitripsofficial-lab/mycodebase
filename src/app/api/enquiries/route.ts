import { NextRequest, NextResponse } from "next/server";
import { createEnquiry } from "@/lib/data/owner-ops";
import { paymentErrorMessage } from "@/lib/payments/upi";
import { checkRateLimit } from "@/lib/rate-limit";
import { enquirySchema } from "@/lib/validation";

/** Public "ask us" form: private dates, custom trips, groups. Validated + rate-limited. */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = checkRateLimit(`enquiry:${ip}`, 4, 10 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "You have sent a few requests already. Please WhatsApp us or try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  const parsed = enquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { website, ...data } = parsed.data;

  try {
    await createEnquiry(data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: paymentErrorMessage(err instanceof Error ? err.message : null, "Could not send your request.") },
      { status: 500 }
    );
  }
}
