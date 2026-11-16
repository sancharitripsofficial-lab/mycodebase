import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Body of every "not found" page: app/not-found.tsx (unmatched URLs, no store header or footer)
 * and (store)/not-found.tsx (notFound() inside a store route). Metadata: NOT_FOUND_METADATA.
 * "This page could not be found." is its own paragraph so the existing Kannada entry matches it.
 */
export function NotFoundContent() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-16 text-center sm:px-6">
      <p className="eyebrow">404</p>
      <h1 className="font-display text-3xl font-semibold text-forest-900 sm:text-4xl">Page not found</h1>
      <div className="space-y-1 text-stone-600">
        <p>This page could not be found.</p>
        <p>See the upcoming road trips from Bengaluru, or ask us for a private car or custom trip on your own dates.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/trips" className="btn-sunset inline-flex items-center gap-2 px-5 py-3 text-sm">
          See upcoming trips <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-full border border-forest-900/20 px-5 py-3 text-sm font-semibold text-forest-900"
        >
          Contact us
        </Link>
      </div>
    </div>
  );
}
