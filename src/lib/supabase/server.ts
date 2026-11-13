import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getServerSecretKey } from "@/lib/env";

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase URL or Anon Key is not configured.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components cannot mutate cookies directly; middleware handles session refresh.
        }
      },
    },
  });
}

/**
 * Anonymous, cookie-free client for PUBLIC reads (published trips, availability, site text,
 * published reviews). Not reading cookies lets storefront pages be cached and served
 * instantly from Vercel's CDN. RLS still applies (anon role).
 */
export function createSupabasePublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase URL or Anon Key is not configured.");
  }
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Strictly server-only admin client using the project's secret key (see getServerSecretKey).
 * NEVER import or invoke from Client Components or expose to browser bundles.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getServerSecretKey();

  if (!url || !serviceKey) {
    throw new Error("Supabase URL or Service Role Key is not configured.");
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

