import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { quoteCoupon } from "@/lib/data/repository";
import { paymentErrorMessage } from "@/lib/payments/upi";
import { checkRateLimit } from "@/lib/rate-limit";

const quoteSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z0-9][A-Z0-9-]{3,23}$/.test(v), "That coupon code doesn't look right."),
  departureId: z.string().uuid(),
  bookingMode: z.enum(["batch_seats", "private_vehicle"]),
  seatsRequested: z.number().int().min(1).max(6),
  payDepositOnly: z.boolean(),
  email: z.string().trim().email("Enter your email first — personal coupons are tied to it.").max(160),
  phone: z.string().trim().min(10, "Enter your phone number first.").max(20),
});

/** Price preview with a coupon. The seat hold checks the code again, under a lock. */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  // Slow down code guessing: 10 tries per 10 minutes per visitor.
  const rl = checkRateLimit(`coupon-quote:${ip}`, 10, 10 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many coupon tries. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }
  const parsed = quoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the coupon details." }, { status: 400 });
  }
  try {
    const q = await quoteCoupon({ ...parsed.data });
    return NextResponse.json({
      code: q.code,
      summary: q.summary,
      couponDiscountPaise: q.pricing.couponDiscountPaise,
      totalPaise: q.pricing.totalPaise,
      payNowPaise: q.pricing.payNowPaise,
    });
  } catch (err) {
    return NextResponse.json(
      { error: paymentErrorMessage(err instanceof Error ? err.message : null, "That coupon could not be applied.") },
      { status: 400 }
    );
  }
}
