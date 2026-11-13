/**
 * Owner operations: offline payments, refunds, trip crew (driver / vehicle / WhatsApp group)
 * and website enquiries. Money rules live in the database functions
 * (admin_record_payment / admin_record_refund); this file only calls them and maps rows.
 *
 * Without a database (preview mode) the read functions return empty lists and every change
 * is refused with NEEDS_DATABASE, the same as website-content editing.
 */
import { getDemoState } from "@/lib/data/demo-store";
import { localISODate, addDaysISO } from "@/lib/dates";
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/types";

export interface DepartureCrew {
  departureId: string;
  driverName: string;
  driverPhone: string;
  vehicleNumber: string;
  whatsappGroupUrl: string;
  reportingNote: string;
  operatorNotes: string;
  updatedAt: string | null;
}

/** What a booked customer sees in My Booking, only close to the trip. */
export interface CustomerTripCrew {
  driverName: string;
  driverPhone: string;
  vehicleNumber: string;
  whatsappGroupUrl: string;
  reportingNote: string;
}

export type EnquiryKind = "private_date" | "custom_trip" | "group" | "general";
export type EnquiryStatus = "new" | "contacted" | "converted" | "closed";

export interface Enquiry {
  id: string;
  kind: EnquiryKind;
  fullName: string;
  phone: string;
  email: string;
  tripId: string | null;
  preferredDates: string;
  groupSize: number | null;
  message: string;
  status: EnquiryStatus;
  staffNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerActor {
  userId: string;
  staffRole: StaffRole;
}

/** Days before the start date when travellers start seeing the driver and group link. */
export const CREW_VISIBLE_DAYS_BEFORE = 3;

function hasDatabase(): boolean {
  return isSupabaseConfigured() && isServiceRoleConfigured();
}

function needsDatabase(): never {
  throw new Error("NEEDS_DATABASE: This needs the live database. Preview mode cannot record it.");
}

function cleanDbError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (/driver_phone/.test(message)) return "BAD_PHONE: Driver phone must be a 10-digit Indian mobile number.";
  if (/whatsapp_group_url/.test(message)) return "BAD_LINK: Paste the group invite link that starts with https://chat.whatsapp.com/";
  if (/enquiries_phone|phone_check|\bphone\b.*check/.test(message)) return "BAD_PHONE: Enter a 10-digit Indian mobile number.";
  return message;
}

// ---------------------------------------------------------------------------
// Money recorded by staff
// ---------------------------------------------------------------------------

export async function recordOfflinePayment(
  input: { bookingId: string; amountPaise: number; method: "cash" | "bank_transfer" | "upi_manual"; reference: string; note: string },
  actor: OwnerActor
): Promise<{ bookingStatus: string; amountPaidPaise: number; amountDuePaise: number }> {
  if (!hasDatabase()) needsDatabase();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_record_payment", {
    p_booking_id: input.bookingId,
    p_amount_paise: input.amountPaise,
    p_method: input.method,
    p_reference: input.reference,
    p_actor_user_id: actor.userId,
    p_actor_role: actor.staffRole,
    p_note: input.note,
  });
  if (error || !data?.[0]) throw new Error(cleanDbError(error?.message, "Could not record the payment."));
  return {
    bookingStatus: data[0].booking_status,
    amountPaidPaise: Number(data[0].amount_paid_paise),
    amountDuePaise: Number(data[0].amount_due_paise),
  };
}

export async function recordRefund(
  input: { bookingId: string; amountPaise: number; reference: string; note: string; closeBooking: boolean },
  actor: OwnerActor
): Promise<{ bookingStatus: string; amountPaidPaise: number; amountRefundedPaise: number }> {
  if (!hasDatabase()) needsDatabase();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_record_refund", {
    p_booking_id: input.bookingId,
    p_amount_paise: input.amountPaise,
    p_reference: input.reference,
    p_actor_user_id: actor.userId,
    p_actor_role: actor.staffRole,
    p_note: input.note,
    p_close_booking: input.closeBooking,
  });
  if (error || !data?.[0]) throw new Error(cleanDbError(error?.message, "Could not record the refund."));
  return {
    bookingStatus: data[0].booking_status,
    amountPaidPaise: Number(data[0].amount_paid_paise),
    amountRefundedPaise: Number(data[0].amount_refunded_paise),
  };
}

