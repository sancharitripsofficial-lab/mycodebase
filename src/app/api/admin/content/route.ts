import { after, NextRequest, NextResponse } from "next/server";
import { contentActionSchema, firstIssue } from "@/lib/admin/content-schemas";
import { requireStaff } from "@/lib/auth";
import { getAdminContent, runContentAction } from "@/lib/data/admin-content";
import { getPublishedTripsWithDetails, getRawSiteSettings } from "@/lib/data/repository";
import { pingIndexNow } from "@/lib/indexnow";
import { refreshStorefront } from "@/lib/revalidate";
import { SITE_URL } from "@/lib/seo";
import { buildSitemap } from "@/lib/sitemap-entries";

/**
 * After a content change, tell Bing/Yahoo and the other IndexNow search engines which pages to
 * read again: the pages that show trips, dates, prices, site text and stories (not the Karnataka
 * guide, whose facts live in code). Runs after the reply is sent and never fails the save.
 */
async function tellSearchEngines(): Promise<void> {
  try {
    const [{ trips, isDemoFallback }, { settings }] = await Promise.all([getPublishedTripsWithDetails(), getRawSiteSettings()]);
    if (isDemoFallback) return;
    const urls = buildSitemap({ baseUrl: SITE_URL, trips, isDemoFallback, posts: settings.blogPosts ?? [] })
      .map((e) => e.url)
      .filter((u) => !u.includes("/karnataka/"));
    await pingIndexNow(urls);
  } catch (err) {
    console.error("[indexnow] could not prepare the ping:", err instanceof Error ? err.message : err);
  }
}

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
    after(tellSearchEngines);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save." }, { status: 409 });
  }
}
