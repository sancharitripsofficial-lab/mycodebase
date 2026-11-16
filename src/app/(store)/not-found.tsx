import type { Metadata } from "next";
import { NotFoundContent } from "@/components/NotFoundContent";
import { NOT_FOUND_METADATA } from "@/lib/seo";

// notFound() inside a store route (unknown trip or story), shown with the store header and footer.
// Unmatched URLs use app/not-found.tsx. Same title and description for both, never the home
// page's; no canonical or og:url (a missing page has no address of its own).
export const metadata: Metadata = NOT_FOUND_METADATA;

export default function StoreNotFound() {
  return <NotFoundContent />;
}
