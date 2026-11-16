import type { Metadata } from "next";
import { ShieldCheck, Lock, Users, BedDouble } from "lucide-react";
import { PageBanner } from "@/components/banners/PageBanner";
import { getSiteSettings } from "@/lib/data/repository";
import { PAGE_SEO, jsonLdText, pageBreadcrumb, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(PAGE_SEO.safety);

export default async function SafetyPage() {
  const { settings } = await getSiteSettings();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(pageBreadcrumb("Safety & comfort", "/safety")) }} />
      <PageBanner
        page="safety"
        scene="safety"
        width="4xl"
        eyebrow="Safety, Privacy & Comfort"
        title="Safety & comfort on every trip"
        subtitle="Small-group road trips require thoughtful planning—and equally thoughtful privacy."
      />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12 space-y-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="tile tile-lagoon p-5 space-y-2">
            <Lock className="h-5 w-5 text-forest-700" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-forest-900">
              Private Comfort Requests
            </h2>
            <p className="text-xs leading-relaxed text-stone-600">
              Co-traveler preferences (such as preferring same-gender co-travelers or requesting a
              women-only departure) are stored in an access-restricted operational table. They are
              never displayed on public pages, analytics, URLs, or group WhatsApp invites.
            </p>
          </div>

          <div className="tile tile-rose p-5 space-y-2">
            <Users className="h-5 w-5 text-copper-600" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-forest-900">
              Explicit Women-Only Batches
            </h2>
            <p className="text-xs leading-relaxed text-stone-600">
              Women-only departures are explicitly scheduled and tagged by operations, never
              auto-generated from an individual traveler’s request. If a comfort request cannot be
              honored by {settings.bookingPolicy.preferenceDecisionHoursBefore} hours before
              departure, an operator offers alternate dates or a refund per policy.
            </p>
          </div>

          <div className="tile tile-leaf p-5 space-y-2">
            <BedDouble className="h-5 w-5 text-forest-700" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-forest-900">
              Overnight Room Policy
            </h2>
            <p className="text-xs leading-relaxed text-stone-600">
              {settings.bookingPolicy.roomPolicySummary}
            </p>
          </div>

          <div className="tile tile-amber p-5 space-y-2">
            <ShieldCheck className="h-5 w-5 text-forest-700" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-forest-900">
              {/* "Draft" only while the legal texts await owner review (Admin → Text & policies), like the
                  booking widget's "draft Terms". The draft wording keeps its existing Kannada entry. */}
              {settings.legalDrafts.ownerReviewRequired ? "ID Minimization & Draft Safety Note" : "ID Minimization & Safety Note"}
            </h2>
            <p className="text-xs leading-relaxed text-stone-600">
              We do not collect or store government ID scans or Aadhaar/passport numbers online.
              Staff record only a manual “verification checked” flag when required at check-in.{" "}
              {settings.legalDrafts.safetySummary}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
