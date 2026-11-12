import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import {
  getAdminOperationsData,
  performAdminBookingAction,
  performAdminSeatOverride,
  performAdminTripUpdate,
} from "@/lib/data/repository";
import {
  adminBookingActionSchema,
  adminSeatOverrideSchema,
  adminTripUpdateSchema,
} from "@/lib/validation";

const mutationEnvelopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("seat_override"), payload: adminSeatOverrideSchema }),
  z.object({ kind: z.literal("booking_action"), payload: adminBookingActionSchema }),
  z.object({ kind: z.literal("trip_update"), payload: adminTripUpdateSchema }),
]);

export async function GET() {
  try {
    const actor = await requireStaff(["owner", "ops", "support"]);
    const includeComfortPrefs = actor.staffRole === "owner" || actor.staffRole === "ops";
    const data = await getAdminOperationsData(includeComfortPrefs);
    return NextResponse.json({ actorRole: actor.staffRole, ...data });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED_STAFF") {
      return NextResponse.json({ error: "Admin authorization required." }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to load admin data." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let actor;
  try {
    // Support role is strictly read-only; mutations require owner or ops
    actor = await requireStaff(["owner", "ops"]);
  } catch {
    return NextResponse.json(
      { error: "Owner or Operations role required for mutations." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = mutationEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid admin action payload." },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.kind === "seat_override") {
      await performAdminSeatOverride({
        ...parsed.data.payload,
        actorUserId: actor.userId,
        actorRole: actor.staffRole ?? "ops",
      });
    } else if (parsed.data.kind === "booking_action") {
      await performAdminBookingAction({
        ...parsed.data.payload,
        actorUserId: actor.userId,
        actorRole: actor.staffRole ?? "ops",
      });
    } else if (parsed.data.kind === "trip_update") {
      await performAdminTripUpdate({
        ...parsed.data.payload,
        actorUserId: actor.userId,
        actorRole: actor.staffRole ?? "ops",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Operation failed." },
      { status: 400 }
    );
  }
}

