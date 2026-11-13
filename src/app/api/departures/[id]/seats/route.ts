import { NextResponse } from "next/server";
import { getDepartureSeatMap } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

/** Seat numbers already taken on a published departure — numbers only, never who holds them. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Unknown departure." }, { status: 400 });
  }
  const taken = await getDepartureSeatMap(id);
  return NextResponse.json({ taken }, { headers: { "Cache-Control": "no-store" } });
}
