import { revalidatePath } from "next/cache";

/**
 * Storefront pages are cached on the CDN (revalidate = 30 s). Call this after anything that
 * changes what customers see — seats held/confirmed/released, trips, dates, prices, site text —
 * so the next visitor gets fresh pages immediately instead of waiting up to 30 s.
 * Bookings themselves are always decided by the database, never by a cached page.
 */
export function refreshStorefront(): void {
  try {
    revalidatePath("/", "layout");
  } catch (err) {
    console.error("[revalidate] could not refresh storefront cache:", err instanceof Error ? err.message : err);
  }
}
