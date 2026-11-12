import type { Metadata } from "next";
import { ShieldCheck, Lock, Users, BedDouble } from "lucide-react";
import { getSiteSettings } from "@/lib/data/repository";

export const metadata: Metadata = {
  title: "Safety & Comfort Standards",
  description:
    "How Sanchari handles operational safety, privacy-protected co-traveler requests, and room allocation drafts.",
};

export default async function SafetyPage() {
  const { settings } = await getSiteSettings();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper-700">
          Safety, Privacy &amp; Comfort
        </p>
        <h1 className="font-display text-3xl font-semibold text-forest-900 sm:text-4xl">
          Operational Care Without Public Profiling
        </h1>
        <p className="text-sm leading-relaxed text-stone-600">
          Small-group road trips require thoughtful planning—and equally thoughtful privacy.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-cream-50 p-5 space-y-2">
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

        <div className="rounded-2xl border border-stone-200 bg-cream-50 p-5 space-y-2">
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

        <div className="rounded-2xl border border-stone-200 bg-cream-50 p-5 space-y-2">
          <BedDouble className="h-5 w-5 text-forest-700" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-forest-900">
            Overnight Room Policy
          </h2>
          <p className="text-xs leading-relaxed text-stone-600">
            {settings.bookingPolicy.roomPolicySummary}
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-cream-50 p-5 space-y-2">
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
  );
}

