import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Car, MapPin, MessageCircle, Users } from "lucide-react";
import { PageBanner } from "@/components/banners/PageBanner";
import { EnquiryForm } from "@/components/EnquiryForm";
import { GuideLinks, guideH2 } from "@/components/guide/GuideParts";
import { TripCard } from "@/components/TripCard";
import { getPublishedTripsWithDetails, getSiteSettings } from "@/lib/data/repository";
import { GUIDE_HUB, guidePagesOfKind } from "@/lib/places/guide";
import { ANY_DAY_LINE, BRAND_NAME, PAGE_SEO, jsonLdText, pageBreadcrumb, pageMetadata, tripListJsonLd } from "@/lib/seo";

// Live trips and dates: same freshness as the trips page.
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: PAGE_SEO.weekend.title,
  description: PAGE_SEO.weekend.description,
  path: PAGE_SEO.weekend.path,
});

/** The FAQ that answers whether trips run only at weekends comes first on this page. */
const WEEKEND_QUESTION = /weekend|weekday/i;

/**
 * For people searching "weekend trips from Bangalore" or a weekend trip planner / organiser.
 * Everything on it is true on any day of the week: the scheduled dates come from the live trips,
 * and a private car on the traveller's own dates is a request the team answers.
 */
export default async function WeekendTripsPage() {
  const [{ trips }, { settings }] = await Promise.all([getPublishedTripsWithDetails(), getSiteSettings()]);
  const maxGroup = settings.bookingPolicy.maxGroupSize || 6;
  const answered = settings.faqs.filter((f) => f.question.trim() && f.answer.trim());
  const faqs = [...answered.filter((f) => WEEKEND_QUESTION.test(f.question)), ...answered.filter((f) => !WEEKEND_QUESTION.test(f.question))].slice(0, 4);
  const regions = guidePagesOfKind("region");
  const categories = guidePagesOfKind("category");
  const link = (p: { path: string; name: string; places: readonly unknown[] }) => ({ href: p.path, label: p.name, count: p.places.length });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(pageBreadcrumb("Weekend trips from Bangalore", PAGE_SEO.weekend.path)) }} />
      {trips.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(tripListJsonLd("Trips from Bangalore with open dates", trips)) }} />
      )}
      <PageBanner
        page="trips"
        scene="trips"
        width="6xl"
        eyebrow="Trip planner & organiser in Bengaluru"
        title="Weekend trips from Bangalore"
        subtitle={`Planned and run by ${BRAND_NAME} in one car, at most ${maxGroup} travellers. On a weekend, a long weekend or any other day.`}
      />

      <div>
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 sm:py-12">
          <section className="max-w-3xl space-y-3 text-[1.02rem] leading-relaxed text-ink-900">
            <p>
              {`${BRAND_NAME} plans and runs small-group road trips from Bengaluru across Karnataka.`}{" "}
              {`You travel in one car with no more than ${maxGroup} people, never a crowded bus.`}
            </p>
            <p>
              Trips are not only on weekends. {ANY_DAY_LINE} Tell us the days you are free, and a real person replies on WhatsApp.
            </p>
          </section>

          <section aria-labelledby="dates-heading" className="space-y-5">
            <h2 id="dates-heading" className={guideH2}>
              Trips with open dates
            </h2>
            {trips.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {trips.map((item) => (
                  <TripCard key={item.trip.id} item={item} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-white/85 p-5 text-stone-600">New trips are being planned. Ask us about your dates below.</p>
            )}
            <Link href="/trips" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700">
              All dates and seats <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          <section aria-labelledby="how-heading" className="space-y-5">
            <h2 id="how-heading" className={guideH2}>
              How we organise your trip
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              <li className="flex gap-3 rounded-2xl bg-white/85 p-4">
                <CalendarDays className="h-5 w-5 shrink-0 text-copper-700" aria-hidden="true" />
                <span>Pick a listed date and choose your exact seat on a live map of the car.</span>
              </li>
              <li className="flex gap-3 rounded-2xl bg-white/85 p-4">
                <MessageCircle className="h-5 w-5 shrink-0 text-copper-700" aria-hidden="true" />
                <span>No listed date suits you? Ask for a private car or a custom trip, and we reply on WhatsApp.</span>
              </li>
              <li className="flex gap-3 rounded-2xl bg-white/85 p-4">
                <Users className="h-5 w-5 shrink-0 text-copper-700" aria-hidden="true" />
                <span>At most {maxGroup} travellers in one car, never a full bus.</span>
              </li>
              <li className="flex gap-3 rounded-2xl bg-white/85 p-4">
                <MapPin className="h-5 w-5 shrink-0 text-copper-700" aria-hidden="true" />
                <span>Pickup and drop in Bengaluru.</span>
              </li>
              <li className="flex gap-3 rounded-2xl bg-white/85 p-4 sm:col-span-2">
                <Car className="h-5 w-5 shrink-0 text-copper-700" aria-hidden="true" />
                <span>
                  Travelling as a family or a group of friends?{" "}
                  <Link href={PAGE_SEO.privateCar.path} className="font-semibold text-forest-900 underline decoration-copper-600/50 underline-offset-2 hover:text-copper-700">
                    Book the whole 6-seat car
                  </Link>
                  .
                </span>
              </li>
            </ul>
          </section>

          <section aria-labelledby="where-heading" className="space-y-5">
            <h2 id="where-heading" className={guideH2}>
              Where to go in Karnataka
            </h2>
            <p className="max-w-3xl text-[1.02rem] leading-relaxed text-ink-900">
              Our guide lists places to visit in every district of Karnataka. Choose a region or a kind of place, then ask us to plan it.
            </p>
            <GuideLinks links={regions.map(link)} />
            <GuideLinks links={categories.map(link)} />
            <Link href={GUIDE_HUB.path} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700">
              {GUIDE_HUB.name} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          {faqs.length > 0 && (
            <section aria-labelledby="faq-heading" className="space-y-4">
              <h2 id="faq-heading" className={guideH2}>
                Questions before you book
              </h2>
              <div className="space-y-3">
                {faqs.map((faq) => (
                  <details key={faq.id} className="rounded-2xl border border-white/70 bg-white/85 p-4">
                    <summary className="cursor-pointer font-display text-base font-semibold text-forest-900">{faq.question}</summary>
                    <p className="mt-2 text-sm leading-relaxed text-stone-600">{faq.answer}</p>
                  </details>
                ))}
              </div>
              <Link href="/faqs" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700">
                All FAQs <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          )}

          <section id="plan" aria-labelledby="plan-heading" className="scroll-mt-24 space-y-5">
            <h2 id="plan-heading" className={guideH2}>
              Tell us your dates
            </h2>
            <div className="max-w-3xl">
              <EnquiryForm defaultKind="private_date" />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
