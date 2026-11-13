import { NextRequest, NextResponse } from "next/server";
import { contentActionSchema, firstIssue } from "@/lib/admin/content-schemas";
import { requireStaff } from "@/lib/auth";
import { getAdminContent, runContentAction } from "@/lib/data/admin-content";
import { refreshStorefront } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

/** Everything the admin can edit: trips (+ itinerary, pickups, dates), site text, reviews. */
export async function GET() {
  try {
    const actor = await requireStaff(["owner", "ops", "support"]);
    const content = await getAdminContent();
    return NextResponse.json({ actorRole: actor.staffRole, ...content });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED_STAFF") {
      return NextResponse.json({ error: "Admin sign-in required." }, { status: 403 });
    }
    return NextResponse.json({ error: "Could not load content." }, { status: 500 });
  }
}

/** One validated change at a time; owner and operations only; every change is audit-logged. */
export async function POST(request: NextRequest) {
  let actor;
  try {
    actor = await requireStaff(["owner", "ops"]);
  } catch {
    return NextResponse.json({ error: "Only the owner or operations staff can edit content." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = contentActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  try {
    const result = await runContentAction(parsed.data, { userId: actor.userId, role: actor.staffRole ?? "ops" });
    refreshStorefront();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save." }, { status: 409 });
  }
}
