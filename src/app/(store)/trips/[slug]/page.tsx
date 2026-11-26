import {
  Accessibility,
  AlertTriangle,
  Armchair,
  ArrowRight,
  Backpack,
  BedDouble,
  CalendarDays,
  Check,
  Clock,
  MapPin,
  Mountain,
  Navigation,
  ShieldCheck,
  Sparkles,
  Users,
  Utensils,
  XCircle,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { BookingWidget } from "@/components/BookingWidget";
import { EnquiryForm } from "@/components/EnquiryForm";
import { WhatsAppChannelCta } from "@/components/WhatsAppChannelCta";
import { PromoBanner } from "@/components/promo/PromoBanner";
import { TripGallery } from "@/components/TripGallery";
import { TripVideos } from "@/components/TripVideos";
import { TripBookBar } from "@/components/MobileBar";
import { NotifyMe } from "@/components/NotifyMe";
import { TrackView } from "@/components/analytics/TrackView";
import { rupees, tripItem } from "@/lib/analytics";
import { forPlacement, getLivePromotions } from "@/lib/data/promotions";
import { advanceTerms, calculateBookingPricing, formatINR } from "@/lib/currency";
import { buildClickToWhatsAppUrl } from "@/lib/messaging/provider";
import { formatTripDates, formatTripDay, formatTripLength } from "@/lib/trip-dates";
import { nextOpenDeparture, seatSummary, wholeCarOpen, wholeCarPricePaise } from "@/lib/trip-facts";
import {
  getDepartureSeatMap,
  getPublishedTripBySlug,
  getPublishedTripsWithDetails,
  getSiteSettings,
} from "@/lib/data/repository";
import { themeClass } from "@/lib/destination-theme";
import { getDestinationWeather } from "@/lib/weather-server";
import { isSupabaseConfigured } from "@/lib/env";
import { decideMovedTrip, demoRenderWouldMislead } from "@/lib/trip-slugs";
import {
  breadcrumbJsonLd,
  jsonLdText,
  pageMetadata,
  sameTripSlug,
  tripImageAlt,
  tripJsonLd,
  tripOgTitle,
  tripPriceInfo,
  tripSeoDescription,
  tripSeoTitle,
  tripStaticSlugs,
} from "@/lib/seo";
import { visiblePosts } from "@/lib/blog";

// Served from the CDN; rebuilt at most every 5 minutes, and immediately after bookings / admin edits
// (lib/revalidate.ts). Not more often: every rebuild is a paid write on the host and a database read.
export const revalidate = 300;

/** Live trips, plus the old/new form of a renamed trip's address (lib/trip-slugs.ts), so both resolve. */
export async function generateStaticParams() {
  const { trips } = await getPublishedTripsWithDetails();
  return tripStaticSlugs(trips.map((t) => t.trip.slug)).map((slug) => ({ slug }));
}

/** Thrown instead of rendering from demo data: the CDN keeps serving the last good page. */
class TripDataUnavailableError extends Error {
  constructor(slug: string) {
    super(`Trip data unavailable for /trips/${slug} (database failed); keeping the last good page.`);
  }
}

/**
 * A slug that is not a live trip: an old address 308-redirects for good to the renamed trip, a
 * new address used before the rename 307-redirects for now to the old one, anything else is 404.
 * Called by generateMetadata and the page, so the redirect wins however the page is rendered.
 * Never decided from demo trips (lib/trip-slugs.ts decideMovedTrip): a failed database read throws.
 */
async function redirectMovedTrip(slug: string): Promise<void> {
  const { trips, isDemoFallback } = await getPublishedTripsWithDetails();
  const next = decideMovedTrip(slug, {
    liveSlugs: trips.map((t) => t.trip.slug),
    isDemoFallback,
    databaseConfigured: isSupabaseConfigured(),
  });
  if (next.kind === "data-unavailable") throw new TripDataUnavailableError(slug);
  if (next.kind === "permanent") permanentRedirect(`/trips/${next.to}`);
  if (next.kind === "temporary") redirect(`/trips/${next.to}`);
  // A trip taken off the site whose address Google still shows: send visitors to the guide page
  // for that place instead of a 404. Reached only while no live trip has this slug.
  const retiredTo = next.kind === "missing" ? RETIRED_TRIP_PAGES[slug] : undefined;
  if (retiredTo) permanentRedirect(retiredTo);
}

/** Old trip addresses that still get Google clicks (Search Console, 26 Nov 2026) → closest guide page. */
const RETIRED_TRIP_PAGES: Readonly<Record<string, string>> = {
  "hampi-boulders-and-ruins": "/karnataka/vijayanagara",
};

/** A renamed trip's address is never rendered from demo data (it would cache a 200 there). */
function refuseMisleadingDemo(slug: string, isDemoFallback: boolean): void {
  if (demoRenderWouldMislead(slug, { isDemoFallback, databaseConfigured: isSupabaseConfigured() })) {
    throw new TripDataUnavailableError(slug);
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [{ item, isDemoFallback }, { trips }, { settings }] = await Promise.all([
    getPublishedTripBySlug(slug),
    getPublishedTripsWithDetails(),
    getSiteSettings(),
  ]);
  if (!item) {
    await redirectMovedTrip(slug);
    return { title: "Trip Not Found", robots: { index: false } };
  }
  refuseMisleadingDemo(slug, isDemoFallback);

  const { trip } = item;
  // Words people actually search ("Coorg Trip from Bangalore – 3D/2N"), with the same "From"
  // price the page, the cards and the structured data show.
  const price = tripPriceInfo(trip, item.departures);
  // The itinerary's day count guards the days/nights figure (owner fact F1): on a mismatch the
  // title and description leave the figure out rather than print a disputed one.
  const itineraryDays = item.itinerary.length;
  const description = tripSeoDescription(trip, price.fromPaise, settings.bookingPolicy.maxGroupSize || 6, itineraryDays);
  return pageMetadata({
    title: tripSeoTitle(trip, trips.map((t) => t.trip), itineraryDays),
    description,
    path: `/trips/${trip.slug}`,
    ogTitle: tripOgTitle(trip),
    ogDescription: trip.tagline || description,
    image: trip.heroImageUrl ? { url: trip.heroImageUrl, alt: tripImageAlt(trip) } : undefined,
  });
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [{ item, isDemoFallback }, { settings }, promotions, { trips: allTrips }] = await Promise.all([
    getPublishedTripBySlug(slug),
    getSiteSettings(),
    getLivePromotions(),
    getPublishedTripsWithDetails(),
  ]);

  if (!item) {
    await redirectMovedTrip(slug);
    notFound();
  }
  refuseMisleadingDemo(slug, isDemoFallback);

  const { trip, itinerary, pickupPoints, departures } = item;
  const theme = themeClass(trip.slug, trip.destination, trip.region);

  // Built into the page (refreshed with it, at most every 5 minutes and after each booking): the car seat map
  // and the live weather are on screen at once, then re-checked quietly in the browser.
  const openDeps = departures.filter((d) => d.status !== "cancelled" && d.status !== "completed");
  const [seatPairs, weather] = await Promise.all([
    Promise.all(openDeps.map(async (d) => [d.departureId, await getDepartureSeatMap(d.departureId)] as const)),
    getDestinationWeather(trip.slug, trip.region, { timeoutMs: 2500, destination: trip.destination }),
  ]);
  const initialSeatMaps = Object.fromEntries(seatPairs);

  // Earliest date a visitor can still book: the same one the trip cards, the home page and the
  // booking box pick (lib/trip-facts), so the date, seats and price never differ between them.
  const nextOpen = nextOpenDeparture(departures);
  // The lowest price of a date a visitor can book now (the trip price only when no date is open).
  // The same number goes into the search snippet, the structured data and the trip cards.
  const price = tripPriceInfo(trip, departures);
  const fromPaise = price.fromPaise;
  const nextDates = nextOpen ? formatTripDates(nextOpen.startDate, nextOpen.endDate, { weekday: true }) : null;
  // The whole car on that date, priced exactly as the booking box and the server price it.
  const wholeCarPaise = nextOpen && wholeCarOpen(nextOpen) ? wholeCarPricePaise(trip, nextOpen, settings.bookingPolicy) : null;
  // What reserving one seat on that date costs now, when the date offers an advance.
  const nextAdvance = (() => {
    if (!nextOpen) return null;
    const terms = advanceTerms({
      tripDepositPercent: trip.depositPercent,
      tripBalanceDueDaysBefore: trip.balanceDueDaysBefore,
      bookingPolicy: settings.bookingPolicy,
      startDate: nextOpen.startDate,
    });
    if (!terms.available || !terms.balanceDueDate) return null;
    const one = calculateBookingPricing({
      trip,
      priceOverridePaise: nextOpen.priceOverridePaise,
      bookingMode: "batch_seats",
      seatsRequested: 1,
      payDepositOnly: true,
      bookingPolicy: settings.bookingPolicy,
    });
    return one.balanceLaterPaise > 0 ? { payNowPaise: one.payNowPaise, balancePaise: one.balanceLaterPaise, by: formatTripDay(terms.balanceDueDate) } : null;
  })();
  const chatText = `Hi Sanchari team, I have a question about the ${trip.title} trip.`;
  const whatsappUrl = settings.socialLinks.whatsappNumber
    ? `https://wa.me/${settings.socialLinks.whatsappNumber}?text=${encodeURIComponent(chatText)}`
    : buildClickToWhatsAppUrl(chatText);

  const structuredData = tripJsonLd(item, price);

  // Internal links: the other trips, and the stories told about this one (Admin → Blog → trip).
  const otherTrips = allTrips.filter((t) => t.trip.id !== trip.id);
  const stories = visiblePosts(settings.blogPosts ?? []).filter((p) => sameTripSlug(p.tripSlug, trip.slug));
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Trips", path: "/trips" },
    { name: trip.title, path: `/trips/${trip.slug}` },
  ]);

  return (
    <div className={`${theme} mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(structuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(breadcrumb) }} />
      <TrackView
        name="view_trip"
        params={{
          currency: "INR",
          value: rupees(fromPaise),
          has_open_date: Boolean(nextOpen),
          items: [tripItem({ slug: trip.slug, title: trip.title, destination: trip.destination, pricePaise: fromPaise })],
        }}
      />

      <nav aria-label="Breadcrumb" className="mb-5 text-xs text-stone-600">
        <Link href="/trips" className="hover:text-forest-900 underline">
          Trips
        </Link>{" "}
        / <span className="text-ink-900 font-medium">{trip.title}</span>
      </nav>

      {trip.isSampleDemo && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-saffron-500/40 bg-saffron-500/10 p-3.5 text-xs text-ink-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-copper-700 mt-0.5" aria-hidden="true" />
          <p>
            <strong>Sample / Draft Itinerary:</strong> Route details, pricing, pickup timings, and
            policies below are pre-launch sample values awaiting owner verification in the Admin
            panel.
          </p>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-12">
        {/* Left: the story of the trip, then the practical details */}
        <div className="space-y-10 lg:col-span-7">
          <header className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="th-chip rounded-full px-3 py-1 tracking-wider uppercase">{trip.region}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-forest-900 ring-1 ring-stone-200">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> {formatTripLength(trip.durationDays, trip.durationNights)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-forest-900 ring-1 ring-stone-200">
                <Mountain className="h-3.5 w-3.5" aria-hidden="true" /> {trip.difficulty}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-forest-900 ring-1 ring-stone-200">
                <Users className="h-3.5 w-3.5" aria-hidden="true" /> Max 6 per car
              </span>
            </div>
            <h1 className="th-text font-display text-[2rem] leading-[1.1] font-semibold sm:text-5xl">{trip.title}</h1>
            {trip.tagline && <p className="font-display text-lg leading-snug text-copper-700 italic sm:text-xl">{trip.tagline}</p>}
            {trip.summary && <p className="text-base leading-relaxed text-ink-900/80 sm:text-[1.05rem]">{trip.summary}</p>}

            {/* Price and next date at a glance (the full booking box is below / on the right) */}
            <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[var(--shadow-soft)]">
              <div className="min-w-0 flex-[1_1_12rem]">
                <p className="text-[11px] font-bold tracking-wider text-stone-600 uppercase">From</p>
                <p className="font-display text-2xl font-semibold text-forest-900">
                  {formatINR(fromPaise)} <span className="text-sm font-normal text-stone-600">per seat</span>
                </p>
                {nextOpen && nextDates ? (
                  <ul className="mt-1 space-y-0.5 text-sm text-ink-900/80">
                    <li className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold text-ink-900">{nextDates}</span>
                      <span className={seatSummary(nextOpen).tone === "few" ? "font-semibold text-copper-700" : "text-forest-700"}>{seatSummary(nextOpen).label}</span>
                    </li>
                    {nextAdvance && <li>{`Reserve with ${formatINR(nextAdvance.payNowPaise)} now, balance ${formatINR(nextAdvance.balancePaise)} by ${nextAdvance.by}`}</li>}
                    {wholeCarPaise !== null && <li>{`Whole car for your group: ${formatINR(wholeCarPaise)}`}</li>}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-ink-900/80">New dates are being planned. Ask to be told first.</p>
                )}
              </div>
              {nextOpen ? (
                <a href="#book" className="btn-sunset inline-flex min-h-12 w-full items-center justify-center gap-2 px-5 text-sm sm:w-auto">
                  Book your seat <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              ) : (
                <a href="#ask" className="btn-ocean inline-flex min-h-12 w-full items-center justify-center gap-2 px-5 text-sm sm:w-auto">
                  Notify me of new dates <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </div>
          </header>

          {/* Photo gallery: tap any photo to open it full screen */}
          <TripGallery
            title={trip.title}
            destination={trip.destination}
            slug={trip.slug}
            region={trip.region}
            heroUrl={trip.heroImageUrl}
            galleryUrls={trip.galleryUrls}
            weather={weather}
          />

          <TripVideos videos={trip.videoLinks} title={trip.title} />

          {forPlacement(promotions, "trip_page", trip.id).length > 0 && (
            <PromoBanner promotions={forPlacement(promotions, "trip_page", trip.id)} />
          )}

          {/* Why this trip works: the facts that make a small-group trip different */}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { Icon: Users, label: "Group size", value: "6 travellers" },
              { Icon: Navigation, label: "Starts & ends", value: trip.pickupCity },
              { Icon: Armchair, label: "Your seat", value: "Pick it on the car map" },
              { Icon: Sparkles, label: "The vibe", value: trip.vibe || trip.region },
            ].map(({ Icon, label, value }) => (
              <div key={label} className="rounded-2xl border border-white/70 bg-white/85 p-3.5 shadow-[var(--shadow-soft)]">
                <Icon className="h-5 w-5 text-copper-700" aria-hidden="true" />
                <dt className="mt-2 text-[11px] font-bold tracking-wider text-stone-600 uppercase">{label}</dt>
                <dd className="mt-0.5 text-sm leading-snug font-semibold text-forest-900">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Day-by-day plan */}
          {itinerary.length > 0 && (
            <section className="space-y-5" aria-labelledby="plan-heading">
              <div>
                <p className="eyebrow">Your trip, hour by hour</p>
                <h2 id="plan-heading" className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
                  Day-by-day plan
                </h2>
              </div>
              <ol className="relative space-y-4">
                <span aria-hidden="true" className="absolute top-2 bottom-2 left-[1.15rem] w-0.5 rounded-full bg-gradient-to-b from-copper-600/60 via-lagoon-500/40 to-forest-900/30" />
                {itinerary.map((day) => (
                  <li key={day.id} className="relative flex gap-4">
                    <span
                      aria-hidden="true"
                      className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-900 font-display text-base font-semibold text-white shadow-[0_8px_20px_-8px_rgb(13_95_107/0.7)] ring-4 ring-cream-100"
                    >
                      {day.dayNumber}
                    </span>
                    <div className="card-theme min-w-0 flex-1 space-y-2.5 p-4 sm:p-5">
                      <p className="text-[11px] font-bold tracking-wider text-copper-700 uppercase">Day {day.dayNumber}</p>
                      <h3 className="th-text font-display text-lg leading-snug font-semibold sm:text-xl">{day.title}</h3>
                      {day.description && <p className="text-sm leading-relaxed text-ink-900/80">{day.description}</p>}
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {day.driveTimeEstimate && (
                          <span className="th-chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {day.driveTimeEstimate}
                          </span>
                        )}
                        {day.mealsIncluded && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-peach-100 px-2.5 py-1 text-xs font-medium text-copper-700">
                            <Utensils className="h-3.5 w-3.5" aria-hidden="true" /> {day.mealsIncluded}
                          </span>
                        )}
                      </div>
                      {day.travelBufferNotes && <p className="text-xs leading-relaxed text-stone-600">{day.travelBufferNotes}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Included / not included */}
          {(trip.inclusions.length > 0 || trip.exclusions.length > 0) && (
            <section className="grid gap-4 sm:grid-cols-2" aria-label="What the price includes">
              <div className="space-y-3 rounded-3xl border border-forest-700/15 bg-gradient-to-br from-[#e9f6f1] to-white p-5 shadow-[var(--shadow-soft)]">
                <h2 className="font-display text-xl font-semibold text-forest-900">Included</h2>
                <ul className="space-y-2.5 text-sm leading-relaxed text-ink-900">
                  {trip.inclusions.map((inc, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest-700 text-white">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span>{inc}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3 rounded-3xl border border-stone-200 bg-white/85 p-5 shadow-[var(--shadow-soft)]">
                <h2 className="font-display text-xl font-semibold text-forest-900">Not included</h2>
                <ul className="space-y-2.5 text-sm leading-relaxed text-ink-900/75">
                  {trip.exclusions.map((exc, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-stone-600" aria-hidden="true" />
                      <span>{exc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Bengaluru pickup points */}
          {pickupPoints.length > 0 && (
            <section className="space-y-4" aria-labelledby="pickup-heading">
              <h2 id="pickup-heading" className="font-display text-2xl font-semibold text-forest-900">
                Pickup points in Bengaluru
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {pickupPoints.map((hub) => (
                  <div key={hub.id} className="space-y-1.5 rounded-2xl border border-white/70 bg-white/90 p-4 text-sm shadow-[var(--shadow-soft)]">
                    <p className="flex items-center gap-1.5 font-semibold text-forest-900">
                      <MapPin className="h-4 w-4 shrink-0 text-copper-700" aria-hidden="true" />
                      {hub.name}
                    </p>
                    <p className="text-xs text-stone-600">
                      {hub.area} · {hub.pickupTimeLabel}
                    </p>
                    <p className="text-[11px] font-medium text-forest-700">
                      {hub.isConfirmed ? "Confirmed pickup point" : "Exact pin & time shared before departure"}
                    </p>
                    {hub.mapsUrl && /^https:\/\//i.test(hub.mapsUrl) && (
                      <a href={hub.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-copper-700 hover:underline">
                        Open in Maps <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Practical details */}
          <section className="space-y-4" aria-labelledby="good-to-know">
            <h2 id="good-to-know" className="font-display text-2xl font-semibold text-forest-900">
              Good to know
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {trip.accommodationNotes && (
                <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[var(--shadow-soft)]">
                  <p className="flex items-center gap-2 font-display text-lg font-semibold text-forest-900">
                    <BedDouble className="h-5 w-5 text-copper-700" aria-hidden="true" /> Stay
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-900/75">{trip.accommodationNotes}</p>
                </div>
              )}
              {trip.safetyNotes && (
                <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[var(--shadow-soft)]">
                  <p className="flex items-center gap-2 font-display text-lg font-semibold text-forest-900">
                    <ShieldCheck className="h-5 w-5 text-forest-700" aria-hidden="true" /> Safety
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-900/75">{trip.safetyNotes}</p>
                </div>
              )}
              {trip.packingList.length > 0 && (
                <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[var(--shadow-soft)]">
                  <p className="flex items-center gap-2 font-display text-lg font-semibold text-forest-900">
                    <Backpack className="h-5 w-5 text-copper-700" aria-hidden="true" /> What to pack
                  </p>
                  <ul className="mt-1.5 space-y-1 text-sm text-ink-900/75">
                    {trip.packingList.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {trip.accessibilityNotes && (
                <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[var(--shadow-soft)]">
                  <p className="flex items-center gap-2 font-display text-lg font-semibold text-forest-900">
                    <Accessibility className="h-5 w-5 text-forest-700" aria-hidden="true" /> Walking &amp; access
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-900/75">{trip.accessibilityNotes}</p>
                </div>
              )}
            </div>
            {settings.bookingPolicy.cancellationSlabs.length > 0 && (
              <div className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                <p className="font-display text-base font-semibold text-forest-900">
                  Cancellation &amp; reschedule{settings.legalDrafts.ownerReviewRequired ? " (draft)" : ""}
                </p>
                <ul className="mt-1.5 space-y-1 text-sm text-ink-900/75">
                  {settings.bookingPolicy.cancellationSlabs.map((slab) => (
                    <li key={slab.label}>
                      <strong className="text-ink-900">{slab.label}:</strong> {slab.refundNote}
                    </li>
                  ))}
                </ul>
                <Link href="/policies#refunds" className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-copper-700 hover:underline">
                  Full refund policy <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            )}
          </section>
        </div>

        {/* Right: Sticky Seat Selection & Checkout */}
        <aside id="book" className="scroll-mt-24 lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            <BookingWidget
              trip={trip}
              departures={departures}
              bookingPolicy={settings.bookingPolicy}
              initialSeatMaps={initialSeatMaps}
              termsAreDraft={settings.legalDrafts.ownerReviewRequired}
            />
          </div>
        </aside>
      </div>

      <TripBookBar
        whatsappUrl={whatsappUrl ?? null}
        priceLabel={`From ${formatINR(fromPaise)}`}
        dateLabel={nextOpen ? formatTripDates(nextOpen.startDate, nextOpen.endDate) : null}
        canBook={Boolean(nextOpen)}
      />

      {(otherTrips.length > 0 || stories.length > 0) && (
        <div className="mt-14 grid gap-8 md:grid-cols-2">
          {otherTrips.length > 0 && (
            <section aria-labelledby="other-trips" className="space-y-3">
              <h2 id="other-trips" className="font-display text-2xl font-semibold text-forest-900">
                Other trips from Bangalore
              </h2>
              <ul className="space-y-2">
                {otherTrips.map(({ trip: other }) => (
                  <li key={other.id}>
                    <Link href={`/trips/${other.slug}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700">
                      {other.title} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {stories.length > 0 && (
            <section aria-labelledby="trip-stories" className="space-y-3">
              <h2 id="trip-stories" className="font-display text-2xl font-semibold text-forest-900">
                Stories from this trip
              </h2>
              <ul className="space-y-2">
                {stories.map((post) => (
                  <li key={post.id}>
                    <Link href={`/blog/${post.id}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700">
                      {post.title} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <div id="ask" className="mx-auto mt-14 max-w-2xl scroll-mt-24 space-y-4">
        {/* No date open: two boxes to be told first, instead of a booking button that leads nowhere. */}
        {!nextOpen && (
          <div className="card-theme space-y-2 p-5 pt-6">
            <h2 className="font-display text-xl font-semibold text-forest-900">Be the first to know the next date</h2>
            <p className="text-sm text-ink-900/80">{`Leave your WhatsApp number and we message you when ${trip.title} gets a new date.`}</p>
            <NotifyMe tripId={trip.id} tripTitle={trip.title} tripSlug={trip.slug} />
          </div>
        )}
        {settings.socialLinks.whatsappChannelUrl && (
          <WhatsAppChannelCta href={settings.socialLinks.whatsappChannelUrl} context="trip" />
        )}
        <EnquiryForm tripId={trip.id} tripTitle={trip.title} />
      </div>
    </div>
  );
}

