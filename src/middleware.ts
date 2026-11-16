import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { LANG_COOKIE, LANG_HANDOFF_MAX_AGE, asLang } from "@/lib/i18n/lang-cookie";
import { TRIP_SLUG_REDIRECTS } from "@/lib/trip-slugs";

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
}

/**
 * Separate admin link.
 * ADMIN_HOST (optional, e.g. "admin.sancharitrips.in"): when set, the admin panel and its APIs
 * answer only on that host — the public storefront host returns 404 for /admin — and opening
 * the admin host's root goes straight to the panel. Leave it empty on localhost.
 */
function adminHostGate(request: NextRequest): NextResponse | null {
  const adminHost = (process.env.ADMIN_HOST ?? "").trim().toLowerCase();
  if (!adminHost) return null;
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const { pathname } = request.nextUrl;
  const onAdminHost = host === adminHost;

  if (isAdminPath(pathname) && !onAdminHost) {
    return new NextResponse("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
  if (onAdminHost && pathname === "/") {
    // Keep the admin host (request.url may carry the internal host behind a proxy).
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.host = request.headers.get("host") ?? url.host;
    return NextResponse.redirect(url);
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const gated = adminHostGate(request);
  if (gated) return gated;

  let response = NextResponse.next({ request });
  const adminArea = isAdminPath(request.nextUrl.pathname);

  // Only staff sign in, so only the admin area needs the Supabase session refresh (a network
  // call). Customer pages skip it entirely, which keeps them instant and cacheable.
  if (adminArea && isSupabaseConfigured()) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      }
    );
    await supabase.auth.getUser();
  }

  if (adminArea) {
    // Keep the admin out of search engines without listing its path in robots.txt.
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "no-store");
  }
  if (isMovedTripPath(request.nextUrl.pathname)) {
    // The trip page redirects old/new addresses (lib/trip-slugs.ts) to a Location without the
    // request's ?lang=kn. Hand the choice over in a short cookie, which Next carries onto the
    // redirect, so a shared Kannada link still opens in Kannada (LanguageProvider reads it).
    const lang = asLang(request.nextUrl.searchParams.get("lang"));
    if (lang) {
      response.cookies.set(LANG_COOKIE, lang, {
        path: "/",
        maxAge: LANG_HANDOFF_MAX_AGE,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
      });
    }
  }
  if (request.nextUrl.pathname === "/booking-lookup") {
    // Private self-service page: crawlable (so the noindex is seen) but never listed in search.
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

/** Both forms of every renamed trip address (each key and value of TRIP_SLUG_REDIRECTS). */
function isMovedTripPath(pathname: string): boolean {
  if (!pathname.startsWith("/trips/")) return false;
  const slug = pathname.slice("/trips/".length).replace(/\/+$/, "");
  return Object.entries(TRIP_SLUG_REDIRECTS).some(([from, to]) => slug === from || slug === to);
}

export const config = {
  // "/" is included only for the optional ADMIN_HOST redirect, "/booking-lookup" only for its
  // noindex header, and the /trips/ addresses only for the ?lang= hand-over cookie above; every
  // other public page bypasses middleware. The matcher must be literal (Next reads it at build
  // time): list BOTH slugs of each TRIP_SLUG_REDIRECTS line here (tests/slug-redirects.test.ts
  // fails when one is missing).
  matcher: [
    "/",
    "/booking-lookup",
    "/trips/coorg-rainforest-slow-drive",
    "/trips/coorg-rainforest-spice-drive",
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
