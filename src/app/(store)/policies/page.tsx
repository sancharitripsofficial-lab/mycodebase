import type { Metadata } from "next";
import { PageBanner3D } from "@/components/banners/PageBanner3D";
import { getSiteSettings } from "@/lib/data/repository";

export const metadata: Metadata = {
  title: "Policies & Legal Drafts",
  description:
    "Owner-review draft Terms, Privacy Notice, and Cancellation/Refund policy for Sanchari • Micro Trips.",
};

export default async function PoliciesPage() {
  const { settings } = await getSiteSettings();

  return (
    <>
      <PageBanner3D
        scene="policies"
        width="4xl"
        eyebrow="Owner-Review Drafts"
        title="Terms, Privacy & Refund Policy (Drafts)"
      />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12 space-y-8">
        <div className="rounded-xl border border-saffron-500/40 bg-saffron-500/10 p-4 text-xs text-ink-900">
          <strong>Owner-Review Draft Notice:</strong> These policy documents are pre-launch drafts
          and must be reviewed by the business owner and legal counsel prior to live commercial
          launch or payment gateway onboarding.
        </div>

        <section id="terms" className="rounded-2xl border border-stone-200 bg-cream-50 p-6 space-y-2">
          <h2 className="font-display text-xl font-semibold text-forest-900">
            1. Terms of Service (Draft)
          </h2>
          <p className="text-sm leading-relaxed text-stone-600">
            {settings.legalDrafts.termsSummary}
          </p>
          <p className="text-xs text-stone-600">
            <strong>Vehicle &amp; Capacity Rule:</strong> {settings.bookingPolicy.vehiclePolicySummary}
          </p>
        </section>

        <section id="privacy" className="rounded-2xl border border-stone-200 bg-cream-50 p-6 space-y-2">
          <h2 className="font-display text-xl font-semibold text-forest-900">
            2. Privacy Notice (Draft)
          </h2>
          <p className="text-sm leading-relaxed text-stone-600">
            {settings.legalDrafts.privacySummary}
          </p>
        </section>

        <section id="refunds" className="rounded-2xl border border-stone-200 bg-cream-50 p-6 space-y-3">
          <h2 className="font-display text-xl font-semibold text-forest-900">
            3. Cancellation &amp; Refund Policy (Draft)
          </h2>
          <p className="text-sm leading-relaxed text-stone-600">
            {settings.legalDrafts.refundSummary}
          </p>
          <ul className="list-disc pl-5 text-xs space-y-1 text-ink-900">
            {settings.bookingPolicy.cancellationSlabs.map((slab) => (
              <li key={slab.label}>
                <strong>{slab.label}:</strong> {slab.refundNote}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
