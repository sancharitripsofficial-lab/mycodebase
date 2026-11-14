import type { Metadata } from "next";
import { ShieldCheck, Lock, Users, BedDouble } from "lucide-react";
import { PageBanner3D } from "@/components/banners/PageBanner3D";
import { getSiteSettings } from "@/lib/data/repository";

export const metadata: Metadata = {
  title: "Safety & Comfort Standards",
  description:
    "How Sanchari handles operational safety, privacy-protected co-traveler requests, and room allocation drafts.",
  alternates: { canonical: "/safety" },
};

export default async function SafetyPage() {
  const { settings } = await getSiteSettings();

  return (
    <>
      <PageBanner3D
        scene="safety"
        width="4xl"
        eyebrow="Safety, Privacy & Comfort"
        title="Operational Care Without Public Profiling"
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
              ID Minimization &amp; Draft Safety Note
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
