import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Step 1 of an admin upload: check the person may upload, then hand the browser a one-time
 * signed link so the file goes straight to Supabase Storage. Files never pass through this
 * server, so Vercel's 4.5 MB request limit no longer blocks phone photos or videos.
 */
const BUCKET = "media";
const FOLDER = "uploads";
const LIMITS: Record<string, { ext: string; maxBytes: number; kind: "photo" | "video" }> = {
  "image/jpeg": { ext: "jpg", maxBytes: 15 * 1024 * 1024, kind: "photo" },
  "image/png": { ext: "png", maxBytes: 15 * 1024 * 1024, kind: "photo" },
  "image/webp": { ext: "webp", maxBytes: 15 * 1024 * 1024, kind: "photo" },
  "image/avif": { ext: "avif", maxBytes: 15 * 1024 * 1024, kind: "photo" },
  "video/mp4": { ext: "mp4", maxBytes: 20 * 1024 * 1024, kind: "video" },
  "video/webm": { ext: "webm", maxBytes: 20 * 1024 * 1024, kind: "video" },
};

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

export async function POST(request: NextRequest) {
  let actor;
  try {
    actor = await requireStaff(["owner", "ops"]);
  } catch {
    return NextResponse.json({ error: "Only the owner or operations staff can upload." }, { status: 403 });
  }
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "Uploads need the database connected." }, { status: 409 });
  }

  let body: { name?: unknown; type?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad upload request." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.slice(0, 200) : "file";
  const type = typeof body.type === "string" ? body.type : "";
  const size = typeof body.size === "number" && Number.isFinite(body.size) ? body.size : -1;
  const rule = LIMITS[type];
  if (!rule) {
    return NextResponse.json(
      {
        error:
          "Only JPG, PNG, WebP or AVIF photos and MP4 or WebM videos. (iPhone .MOV videos: save or share them as MP4 first.)",
      },
      { status: 400 }
    );
  }
  if (size <= 0 || size > rule.maxBytes) {
    const mb = (Math.max(size, 0) / 1048576).toFixed(1);
    return NextResponse.json(
      {
        error:
          rule.kind === "video"
            ? `Videos can be up to 20 MB (this one is ${mb} MB). Trim it or export it at 720p.`
            : `Photos can be up to 15 MB (this one is ${mb} MB).`,
      },
      { status: 400 }
    );
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const path = `${FOLDER}/${stamp}-${safeBaseName(name)}-${crypto.randomBytes(3).toString("hex")}.${rule.ext}`;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: `Could not start the upload: ${error?.message ?? "no upload link"}` }, { status: 409 });
  }
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  await admin.from("audit_logs").insert({
    actor_user_id: actor.userId,
    actor_role: actor.staffRole,
    action: "media_uploaded",
    entity_type: "media",
    entity_id: path,
    reason: name.slice(0, 120),
    after_state: { url, size, type, direct: true },
  });
  return NextResponse.json({ ok: true, path, url, signedUrl: data.signedUrl });
}