// ---------------------------------------------------------------------------
// Trip crew
// ---------------------------------------------------------------------------

function mapCrew(row: Record<string, unknown>): DepartureCrew {
  return {
    departureId: String(row.departure_id),
    driverName: String(row.driver_name ?? ""),
    driverPhone: String(row.driver_phone ?? ""),
    vehicleNumber: String(row.vehicle_number ?? ""),
    whatsappGroupUrl: String(row.whatsapp_group_url ?? ""),
    reportingNote: String(row.reporting_note ?? ""),
    operatorNotes: String(row.operator_notes ?? ""),
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

export async function listDepartureCrew(): Promise<DepartureCrew[]> {
  if (!hasDatabase()) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("departure_ops_notes").select("*");
  if (error) {
    console.error("[owner-ops] crew list failed:", error.message);
    return [];
  }
  return (data ?? []).map(mapCrew);
}

export async function saveDepartureCrew(
  input: Omit<DepartureCrew, "updatedAt">,
  actor: OwnerActor
): Promise<DepartureCrew> {
  if (!hasDatabase()) needsDatabase();
  const admin = createSupabaseAdminClient();
  const { data: before } = await admin
    .from("departure_ops_notes")
    .select("*")
    .eq("departure_id", input.departureId)
    .maybeSingle();
  const row = {
    departure_id: input.departureId,
    driver_name: input.driverName,
    driver_phone: input.driverPhone,
    vehicle_number: input.vehicleNumber,
    whatsapp_group_url: input.whatsappGroupUrl,
    reporting_note: input.reportingNote,
    operator_notes: input.operatorNotes,
    vehicle_assignment_label: input.vehicleNumber,
    updated_by: actor.userId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from("departure_ops_notes").upsert(row).select("*").single();
  if (error || !data) throw new Error(cleanDbError(error?.message, "Could not save the crew details."));
  await admin.from("audit_logs").insert({
    actor_user_id: actor.userId,
    actor_role: actor.staffRole,
    action: "crew_updated",
    entity_type: "departure",
    entity_id: input.departureId,
    reason: "Driver / vehicle / group link updated",
    before_state: before ? { driver_name: before.driver_name, vehicle_number: before.vehicle_number } : null,
    after_state: { driver_name: input.driverName, vehicle_number: input.vehicleNumber },
  });
  return mapCrew(data);
}

/**
 * Crew shown to a booked customer: only for paid bookings, only from a few days before the
 * trip until it ends, and only the fields meant for travellers (no internal notes).
 */
export async function getCustomerTripCrew(params: {
  departureId: string;
  bookingStatus: string;
  startDate: string;
  endDate: string;
}): Promise<CustomerTripCrew | null> {
  if (!["confirmed", "deposit_paid"].includes(params.bookingStatus)) return null;
  const today = localISODate();
  if (today < addDaysISO(params.startDate, -CREW_VISIBLE_DAYS_BEFORE) || today > params.endDate) return null;
  if (!hasDatabase()) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("departure_ops_notes")
    .select("driver_name, driver_phone, vehicle_number, whatsapp_group_url, reporting_note")
    .eq("departure_id", params.departureId)
    .maybeSingle();
  if (!data) return null;
  const crew: CustomerTripCrew = {
    driverName: data.driver_name ?? "",
    driverPhone: data.driver_phone ?? "",
    vehicleNumber: data.vehicle_number ?? "",
    whatsappGroupUrl: data.whatsapp_group_url ?? "",
    reportingNote: data.reporting_note ?? "",
  };
  return Object.values(crew).some((v) => v) ? crew : null;
}

/** Seat numbers a booking holds or owns (customer view + admin). */
export async function getBookingSeatNumbers(bookingId: string): Promise<number[]> {
  if (!hasDatabase()) {
    return getDemoState()
      .seatAllocations.filter(
        (s) => s.bookingId === bookingId && (s.allocationStatus === "held" || s.allocationStatus === "confirmed")
      )
      .map((s) => s.seatNumber)
      .sort((a, b) => a - b);
  }
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("seat_allocations")
    .select("seat_number")
    .eq("booking_id", bookingId)
    .in("allocation_status", ["held", "confirmed"]);
  return (data ?? []).map((r) => Number(r.seat_number)).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

function mapEnquiry(row: Record<string, unknown>): Enquiry {
  return {
    id: String(row.id),
    kind: row.kind as EnquiryKind,
    fullName: String(row.full_name),
    phone: String(row.phone),
    email: String(row.email ?? ""),
    tripId: (row.trip_id as string | null) ?? null,
    preferredDates: String(row.preferred_dates ?? ""),
    groupSize: row.group_size === null || row.group_size === undefined ? null : Number(row.group_size),
    message: String(row.message ?? ""),
    status: row.status as EnquiryStatus,
    staffNote: String(row.staff_note ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const previewEnquiries: Enquiry[] = [];

export async function createEnquiry(input: {
  kind: EnquiryKind;
  fullName: string;
  phone: string;
  email: string;
  tripId: string | null;
  preferredDates: string;
  groupSize: number | null;
  message: string;
}): Promise<{ id: string }> {
  if (!hasDatabase()) {
    const now = new Date().toISOString();
    const e: Enquiry = { ...input, id: crypto.randomUUID(), status: "new", staffNote: "", createdAt: now, updatedAt: now };
    previewEnquiries.unshift(e);
    return { id: e.id };
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("enquiries")
    .insert({
      kind: input.kind,
      full_name: input.fullName,
      phone: input.phone,
      email: input.email,
      trip_id: input.tripId,
      preferred_dates: input.preferredDates,
      group_size: input.groupSize,
      message: input.message,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[enquiries] insert failed:", error?.message);
    throw new Error(cleanDbError(error?.message, "Could not send your request. Please WhatsApp us instead."));
  }
  return { id: data.id };
}

export async function listEnquiries(): Promise<Enquiry[]> {
  if (!hasDatabase()) return previewEnquiries.slice();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("enquiries").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) {
    console.error("[enquiries] list failed:", error.message);
    return [];
  }
  return (data ?? []).map(mapEnquiry);
}

export async function updateEnquiry(
  input: { id: string; status: EnquiryStatus; staffNote: string },
  actor: OwnerActor
): Promise<Enquiry> {
  if (!hasDatabase()) {
    const e = previewEnquiries.find((x) => x.id === input.id);
    if (!e) throw new Error("NOT_FOUND: Enquiry not found.");
    Object.assign(e, { status: input.status, staffNote: input.staffNote, updatedAt: new Date().toISOString() });
    return e;
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("enquiries")
    .update({ status: input.status, staff_note: input.staffNote, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(cleanDbError(error?.message, "Could not update the enquiry."));
  await admin.from("audit_logs").insert({
    actor_user_id: actor.userId,
    actor_role: actor.staffRole,
    action: "enquiry_updated",
    entity_type: "enquiry",
    entity_id: input.id,
    reason: `Status ${input.status}`,
    before_state: null,
    after_state: { status: input.status },
  });
  return mapEnquiry(data);
}

/**
 * Deletes enquiries for good (the customer's name, phone and message go with them).
 * The audit log keeps only how many were deleted and when, not the personal details.
 */
export async function deleteEnquiries(ids: string[], actor: OwnerActor): Promise<{ deleted: number }> {
  const unique = Array.from(new Set(ids));
  if (!hasDatabase()) {
    let deleted = 0;
    for (const id of unique) {
      const i = previewEnquiries.findIndex((x) => x.id === id);
      if (i >= 0) {
        previewEnquiries.splice(i, 1);
        deleted++;
      }
    }
    return { deleted };
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("enquiries").delete().in("id", unique).select("id");
  if (error) throw new Error(cleanDbError(error.message, "Could not delete the enquiries."));
  const deleted = data?.length ?? 0;
  await admin.from("audit_logs").insert({
    actor_user_id: actor.userId,
    actor_role: actor.staffRole,
    action: "enquiries_deleted",
    entity_type: "enquiry",
    entity_id: unique.length === 1 ? unique[0] : "bulk",
    reason: "Deleted " + deleted + (deleted === 1 ? " enquiry" : " enquiries"),
    before_state: null,
    after_state: { deleted, ids: unique },
  });
  return { deleted };
}
