import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "media";
const FOLDER = "uploads";
const LIMITS: Record<string, { ext: string; maxBytes: number }> = {
  "image/jpeg": { ext: "jpg", maxBytes: 8 * 1024 * 1024 },
  "image/png": { ext: "png", maxBytes: 8 * 1024 * 1024 },
  "image/webp": { ext: "webp", maxBytes: 8 * 1024 * 1024 },
  "image/avif": { ext: "avif", maxBytes: 8 * 1024 * 1024 },
  "video/mp4": { ext: "mp4", maxBytes: 20 * 1024 * 1024 },
  "video/webm": { ext: "webm", maxBytes: 20 * 1024 * 1024 },
};

export interface MediaItem {
  path: string;
  url: string;
  name: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string | null;
  usedBy: string[];
}

function storageReady() {
  return isSupabaseConfigured() && isServiceRoleConfigured();
}

function safeBaseName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "file"
  );
}

/** Which trips use a public URL (hero, gallery or videos) — so in-use files are never deleted. */
async function usageIndex(): Promise<Map<string, string[]>> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("trips").select("title, hero_image_url, gallery_urls, video_links");
  const index = new Map<string, string[]>();
  const add = (url: string, title: string) => index.set(url, [...(index.get(url) ?? []), title]);
  for (const t of data ?? []) {
    const title = String(t.title);
    if (t.hero_image_url) add(String(t.hero_image_url), `${title} (main photo)`);
    for (const g of (Array.isArray(t.gallery_urls) ? t.gallery_urls : []) as string[]) add(g, `${title} (gallery)`);
    for (const v of (Array.isArray(t.video_links) ? t.video_links : []) as { url: string }[]) add(v.url, `${title} (video)`);
  }
  // Offers & ads use library files too (table exists from migration 202611130003).
  const { data: promos } = await admin.from("promotions").select("title, media_url, poster_url");
  for (const p of promos ?? []) {
    if (p.media_url) add(String(p.media_url), `Offer “${String(p.title)}”`);
    if (p.poster_url) add(String(p.poster_url), `Offer “${String(p.title)}” (cover)`);
  }
  // The chat guide's character pictures / videos (Admin → Website text → Chat guide).
  const { data: assistant } = await admin.from("site_settings").select("value").eq("key", "assistant").maybeSingle();
  const media = (assistant?.value as { guideMedia?: Record<string, unknown> } | null)?.guideMedia ?? {};
  for (const [emotion, url] of Object.entries(media)) {
    if (typeof url === "string" && url) add(url, `Chat guide (${emotion})`);
  }
  return index;
}

export async function GET() {
  try {
    await requireStaff(["owner", "ops", "support"]);
  } catch {
    return NextResponse.json({ error: "Admin sign-in required." }, { status: 403 });
  }
  if (!storageReady()) return NextResponse.json({ ready: false, items: [] });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .list(FOLDER, { limit: 500, sortBy: { column: "created_at", order: "desc" } });
  if (error) {
    return NextResponse.json({ ready: false, items: [], error: `Media storage is not ready: ${error.message}` });
  }
  const usage = await usageIndex();
  const items: MediaItem[] = (data ?? [])
    .filter((f) => f.name && !f.name.startsWith("."))
    .map((f) => {
      const path = `${FOLDER}/${f.name}`;
      const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const meta = (f.metadata ?? {}) as { size?: number; mimetype?: string };
      return {
        path,
        url,
        name: f.name,
        sizeBytes: Number(meta.size ?? 0),
        contentType: String(meta.mimetype ?? ""),
        createdAt: f.created_at ?? null,
        usedBy: usage.get(url) ?? [],
      };
    });
  return NextResponse.json({ ready: true, items });
}

export async function POST(request: NextRequest) {
  let actor;
  try {
    actor = await requireStaff(["owner", "ops"]);
  } catch {
    return NextResponse.json({ error: "Only the owner or operations staff can upload." }, { status: 403 });
  }
  if (!storageReady()) {
    return NextResponse.json({ error: "Uploads need the database connected." }, { status: 409 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the file as a form upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  const rule = LIMITS[file.type];
  if (!rule) {
    return NextResponse.json({ error: "Only JPG, PNG, WebP, AVIF photos or MP4/WebM videos." }, { status: 400 });
  }
  if (file.size > rule.maxBytes) {
    return NextResponse.json(
      { error: `Too large: photos up to 8 MB, videos up to 20 MB (this file is ${(file.size / 1048576).toFixed(1)} MB).` },
      { status: 400 }
    );
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const path = `${FOLDER}/${stamp}-${safeBaseName(file.name)}-${crypto.randomBytes(3).toString("hex")}.${rule.ext}`;
  const admin = createSupabaseAdminClient();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (error) {
    return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 409 });
  }
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  await admin.from("audit_logs").insert({
    actor_user_id: actor.userId,
    actor_role: actor.staffRole,
    action: "media_uploaded",
    entity_type: "media",
    entity_id: path,
    reason: file.name.slice(0, 120),
    after_state: { url, size: file.size, type: file.type },
  });
  return NextResponse.json({ ok: true, path, url });
}

export async function DELETE(request: NextRequest) {
  let actor;
  try {
    actor = await requireStaff(["owner", "ops"]);
  } catch {
    return NextResponse.json({ error: "Only the owner or operations staff can delete media." }, { status: 403 });
  }
  if (!storageReady()) return NextResponse.json({ error: "Needs the database connected." }, { status: 409 });

  const body = (await request.json().catch(() => null)) as { path?: string } | null;
  const path = String(body?.path ?? "");
  if (!new RegExp(`^${FOLDER}/[a-z0-9][a-z0-9.-]{0,120}$`).test(path)) {
    return NextResponse.json({ error: "Unknown file." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const usedBy = (await usageIndex()).get(url) ?? [];
  if (usedBy.length > 0) {
    return NextResponse.json({ error: `Still used by: ${usedBy.join(", ")}. Remove it there first.` }, { status: 409 });
  }
  const { error } = await admin.storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: `Delete failed: ${error.message}` }, { status: 409 });
  await admin.from("audit_logs").insert({
    actor_user_id: actor.userId,
    actor_role: actor.staffRole,
    action: "media_deleted",
    entity_type: "media",
    entity_id: path,
    reason: "Deleted from media library",
  });
  return NextResponse.json({ ok: true });
}
