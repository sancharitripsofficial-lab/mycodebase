import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";

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

  if (isSupabaseConfigured()) {
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

  if (isAdminPath(request.nextUrl.pathname)) {
    // Keep the admin out of search engines without listing its path in robots.txt.
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
