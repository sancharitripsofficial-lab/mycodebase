import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Car, IndianRupee, MapPin, Route, ShieldCheck, Users } from "lucide-react";
import { PageBanner } from "@/components/banners/PageBanner";
import { GuideLinks } from "@/components/guide/GuideParts";
import { TripCard } from "@/components/TripCard";
import { GUIDE_HUB, guidePagesOfKind } from "@/lib/places/guide";
import { formatINR } from "@/lib/currency";
import { getPublishedTripsWithDetails, getSiteSettings } from "@/lib/data/repository";
import {
  ANY_DAY_LINE,
  BRAND_NAME,
  PAGE_SEO,
  jsonLdText,
  liveDestinations,
  packagesPageDescription,
  pageBreadcrumb,
  pageMetadata,
  searchName,
  tripListJsonLd,
  tripPriceInfo,
} from "@/lib/seo";

// Same freshness as the trips page: live trips and prices, refreshed every 60 s.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { trips } = await getPublishedTripsWithDetails();
  return pageMetadata({
    title: PAGE_SEO.packages.title,
    description: packagesPageDescription(liveDestinations(trips)),
    path: PAGE_SEO.packages.path,
  });
}

/**
 * Well-known travel facts per destination (approximate road distance from Bengaluru, drive time,
 * usual best months). Shown only for destinations that have a live trip on the site.
 */
const PLACE_FACTS: Record<string, { distance: string; drive: string; season: string }> = {
  coorg: { distance: "About 250 km", drive: "5–6 hours", season: "October to March" },
  chikmagalur: { distance: "About 245 km", drive: "About 5 hours", season: "September to March" },
  gokarna: { distance: "About 480 km", drive: "8–9 hours", season: "October to March" },
  hampi: { distance: "About 340 km", drive: "6–7 hours", season: "October to February" },
};

/**
 * Landing page for people searching "Karnataka tour packages", "tour planners in Karnataka",
 * "road trips from Bangalore" etc. Everything on it comes from the live trips (Admin → Trips)
 * and the FAQs (Admin → Website text), plus the general place facts above.
 */
