import { NextRequest, NextResponse } from "next/server";
import { trackPromotion } from "@/lib/data/promotions";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Counts an offer view or click. Numbers only: nothing about the visitor is stored.
 * Each visitor counts at most one view per offer per 30 minutes and a few clicks.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { id?: unknown; kind?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const kind = body?.kind === "click" ? "click" : body?.kind === "view" ? "view" : null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !kind) return NextResponse.json({ ok: false }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = kind === "view" ? checkRateLimit(`promo-view:${ip}:${id}`, 1, 30 * 60_000) : checkRateLimit(`promo-click:${ip}:${id}`, 3, 10 * 60_000);
  if (!rl.allowed) return NextResponse.json({ ok: true, counted: false });

  const counted = await trackPromotion(id, kind);
  return NextResponse.json({ ok: true, counted });
}
