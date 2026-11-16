import type { Metadata } from "next";
import { NotFoundContent } from "@/components/NotFoundContent";
import { NOT_FOUND_METADATA } from "@/lib/seo";

// Unmatched URLs (e.g. /private-6-seat): Next builds its /_not-found page only from this root
// file, so without it the built-in "404: This page could not be found." title showed next to the
// home title. Same metadata as (store)/not-found.tsx: noindex, no canonical, no og:url.
export const metadata: Metadata = NOT_FOUND_METADATA;

export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-screen items-center">
      <NotFoundContent />
    </main>
  );
}