export default async function KarnatakaTourPackagesPage() {
  const [{ trips }, { settings }] = await Promise.all([getPublishedTripsWithDetails(), getSiteSettings()]);
  const maxGroup = settings.bookingPolicy.maxGroupSize || 6;
  const placeList = liveDestinations(trips) || "Karnataka";
  // Each trip's "From" price is the same number its own page shows (lowest open date price).
  const fromByTrip = new Map(trips.map(({ trip, departures }) => [trip.id, tripPriceInfo(trip, departures).fromPaise]));
  const fromPrice = [...fromByTrip.values()].reduce((min, p) => (p > 0 && p < min ? p : min), Infinity);
  const anyPrivate = trips.some(({ trip }) => trip.privateGroupPricePaise);
  const faqs = settings.faqs.filter((f) => f.question.trim() && f.answer.trim()).slice(0, 4);

  const list = tripListJsonLd("Karnataka tour packages from Bangalore", trips);
  const breadcrumb = pageBreadcrumb("Karnataka tour packages", "/karnataka-tour-packages");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(list) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(breadcrumb) }} />
      <PageBanner
        page="karnataka"
        scene="trips"
        width="6xl"
        eyebrow="Tours & trips across Karnataka"
        title="Karnataka tour packages from Bangalore"
        subtitle={
          <>
            {`Small-group tours from Bengaluru to ${placeList}, at most ${maxGroup} travellers in one car.`} {ANY_DAY_LINE}
          </>
        }
      />

      <div>
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 sm:py-12">
          <section className="max-w-3xl space-y-3 text-[1.02rem] leading-relaxed text-ink-900">
            <p>
              {/* One text node per sentence so the Kannada view (kn.json) can match each one whole. */}
              {`${BRAND_NAME} is a Bengaluru tour planner for small-group road trips across Karnataka.`} {ANY_DAY_LINE}{" "}
              {`Every tour starts and ends in Bengaluru and travels in one car with no more than ${maxGroup} people, never a crowded bus.`}
            </p>
            <p>
              Pick a date, choose your exact seat on the live car map and pay by UPI.
              {anyPrivate ? " Travelling as a group? Book the whole car for your own private trip." : ""}
            </p>
          </section>

          <section aria-labelledby="packages-heading" className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="packages-heading" className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
                Tour packages with open dates
              </h2>
              {Number.isFinite(fromPrice) && (
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-copper-700">
                  <IndianRupee className="h-4 w-4" aria-hidden="true" /> From {formatINR(fromPrice)} per seat
                </p>
              )}
            </div>
            {trips.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {trips.map((item) => (
                  <TripCard key={item.trip.id} item={item} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-white/85 p-5 text-stone-600">New trips are being planned. Ask us about your dates below.</p>
            )}
          </section>

          {trips.length > 0 && (
            <section aria-labelledby="places-heading" className="space-y-5">
              <h2 id="places-heading" className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
                Places we travel to from Bangalore
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {trips.map(({ trip }) => {
                  const place = searchName(trip.destination) || trip.destination;
                  const facts = PLACE_FACTS[place.toLowerCase()];
                  return (
                    <article key={trip.id} className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-[var(--shadow-soft)]">
                      <h3 className="font-display text-xl font-semibold text-forest-900">
                        <Link href={`/trips/${trip.slug}`} className="hover:text-copper-700">
                          {place} trip from Bangalore
                        </Link>
                      </h3>
                      <p className="mt-1 text-sm text-stone-600">{trip.tagline}</p>
                      <ul className="mt-3 space-y-1.5 text-sm text-ink-900/85">
                        <li className="flex items-start gap-2">
                          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-copper-700" aria-hidden="true" />
                          <span>
                            {trip.durationDays} {trip.durationDays === 1 ? "day" : "days"}, {trip.durationNights}{" "}
                            {trip.durationNights === 1 ? "night" : "nights"}
                          </span>
                        </li>
                        {facts && (
                          <>
                            <li className="flex items-start gap-2">
                              <Route className="mt-0.5 h-4 w-4 shrink-0 text-copper-700" aria-hidden="true" />
                              <span>
                                Distance from Bengaluru: {facts.distance} ({facts.drive} by road)
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-copper-700" aria-hidden="true" />
                              <span>Best time to visit: {facts.season}</span>
                            </li>
                          </>
                        )}
                        {(fromByTrip.get(trip.id) ?? 0) > 0 && (
                          <li className="flex items-start gap-2">
                            <IndianRupee className="mt-0.5 h-4 w-4 shrink-0 text-copper-700" aria-hidden="true" />
                            <span>From {formatINR(fromByTrip.get(trip.id) ?? 0)} per seat</span>
                          </li>
                        )}
                      </ul>
                      <Link
                        href={`/trips/${trip.slug}#book`}
                        aria-label={`See dates for the ${place} trip`}
                        className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700"
                      >
                        See dates <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section aria-labelledby="why-heading" className="space-y-5">
            <h2 id="why-heading" className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
              Why travellers plan their Karnataka trip with us
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              <li className="flex gap-3 rounded-2xl bg-white/85 p-4">
                <Users className="h-5 w-5 shrink-0 text-copper-700" aria-hidden="true" />
                <span>At most {maxGroup} travellers in one car, never a full bus.</span>
              </li>
              <li className="flex gap-3 rounded-2xl bg-white/85 p-4">
                <Car className="h-5 w-5 shrink-0 text-copper-700" aria-hidden="true" />
                <span>Choose your exact seat on a live map of the car.</span>
              </li>
              <li className="flex gap-3 rounded-2xl bg-white/85 p-4">
                <MapPin className="h-5 w-5 shrink-0 text-copper-700" aria-hidden="true" />
                <span>Pickup and drop in Bengaluru.</span>
              </li>
              <li className="flex gap-3 rounded-2xl bg-white/85 p-4">
                <ShieldCheck className="h-5 w-5 shrink-0 text-copper-700" aria-hidden="true" />
                <span>Pay by UPI straight to us; your booking shows in My Booking.</span>
              </li>
            </ul>
          </section>

          <section aria-labelledby="regions-heading" className="space-y-5">
            <h2 id="regions-heading" className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
              Explore Karnataka by region
            </h2>
            <p className="max-w-3xl text-[1.02rem] leading-relaxed text-ink-900">
              Our guide lists places to visit in every district of Karnataka. For a place without a listed trip, ask us for a custom trip.
            </p>
            <GuideLinks
              links={[
                ...guidePagesOfKind("region").map((r) => ({ href: r.path, label: r.name, count: r.places.length })),
                { href: GUIDE_HUB.path, label: GUIDE_HUB.name },
              ]}
            />
          </section>

          {faqs.length > 0 && (
            <section aria-labelledby="faq-heading" className="space-y-4">
              <h2 id="faq-heading" className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
                Questions before you book
              </h2>
              <div className="space-y-3">
                {faqs.map((faq) => (
                  <details key={faq.id} className="rounded-2xl border border-white/70 bg-white/85 p-4">
                    <summary className="cursor-pointer font-display text-base font-semibold text-forest-900">{faq.question}</summary>
                    <p className="mt-2 text-sm leading-relaxed text-stone-600">{faq.answer}</p>
                  </details>
                ))}
              </div>
              <Link href="/faqs" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700">
                All FAQs <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          )}

          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-5">
            <p className="min-w-0 flex-[1_1_15rem] font-display text-lg font-semibold text-forest-900">Ready for your Karnataka road trip?</p>
            <Link href="/trips" className="btn-sunset inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-center text-sm sm:w-auto">
              See all dates <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/contact" className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-forest-900/20 px-5 py-3 text-sm font-semibold text-forest-900 sm:w-auto">
              Ask us
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
