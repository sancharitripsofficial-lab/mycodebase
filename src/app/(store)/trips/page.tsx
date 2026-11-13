import type { Metadata } from "next";
import { PageBanner3D } from "@/components/banners/PageBanner3D";
import { EnquiryForm } from "@/components/EnquiryForm";
import { TripsCatalogClient } from "@/components/TripsCatalogClient";
import { PromoBanner } from "@/components/promo/PromoBanner";
import { forPlacement, getLivePromotions } from "@/lib/data/promotions";
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
  const [{ trips }, promotions] = await Promise.all([getPublishedTripsWithDetails(), getLivePromotions()]);
  const offers = forPlacement(promotions, "trips_banner");

  return (
    <>
      <PageBanner3D
        scene="trips"
        width="6xl"
        eyebrow="Scheduled & Private Departures"
        title="Curated Karnataka Micro Trips"
        subtitle="Every route travels in an Ertiga-class vehicle capped at 6 travelers. Join an open batch for 1–5 seats or reserve all 6 seats privately when a departure is unoccupied."
      />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 space-y-8">
        {offers.length > 0 && <PromoBanner promotions={offers} />}
        <TripsCatalogClient trips={trips} />

        <div id="ask" className="mx-auto max-w-2xl scroll-mt-24">
          <EnquiryForm />
        </div>
      </div>
    </>
  );
}

