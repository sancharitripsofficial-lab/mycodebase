import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatINR } from "@/lib/currency";
import { formatTripDates, formatTripLength } from "@/lib/trip-dates";
import { seatSummary } from "@/lib/trip-facts";

/**
 * Six seats in the car's own layout: one beside the driver, three in the middle, two at the back.
 * With `takenSeats` (the live seat map) the exact seats are shown; never guessed from a count.
 */
export function SeatGlyph({ takenSeats, maxCapacity = 6, className = "" }: { takenSeats: number[]; maxCapacity?: number; className?: string }) {
  const taken = new Set(takenSeats);
  const state = (seat: number) => (seat > maxCapacity || taken.has(seat) ? "taken" : "open");
  const open = Array.from({ length: maxCapacity }, (_, i) => i + 1).filter((s) => !taken.has(s));
  return (
    <span
      role="img"
      aria-label={open.length === 0 ? "All seats are taken" : `Open seats: ${open.join(", ")} of ${maxCapacity}`}
      className={`seat-glyph ${className}`}
    >
      {/* India drives on the left: the driver sits front right. */}
      <span data-seat={state(1)} style={{ gridColumn: "span 3" }} />
      <span data-seat="driver" style={{ gridColumn: "span 3" }} />
      {[2, 3, 4].map((s) => (
        <span key={s} data-seat={state(s)} style={{ gridColumn: "span 2" }} />
      ))}
      {[5, 6].map((s) => (
        <span key={s} data-seat={state(s)} style={{ gridColumn: "span 3" }} />
      ))}
    </span>
  );
}

export interface NextTripTicketProps {
  from: string;
  destination: string;
  tripTitle: string;
  tripSlug: string;
  departureId: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  durationNights: number;
  seatsRemaining: number;
  maxCapacity: number;
  /** Exact taken seat numbers for the car glyph; null when the live map could not be read. */
  takenSeats: number[] | null;
  pricePaise: number;
  /** What the advance comes to for one seat, when this date offers one. */
  advance: { percent: number; payNowPaise: number } | null;
  womenOnly: boolean;
}

/** The next trip a visitor can book, as a frosted-glass seat ticket over the hero film: where, when, seats left, price, book. */
export function NextTripTicket(p: NextTripTicketProps) {
  const seats = seatSummary(p);
  const bookHref = `/trips/${p.tripSlug}?date=${p.departureId}#book`;
  return (
    <aside aria-label="Next trip you can book" className="w-full max-w-[26rem]">
      <div className="ticket-main px-5 pt-4 pb-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-white/85">{`Next trip from ${p.from}`}</p>
          <p className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold [text-shadow:none] ${seats.tone === "few" ? "bg-peach-100 text-copper-700" : "bg-[#dcf3e3] text-[#12603e]"}`}>
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
            </span>
            {seats.label}
          </p>
        </div>

        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-display text-[1.7rem] leading-[1.1] font-semibold text-white sm:text-3xl">{p.destination}</p>
            <p className="mt-2 text-base font-semibold text-white">
              {formatTripDates(p.startDate, p.endDate, { weekday: true })}
              {p.womenOnly && <span className="ml-2 rounded-full bg-[#fde3e6] px-2 py-0.5 align-middle text-[11px] font-semibold text-[#a3263a] [text-shadow:none]">Women only</span>}
            </p>
            <p className="text-xs text-white/80">{formatTripLength(p.durationDays, p.durationNights)}</p>
          </div>
          {p.takenSeats && <SeatGlyph takenSeats={p.takenSeats} maxCapacity={p.maxCapacity} className="shrink-0" />}
        </div>
      </div>

      <div className="ticket-stub flex items-center justify-between gap-3 px-5 pt-4 pb-4">
        <div className="min-w-0 leading-tight">
          <p className="font-display text-[1.75rem] font-semibold text-white">{formatINR(p.pricePaise)}</p>
          <p className="text-xs text-white/80">per person</p>
          {p.advance && (
            <p className="mt-1 text-xs font-semibold text-saffron-500">{`Reserve with ${formatINR(p.advance.payNowPaise)} now`}</p>
          )}
        </div>
        <Link href={bookHref} className="btn-sunset min-h-12 shrink-0 px-5 text-sm [text-shadow:none]">
          Book now
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <Link
        href={`/trips/${p.tripSlug}`}
        className="mt-2.5 block text-center text-xs font-semibold text-white underline decoration-white/50 underline-offset-4 [text-shadow:0_1px_3px_rgb(10_40_30/0.6)] hover:decoration-white"
      >
        See the full itinerary<span className="sr-only"> of {p.tripTitle}</span>
      </Link>
    </aside>
  );
}

/** No date is open anywhere: the ticket invites the visitor to be told about the next one. */
export function NoTripTicket({ notifyHref }: { notifyHref: string }) {
  return (
    <aside aria-label="New dates" className="w-full max-w-[26rem]">
      <div className="ticket-main px-5 pt-4 pb-5">
        <p className="text-xs font-semibold text-white/85">Next trip</p>
        <p className="mt-2 font-display text-2xl leading-tight font-semibold text-white">New dates are being planned</p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/90">Every seat on the listed dates is taken or booking has closed. Tell us where you want to go and we message you the next date first.</p>
      </div>
      <div className="ticket-stub flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-4">
        <Link href="/trips" className="text-sm font-semibold text-white underline underline-offset-4">
          See all trips
        </Link>
        <Link href={notifyHref} className="btn-sunset min-h-12 px-5 text-sm [text-shadow:none]">
          Notify me
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}
