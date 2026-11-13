import type { Metadata } from "next";
import { EnquiryForm } from "@/components/EnquiryForm";
import { TripsCatalogClient } from "@/components/TripsCatalogClient";
import { getPublishedTripsWithDetails } from "@/lib/data/repository";

// Served from the CDN; refreshed every 30 s and immediately after bookings / admin edits.
export const revalidate = 30;

export const metadata: Metadata = {
  title: "Explore Karnataka Trips",
  description:
    "Browse upcoming 6-traveler Karnataka road trips from Bengaluru with live seat counts and private vehicle options.",
};

export default async function TripsPage() {
  // ?mode=private is read in the browser (TripsCatalogClient) so this page stays cacheable.
  const { trips } = await getPublishedTripsWithDetails();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 space-y-8">
      <div className="max-w-2xl space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper-700">
          Scheduled &amp; Private Departures
        </p>
        <h1 className="font-display text-3xl font-semibold text-forest-900 sm:text-4xl">
          Curated Karnataka Micro Trips
        </h1>
        <p className="text-sm leading-relaxed text-stone-600">
          Every route travels in an Ertiga-class vehicle capped at 6 travelers. Join an open
          batch for 1–5 seats or reserve all 6 seats privately when a departure is unoccupied.
        </p>
      </div>

      <TripsCatalogClient trips={trips} />

      <div id="ask" className="mx-auto max-w-2xl scroll-mt-24">
        <EnquiryForm />
      </div>
    </div>
  );
}

