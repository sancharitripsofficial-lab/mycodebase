/**
 * Creator (influencer) programme + coupons. The rules live in the database
 * (migration 202611130004_creator_coupons.sql): ranges can't overlap, approval picks the
 * range from the VERIFIED follower count, codes are personal and one-time, limits are
 * enforced under a lock when seats are held. This file only reads/writes through them.
 */
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/types";

export type DiscountType = "percent" | "flat" | "free_seats";
export type CreatorPlatform = "instagram" | "youtube" | "facebook" | "x" | "other";

export interface InfluencerTier {
  id: string;
  label: string;
  minFollowers: number;
  maxFollowers: number | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountPaise: number | null;
  validDays: number;
  isActive: boolean;
}

export interface CreatorApplication {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  platform: CreatorPlatform;
  profileUrl: string;
  followersClaimed: number;
  message: string;
  status: "pending" | "approved" | "rejected";
  followersVerified: number | null;
  tierId: string | null;
  couponCode: string | null;
  staffNote: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface Coupon {
  id: string;
  code: string;
  kind: "public" | "creator";
  discountType: DiscountType;
  discountValue: number;
  maxDiscountPaise: number | null;
  minOrderPaise: number;
  maxRedemptions: number | null;
  perCustomerLimit: number;
  validFrom: string | null;
  validUntil: string | null;
  tripId: string | null;
  lockedEmail: string | null;
  lockedPhone: string | null;
  isActive: boolean;
  note: string;
  usedCount: number;
  heldCount: number;
  discountGivenPaise: number;
  createdAt: string;
}

interface Actor {
  userId: string | null;
  staffRole: StaffRole;
}

function db() {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    throw new Error("NEEDS_DATABASE: Coupons and creators need the live database.");
  }
  return createSupabaseAdminClient();
}

export function hasCreatorDatabase(): boolean {
  return isSupabaseConfigured() && isServiceRoleConfigured();
}

function friendly(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (/idx_coupons_code|duplicate key/.test(message)) return "CODE_TAKEN: That code already exists. Choose another.";
  if (/coupons_percent_range|tiers_percent_range/.test(message)) return "BAD_VALUE: Percent must be between 1 and 100.";
  if (/free_seats_range/.test(message)) return "BAD_VALUE: Free seats must be between 1 and 6.";
  if (/tiers_range_order/.test(message)) return "BAD_RANGE: The highest follower count must be at or above the lowest.";
  if (/coupons_dates_order/.test(message)) return "BAD_DATES: The end must be after the start.";
  if (/code_check|coupons_code_check/.test(message)) return "BAD_CODE: Codes are 4–24 capital letters, numbers or dashes.";
  return message;
}

const mapTier = (r: Record<string, unknown>): InfluencerTier => ({
  id: String(r.id),
  label: String(r.label),
  minFollowers: Number(r.min_followers),
  maxFollowers: r.max_followers === null || r.max_followers === undefined ? null : Number(r.max_followers),
  discountType: r.discount_type as DiscountType,
  discountValue: Number(r.discount_value),
  maxDiscountPaise: r.max_discount_paise === null || r.max_discount_paise === undefined ? null : Number(r.max_discount_paise),
  validDays: Number(r.valid_days),
  isActive: Boolean(r.is_active),
});

/** "25% off (up to ₹3,000)", "₹2,000 off", "1 free seat". */
export function rewardLabel(t: { discountType: DiscountType; discountValue: number; maxDiscountPaise: number | null }): string {
  const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  if (t.discountType === "percent") return `${t.discountValue}% off${t.maxDiscountPaise ? ` (up to ${rupees(t.maxDiscountPaise)})` : ""}`;
  if (t.discountType === "flat") return `${rupees(t.discountValue)} off`;
  return `${t.discountValue} free seat${t.discountValue === 1 ? "" : "s"}`;
}

export function followersLabel(t: { minFollowers: number; maxFollowers: number | null }): string {
  const f = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));
  return t.maxFollowers === null ? `${f(t.minFollowers)}+ followers` : `${f(t.minFollowers)}–${f(t.maxFollowers)} followers`;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/** Active follower ranges for the public Creators page (never throws). */
