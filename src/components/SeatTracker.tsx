"use client";

import { CheckCircle2, Lock, UserCheck } from "lucide-react";

interface SeatTrackerProps {
  maxCapacity: number;
  seatsTaken: number;
  selectedCount: number;
  departureCode: string;
}

/**
 * Accessible 6-place visual tracker.
 * Uses distinct icons + text labels (not color alone) and NEVER exposes individual
 * passenger identities, seat-map assignments, or demographic data.
 */
export function SeatTracker({
  maxCapacity,
  seatsTaken,
  selectedCount,
  departureCode,
}: SeatTrackerProps) {
  const safeCap = Math.min(6, Math.max(1, maxCapacity));
  const seatsRemaining = Math.max(0, safeCap - seatsTaken);

  const slots = Array.from({ length: safeCap }, (_, idx) => {
    const pos = idx + 1;
    if (pos <= seatsTaken) return "taken" as const;
    if (pos <= seatsTaken + selectedCount) return "selected" as const;
    return "open" as const;
  });

  return (
    <div className="rounded-xl border border-stone-200 bg-cream-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">
            6-Seat Vehicle Tracker • {departureCode}
          </p>
          <p className="text-sm font-medium text-ink-900" aria-live="polite">
            {seatsRemaining === 0
              ? `All ${safeCap} places allocated (Sold out)`
              : `${seatsRemaining} of ${safeCap} seats open (${selectedCount} selected)`}
          </p>
        </div>
        <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-medium text-forest-900">
          Max {safeCap} travelers
        </span>
      </div>

      <div
        role="img"
        aria-label={`Vehicle capacity for ${departureCode}: ${seatsTaken} allocated, ${selectedCount} selected by you, ${Math.max(0, seatsRemaining - selectedCount)} open out of ${safeCap} total seats.`}
        className="grid grid-cols-3 gap-2 sm:grid-cols-6"
      >
        {slots.map((state, index) => {
          const seatLabel = `Place ${index + 1}`;
          if (state === "taken") {
            return (
              <div
                key={seatLabel}
                className="flex flex-col items-center justify-center gap-1 rounded-lg border border-stone-300 bg-stone-200/80 px-2 py-2.5 text-center text-stone-600"
              >
                <Lock className="h-4 w-4" aria-hidden="true" />
                <span className="text-[11px] font-semibold">Taken</span>
              </div>
            );
          }

          if (state === "selected") {
            return (
              <div
                key={seatLabel}
                className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-copper-600 bg-copper-600/10 px-2 py-2.5 text-center text-copper-700"
              >
                <UserCheck className="h-4 w-4" aria-hidden="true" />
                <span className="text-[11px] font-semibold">Your Seat</span>
              </div>
            );
          }

          return (
            <div
              key={seatLabel}
              className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-forest-700 bg-white px-2 py-2.5 text-center text-forest-900"
            >
              <CheckCircle2 className="h-4 w-4 text-forest-700" aria-hidden="true" />
              <span className="text-[11px] font-semibold">Open</span>
            </div>
          );
        })}
      </div>

      <p className="mt-2.5 text-xs text-stone-600">
        Exact row seating is assigned fairly prior to departure; row requests in checkout are
        optional preferences only.
      </p>
    </div>
  );
}

