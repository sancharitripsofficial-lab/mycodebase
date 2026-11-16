import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarHeart, Route, Users } from "lucide-react";
import { PageBanner } from "@/components/banners/PageBanner";
import { EnquiryForm } from "@/components/EnquiryForm";
import { guideH2 } from "@/components/guide/GuideParts";
import { getPublishedTripsWithDetails, getSiteSettings } from "@/lib/data/repository";
import { isBookable } from "@/lib/departure-rules";
import { GUIDE_HUB } from "@/lib/places/guide";
import { BRAND_NAME, PAGE_SEO, jsonLdText, pageBreadcrumb, pageMetadata } from "@/lib/seo";

// Which dates still have the whole car free changes with every booking.
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: PAGE_SEO.privateCar.title,
  description: PAGE_SEO.privateCar.description,
  path: PAGE_SEO.privateCar.path,
});

/** "Fri, 4 Dec 2026" from an ISO date (read at noon UTC so the day never shifts). */
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The whole 6-seat car for one group. Two true ways only: a listed date on which no seat is sold
 * yet (booked on the trip page), or a request for the traveller's own dates, which the team
 * answers on WhatsApp. Nothing here is an instant booking for any date.
 */
export default async function PrivateCarTripsPage() {
  const [{ trips }, { settings }] = await Promise.all([getPublishedTripsWithDetails(), getSiteSettings()]);
  const maxGroup = settings.bookingPolicy.maxGroupSize || 6;
  // Same rule as the trip cards and the "Private 6-seat" filter: the date can be booked and nobody has a seat on it yet.
  const openCars = trips.flatMap(({ trip, departures }) =>
    departures
      .filter((d) => isBookable(d) && d.seatsTaken === 0 && d.status !== "cancelled" && d.status !== "completed")
      .map((d) => ({ trip, departure: d })),
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(pageBreadcrumb("Private car trips", PAGE_SEO.privateCar.path)) }} />
      <PageBanner
        page="trips"
        scene="trips"
        width="6xl"
        eyebrow="Your group, the whole car"
        title="Private 6-seat car trips from Bangalore"
        subtitle={`All ${maxGroup} seats for your family or friends: on a listed date, or on your own dates on request.`}
      />

      <div>
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 sm:py-12">
          <section className="max-w-3xl space-y-3 text-[1.02rem] leading-relaxed text-ink-900">
            <p>
              {`Every ${BRAND_NAME} trip travels in one car with at most ${maxGroup} travellers.`} You can join others on a scheduled date, or keep
              the whole car for your own group.
            </p>
          </section>

          <section aria-labelledby="listed-heading" className="space-y-5">
            <h2 id="listed-heading" className={guideH2}>
              1. Book the whole car on a listed date
            </h2>
            <p className="max-w-3xl text-[1.02rem] leading-relaxed text-ink-900">
              A date can be booked as a private car while all {maxGroup} seats on it are still open. Open the trip, choose the date and select
              “Private 6-Seat Vehicle” on the booking form.
            </p>
            {openCars.length > 0 ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {openCars.map(({ trip, departure }) => (
                  <li key={departure.departureId} className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[var(--shadow-soft)]">
                    <h3 className="font-display text-lg font-semibold text-forest-900">
                      <Link href={`/trips/${trip.slug}#book`} className="hover:text-copper-700">
                        {trip.title}
                      </Link>
                    </h3>
                    <p className="mt-1 text-sm text-ink-900/85">
                      {dayLabel(departure.startDate)} to {dayLabel(departure.endDate)} · all {departure.maxCapacity} seats open
                    </p>
                    <Link
                      href={`/trips/${trip.slug}#book`}
                      aria-label={`See ${trip.title} starting ${dayLabel(departure.startDate)}`}
                      className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700"
                    >
                      See this date <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="max-w-3xl rounded-2xl bg-white/85 p-5 text-stone-600">
                No listed date has the whole car free right now. Ask for your own dates below.
              </p>
            )}
            <Link href="/trips?mode=private" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700">
              Trips with a private car available <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          <section aria-labelledby="ask-heading" className="space-y-5">
            <h2 id="ask-heading" className={guideH2}>
              2. Ask for your own dates
            </h2>
            <ul className="grid gap-4 sm:grid-cols-3">
              <li className="flex gap-3 rounded-2xl bg-white/85 p-4">
                <CalendarHeart className="h-5 w-5 shrink-0 text-copper-700" aria-hidden="true" />
                <span>Private car on a date we do not list: your group, your date, the whole car.</span>
              </li>
              <li className="flex gap-3 rounded-2xl bg-white/85 p-4">
                <Route className="h-5 w-5 shrink-0 text-copper-700" aria-hidden="true" />
                <span>
                  A custom trip to a place we do not run yet. See{" "}
                  <Link href={GUIDE_HUB.path} className="font-semibold text-forest-900 underline decoration-copper-600/50 underline-offset-2 hover:text-copper-700">
                    places to visit in Karnataka
                  </Link>
                  .
                </span>
              </li>
              <li className="flex gap-3 rounded-2xl bg-white/85 p-4">
                <Users className="h-5 w-5 shrink-0 text-copper-700" aria-hidden="true" />
                <span>A bigger group: an office, a college batch or a family of 7 or more.</span>
              </li>
            </ul>
            <p className="max-w-3xl text-[1.02rem] leading-relaxed text-ink-900">
              These are requests, not instant bookings. Send the form and a real person replies on WhatsApp with dates and a price. Asking costs
              nothing.
            </p>
            <div id="plan" className="max-w-3xl scroll-mt-24">
              <EnquiryForm defaultKind="private_date" />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
