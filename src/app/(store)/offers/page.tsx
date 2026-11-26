import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageBanner } from "@/components/banners/PageBanner";
import { guideH2 } from "@/components/guide/GuideParts";
import { OfferTerms, PromoCta } from "@/components/promo/PromoBanner";
import { TripCard } from "@/components/TripCard";
import { getLivePromotions } from "@/lib/data/promotions";
import { getPublishedTripsWithDetails } from "@/lib/data/repository";
import { BRAND_NAME, PAGE_SEO, jsonLdText, pageBreadcrumb, pageMetadata } from "@/lib/seo";

// Offers start and end on a schedule (Admin → Offers & ads): refresh at least once a minute.
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: PAGE_SEO.offers.title,
  description: PAGE_SEO.offers.description,
  path: PAGE_SEO.offers.path,
});

/**
 * Every offer that is live right now (the same ones shown in the top bar, banners and pop-up),
 * in one place. Nothing is invented here: with no live offer the page says so.
 */
export default async function OffersPage() {
  const [promotions, { trips }] = await Promise.all([getLivePromotions(), getPublishedTripsWithDetails()]);
  // One card per offer, even when it is shown in several places on the site.
  const offers = promotions.filter((p, i, all) => all.findIndex((o) => o.id === p.id) === i && p.title.trim());

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(pageBreadcrumb("Offers", PAGE_SEO.offers.path)) }} />
      <PageBanner
        page="trips"
        scene="trips"
        width="6xl"
        eyebrow="Offers for travellers"
        title="Current trip offers from Bangalore"
        subtitle={`Every offer ${BRAND_NAME} is running today, in one place.`}
      />

      <div>
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 sm:py-12">
          <section aria-labelledby="offers-heading" className="space-y-5">
            <h2 id="offers-heading" className={guideH2}>
              Offers running now
            </h2>
            {offers.length > 0 ? (
              <ul className="grid gap-4 md:grid-cols-2">
                {offers.map((offer) => (
                  <li key={offer.id} className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-[var(--shadow-soft)]">
                    {offer.badge && <p className="eyebrow text-copper-700">{offer.badge}</p>}
                    <h3 className="font-display text-xl font-semibold text-forest-900">{offer.title}</h3>
                    {offer.message && <p className="mt-2 text-sm leading-relaxed text-ink-900/85">{offer.message}</p>}
                    <OfferTerms promo={offer} className="mt-2 text-xs font-semibold text-stone-600" />
                    <PromoCta promo={offer} className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="max-w-3xl rounded-2xl bg-white/85 p-5 text-stone-600">
                No offer is running right now. New offers appear on this page as soon as they start.
              </p>
            )}
            <p className="max-w-3xl text-sm leading-relaxed text-stone-600">
              Have a coupon or creator code? Enter it on the booking form of your trip: the price is checked again before you pay.
            </p>
          </section>

          {trips.length > 0 && (
            <section aria-labelledby="trips-heading" className="space-y-5">
              <h2 id="trips-heading" className={guideH2}>
                Trips with open dates
              </h2>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {trips.map((item) => (
                  <TripCard key={item.trip.id} item={item} />
                ))}
              </div>
              <Link href="/trips" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700">
                All dates and seats <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
