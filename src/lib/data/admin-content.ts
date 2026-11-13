import { getDemoState, liveDepartureStatus } from "@/lib/data/demo-store";
import { getSiteSettings } from "@/lib/data/repository";
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import { slugify, type ContentAction } from "@/lib/admin/content-schemas";
import { paymentErrorMessage } from "@/lib/payments/upi";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  DepartureStatus,
  DepartureType,
  ItineraryDay,
  PickupPoint,
  SiteSettings,
  Trip,
  VerifiedReview,
} from "@/lib/types";

export interface AdminDepartureRow {
  departureId: string;
  tripId: string;
  departureCode: string;
  startDate: string;
  endDate: string;
  maxCapacity: number;
  minOccupancy: number;
  departureType: DepartureType;
  /** Live badge: cancelled/completed as stored, otherwise computed from seats. */
  status: DepartureStatus;
  bookingCutoffAt: string;
  preferenceDeadlineAt: string;
  priceOverridePaise: number | null;
  isPublished: boolean;
  seatsTaken: number;
  bookingCount: number;
  paidBookingCount: number;
}

export interface AdminTripBundle {
  trip: Trip;
  itinerary: ItineraryDay[];
  pickupPoints: PickupPoint[];
  departures: AdminDepartureRow[];
}

export interface AdminContentSnapshot {
  trips: AdminTripBundle[];
  settings: SiteSettings;
  reviews: VerifiedReview[];
  /** False in offline preview mode: content can be viewed but not saved. */
  editable: boolean;
  /** True when ANTHROPIC_API_KEY is set on the server, so the chat guide's smart answers can run. The key itself is never sent. */
  assistantAiReady: boolean;
}

/** Only says whether the key exists; never returns or logs it. */
function isAssistantAiReady(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

const OFFLINE_MESSAGE =
  "Editing needs the database. Connect Supabase (.env.local) to save changes — preview mode is read-only.";

function canEdit(): boolean {
  return isSupabaseConfigured() && isServiceRoleConfigured();
}

function mapTrip(row: Record<string, unknown>): Trip {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    destination: String(row.destination),
    region: String(row.region),
    tagline: String(row.tagline),
    summary: String(row.summary),
    durationDays: Number(row.duration_days),
    durationNights: Number(row.duration_nights),
    difficulty: row.difficulty as Trip["difficulty"],
    vibe: String(row.vibe),
    basePricePaise: Number(row.base_price_paise),
    privateGroupPricePaise: row.private_group_price_paise === null ? null : Number(row.private_group_price_paise),
    privateDiscountPercent: Number(row.private_discount_percent),
    depositPercent: row.deposit_percent === null ? null : Number(row.deposit_percent),
    balanceDueDaysBefore: Number(row.balance_due_days_before),
    pickupCity: String(row.pickup_city),
    heroImageUrl: String(row.hero_image_url),
    galleryUrls: arr(row.gallery_urls) as string[],
    videoLinks: arr(row.video_links) as Trip["videoLinks"],
    inclusions: arr(row.inclusions) as string[],
    exclusions: arr(row.exclusions) as string[],
    accommodationNotes: String(row.accommodation_notes ?? ""),
    packingList: arr(row.packing_list) as string[],
    safetyNotes: String(row.safety_notes ?? ""),
    accessibilityNotes: String(row.accessibility_notes ?? ""),
    isSampleDemo: Boolean(row.is_sample_demo),
    isPublished: Boolean(row.is_published),
    sortOrder: Number(row.sort_order),
  };
}

