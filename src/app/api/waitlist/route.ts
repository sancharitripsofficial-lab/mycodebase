import { NextRequest, NextResponse } from "next/server";
import { addWaitlistEntry } from "@/lib/data/repository";
import { checkRateLimit } from "@/lib/rate-limit";
import { waitlistSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = checkRateLimit(`waitlist:${ip}`, 8, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many waitlist requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = waitlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid waitlist request." },
      { status: 400 }
    );
  }

  try {
    const entry = await addWaitlistEntry({
      departureId: parsed.data.departureId,
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      seatsNeeded: parsed.data.seatsNeeded,
      whatsappOptIn: parsed.data.whatsappOptIn,
    });
    return NextResponse.json({
      ok: true,
      waitlistId: entry.id,
      message: "Added to waitlist. An operator will contact you if seats open.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to join waitlist." },
      { status: 400 }
    );
  }
}

