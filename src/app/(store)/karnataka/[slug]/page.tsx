import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PageBanner } from "@/components/banners/PageBanner";
import { GuideGroups, GuideLinks, GuideNote, KannadaName, PlanSection, guideH2 } from "@/components/guide/GuideParts";
import { getPublishedTripsWithDetails } from "@/lib/data/repository";
import { GUIDE_HUB, GUIDE_PAGES, guidePage, guidePagesOfKind, tripsForPlaces, type GuidePage } from "@/lib/places/guide";
import { NOT_FOUND_METADATA, breadcrumbJsonLd, guideListJsonLd, jsonLdText, pageMetadata } from "@/lib/seo";

// Live trips (and their prices) show on these pages: same freshness as the trips page.
export const revalidate = 60;
// Only the regions, districts and kinds of place in the guide exist; anything else is a real 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDE_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = guidePage(slug);
  if (!page) return NOT_FOUND_METADATA;
  return pageMetadata({ title: page.title, description: page.description, path: page.path });
}

/** Links to the neighbouring guide pages: the same region's districts, the other regions, the other kinds of place. */
function relatedLinks(page: GuidePage): { heading: string; links: { href: string; label: string; count: number }[] }[] {
  const link = (p: GuidePage) => ({ href: p.path, label: p.name, count: p.places.length });
  const regions = guidePagesOfKind("region");
  const districts = guidePagesOfKind("district");
  const categories = guidePagesOfKind("category");
  if (page.kind === "district") {
    const region = regions.find((r) => r.region === page.region);
    return [
      {
        heading: `More districts in ${region?.name ?? "this region"}`,
        links: [...(region ? [link(region)] : []), ...districts.filter((d) => d.region === page.region && d.slug !== page.slug).map(link)],
      },
      { heading: "Karnataka places by type", links: categories.map(link) },
    ];
  }
  if (page.kind === "region") {
    return [
      { heading: "Other regions of Karnataka", links: regions.filter((r) => r.slug !== page.slug).map(link) },
      { heading: "Karnataka places by type", links: categories.map(link) },
    ];
  }
  return [
    { heading: "Other kinds of places", links: categories.filter((c) => c.slug !== page.slug).map(link) },
    { heading: "Karnataka by region", links: regions.map(link) },
  ];
}

/**
 * One Karnataka guide page: a region, a district or a kind of place. The places and their facts
 * come from the fact-checked list (src/lib/places); the trips shown are the live ones that go there.
 */
export default async function KarnatakaGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = guidePage(slug);
  if (!page) notFound();

  const { trips } = await getPublishedTripsWithDetails();
  // A kind-of-place page spans the whole state, so it shows every live trip; a region or district shows its own.
  const liveTrips = page.kind === "category" ? trips : tripsForPlaces(page.places, trips);

  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: GUIDE_HUB.name, path: GUIDE_HUB.path },
    { name: page.name, path: page.path },
  ]);
  const list = guideListJsonLd(page.h1, page.places);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(list) }} />
      <PageBanner
        page="karnataka"
        scene="trips"
        width="6xl"
        eyebrow={page.eyebrow}
        title={page.h1}
        subtitle={`${page.places.length} places, each with a short fact and its district.`}
      />

      <div>
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 sm:py-12">
          <nav aria-label="Breadcrumb" className="text-sm text-stone-600">
            <Link href="/" className="hover:text-copper-700">
              Home
            </Link>{" "}
            ›{" "}
            <Link href={GUIDE_HUB.path} className="hover:text-copper-700">
              {GUIDE_HUB.name}
            </Link>{" "}
            › <span className="text-ink-900">{page.name}</span>
          </nav>

          <section className="max-w-3xl space-y-3 text-[1.02rem] leading-relaxed text-ink-900">
            {page.intro.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {page.district && (
              <p className="text-sm text-stone-600">
                In Kannada:
                <KannadaName name={page.district.name} />
              </p>
            )}
            <p>
              <Link href="#plan" className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-forest-900 hover:text-copper-700">
                {liveTrips.length > 0 ? "See our trips with open dates" : "Ask us to plan this trip"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </p>
          </section>

          <GuideGroups groups={page.groups} showDistrict={page.kind !== "district"} />

          <GuideNote />

          <PlanSection
            name={page.kind === "category" ? "these places" : page.name}
            planName={page.planName}
            trips={liveTrips}
            tripsHeading={page.kind === "category" ? "Trips with open dates" : `Our trips in ${page.name}`}
            showNoTripLine={page.kind !== "category"}
          />

          {relatedLinks(page).map((block) => (
            <section key={block.heading} aria-label={block.heading} className="space-y-4">
              <h2 className={guideH2}>{block.heading}</h2>
              <GuideLinks links={block.links} />
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