export async function getAdminContent(): Promise<AdminContentSnapshot> {
  const { settings } = await getSiteSettings();

  if (!canEdit()) {
    const state = getDemoState();
    return {
      editable: false,
      assistantAiReady: isAssistantAiReady(),
      settings,
      reviews: state.reviews,
      trips: state.trips
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((trip) => ({
          trip,
          itinerary: state.itineraryDays.filter((d) => d.tripId === trip.id).sort((a, b) => a.dayNumber - b.dayNumber),
          pickupPoints: state.pickupPoints.filter((p) => p.tripId === trip.id).sort((a, b) => a.sortOrder - b.sortOrder),
          departures: state.departures
            .filter((d) => d.tripId === trip.id)
            .map((d) => {
              const now = Date.now();
              const taken = state.seatAllocations.filter(
                (sa) =>
                  sa.departureId === d.id &&
                  (sa.allocationStatus === "confirmed" ||
                    sa.allocationStatus === "operator_blocked" ||
                    (sa.allocationStatus === "held" && (!sa.holdExpiresAt || Date.parse(sa.holdExpiresAt) > now)))
              ).length;
              const bookings = state.bookings.filter((b) => b.departureId === d.id);
              return {
                departureId: d.id,
                tripId: d.tripId,
                departureCode: d.departureCode,
                startDate: d.startDate,
                endDate: d.endDate,
                maxCapacity: d.maxCapacity,
                minOccupancy: d.minOccupancy,
                departureType: d.departureType,
                status: liveDepartureStatus(d.status, Math.max(0, d.maxCapacity - taken)),
                bookingCutoffAt: d.bookingCutoffAt,
                preferenceDeadlineAt: d.preferenceDeadlineAt,
                priceOverridePaise: d.priceOverridePaise,
                isPublished: d.isPublished,
                seatsTaken: taken,
                bookingCount: bookings.length,
                paidBookingCount: bookings.filter((b) => b.amountPaidPaise > 0).length,
              };
            })
            .sort((a, b) => a.startDate.localeCompare(b.startDate)),
        })),
    };
  }

  const admin = createSupabaseAdminClient();
  const [
    { data: tripRows },
    { data: dayRows },
    { data: pickupRows },
    { data: depRows },
    { data: seatRows },
    { data: bookingRows },
    { data: reviewRows },
  ] = await Promise.all([
    admin.from("trips").select("*").order("sort_order"),
    admin.from("itinerary_days").select("*").order("day_number"),
    admin.from("pickup_points").select("*").order("sort_order"),
    admin.from("departures").select("*").order("start_date"),
    admin
      .from("seat_allocations")
      .select("departure_id, allocation_status, hold_expires_at")
      .in("allocation_status", ["held", "confirmed", "operator_blocked"]),
    admin.from("bookings").select("departure_id, status, amount_paid_paise"),
    admin.from("reviews").select("*").order("created_at", { ascending: false }),
  ]);

  const now = Date.now();
  const takenBy = new Map<string, number>();
  for (const s of seatRows ?? []) {
    const active =
      s.allocation_status !== "held" || s.hold_expires_at === null || Date.parse(String(s.hold_expires_at)) > now;
    if (active) takenBy.set(String(s.departure_id), (takenBy.get(String(s.departure_id)) ?? 0) + 1);
  }
  const bookingsBy = new Map<string, { total: number; paid: number }>();
  for (const b of bookingRows ?? []) {
    const key = String(b.departure_id);
    const cur = bookingsBy.get(key) ?? { total: 0, paid: 0 };
    cur.total += 1;
    if (Number(b.amount_paid_paise) > 0) cur.paid += 1;
    bookingsBy.set(key, cur);
  }

  const trips = (tripRows ?? []).map((row) => {
    const trip = mapTrip(row);
    return {
      trip,
      itinerary: (dayRows ?? [])
        .filter((d) => d.trip_id === trip.id)
        .map((d) => ({
          id: String(d.id),
          tripId: String(d.trip_id),
          dayNumber: Number(d.day_number),
          title: String(d.title),
          description: String(d.description ?? ""),
          driveTimeEstimate: String(d.drive_time_estimate ?? ""),
          travelBufferNotes: String(d.travel_buffer_notes ?? ""),
          mealsIncluded: String(d.meals_included ?? ""),
        })),
      pickupPoints: (pickupRows ?? [])
        .filter((p) => p.trip_id === trip.id)
        .map((p) => ({
          id: String(p.id),
          tripId: String(p.trip_id),
          name: String(p.name),
          area: String(p.area),
          pickupTimeLabel: String(p.pickup_time_label),
          mapsUrl: (p.maps_url as string | null) ?? null,
          isConfirmed: Boolean(p.is_confirmed),
          sortOrder: Number(p.sort_order),
        })),
      departures: (depRows ?? [])
        .filter((d) => d.trip_id === trip.id)
        .map((d) => {
          const taken = takenBy.get(String(d.id)) ?? 0;
          const b = bookingsBy.get(String(d.id)) ?? { total: 0, paid: 0 };
          return {
            departureId: String(d.id),
            tripId: String(d.trip_id),
            departureCode: String(d.departure_code),
            startDate: String(d.start_date),
            endDate: String(d.end_date),
            maxCapacity: Number(d.max_capacity),
            minOccupancy: Number(d.min_occupancy),
            departureType: d.departure_type as DepartureType,
            status: liveDepartureStatus(d.status as DepartureStatus, Math.max(0, Number(d.max_capacity) - taken)),
            bookingCutoffAt: String(d.booking_cutoff_at),
            preferenceDeadlineAt: String(d.preference_deadline_at),
            priceOverridePaise: d.price_override_paise === null ? null : Number(d.price_override_paise),
            isPublished: Boolean(d.is_published),
            seatsTaken: taken,
            bookingCount: b.total,
            paidBookingCount: b.paid,
          };
        }),
    };
  });

  return {
    editable: true,
    assistantAiReady: isAssistantAiReady(),
    settings,
    trips,
    reviews: (reviewRows ?? []).map((r) => ({
      id: String(r.id),
      tripId: (r.trip_id as string | null) ?? null,
      authorName: String(r.author_name),
      departureLabel: (r.departure_label as string | null) ?? null,
      rating: Number(r.rating),
      quote: String(r.quote),
      isVerifiedAuthentic: Boolean(r.is_verified_authentic),
      isPublished: Boolean(r.is_published),
      createdAt: String(r.created_at),
    })),
  };
}

