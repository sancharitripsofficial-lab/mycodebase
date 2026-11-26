import type { Metadata } from "next";
import { PageBanner } from "@/components/banners/PageBanner";
import { EnquiryForm } from "@/components/EnquiryForm";
import { TripsCatalogClient } from "@/components/TripsCatalogClient";
import { PromoBanner } from "@/components/promo/PromoBanner";
import { forPlacement, getLivePromotions } from "@/lib/data/promotions";
import { getPublishedTripsWithDetails, getSiteSettings } from "@/lib/data/repository";
import { PAGE_SEO, jsonLdText, liveDestinations, pageBreadcrumb, pageMetadata, tripListJsonLd, tripsPageDescription } from "@/lib/seo";

// Served from the CDN; rebuilt at most every 5 minutes, and immediately after bookings / admin edits
// (lib/revalidate.ts). Not more often: every rebuild is a paid write on the host and a database read.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { trips } = await getPublishedTripsWithDetails();
  // ?q=, ?mode=, ?category= and ?lang= all share this one canonical address.
  return pageMetadata({
    title: PAGE_SEO.trips.title,
    description: tripsPageDescription(liveDestinations(trips)),
    path: PAGE_SEO.trips.path,
  });
}

export default async function TripsPage() {
  // ?q=, ?mode= and ?category= are read in the browser (TripsCatalogClient) so this page stays cacheable.
  const [{ trips }, promotions, { settings }] = await Promise.all([
    getPublishedTripsWithDetails(),
    getLivePromotions(),
    getSiteSettings(),
  ]);
  const offers = forPlacement(promotions, "trips_banner");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(tripListJsonLd("Road trips from Bangalore", trips)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(pageBreadcrumb("Trips", "/trips")) }} />
      <PageBanner
        page="trips"
        scene="trips"
        width="6xl"
        eyebrow="Scheduled & Private Departures"
        title="Road Trips from Bangalore"
        subtitle="Every route travels in an Ertiga-class vehicle capped at 6 travelers. Join an open batch for 1–5 seats or reserve all 6 seats privately when a departure is unoccupied."
      />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 space-y-8">
        {offers.length > 0 && <PromoBanner promotions={offers} />}
        <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">Upcoming trips</h2>
        <TripsCatalogClient trips={trips} categories={settings.homePage.categories} />

        <div id="ask" className="mx-auto max-w-2xl scroll-mt-24">
          <EnquiryForm />
        </div>
      </div>
    </>
  );
}

