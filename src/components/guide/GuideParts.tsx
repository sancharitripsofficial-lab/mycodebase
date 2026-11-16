import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EnquiryForm } from "@/components/EnquiryForm";
import { TripCard } from "@/components/TripCard";
import { ANY_DAY_LINE, BRAND_NAME } from "@/lib/seo";
import { KANNADA_NAMES } from "@/lib/places/search";
import { CATEGORY_LABELS } from "@/lib/places/karnataka-places";
import { districtGuide, type GuideGroup } from "@/lib/places/guide";
import type { KarnatakaPlace } from "@/lib/places/types";
import type { TripWithDetails } from "@/lib/types";

/** Shared pieces of the Karnataka guide pages (/karnataka, /karnataka/[slug]) and the planner pages. */

export const guideH2 = "font-display text-2xl font-semibold text-forest-900 sm:text-3xl";
const pill =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-forest-900/15 bg-white/90 px-4 py-2 text-sm font-semibold text-forest-900 hover:border-copper-600 hover:text-copper-700";

/** The Kannada spelling of a district or place, when the place list has one. */
export function KannadaName({ name }: { name: string }) {
  const kn = KANNADA_NAMES[name]?.[0];
  if (!kn) return null;
  return (
    <span lang="kn" data-no-translate className="font-normal text-stone-600">
      {" "}
      ({kn})
    </span>
  );
}

/** A row of links to other guide pages. */
export function GuideLinks({ links }: { links: { href: string; label: string; count?: number }[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {links.map((l) => (
        <li key={l.href}>
          <Link href={l.href} className={pill}>
            {l.label}
            {typeof l.count === "number" && <span className="font-normal text-stone-600">{l.count}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** One place: its name, the one-line fact, its district and type, and other names people use. */
function PlaceItem({ place, showDistrict }: { place: KarnatakaPlace; showDistrict: boolean }) {
  const district = showDistrict ? districtGuide(place.district) : null;
  const aliases = place.aliases.slice(0, 3);
  return (
    <li id={place.id} className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[var(--shadow-soft)]">
      <h3 className="font-display text-lg font-semibold text-forest-900">
        <span data-no-translate>{place.name}</span>
        <KannadaName name={place.name} />
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-900/85">{`${place.blurb.replace(/[.\s]+$/, "")}.`}</p>
      <p className="mt-2 text-xs text-stone-600">
        {district ? (
          <>
            <Link href={district.path} className="font-semibold text-forest-900 hover:text-copper-700">
              {district.name}
            </Link>{" "}
            district ·{" "}
          </>
        ) : null}
        {place.categories.map((c) => CATEGORY_LABELS[c]).join(" · ")}
        {aliases.length > 0 && (
          <>
            {" "}
            · Also called: <span data-no-translate>{aliases.join(", ")}</span>
          </>
        )}
      </p>
    </li>
  );
}

/** The places of a guide page, section by section. */
export function GuideGroups({ groups, showDistrict }: { groups: readonly GuideGroup[]; showDistrict: boolean }) {
  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`g-${group.id}`} className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id={`g-${group.id}`} className={guideH2}>
              {group.heading} <span className="text-base font-normal text-stone-600">({group.places.length})</span>
            </h2>
            {group.href && (
              <Link href={group.href} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700">
                All of {group.heading} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {group.places.map((place) => (
              <PlaceItem key={place.id} place={place} showDistrict={showDistrict} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * "Plan this trip": the live trips that go there, or a plain line that none is scheduled, and the
 * enquiry form. A private or custom trip is a request the team answers, never an instant booking.
 */
export function PlanSection({
  name,
  planName,
  trips,
  tripsHeading,
  showNoTripLine = true,
}: {
  name: string;
  planName?: string;
  trips: TripWithDetails[];
  tripsHeading: string;
  showNoTripLine?: boolean;
}) {
  return (
    <section id="plan" aria-labelledby="plan-heading" className="scroll-mt-24 space-y-5">
      <h2 id="plan-heading" className={guideH2}>
        {trips.length > 0 ? tripsHeading : `Plan a trip to ${name}`}
      </h2>
      {trips.length > 0 ? (
        <>
          <p className="max-w-3xl text-[1.02rem] leading-relaxed text-ink-900">
            {`${BRAND_NAME} travels in one car with at most six travellers.`} {ANY_DAY_LINE}
          </p>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {trips.map((item) => (
              <TripCard key={item.trip.id} item={item} />
            ))}
          </div>
        </>
      ) : (
        showNoTripLine && (
          <p className="max-w-3xl rounded-2xl bg-white/85 p-5 text-[1.02rem] leading-relaxed text-ink-900">
            {`${BRAND_NAME} has no scheduled trip to ${name} right now.`} Ask us for a private car or a custom trip on your own dates, and a
            real person replies on WhatsApp.
          </p>
        )
      )}
      <div className="max-w-3xl">
        <EnquiryForm defaultPlace={planName} defaultKind="custom_trip" />
      </div>
    </section>
  );
}

/** A plain note that the guide lists places, not timings or prices. */
export function GuideNote() {
  return (
    <p className="max-w-3xl text-sm leading-relaxed text-stone-600">
      This guide names places and where they are. It does not list opening times, entry fees or permits: please check those locally before
      you travel.
    </p>
  );
}
