/**
 * Offers & ads: staff create them in the admin; the storefront shows the live ones.
 * Rules (dates, links, placements) are enforced by the database (migration
 * 202611130003_promotions.sql); visitors read through RLS and never see the counters.
 * Without a database (preview mode) offers live in memory so the screens can be tried.
 */
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient, createSupabasePublicClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/types";

export const PROMO_PLACEMENTS = ["top_bar", "home_banner", "trips_banner", "trip_page", "popup"] as const;
export type PromoPlacement = (typeof PROMO_PLACEMENTS)[number];
export type PromoMediaType = "none" | "image" | "video" | "youtube";
export type PromoTheme = "sunset" | "ocean" | "teal";

export const PLACEMENT_LABEL: Record<PromoPlacement, string> = {
  top_bar: "Thin bar above the menu (every page)",
  home_banner: "Big banner on the home page",
  trips_banner: "Banner on the All trips page",
  trip_page: "Banner on trip pages",
  popup: "Pop-up once per visitor",
};

/** What the website shows. */
export interface Promotion {
  id: string;
  title: string;
  message: string;
  badge: string;
  mediaType: PromoMediaType;
  mediaUrl: string;
  posterUrl: string;
  ctaLabel: string;
  ctaUrl: string;
  placements: PromoPlacement[];
  /** The trip this offer is for (its button opens that trip's dates; on trip pages it shows only there). */
  tripId: string | null;
  /** That trip's page address, filled in when loading (never saved). */
  tripSlug?: string | null;
  theme: PromoTheme;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
}

