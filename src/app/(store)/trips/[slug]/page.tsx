import {
  AlertTriangle,
  Backpack,
  Check,
  Clock,
  MapPin,
  Shield,
  XCircle,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingWidget } from "@/components/BookingWidget";
import { EnquiryForm } from "@/components/EnquiryForm";
import { WhatsAppChannelCta } from "@/components/WhatsAppChannelCta";
import { PromoBanner } from "@/components/promo/PromoBanner";
import { TripGallery } from "@/components/TripGallery";
import { TripVideos } from "@/components/TripVideos";
import { forPlacement, getLivePromotions } from "@/lib/data/promotions";
import { formatINR } from "@/lib/currency";
import {
  getDepartureSeatMap,
  getPublishedTripBySlug,
  getPublishedTripsWithDetails,
  getSiteSettings,
} from "@/lib/data/repository";
import { themeClass } from "@/lib/destination-theme";
import { getDestinationWeather } from "@/lib/weather-server";

// Served from the CDN; refreshed every 30 s and immediately after bookings / admin edits.
export const revalidate = 30;

export async function generateStaticParams() {
  const { trips } = await getPublishedTripsWithDetails();
  return trips.map((t) => ({ slug: t.trip.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { item } = await getPublishedTripBySlug(slug);
  if (!item) return { title: "Trip Not Found" };

  return {
    title: item.trip.title,
    description: item.trip.tagline,
    openGraph: {
      title: item.trip.title,
      description: item.trip.tagline,
      images: [item.trip.heroImageUrl],
    },
  };
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [{ item }, { settings }, promotions] = await Promise.all([
    getPublishedTripBySlug(slug),
    getSiteSettings(),
    getLivePromotions(),
  ]);

  if (!item) {
    notFound();
  }

  const { trip, itinerary, pickupPoints, departures } = item;
  const theme = themeClass(trip.slug, trip.destination, trip.region);

  // Built into the page (refreshed with it every 30 s and after each booking): the car seat map
  // and the live weather are on screen at once, then re-checked quietly in the browser.
  const openDeps = departures.filter((d) => d.status !== "cancelled" && d.status !== "completed");
  const [seatPairs, weather] = await Promise.all([
    Promise.all(openDeps.map(async (d) => [d.departureId, await getDepartureSeatMap(d.departureId)] as const)),
    getDestinationWeather(trip.slug, trip.region, { timeoutMs: 2500, destination: trip.destination }),
  ]);
  const initialSeatMaps = Object.fromEntries(seatPairs);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: trip.title,
    description: trip.summary,
    touristType: "Small-group road trip (max 6 travelers)",
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: (trip.basePricePaise / 100).toFixed(0),
    },
  };

  return (
    <div className={`${theme} mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
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
        {/* Left: Editorial Overview, Gallery, Itinerary, Policies */}
        <div className="space-y-10 lg:col-span-7">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-copper-700">
              <span className="th-chip rounded-full px-2.5 py-0.5">{trip.region}</span>
              <span>
                {trip.durationDays}D / {trip.durationNights}N
              </span>
              <span>•</span>
              <span>{trip.difficulty}</span>
            </div>
            <h1 className="th-text font-display text-3xl font-semibold sm:text-4xl">
              {trip.title}
            </h1>
            <p className="text-base leading-relaxed text-stone-600">{trip.summary}</p>
          </div>

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

          {/* Key Facts */}
          <dl className="grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-4">
            <div className="tile tile-lagoon">
              <dt className="text-ink-900/70">Max group</dt>
              <dd className="tile-num mt-0.5 text-sm font-bold">6 travelers</dd>
            </div>
            <div className="tile tile-leaf">
              <dt className="text-ink-900/70">Start / end</dt>
              <dd className="tile-num mt-0.5 text-sm font-bold">{trip.pickupCity}</dd>
            </div>
            <div className="tile tile-sunset">
              <dt className="text-ink-900/70">Batch rate</dt>
              <dd className="tile-num mt-0.5 text-sm font-bold">
                {formatINR(trip.basePricePaise)} / seat
              </dd>
            </div>
            <div className="tile tile-amber">
              <dt className="text-ink-900/70">Private 6-seat</dt>
              <dd className="tile-num mt-0.5 text-sm font-bold">
                {trip.privateGroupPricePaise
                  ? formatINR(trip.privateGroupPricePaise)
                  : `${trip.privateDiscountPercent}% off`}
              </dd>
            </div>
          </dl>

          {/* Day-by-day Itinerary */}
          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-forest-900">
              Day-by-Day Itinerary &amp; Travel Buffers
            </h2>
            <ol className="relative space-y-3 border-l-2 border-dashed border-stone-300 pl-5 ml-1.5">
              {itinerary.map((day) => (
                <li key={day.id} className="card-theme relative space-y-2 overflow-visible p-4 pt-5">
                  <span
                    aria-hidden="true"
                    className="th-dot absolute top-5 -left-[1.69rem] h-3.5 w-3.5 rounded-full ring-4 ring-cream-100"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="th-text font-display text-lg font-semibold">
                      Day {day.dayNumber}: {day.title}
                    </h3>
                    {day.driveTimeEstimate && (
                      <span className="th-chip inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {day.driveTimeEstimate}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-stone-600">{day.description}</p>
                  <div className="flex flex-wrap gap-4 pt-1 text-xs text-stone-600">
                    {day.travelBufferNotes && (
                      <span>
                        <strong className="text-ink-900">Buffer:</strong> {day.travelBufferNotes}
                      </span>
                    )}
                    {day.mealsIncluded && (
                      <span>
                        <strong className="text-ink-900">Meals:</strong> {day.mealsIncluded}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Pickup Points */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl font-semibold text-forest-900">
              Bengaluru Pickup Hubs
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {pickupPoints.map((hub) => (
                <div key={hub.id} className="sec-route space-y-1 rounded-2xl border border-stone-200 p-4 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold text-forest-900">
                    <MapPin className="h-4 w-4 text-copper-600" aria-hidden="true" />
                    {hub.name}
                  </p>
                  <p className="text-xs text-stone-600">
                    {hub.area} • {hub.pickupTimeLabel}
                  </p>
                  <p className="text-[11px] font-medium text-copper-700">
                    {hub.isConfirmed
                      ? "Confirmed pickup point"
                      : "Tentative hub — final pin & timing confirmed before departure"}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Inclusions / Exclusions */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="tile tile-leaf space-y-2.5 p-4">
              <h3 className="font-display text-lg font-semibold text-forest-900">Inclusions</h3>
              <ul className="space-y-2 text-xs leading-relaxed text-ink-900">
                {trip.inclusions.map((inc, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
                    <span>{inc}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="tile tile-rose space-y-2.5 p-4">
              <h3 className="font-display text-lg font-semibold text-forest-900">Exclusions</h3>
              <ul className="space-y-2 text-xs leading-relaxed text-stone-600">
                {trip.exclusions.map((exc, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 shrink-0 text-stone-600" aria-hidden="true" />
                    <span>{exc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Accommodation, Packing, Safety, Accessibility, Cancellation */}
          <section className="sec-kolam space-y-4 rounded-2xl border border-stone-200 p-5 text-sm">
            <div>
              <h3 className="font-display text-lg font-semibold text-forest-900">
                Accommodation &amp; Room Allocation
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">
                {trip.accommodationNotes}
              </p>
            </div>

            <div>
              <h3 className="flex items-center gap-1.5 font-display text-lg font-semibold text-forest-900">
                <Backpack className="h-4 w-4 text-copper-600" aria-hidden="true" />
                Packing Guidance
              </h3>
              <ul className="mt-1.5 list-disc pl-5 text-xs space-y-1 text-stone-600">
                {trip.packingList.map((p, idx) => (
                  <li key={idx}>{p}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="flex items-center gap-1.5 font-display text-lg font-semibold text-forest-900">
                <Shield className="h-4 w-4 text-forest-700" aria-hidden="true" />
                Safety &amp; Accessibility Notes
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">{trip.safetyNotes}</p>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">
                <strong>Accessibility:</strong> {trip.accessibilityNotes}
              </p>
            </div>

            <div className="border-t border-stone-200 pt-3">
              <h3 className="font-display text-base font-semibold text-forest-900">
                Draft Cancellation &amp; Reschedule Slabs
              </h3>
              <ul className="mt-1.5 space-y-1 text-xs text-stone-600">
                {settings.bookingPolicy.cancellationSlabs.map((slab) => (
                  <li key={slab.label}>
                    <strong>{slab.label}:</strong> {slab.refundNote}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {/* Right: Sticky Seat Selection & Checkout */}
        <aside id="book" className="scroll-mt-24 lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            <BookingWidget
              trip={trip}
              departures={departures}
              pickupPoints={pickupPoints}
              bookingPolicy={settings.bookingPolicy}
              initialSeatMaps={initialSeatMaps}
            />
          </div>
        </aside>
      </div>

      <div id="ask" className="mx-auto mt-14 max-w-2xl scroll-mt-24 space-y-4">
        {settings.socialLinks.whatsappChannelUrl && (
          <WhatsAppChannelCta href={settings.socialLinks.whatsappChannelUrl} context="trip" />
        )}
        <EnquiryForm tripId={trip.id} tripTitle={trip.title} />
      </div>
    </div>
  );
}