function friendlyDbError(message: string | undefined): string {
  if (!message) return "Could not save. Please try again.";
  if (message.includes("trips_slug_key")) return "Another trip already uses this web address (slug). Change it.";
  if (message.includes("departures_departure_code_key")) return "That departure code is already used. Pick another.";
  if (message.includes("trips_slug_format")) return "Web address: lowercase letters, numbers and dashes only.";
  return paymentErrorMessage(message, "Could not save. Please try again.");
}

export interface ContentActionResult {
  message: string;
  id?: string;
  details?: Record<string, unknown>;
}

/** Applies one validated admin content change. Throws Error with a human-readable message. */
export async function runContentAction(
  input: ContentAction,
  actor: { userId: string; role: string }
): Promise<ContentActionResult> {
  if (!canEdit()) throw new Error(OFFLINE_MESSAGE);
  const admin = createSupabaseAdminClient();
  const audit = async (action: string, entityType: string, entityId: string, reason: string, after?: unknown) => {
    await admin.from("audit_logs").insert({
      actor_user_id: actor.userId,
      actor_role: actor.role,
      action,
      entity_type: entityType,
      entity_id: entityId,
      reason,
      after_state: after ?? null,
    });
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(friendlyDbError(error.message));
    return data;
  };

  switch (input.action) {
    case "trip.save": {
      const t = input.data;
      const row = {
        slug: t.slug && t.slug.length > 0 ? t.slug : slugify(t.title),
        title: t.title,
        destination: t.destination,
        region: t.region,
        tagline: t.tagline,
        summary: t.summary,
        duration_days: t.durationDays,
        duration_nights: t.durationNights,
        difficulty: t.difficulty,
        vibe: t.vibe,
        base_price_paise: t.basePricePaise,
        private_group_price_paise: t.privateGroupPricePaise,
        private_discount_percent: t.privateDiscountPercent,
        deposit_percent: t.depositPercent,
        balance_due_days_before: t.balanceDueDaysBefore,
        pickup_city: t.pickupCity,
        hero_image_url: t.heroImageUrl,
        gallery_urls: t.galleryUrls,
        video_links: t.videoLinks,
        inclusions: t.inclusions,
        exclusions: t.exclusions,
        accommodation_notes: t.accommodationNotes,
        packing_list: t.packingList,
        safety_notes: t.safetyNotes,
        accessibility_notes: t.accessibilityNotes,
        is_sample_demo: t.isSampleDemo,
        is_published: t.isPublished,
        sort_order: t.sortOrder,
        updated_at: new Date().toISOString(),
      };
      if (!row.slug) throw new Error("Give the trip a title with letters or numbers.");
      if (t.id) {
        const { error } = await admin.from("trips").update(row).eq("id", t.id);
        if (error) throw new Error(friendlyDbError(error.message));
        await audit("trip_updated", "trip", t.id, "Trip details saved", {
          title: row.title,
          base_price_paise: row.base_price_paise,
          is_published: row.is_published,
        });
        return { message: `Saved “${row.title}”. Existing bookings keep the price they were booked at.`, id: t.id };
      }
      const { data, error } = await admin.from("trips").insert(row).select("id").single();
      if (error || !data) throw new Error(friendlyDbError(error?.message));
      await audit("trip_created", "trip", String(data.id), "New trip", { title: row.title, slug: row.slug });
      return { message: `Created “${row.title}”. Add its dates, pickup points and itinerary next.`, id: String(data.id) };
    }

    case "trip.delete":
      await rpc("admin_delete_trip", { p_id: input.data.id, p_actor_user_id: actor.userId, p_actor_role: actor.role });
      return { message: "Trip deleted." };

    case "itinerary.save": {
      const n = await rpc("admin_replace_itinerary", {
        p_trip_id: input.data.tripId,
        p_days: input.data.days,
        p_actor_user_id: actor.userId,
        p_actor_role: actor.role,
      });
      return { message: `Itinerary saved (${n} day${n === 1 ? "" : "s"}).` };
    }

    case "pickup.save": {
      const p = input.data;
      const row = {
        trip_id: p.tripId,
        name: p.name,
        area: p.area,
        pickup_time_label: p.pickupTimeLabel,
        maps_url: p.mapsUrl || null,
        is_confirmed: p.isConfirmed,
        sort_order: p.sortOrder,
      };
      if (p.id) {
        const { error } = await admin.from("pickup_points").update(row).eq("id", p.id);
        if (error) throw new Error(friendlyDbError(error.message));
        await audit("pickup_updated", "pickup_point", p.id, "Pickup point saved", row);
        return { message: `Saved pickup “${p.name}”.`, id: p.id };
      }
      const { data, error } = await admin.from("pickup_points").insert(row).select("id").single();
      if (error || !data) throw new Error(friendlyDbError(error?.message));
      await audit("pickup_created", "pickup_point", String(data.id), "New pickup point", row);
      return { message: `Added pickup “${p.name}”.`, id: String(data.id) };
    }

    case "pickup.delete":
      await rpc("admin_delete_pickup", { p_id: input.data.id, p_actor_user_id: actor.userId, p_actor_role: actor.role });
      return { message: "Pickup point deleted." };

    case "departure.save": {
      const d = input.data;
      const id = await rpc("admin_save_departure", {
        p_id: d.id ?? null,
        p_trip_id: d.tripId,
        p_departure_code: d.departureCode,
        p_start_date: d.startDate,
        p_end_date: d.endDate,
        p_max_capacity: d.maxCapacity,
        p_min_occupancy: d.minOccupancy,
        p_departure_type: d.departureType,
        p_booking_cutoff_at: d.bookingCutoffAt,
        p_preference_deadline_at: d.preferenceDeadlineAt,
        p_price_override_paise: d.priceOverridePaise,
        p_is_published: d.isPublished,
        p_actor_user_id: actor.userId,
        p_actor_role: actor.role,
      });
      return { message: d.id ? `Saved ${d.departureCode}.` : `Added date ${d.departureCode}.`, id: String(id) };
    }

    case "departure.status": {
      const rows = (await rpc("admin_set_departure_status", {
        p_id: input.data.id,
        p_status: input.data.status,
        p_actor_user_id: actor.userId,
        p_actor_role: actor.role,
        p_reason: input.data.reason,
      })) as { status: string; released_unpaid_holds: number; paid_bookings_to_handle: number }[];
      const r = rows?.[0];
      if (input.data.status === "cancelled") {
        return {
          message: `Date cancelled. ${r?.released_unpaid_holds ?? 0} unpaid hold(s) ended. ${
            r?.paid_bookings_to_handle ?? 0
          } paid booking(s) need a refund or a new date — see Bookings.`,
          details: r,
        };
      }
      return { message: input.data.status === "open" ? "Date reopened for booking." : "Date marked completed." };
    }

    case "departure.delete":
      await rpc("admin_delete_departure", { p_id: input.data.id, p_actor_user_id: actor.userId, p_actor_role: actor.role });
      return { message: "Date deleted." };

    case "settings.save": {
      const { key, value } = input.data;
      const { data: before } = await admin.from("site_settings").select("value").eq("key", key).maybeSingle();
      const { error } = await admin
        .from("site_settings")
        .upsert({ key, value, updated_by: actor.userId, updated_at: new Date().toISOString() });
      if (error) throw new Error(friendlyDbError(error.message));
      await admin.from("audit_logs").insert({
        actor_user_id: actor.userId,
        actor_role: actor.role,
        action: "settings_saved",
        entity_type: "site_settings",
        entity_id: key,
        reason: `Site settings “${key}” saved`,
        before_state: before?.value ?? null,
        after_state: value,
      });
      return { message: "Saved. The website shows the change on the next page load." };
    }

    case "review.save": {
      const r = input.data;
      const row = {
        trip_id: r.tripId,
        author_name: r.authorName,
        departure_label: r.departureLabel,
        rating: r.rating,
        quote: r.quote,
        is_verified_authentic: r.isVerifiedAuthentic,
        is_published: r.isPublished,
      };
      if (r.id) {
        const { error } = await admin.from("reviews").update(row).eq("id", r.id);
        if (error) throw new Error(friendlyDbError(error.message));
        await audit("review_updated", "review", r.id, "Review saved", { published: r.isPublished });
        return { message: "Review saved.", id: r.id };
      }
      const { data, error } = await admin.from("reviews").insert(row).select("id").single();
      if (error || !data) throw new Error(friendlyDbError(error?.message));
      await audit("review_created", "review", String(data.id), "Review added", { published: r.isPublished });
      return { message: "Review added.", id: String(data.id) };
    }

    case "review.delete": {
      const { error } = await admin.from("reviews").delete().eq("id", input.data.id);
      if (error) throw new Error(friendlyDbError(error.message));
      await audit("review_deleted", "review", input.data.id, "Review deleted");
      return { message: "Review deleted." };
    }
  }
}