export async function getPublicTiers(): Promise<InfluencerTier[]> {
  if (!hasCreatorDatabase()) return [];
  const { data, error } = await createSupabaseAdminClient()
    .from("influencer_tiers")
    .select("*")
    .eq("is_active", true)
    .order("min_followers", { ascending: true });
  if (error) {
    console.error("[creators] tiers failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapTier(r as Record<string, unknown>));
}

export async function createCreatorApplication(input: {
  fullName: string;
  phone: string;
  email: string;
  platform: CreatorPlatform;
  profileUrl: string;
  followersClaimed: number;
  message: string;
}): Promise<void> {
  const { error } = await db().from("influencer_applications").insert({
    full_name: input.fullName,
    phone: input.phone,
    email: input.email.toLowerCase(),
    platform: input.platform,
    profile_url: input.profileUrl,
    followers_claimed: input.followersClaimed,
    message: input.message,
  });
  if (error) {
    console.error("[creators] apply failed:", error.message);
    throw new Error("Could not send your application. Please WhatsApp us instead.");
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function getCreatorAdminData(): Promise<{ tiers: InfluencerTier[]; applications: CreatorApplication[]; coupons: Coupon[]; ready: boolean }> {
  if (!hasCreatorDatabase()) return { tiers: [], applications: [], coupons: [], ready: false };
  const admin = createSupabaseAdminClient();
  const [{ data: tiers }, { data: apps }, { data: coupons }, { data: reds }] = await Promise.all([
    admin.from("influencer_tiers").select("*").order("min_followers", { ascending: true }),
    admin.from("influencer_applications").select("*").order("created_at", { ascending: false }).limit(300),
    admin.from("coupons").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("coupon_redemptions").select("coupon_id, status, discount_paise"),
  ]);
  const couponCode = new Map((coupons ?? []).map((c) => [String(c.id), String(c.code)]));
  const usage = new Map<string, { used: number; held: number; given: number }>();
  for (const r of reds ?? []) {
    const u = usage.get(String(r.coupon_id)) ?? { used: 0, held: 0, given: 0 };
    if (r.status === "used") {
      u.used += 1;
      u.given += Number(r.discount_paise);
    } else if (r.status === "held") u.held += 1;
    usage.set(String(r.coupon_id), u);
  }
  return {
    ready: true,
    tiers: (tiers ?? []).map((r) => mapTier(r as Record<string, unknown>)),
    applications: (apps ?? []).map((a) => ({
      id: String(a.id),
      fullName: String(a.full_name),
      phone: String(a.phone),
      email: String(a.email),
      platform: a.platform as CreatorPlatform,
      profileUrl: String(a.profile_url),
      followersClaimed: Number(a.followers_claimed),
      message: String(a.message ?? ""),
      status: a.status as CreatorApplication["status"],
      followersVerified: a.followers_verified === null ? null : Number(a.followers_verified),
      tierId: (a.tier_id as string | null) ?? null,
      couponCode: a.coupon_id ? couponCode.get(String(a.coupon_id)) ?? null : null,
      staffNote: String(a.staff_note ?? ""),
      createdAt: String(a.created_at),
      reviewedAt: (a.reviewed_at as string | null) ?? null,
    })),
    coupons: (coupons ?? []).map((c) => {
      const u = usage.get(String(c.id)) ?? { used: 0, held: 0, given: 0 };
      return {
        id: String(c.id),
        code: String(c.code),
        kind: c.kind as Coupon["kind"],
        discountType: c.discount_type as DiscountType,
        discountValue: Number(c.discount_value),
        maxDiscountPaise: c.max_discount_paise === null ? null : Number(c.max_discount_paise),
        minOrderPaise: Number(c.min_order_paise),
        maxRedemptions: c.max_redemptions === null ? null : Number(c.max_redemptions),
        perCustomerLimit: Number(c.per_customer_limit),
        validFrom: (c.valid_from as string | null) ?? null,
        validUntil: (c.valid_until as string | null) ?? null,
        tripId: (c.trip_id as string | null) ?? null,
        lockedEmail: (c.locked_email as string | null) ?? null,
        lockedPhone: (c.locked_phone as string | null) ?? null,
        isActive: Boolean(c.is_active),
        note: String(c.note ?? ""),
        usedCount: u.used,
        heldCount: u.held,
        discountGivenPaise: u.given,
        createdAt: String(c.created_at),
      };
    }),
  };
}

async function audit(actor: Actor, action: string, entityType: string, entityId: string, reason: string, after?: Record<string, unknown>) {
  await createSupabaseAdminClient().from("audit_logs").insert({
    actor_user_id: actor.userId,
    actor_role: actor.staffRole,
    action,
    entity_type: entityType,
    entity_id: entityId,
    reason,
    after_state: after ?? null,
  });
}

export async function saveTier(t: Omit<InfluencerTier, "id"> & { id?: string | null }, actor: Actor): Promise<void> {
  const row = {
    label: t.label,
    min_followers: t.minFollowers,
    max_followers: t.maxFollowers,
    discount_type: t.discountType,
    discount_value: t.discountValue,
    max_discount_paise: t.discountType === "percent" ? t.maxDiscountPaise : null,
    valid_days: t.validDays,
    is_active: t.isActive,
    updated_at: new Date().toISOString(),
  };
  const admin = db();
  const { data, error } = t.id
    ? await admin.from("influencer_tiers").update(row).eq("id", t.id).select("id").single()
    : await admin.from("influencer_tiers").insert(row).select("id").single();
  if (error || !data) throw new Error(friendly(error?.message, "Could not save the range."));
  await audit(actor, t.id ? "creator_tier_updated" : "creator_tier_created", "influencer_tier", String(data.id), t.label, row);
}

export async function deleteTier(id: string, actor: Actor): Promise<void> {
  const { data, error } = await db().from("influencer_tiers").delete().eq("id", id).select("label").maybeSingle();
  if (error) throw new Error(friendly(error.message, "Could not delete the range."));
  if (data) await audit(actor, "creator_tier_deleted", "influencer_tier", id, String(data.label));
}

export async function approveCreator(
  input: { applicationId: string; followersVerified: number; code: string; note: string },
  actor: Actor
): Promise<{ code: string; tierLabel: string; reward: string; validUntil: string }> {
  const { data, error } = await db().rpc("admin_approve_creator", {
    p_application_id: input.applicationId,
    p_followers_verified: input.followersVerified,
    p_code: input.code,
    p_actor_user_id: actor.userId,
    p_actor_role: actor.staffRole,
    p_note: input.note,
  });
  if (error || !data?.[0]) throw new Error(friendly(error?.message, "Could not approve."));
  const r = data[0];
  return {
    code: String(r.code),
    tierLabel: String(r.tier_label),
    reward: rewardLabel({ discountType: r.discount_type, discountValue: Number(r.discount_value), maxDiscountPaise: null }),
    validUntil: String(r.valid_until),
  };
}

export async function rejectCreator(input: { applicationId: string; note: string }, actor: Actor): Promise<void> {
  const { data, error } = await db()
    .from("influencer_applications")
    .update({ status: "rejected", staff_note: input.note, reviewed_by: actor.userId, reviewed_at: new Date().toISOString() })
    .eq("id", input.applicationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Could not reject.");
  if (!data) throw new Error("ALREADY_DECIDED: This application was already decided.");
  await audit(actor, "creator_rejected", "influencer_application", input.applicationId, input.note || "Rejected");
}

export async function saveCoupon(
  c: {
    id?: string | null;
    code: string;
    discountType: DiscountType;
    discountValue: number;
    maxDiscountPaise: number | null;
    minOrderPaise: number;
    maxRedemptions: number | null;
    perCustomerLimit: number;
    validFrom: string | null;
    validUntil: string | null;
    tripId: string | null;
    isActive: boolean;
    note: string;
  },
  actor: Actor
): Promise<void> {
  const admin = db();
  if (c.id) {
    // Existing codes (including creators' personal codes): only switch on/off, dates, limits and note —
    // the code, value and owner stay as issued.
    const { error } = await admin
      .from("coupons")
      .update({
        is_active: c.isActive,
        valid_from: c.validFrom,
        valid_until: c.validUntil,
        max_redemptions: c.maxRedemptions,
        note: c.note,
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    if (error) throw new Error(friendly(error.message, "Could not save the coupon."));
    await audit(actor, "coupon_updated", "coupon", c.id, `${c.code} ${c.isActive ? "on" : "off"}`);
    return;
  }
  const { data, error } = await admin
    .from("coupons")
    .insert({
      code: c.code,
      kind: "public",
      discount_type: c.discountType,
      discount_value: c.discountValue,
      max_discount_paise: c.discountType === "percent" ? c.maxDiscountPaise : null,
      min_order_paise: c.minOrderPaise,
      max_redemptions: c.maxRedemptions,
      per_customer_limit: c.perCustomerLimit,
      valid_from: c.validFrom,
      valid_until: c.validUntil,
      trip_id: c.tripId,
      is_active: c.isActive,
      note: c.note,
      created_by: actor.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(friendly(error?.message, "Could not create the coupon."));
  await audit(actor, "coupon_created", "coupon", String(data.id), c.code, { type: c.discountType, value: c.discountValue });
}