/** What staff see in the admin. */
export interface AdminPromotion extends Promotion {
  isActive: boolean;
  viewCount: number;
  clickCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PromotionInput = Omit<Promotion, "id"> & { id?: string | null; isActive: boolean };

interface Actor {
  userId: string | null;
  staffRole: StaffRole;
}

const PUBLIC_COLUMNS =
  "id, title, message, badge, media_type, media_url, poster_url, cta_label, cta_url, placements, trip_id, theme, starts_at, ends_at, is_active, sort_order";

function hasDatabase(): boolean {
  return isSupabaseConfigured() && isServiceRoleConfigured();
}

function mapPromotion(r: Record<string, unknown>): Promotion {
  return {
    id: String(r.id),
    title: String(r.title),
    message: String(r.message ?? ""),
    badge: String(r.badge ?? ""),
    mediaType: (r.media_type as PromoMediaType) ?? "none",
    mediaUrl: String(r.media_url ?? ""),
    posterUrl: String(r.poster_url ?? ""),
    ctaLabel: String(r.cta_label ?? ""),
    ctaUrl: String(r.cta_url ?? ""),
    placements: (Array.isArray(r.placements) ? r.placements : []) as PromoPlacement[],
    tripId: (r.trip_id as string | null) ?? null,
    tripSlug: ((r.trips as { slug?: unknown } | null)?.slug as string | undefined) ?? null,
    theme: ((r.theme as PromoTheme) ?? "sunset") as PromoTheme,
    startsAt: (r.starts_at as string | null) ?? null,
    endsAt: (r.ends_at as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapAdmin(r: Record<string, unknown>): AdminPromotion {
  return {
    ...mapPromotion(r),
    isActive: Boolean(r.is_active),
    viewCount: Number(r.view_count ?? 0),
    clickCount: Number(r.click_count ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

/** Is this offer showing on the website right now? */
export function isLiveNow(p: Pick<AdminPromotion, "isActive" | "startsAt" | "endsAt">, now = Date.now()): boolean {
  if (!p.isActive) return false;
  if (p.startsAt && Date.parse(p.startsAt) > now) return false;
  if (p.endsAt && Date.parse(p.endsAt) <= now) return false;
  return true;
}

export function promoStatus(p: AdminPromotion, now = Date.now()): "live" | "scheduled" | "ended" | "off" {
  if (!p.isActive) return "off";
  if (p.endsAt && Date.parse(p.endsAt) <= now) return "ended";
  if (p.startsAt && Date.parse(p.startsAt) > now) return "scheduled";
  return "live";
}

function byOrder(a: Promotion, b: Promotion): number {
  return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
}

// ---------------------------------------------------------------------------
// Preview store (no database)
// ---------------------------------------------------------------------------

const preview: AdminPromotion[] = [];

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/** Every offer live right now (the website filters by placement). Never throws. */
export async function getLivePromotions(): Promise<Promotion[]> {
  if (!hasDatabase()) {
    return preview.filter((p) => isLiveNow(p)).sort(byOrder);
  }
  try {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("promotions")
      .select(`${PUBLIC_COLUMNS}, trips(slug)`)
      .order("sort_order", { ascending: true })
      .limit(40);
    if (error) {
      console.error("[promotions] live list failed:", error.message);
      return [];
    }
    return (data ?? [])
      .map((r) => mapPromotion(r as Record<string, unknown>))
      .filter((p) => isLiveNow({ ...p, isActive: true }))
      .sort(byOrder);
  } catch (err) {
    console.error("[promotions] live list failed:", err);
    return [];
  }
}

export function forPlacement(list: Promotion[], placement: PromoPlacement, tripId?: string | null): Promotion[] {
  return list.filter(
    (p) => p.placements.includes(placement) && (placement !== "trip_page" || !p.tripId || p.tripId === tripId)
  );
}

/** Count a view or click (live offers only). Returns false when nothing was counted. */
export async function trackPromotion(id: string, kind: "view" | "click"): Promise<boolean> {
  if (!hasDatabase()) {
    const p = preview.find((x) => x.id === id && isLiveNow(x));
    if (!p) return false;
    if (kind === "view") p.viewCount += 1;
    else p.clickCount += 1;
    return true;
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("promotion_track", { p_promotion_id: id, p_kind: kind });
  if (error) {
    console.error("[promotions] track failed:", error.message);
    return false;
  }
  return Boolean(data);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listPromotionsAdmin(): Promise<AdminPromotion[]> {
  if (!hasDatabase()) return preview.slice().sort(byOrder);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("promotions")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[promotions] admin list failed:", error.message);
    throw new Error("Could not load offers.");
  }
  return (data ?? []).map((r) => mapAdmin(r as Record<string, unknown>));
}

function cleanDbError(message: string | undefined): string {
  if (!message) return "Could not save the offer.";
  if (/media_url/.test(message)) return "The photo/video link must start with https:// or be a file from the media library.";
  if (/cta_url/.test(message)) return "The button link must start with / (a page on this site) or https://.";
  if (/promotions_button_pair/.test(message)) return "Give the button both a label and a link, or leave both empty.";
  if (/promotions_dates_order/.test(message)) return "The end date must be after the start date.";
  if (/placements/.test(message)) return "Choose at least one place to show the offer.";
  return message;
}

export async function savePromotion(input: PromotionInput, actor: Actor): Promise<AdminPromotion> {
  const row = {
    title: input.title,
    message: input.message,
    badge: input.badge,
    media_type: input.mediaType,
    media_url: input.mediaType === "none" ? "" : input.mediaUrl,
    poster_url: input.mediaType === "video" ? input.posterUrl : "",
    cta_label: input.ctaLabel,
    cta_url: input.ctaUrl,
    placements: input.placements,
    trip_id: input.tripId,
    theme: input.theme,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    is_active: input.isActive,
    sort_order: input.sortOrder,
  };

  if (!hasDatabase()) {
    const now = new Date().toISOString();
    const existing = input.id ? preview.find((p) => p.id === input.id) : undefined;
    const next: AdminPromotion = {
      ...mapAdmin({ ...row, id: existing?.id ?? crypto.randomUUID(), created_at: existing?.createdAt ?? now, updated_at: now }),
      viewCount: existing?.viewCount ?? 0,
      clickCount: existing?.clickCount ?? 0,
    };
    if (existing) Object.assign(existing, next);
    else preview.push(next);
    return next;
  }

  const admin = createSupabaseAdminClient();
  const query = input.id
    ? admin
        .from("promotions")
        .update({ ...row, updated_by: actor.userId, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .select("*")
        .single()
    : admin
        .from("promotions")
        .insert({ ...row, created_by: actor.userId, updated_by: actor.userId })
        .select("*")
        .single();
  const { data, error } = await query;
  if (error || !data) throw new Error(cleanDbError(error?.message));
  await admin.from("audit_logs").insert({
    actor_user_id: actor.userId,
    actor_role: actor.staffRole,
    action: input.id ? "offer_updated" : "offer_created",
    entity_type: "promotion",
    entity_id: String(data.id),
    reason: `${input.isActive ? "On" : "Off"}: ${input.title}`,
    before_state: null,
    after_state: { title: input.title, placements: input.placements, starts_at: input.startsAt, ends_at: input.endsAt },
  });
  return mapAdmin(data as Record<string, unknown>);
}

export async function deletePromotion(id: string, actor: Actor): Promise<void> {
  if (!hasDatabase()) {
    const i = preview.findIndex((p) => p.id === id);
    if (i >= 0) preview.splice(i, 1);
    return;
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("promotions").delete().eq("id", id).select("title").maybeSingle();
  if (error) throw new Error("Could not delete the offer.");
  if (!data) throw new Error("NOT_FOUND: That offer no longer exists.");
  await admin.from("audit_logs").insert({
    actor_user_id: actor.userId,
    actor_role: actor.staffRole,
    action: "offer_deleted",
    entity_type: "promotion",
    entity_id: id,
    reason: `Deleted: ${String(data.title)}`,
  });
}
