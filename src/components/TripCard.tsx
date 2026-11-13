import { Calendar, MapPin, Users } from "lucide-react";
import { LivingPhoto } from "@/components/living/LivingPhoto";
import type { LiveWeather } from "@/components/living/weather";
import Link from "next/link";
import { formatINR } from "@/lib/currency";
import { themeClass } from "@/lib/destination-theme";
import type { DepartureStatus, TripWithDetails } from "@/lib/types";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function getStatusBadge(status: DepartureStatus, seatsRemaining: number, maxCapacity: number) {
  switch (status) {
    case "sold_out":
      return {
        label: "Sold out • Waitlist",
        className: "bg-stone-200 text-stone-600 border-stone-300",
      };
    case "last_seats":
      return {
        label: `Last ${seatsRemaining} ${seatsRemaining === 1 ? "seat" : "seats"}`,
        className: "bg-copper-600 text-cream-50 border-copper-700",
      };
    case "filling_fast":
      return {
        label: `Filling fast • ${seatsRemaining} left`,
        className: "bg-saffron-500/15 text-copper-700 border-saffron-500/40",
      };
    default:
      return {
        label: `Open • ${seatsRemaining} of ${maxCapacity} seats`,
        className: "bg-forest-900/10 text-forest-900 border-forest-700/25",
      };
  }
}

export function TripCard({ item, weather = null }: { item: TripWithDetails; weather?: LiveWeather | null }) {
  const { trip, departures } = item;
  const upcoming =
    departures.find((d) => d.status !== "sold_out" && d.status !== "cancelled") ??
    departures[0] ??
    null;

  const badge = upcoming
    ? getStatusBadge(upcoming.status, upcoming.seatsRemaining, upcoming.maxCapacity)
    : { label: "Dates coming soon", className: "bg-stone-200 text-stone-600 border-stone-300" };

  const privateAvailable = departures.some(
    (d) => d.seatsTaken === 0 && d.status !== "cancelled" && d.status !== "completed"
  );

  return (
    <article
      className={`card-theme ${themeClass(trip.slug, trip.destination, trip.region)} group flex flex-col transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-200">
        <LivingPhoto
          variant="card"
          slug={trip.slug}
          region={trip.region}
          src={trip.heroImageUrl}
          initialWeather={weather}
          alt={`${trip.destination} — ${trip.title}`}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-center justify-between gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold backdrop-blur-xs ${badge.className}`}
          >
            {badge.label}
          </span>
          {trip.isSampleDemo && (
            <span className="rounded-full bg-forest-950/80 px-2.5 py-1 text-[11px] font-medium text-cream-100">
              Sample Itinerary
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between p-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-stone-600">
            <span className="th-chip rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">{trip.region}</span>
            <span>
              {trip.durationDays}D / {trip.durationNights}N • {trip.difficulty}
            </span>
          </div>

          <h3 className="th-text font-display text-xl font-semibold leading-snug">
            <Link href={`/trips/${trip.slug}`} className="hover:text-copper-700">
              {trip.title}
            </Link>
          </h3>

          <p className="text-sm leading-relaxed text-stone-600 line-clamp-2">{trip.tagline}</p>

          <dl className="space-y-1.5 border-t border-black/5 pt-3 text-xs text-ink-900/75">
            <div className="flex items-center gap-2">
              <MapPin className="th-accent h-3.5 w-3.5" aria-hidden="true" />
              <span>Pickup: {trip.pickupCity} • {trip.vibe}</span>
            </div>
            {upcoming && (
              <div className="flex items-center gap-2">
                <Calendar className="th-accent h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  Next: {shortDate(upcoming.startDate)} – {shortDate(upcoming.endDate)}
                  {upcoming.departureType === "women_only" ? " (Women-only batch)" : ""}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Users className="th-accent h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {privateAvailable
                  ? "Batch seats or Private 6-seat vehicle available"
                  : "Join scheduled small batch (max 6)"}
              </span>
            </div>
          </dl>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-stone-600">
              Sample from
            </p>
            <p className="text-lg font-bold text-forest-900">
              {formatINR(trip.basePricePaise)}
              <span className="text-xs font-normal text-stone-600"> / person</span>
            </p>
          </div>
          <Link
            href={upcoming ? `/trips/${trip.slug}?date=${upcoming.departureId}#book` : `/trips/${trip.slug}#book`}
            className="btn-ocean px-4 py-2 text-sm"
          >
            View &amp; Select Seats
          </Link>
        </div>
      </div>
    </article>
  );
}

