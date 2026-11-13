import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import {
  deleteEnquiries,
  listDepartureCrew,
  listEnquiries,
  recordOfflinePayment,
  recordRefund,
  saveDepartureCrew,
  updateEnquiry,
} from "@/lib/data/owner-ops";
import { paymentErrorMessage } from "@/lib/payments/upi";
import { refreshStorefront } from "@/lib/revalidate";
import { ownerOpsActionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Trip crew per date + website enquiries, for the admin panel. */
export async function GET() {
  try {
    await requireStaff(["owner", "ops", "support"]);
  } catch {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 403 });
  }
  const [crew, enquiries] = await Promise.all([listDepartureCrew(), listEnquiries()]);
  return NextResponse.json({ crew, enquiries }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  let actor;
  try {
    actor = await requireStaff(["owner", "ops"]);
  } catch {
    return NextResponse.json({ error: "Owner or Operations role required." }, { status: 403 });
  }
  if (!actor.staffRole) {
    return NextResponse.json({ error: "Owner or Operations role required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  const parsed = ownerOpsActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, { status: 400 });
  }

  const who = { userId: actor.userId, staffRole: actor.staffRole };
  const a = parsed.data;
  try {
    switch (a.kind) {
      case "record_payment": {
        const r = await recordOfflinePayment(
          { bookingId: a.bookingId, amountPaise: a.amountRupees, method: a.method, reference: a.reference, note: a.note },
          who
        );
        refreshStorefront();
        return NextResponse.json({ ok: true, result: r });
      }
      case "record_refund": {
        const r = await recordRefund(
          { bookingId: a.bookingId, amountPaise: a.amountRupees, reference: a.reference, note: a.note, closeBooking: a.closeBooking },
          who
        );
        refreshStorefront();
        return NextResponse.json({ ok: true, result: r });
      }
      case "save_crew": {
        const crew = await saveDepartureCrew(
          {
            departureId: a.departureId,
            driverName: a.driverName,
            driverPhone: a.driverPhone,
            vehicleNumber: a.vehicleNumber,
            whatsappGroupUrl: a.whatsappGroupUrl,
            reportingNote: a.reportingNote,
            operatorNotes: a.operatorNotes,
          },
          who
        );
        return NextResponse.json({ ok: true, crew });
      }
      case "update_enquiry": {
        const enquiry = await updateEnquiry({ id: a.id, status: a.status, staffNote: a.staffNote }, who);
        return NextResponse.json({ ok: true, enquiry });
      }
      case "delete_enquiries": {
        const r = await deleteEnquiries(a.ids, who);
        return NextResponse.json({ ok: true, deleted: r.deleted });
      }
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : null;
    const status = raw?.startsWith("NEEDS_DATABASE") ? 409 : raw?.startsWith("NOT_ALLOWED") ? 403 : 400;
    return NextResponse.json({ error: paymentErrorMessage(raw, "That did not work. Please try again.") }, { status });
  }
}
