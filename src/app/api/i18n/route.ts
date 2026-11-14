import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/data/repository";

/**
 * GET /api/i18n — the owner's Kannada wording (Admin → Kannada), loaded by the browser only when a
 * visitor switches to ಕನ್ನಡ. The built-in translations ship with the site; these override them.
 * Public text only (it is shown on the website anyway). Cached at the edge for a minute.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { settings } = await getSiteSettings();
  return NextResponse.json(
    { kn: settings.translationsKn ?? {} },
    { headers: { "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } },
  );
}
