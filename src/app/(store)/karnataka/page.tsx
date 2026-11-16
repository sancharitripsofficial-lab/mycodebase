import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageBanner } from "@/components/banners/PageBanner";
import { GuideLinks, GuideNote, PlanSection, guideH2 } from "@/components/guide/GuideParts";
import { getPublishedTripsWithDetails } from "@/lib/data/repository";
import { KARNATAKA_DISTRICTS, KARNATAKA_PLACES } from "@/lib/places/karnataka-places";
import { GUIDE_HUB, guidePagesOfKind } from "@/lib/places/guide";
import { ANY_DAY_LINE, BRAND_NAME, jsonLdText, pageBreadcrumb, pageMetadata } from "@/lib/seo";

// Live trips show at the foot of the page: same freshness as the trips page.
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({ title: GUIDE_HUB.title, description: GUIDE_HUB.description, path: GUIDE_HUB.path });

/**
 * The Karnataka guide hub: every region, district and kind of place in the fact-checked place
 * list (src/lib/places), each linking to its own page.
 */
export default async function KarnatakaGuideHubPage() {
  const { trips } = await getPublishedTripsWithDetails();
  const regions = guidePagesOfKind("region");
  const districts = guidePagesOfKind("district");
  const categories = guidePagesOfKind("category");
  const link = (p: { path: string; name: string; places: readonly unknown[] }) => ({ href: p.path, label: p.name, count: p.places.length });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(pageBreadcrumb(GUIDE_HUB.name, GUIDE_HUB.path)) }} />
      <PageBanner
        page="karnataka"
        scene="trips"
        width="6xl"
        eyebrow="Karnataka travel guide"
        title={GUIDE_HUB.h1}
        subtitle={`${KARNATAKA_PLACES.length} places across all ${KARNATAKA_DISTRICTS.length} districts, by region and by type.`}
      />

      <div>
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 sm:py-12">
          <section className="max-w-3xl space-y-3 text-[1.02rem] leading-relaxed text-ink-900">
            <p>
              {`${BRAND_NAME} plans small-group road trips from Bengaluru across Karnataka.`}{" "}
              {`This guide lists ${KARNATAKA_PLACES.length} places to visit in all ${KARNATAKA_DISTRICTS.length} districts of the state, each with a short fact, so you can decide where to go.`}
            </p>
            <p>
              {ANY_DAY_LINE} For a place we do not run a trip to yet, ask us for a custom trip and a real person replies on WhatsApp.
            </p>
          </section>

          <section aria-labelledby="regions-heading" className="space-y-5">
            <h2 id="regions-heading" className={guideH2}>
              Karnataka by region
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {regions.map((region) => (
                <article key={region.slug} className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-[var(--shadow-soft)]">
                  <h3 className="font-display text-xl font-semibold text-forest-900">
                    <Link href={region.path} className="hover:text-copper-700">
                      {region.name}
                    </Link>
                  </h3>
                  <p className="mt-1 text-sm text-stone-600">
                    {region.places.length} places in {region.groups.length} districts
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {region.groups.map((g) => (
                      <li key={g.id}>
                        <Link href={g.href ?? region.path} className="inline-flex min-h-9 items-center font-medium text-forest-900 hover:text-copper-700">
                          {g.heading}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={region.path}
                    aria-label={`All places in ${region.name}`}
                    className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700"
                  >
                    See the places <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="types-heading" className="space-y-5">
            <h2 id="types-heading" className={guideH2}>
              Places by type
            </h2>
            <GuideLinks links={categories.map(link)} />
          </section>

          <section aria-labelledby="districts-heading" className="space-y-5">
            <h2 id="districts-heading" className={guideH2}>
              All {districts.length} districts of Karnataka
            </h2>
            <GuideLinks links={districts.map(link)} />
          </section>

          <GuideNote />

          <PlanSection name="Karnataka" trips={trips} tripsHeading="Trips with open dates" showNoTripLine={false} />

          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-5">
            <p className="min-w-0 flex-[1_1_15rem] font-display text-lg font-semibold text-forest-900">Looking for a ready plan?</p>
            <Link href="/karnataka-tour-packages" className="btn-sunset inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-center text-sm sm:w-auto">
              Karnataka tour packages <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/weekend-trips-from-bangalore"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-forest-900/20 px-5 py-3 text-sm font-semibold text-forest-900 sm:w-auto"
            >
              Weekend trips from Bangalore
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
