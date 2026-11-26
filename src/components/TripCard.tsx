import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { LivingPhoto } from "@/components/living/LivingPhoto";
import type { LiveWeather } from "@/components/living/weather";
import { NotifyMe } from "@/components/NotifyMe";
import { TripCardVideo } from "@/components/TripCardVideo";
import { formatINR } from "@/lib/currency";
import { themeClass } from "@/lib/destination-theme";
import { classifyVideoLink } from "@/lib/media";
import { formatTripDates, formatTripLength } from "@/lib/trip-dates";
import { inclusionHighlights, nextListedDeparture, seatSummary, wholeCarOpen } from "@/lib/trip-facts";
import { tripPriceInfo } from "@/lib/trip-price";
import type { TripWithDetails } from "@/lib/types";

/** Six pips: how many of the car's seats are still open (a count, not which seats). */
function SeatPips({ open, max }: { open: number; max: number }) {
  return (
    <span className="seat-pips" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} data-open={i < open ? "true" : "false"} />
      ))}
    </span>
  );
}

/**
 * One trip, the same way on every page: where, how long, how hard, the next date, seats open,
 * the starting price, what the price includes, and one button. A trip with no date open offers
 * "Notify me" instead of a booking button that would lead nowhere.
 */
export function TripCard({ item, weather = null }: { item: TripWithDetails; weather?: LiveWeather | null }) {
  const { trip, departures } = item;
  // The same date the trip page, the booking box and the home page pick (lib/trip-facts).
  const next = nextListedDeparture(departures);
  const seats = next ? seatSummary(next) : null;
  // The same "From" price as the trip page, its search snippet and its structured data.
  const fromPaise = tripPriceInfo(trip, departures).fromPaise;
  const wholeCar = next ? wholeCarOpen(next) : false;
  const included = inclusionHighlights(trip.inclusions, 2);
  const place = trip.destination.split(",")[0].trim();
  // Scheduled seats and the whole car are two different bookings: say which this date offers.
  const joinLine = !next
    ? ""
    : next.seatsRemaining === 0
      ? "This date is full. Join the waitlist, or ask us for another date."
      : next.seatsRemaining === 1
        ? "Scheduled trip. One seat left to join."
        : wholeCar
          ? "Scheduled trip. Join with 1 to 5 seats, or book the whole car for your group."
          : `Scheduled trip. Join with 1 to ${Math.min(5, next.seatsRemaining)} seats.`;
  const tripHref = `/trips/${trip.slug}`;
  const bookHref = next ? `${tripHref}?date=${next.departureId}#book` : tripHref;

  // The trip's first uploaded film (Admin → Trips → Photos & videos) plays silently in the card.
  const cardVideo = trip.videoLinks.find((v) => classifyVideoLink(v.url).kind === "file")?.url ?? null;

  const badgeTone =
    !seats ? "bg-white/95 text-stone-600" : seats.tone === "full" ? "bg-stone-200 text-stone-600" : seats.tone === "few" ? "bg-copper-600 text-white" : "bg-white/95 text-[#12603e]";

  return (
    <article className={`card-theme ${themeClass(trip.slug, trip.destination, trip.region)} group flex flex-col transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]`}>
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-stone-200 sm:aspect-[4/3]">
        <LivingPhoto
          variant="card"
          slug={trip.slug}
          region={trip.region}
          src={trip.heroImageUrl}
          initialWeather={weather}
          alt={`${trip.destination}: ${trip.title}`}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        {cardVideo && <TripCardVideo src={cardVideo} />}
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold shadow-sm ${badgeTone}`}>
            {next && seats && seats.tone !== "full" && <SeatPips open={next.seatsRemaining} max={next.maxCapacity} />}
            {seats ? (seats.tone === "full" ? "Sold out, waitlist open" : seats.label) : "Dates coming soon"}
          </span>
          <span className="flex flex-col items-end gap-1.5">
            {next?.departureType === "women_only" && <span className="rounded-full bg-[#fde3e6] px-2.5 py-1 text-[11px] font-semibold text-[#a3263a] shadow-sm">Women only</span>}
            {trip.isSampleDemo && <span className="rounded-full bg-forest-950/80 px-2.5 py-1 text-[11px] font-medium text-cream-100">Sample itinerary</span>}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <p className="th-accent text-xs font-bold tracking-wide">{place}</p>
        <h3 className="th-text mt-1 font-display text-xl leading-snug font-semibold">
          <Link href={tripHref} className="hover:text-copper-700">
            {trip.title}
          </Link>
        </h3>
        <ul className="mt-2.5 flex flex-wrap gap-1.5 text-xs font-semibold">
          <li className="th-chip rounded-full px-2.5 py-1">{formatTripLength(trip.durationDays, trip.durationNights)}</li>
          <li className="th-chip rounded-full px-2.5 py-1">{trip.difficulty}</li>
          <li className="th-chip rounded-full px-2.5 py-1">Max 6 people</li>
        </ul>

        {/* The two facts people decide on, always in the same place. */}
        <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-black/5 bg-white/80">
          <div className="p-3">
            <dt className="text-[11px] font-semibold text-stone-600">Next departure</dt>
            <dd className="mt-0.5 font-display text-lg leading-tight font-semibold text-ink-900">{next ? formatTripDates(next.startDate, next.endDate) : "Coming soon"}</dd>
          </div>
          <div className="border-l border-dashed border-stone-300 p-3">
            <dt className="text-[11px] font-semibold text-stone-600">Starting price</dt>
            <dd className="mt-0.5 font-display text-lg leading-tight font-semibold text-forest-900">
              {formatINR(fromPaise)}
              <span className="font-sans text-xs font-normal text-stone-600"> per person</span>
            </dd>
          </div>
        </dl>

        {included.shown.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs leading-relaxed text-ink-900/80">
            {included.shown.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <Check className="th-accent mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="line-clamp-1">{line}</span>
              </li>
            ))}
            {included.more > 0 && (
              <li className="pl-[1.375rem] text-stone-600">{`+${included.more} more included`}</li>
            )}
          </ul>
        )}

        <div className="mt-auto pt-4">
          {next ? (
            <>
              <p className="mb-2.5 text-xs leading-relaxed text-stone-600">{joinLine}</p>
              <Link href={bookHref} className="btn-ocean min-h-12 w-full px-4 text-sm">
                {seats?.tone === "full" ? "View itinerary & join waitlist" : "View itinerary & book"}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          ) : (
            <>
              <NotifyMe tripId={trip.id} tripTitle={trip.title} tripSlug={trip.slug} />
              <Link href={tripHref} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1 text-sm font-semibold text-forest-900 hover:text-copper-700">
                View itinerary <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
