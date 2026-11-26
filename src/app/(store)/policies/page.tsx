import type { Metadata } from "next";
import { PageBanner } from "@/components/banners/PageBanner";
import { cleanAdsId, cleanMeasurementId } from "@/lib/analytics";
import { getSiteSettings } from "@/lib/data/repository";
import { PAGE_SEO, jsonLdText, pageBreadcrumb, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(PAGE_SEO.policies);

export default async function PoliciesPage() {
  const { settings } = await getSiteSettings();
  // "Draft" labels only while the owner keeps Admin → Text & policies → "Still waiting for owner /
  // lawyer review" switched on.
  const draft = settings.legalDrafts.ownerReviewRequired;
  const d = draft ? " (Draft)" : "";
  // Said on this page exactly while analytics is switched on (Admin → Website text → Analytics).
  const analyticsOn = Boolean(cleanMeasurementId(settings.analytics.gaMeasurementId) || cleanMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID));
  const adsOn = Boolean(cleanAdsId((settings.analytics as { googleAdsId?: string }).googleAdsId));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(pageBreadcrumb("Terms, privacy & refunds", "/policies")) }} />
      <PageBanner
        page="policies"
        scene="policies"
        width="4xl"
        eyebrow={draft ? "Owner-Review Drafts" : "Clear rules, no surprises"}
        title={draft ? "Terms, Privacy & Refund Policy (Drafts)" : "Terms, Privacy & Refund Policy"}
      />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12 space-y-8">
        {draft && (
          <div className="rounded-xl border border-saffron-500/40 bg-saffron-500/10 p-4 text-xs text-ink-900">
            <strong>Owner-Review Draft Notice:</strong> These policy documents are pre-launch drafts
            and must be reviewed by the business owner and legal counsel prior to live commercial
            launch or payment gateway onboarding.
          </div>
        )}

        <section id="terms" className="tile tile-lagoon p-6 space-y-2">
          <h2 className="font-display text-xl font-semibold text-forest-900">
            1. Terms of Service{d}
          </h2>
          <p className="text-sm leading-relaxed text-stone-600">
            {settings.legalDrafts.termsSummary}
          </p>
          <p className="text-xs text-stone-600">
            <strong>Vehicle &amp; Capacity Rule:</strong> {settings.bookingPolicy.vehiclePolicySummary}
          </p>
        </section>

        <section id="privacy" className="tile tile-leaf p-6 space-y-2">
          <h2 className="font-display text-xl font-semibold text-forest-900">
            2. Privacy Notice{d}
          </h2>
          <p className="text-sm leading-relaxed text-stone-600">
            {settings.legalDrafts.privacySummary}
          </p>
          {analyticsOn && (
            <p className="text-xs leading-relaxed text-stone-600">
              <strong>Website statistics:</strong> this website uses Google Analytics to count visits and the steps of a booking (a trip opened, seats
              chosen, a reservation started, a booking completed, a WhatsApp link tapped). These counts carry no name, phone number or email.
            </p>
          )}
          {adsOn && (
            <p className="text-xs leading-relaxed text-stone-600">
              <strong>Advertising:</strong> we advertise on Google. When you reach this website from a Google ad, Google Ads is told that a booking was
              completed and its amount, so we can see which ads work. No name, phone number or email is sent.
            </p>
          )}
        </section>

        <section id="refunds" className="tile tile-sunset p-6 space-y-3">
          <h2 className="font-display text-xl font-semibold text-forest-900">
            3. Cancellation &amp; Refund Policy{d}
          </h2>
          <p className="text-sm leading-relaxed text-stone-600">
            {settings.legalDrafts.refundSummary}
          </p>
          <p className="text-xs leading-relaxed text-ink-900">
            <strong>Advance and balance:</strong>{" "}
            where a trip offers an advance, its booking form shows the exact amount to pay now, the balance and the day the balance is due. A trip that
            leaves too soon for a balance is paid in full when you book.
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
