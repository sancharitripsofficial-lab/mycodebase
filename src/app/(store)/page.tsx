import { ArrowRight, Bus, Car, Check, Compass, MessageCircle, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { HeroCinematic, Reveal } from "@/components/motion";
import { EnquiryForm } from "@/components/EnquiryForm";
import { HomeIcon } from "@/components/home/icons";
import { NextTripTicket, NoTripTicket } from "@/components/home/NextTripTicket";
import { PhotoSection, TeamSection, TrustPromises } from "@/components/home/TrustSections";
import { LivingPhoto } from "@/components/living/LivingPhoto";
import type { LiveWeather } from "@/components/living/weather";
import { PromoBanner } from "@/components/promo/PromoBanner";
import { RoadTripMinimap } from "@/components/three/RoadTripMinimap";
import { TripCard } from "@/components/TripCard";
import { advanceTerms, calculateBookingPricing, formatINR } from "@/lib/currency";
import { forPlacement, getLivePromotions } from "@/lib/data/promotions";
import { getDepartureSeatMap, getPublishedTripsWithDetails, getSiteSettings, getVerifiedReviews } from "@/lib/data/repository";
import { themeClass } from "@/lib/destination-theme";
import type { HomeCategory, SectionText } from "@/lib/home-content";
import { isOptimizableImage } from "@/lib/media";
import { buildClickToWhatsAppUrl } from "@/lib/messaging/provider";
import type { TripWithDetails } from "@/lib/types";
import { getDestinationWeather } from "@/lib/weather-server";
import { HOME_DESCRIPTION, HOME_TITLE, businessJsonLd, jsonLdText, pageMetadata, tripPriceInfo } from "@/lib/seo";
import { visiblePosts } from "@/lib/blog";
import type { Metadata } from "next";
import { LiveWeatherBadge } from "@/components/living/LiveWeatherBadge";
import { isBookable } from "@/lib/departure-rules";
import { BUILT_IN_MEDIA, resolveHero, resolveJourney } from "@/lib/site-media";
import { JourneyReel } from "@/components/JourneyReel";
import { HeroJourneySteps } from "@/components/HeroJourneySteps";
import { formatTripDates, formatTripDay } from "@/lib/trip-dates";
import { nextOpenDeparture, seatSummary } from "@/lib/trip-facts";

// Served from the CDN; rebuilt at most every 5 minutes, and immediately after bookings / admin edits
// (lib/revalidate.ts). Not more often: every rebuild is a paid write on the host and a database read.
export const revalidate = 300;

// The one address Google should list for the home page (not ?lang=kn, not the old vercel.app link).
// Brand first in the home title: the strongest signal for people searching "sancharitrips".
export const metadata: Metadata = pageMetadata({ title: HOME_TITLE, description: HOME_DESCRIPTION, path: "/", absoluteTitle: true });

/** Dates a visitor can still book (not cancelled, not left yet, booking cut-off not passed). */
const isOpen = (d: TripWithDetails["departures"][number]) => isBookable(d);

/** Small heading + title (+ optional line) used by every section; all words come from Admin. */
function SectionHead({ text, id, light = false }: { text: SectionText; id?: string; light?: boolean }) {
  return (
    <div className="max-w-2xl space-y-1.5">
      {text.eyebrow && <p className={`text-sm font-semibold ${light ? "text-saffron-500" : "text-copper-700"}`}>{text.eyebrow}</p>}
      <h2 id={id} className={`font-display text-2xl font-semibold sm:text-3xl ${light ? "text-cream-50" : "text-forest-900"}`}>
        {text.title}
      </h2>
      {text.body && <p className={`text-sm leading-relaxed ${light ? "text-white/85" : "text-stone-600"}`}>{text.body}</p>}
    </div>
  );
}

type CategoryView = {
  category: HomeCategory;
  trips: TripWithDetails[];
  fromPaise: number;
  next: { date: string; seats: number; slug: string; departureId: string } | null;
  photo: string;
  weather: LiveWeather | null;
};

export default async function HomePage() {
  const [{ trips }, { settings }, reviews, promotions] = await Promise.all([
    getPublishedTripsWithDetails(),
    getSiteSettings(),
    getVerifiedReviews(),
    getLivePromotions(),
  ]);
  const home = settings.homePage;
  const hasStories = visiblePosts(settings.blogPosts ?? []).length > 0;
  const homeOffers = forPlacement(promotions, "home_banner");

  // Every date still taking bookings, earliest first, with its trip.
  const openDates = trips
    .flatMap((t) => t.departures.filter(isOpen).map((d) => ({ dep: d, trip: t.trip })))
    .sort((a, b) => a.dep.startDate.localeCompare(b.dep.startDate));
  // The next trip a visitor can book: the earliest date with a seat free (the ticket on the first screen).
  const nextUp = openDates.find((x) => x.dep.seatsRemaining > 0) ?? null;

  // Live weather at every destination (cached 15 min) and the exact open seats of the next trip,
  // looked up while the page is built, so both show with the first paint.
  const [weatherPairs, nextTakenSeats] = await Promise.all([
    Promise.all(
      trips.map(
        async (t) => [t.trip.slug, await getDestinationWeather(t.trip.slug, t.trip.region, { timeoutMs: 2500, destination: t.trip.destination })] as const
      )
    ),
    nextUp ? getDepartureSeatMap(nextUp.dep.departureId).catch(() => null) : Promise.resolve(null),
  ]);
  const weatherBySlug = new Map(weatherPairs);
  // The seat picture is shown only when it agrees with the count beside it.
  const ticketSeats =
    nextUp && nextTakenSeats && nextTakenSeats.length === nextUp.dep.maxCapacity - nextUp.dep.seatsRemaining ? nextTakenSeats : null;

  // What reserving one seat costs now on the next trip, when that date offers an advance.
  const nextUnitPaise = nextUp ? nextUp.dep.priceOverridePaise ?? nextUp.trip.basePricePaise : 0;
  const nextAdvance = (() => {
    if (!nextUp) return null;
    const terms = advanceTerms({
      tripDepositPercent: nextUp.trip.depositPercent,
      tripBalanceDueDaysBefore: nextUp.trip.balanceDueDaysBefore,
      bookingPolicy: settings.bookingPolicy,
      startDate: nextUp.dep.startDate,
    });
    if (!terms.available || terms.percent === null) return null;
    const pricing = calculateBookingPricing({
      trip: nextUp.trip,
      priceOverridePaise: nextUp.dep.priceOverridePaise,
      bookingMode: "batch_seats",
      seatsRequested: 1,
      payDepositOnly: true,
      bookingPolicy: settings.bookingPolicy,
    });
    return pricing.balanceLaterPaise > 0 ? { percent: terms.percent, payNowPaise: pricing.payNowPaise } : null;
  })();

  // Categories from Admin, each with its live trips. Published trips not in any category are
  // collected under "More trips", so nothing the owner publishes is ever hidden.
  const bySlug = new Map(trips.map((t) => [t.trip.slug, t]));
  const used = new Set<string>();
  const categoryViews: CategoryView[] = [];
  const pushView = (category: HomeCategory, list: TripWithDetails[]) => {
    if (list.length === 0) return;
    const first = list
      .map((t) => ({ d: nextOpenDeparture(t.departures), slug: t.trip.slug }))
      .filter((x): x is { d: TripWithDetails["departures"][number]; slug: string } => x.d !== null)
      .sort((a, b) => a.d.startDate.localeCompare(b.d.startDate))[0];
    categoryViews.push({
      category,
      trips: list,
      // Same "From" price as each trip's own page (lowest open date price).
      fromPaise: Math.min(...list.map((t) => tripPriceInfo(t.trip, t.departures).fromPaise)),
      next: first ? { date: first.d.startDate, seats: first.d.seatsRemaining, slug: first.slug, departureId: first.d.departureId } : null,
      photo: list[0].trip.heroImageUrl,
      weather: weatherBySlug.get(list[0].trip.slug) ?? null,
    });
  };
  for (const c of home.categories) {
    const list = c.tripSlugs.map((s) => bySlug.get(s)).filter((t): t is TripWithDetails => Boolean(t));
    list.forEach((t) => used.add(t.trip.slug));
    pushView(c, list);
  }
  const rest = trips.filter((t) => !used.has(t.trip.slug));
  if (rest.length > 0) {
    pushView({ id: "more", name: "More trips", description: "Other routes we run from Bengaluru.", theme: "brand", tripSlugs: rest.map((t) => t.trip.slug) }, rest);
  }

  const openSeats = openDates.reduce((sum, x) => sum + Math.max(0, x.dep.seatsRemaining), 0);
  const openDateCount = openDates.filter((x) => x.dep.seatsRemaining > 0).length;
  // The full list of dates is worth showing only when a trip has more dates than its card can show.
  const tripsWithDates = new Set(openDates.map((x) => x.trip.id)).size;
  const showAllDates = home.departuresSection.show && openDates.length > tripsWithDates;

  const chatText = "Hi Sanchari team, I have a question about upcoming 6-traveler Karnataka road trips.";
  const whatsappUrl = settings.socialLinks.whatsappNumber
    ? `https://wa.me/${settings.socialLinks.whatsappNumber}?text=${encodeURIComponent(chatText)}`
    : buildClickToWhatsAppUrl(chatText);

  const headline = settings.brandIdentity.headline;

  return (
    <div>
      {/* Who we are, for Google (business card in search results). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(businessJsonLd(settings)) }} />

      {/* First screen: what Sanchari is, the next trip you can book with its date, seats and price,
          and the two things to do next (see all trips, book this one). WhatsApp stays one tap away.
          Background: looping road-trip film, or the owner's still picture (Admin → Pictures & videos). */}
      <section className="relative isolate overflow-hidden text-cream-50">
        <HeroCinematic {...resolveHero(settings.siteMedia)} />
        <div className="relative mx-auto grid max-w-6xl gap-x-10 gap-y-5 px-4 pt-5 pb-6 sm:px-6 md:grid-cols-[1.08fr_0.92fr] md:gap-y-6 md:pt-10 md:pb-8">
          <div className="max-w-xl space-y-3 [text-shadow:0_1px_3px_rgb(10_40_30/0.45)] md:space-y-5 md:self-end">
            {/* Route minimap: beside the heading on phones, top right from md up */}
            <RoadTripMinimap
              labels={[nextUp?.trip.pickupCity || "Bengaluru", nextUp?.trip.destination.split(",")[0] ?? "Karnataka"]}
              className="float-right mb-1 ml-3 w-[92px] min-[380px]:w-[108px] md:absolute md:top-8 md:right-6 md:m-0 md:w-[168px]"
            />
            <Reveal onLoad>
              {/* The page's main heading for Google: who and what we are. A small chip; the slogan below is a styled paragraph. */}
              <h1 className="glass inline-flex max-w-[calc(100%-6.6rem)] items-center gap-2 rounded-2xl px-3.5 py-1.5 text-xs font-semibold tracking-wide text-white [font-family:inherit] min-[380px]:max-w-[calc(100%-7.6rem)] md:max-w-none md:rounded-full">
                <Compass className="h-3.5 w-3.5 shrink-0 text-saffron-500" aria-hidden="true" />
                {home.heroChip}
              </h1>
            </Reveal>

            {home.kannadaLine && (
              <Reveal onLoad delay={60}>
                <p lang="kn" className="text-base font-semibold text-saffron-500 sm:text-xl">
                  {home.kannadaLine}
                </p>
              </Reveal>
            )}

            <Reveal as="p" onLoad delay={100} className="clear-both font-display text-[2.15rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl lg:text-[3.9rem]">
              {headline.split(".")[0]}.
              <span className="text-gradient-sunrise block">{headline.split(".").slice(1).join(".").trim() || "Return as a story."}</span>
            </Reveal>

            <Reveal as="p" onLoad delay={160} className="text-[0.95rem] leading-relaxed text-white/90 sm:text-lg">
              {settings.brandIdentity.subheadline}
            </Reveal>
          </div>

          {/* The next trip, as a seat ticket: on phones it sits right under the headline. */}
          <Reveal onLoad delay={220} className="flex justify-center md:col-start-2 md:row-span-2 md:row-start-1 md:items-end md:justify-end md:pt-[13.25rem]">
            {nextUp ? (
              <NextTripTicket
                from={nextUp.trip.pickupCity || "Bengaluru"}
                destination={nextUp.trip.destination.split(",")[0].trim()}
                tripTitle={nextUp.trip.title}
                tripSlug={nextUp.trip.slug}
                departureId={nextUp.dep.departureId}
                startDate={nextUp.dep.startDate}
                endDate={nextUp.dep.endDate}
                durationDays={nextUp.trip.durationDays}
                durationNights={nextUp.trip.durationNights}
                seatsRemaining={nextUp.dep.seatsRemaining}
                maxCapacity={nextUp.dep.maxCapacity}
                takenSeats={ticketSeats}
                pricePaise={nextUnitPaise}
                advance={nextAdvance}
                womenOnly={nextUp.dep.departureType === "women_only"}
              />
            ) : (
              <NoTripTicket notifyHref={home.planSection.show ? "#plan" : "/contact"} />
            )}
          </Reveal>

          <div className="space-y-4 md:col-start-1 md:row-start-2 md:self-start">
            <Reveal onLoad delay={280} className="flex flex-wrap items-center gap-2.5">
              <Link href="/trips" className="btn-sunset min-h-12 flex-1 px-5 text-sm min-[420px]:flex-none sm:px-6">
                Explore trips
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white transition hover:bg-white/20 min-[420px]:flex-none"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  WhatsApp us
                </a>
              )}
              <Link href="/trips?mode=private" className="inline-flex min-h-11 w-full items-center text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 [text-shadow:0_1px_3px_rgb(10_40_30/0.6)] hover:decoration-white min-[640px]:w-auto min-[640px]:pl-1">
                Book the whole car for your group
              </Link>
            </Reveal>

            {home.heroPoints.length > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm font-semibold text-white [text-shadow:0_1px_3px_rgb(10_40_30/0.6)]">
                {home.heroPoints.map((point) => (
                  <li key={point} className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4 shrink-0 text-saffron-500" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* The trip in five steps, see-through over the film (upcoming steps from Admin → Home page). */}
        <div className="relative mx-auto max-w-6xl px-4 pb-8 sm:px-6 md:pb-10">
          <HeroJourneySteps upcoming={home.beyondSection.upcomingSteps} />
        </div>
      </section>

      {/* Upcoming trips, straight after the first screen: every trip with its next date, open seats and price. */}
      {home.routesSection.show && trips.length > 0 && (
        <section id="upcoming-dates" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-10 pb-4 sm:px-6 sm:pt-14" aria-labelledby="upcoming-trips">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="space-y-2">
              <SectionHead text={home.routesSection} id="upcoming-trips" />
              {openSeats > 0 && (
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#12603e]">
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50 motion-reduce:hidden" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
                  </span>
                  {`${openSeats} ${openSeats === 1 ? "seat" : "seats"} open on ${openDateCount === 1 ? "1 date" : `${openDateCount} dates`} right now`}
                </p>
              )}
            </div>
            <Link href="/trips" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-forest-900 px-4 text-sm font-semibold text-forest-900 hover:bg-forest-900 hover:text-cream-50">
              Filter all trips <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {trips.map((item) => (
              <TripCard key={item.trip.id} item={item} weather={weatherBySlug.get(item.trip.slug) ?? null} />
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link href="/karnataka-tour-packages" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700">
              Karnataka tour packages <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            {hasStories && (
              <Link href="/blog" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700">
                Latest stories <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Every date, when a trip runs on more dates than its card can show. */}
      {showAllDates && (
        <section className="sec-route mt-10 border-y border-stone-200/70" aria-labelledby="all-dates">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <div className="mb-6">
              <SectionHead text={home.departuresSection} id="all-dates" />
            </div>
            <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {openDates.slice(0, 9).map(({ dep, trip }) => {
                const seats = seatSummary(dep);
                return (
                  <li key={dep.departureId}>
                    <Link
                      href={`/trips/${trip.slug}?date=${dep.departureId}#book`}
                      className={`card-theme card-lift ${themeClass(trip.slug, trip.destination, trip.region)} flex h-full items-center justify-between gap-3 p-4 pt-5`}
                    >
                      <span className="min-w-0">
                        <span className="block font-display text-lg leading-tight font-semibold text-ink-900">{formatTripDates(dep.startDate, dep.endDate, { weekday: true })}</span>
                        <span className="th-text mt-0.5 block truncate text-sm font-semibold">{trip.title}</span>
                        <span className={`mt-1 block text-xs font-semibold ${seats.tone === "full" ? "text-stone-600" : seats.tone === "few" ? "text-copper-700" : "text-[#12603e]"}`}>
                          {seats.tone === "full" ? "Sold out, waitlist open" : seats.label}
                        </span>
                        {dep.departureType === "women_only" && (
                          <span className="mt-1 inline-block rounded-full bg-[#fde3e6] px-2 py-0.5 text-[11px] font-semibold text-[#a3263a]">Women only</span>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-base font-bold text-forest-900">{formatINR(dep.priceOverridePaise ?? trip.basePricePaise)}</span>
                        <span className="block text-[11px] text-stone-600">per person</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* Offers & ads from Admin → Offers & ads (home banner) */}
      {homeOffers.length > 0 && (
        <section aria-label="Current offers" className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
          <PromoBanner promotions={homeOffers} />
        </section>
      )}

      {/* What every trip keeps to, each promise linked to where it is written down. */}
      <TrustPromises text={home.trustSection} cards={home.trustCards} />

      {/* Categories (Admin → Home page): photo header in the place's colours, description, trips, price, next date, live weather */}
      {home.categoriesSection.show && categoryViews.length > 0 && (
        <section className="sec-contour border-y border-stone-200/70" aria-labelledby="pick-trip">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <div className="mb-6">
              <SectionHead text={home.categoriesSection} id="pick-trip" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {categoryViews.map((v) => (
                <Link
                  key={v.category.id}
                  href={v.category.id === "more" ? "/trips" : `/trips?category=${encodeURIComponent(v.category.id)}`}
                  className={`card-theme card-lift theme-${v.category.theme} group flex h-full flex-col`}
                >
                  <div className="relative h-32 overflow-hidden sm:h-36">
                    <Image
                      src={v.photo}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      unoptimized={!isOptimizableImage(v.photo)}
                      className="object-cover transition duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,color-mix(in_srgb,var(--th-deep)_88%,transparent)_100%)]" />
                    <span className="absolute top-2.5 left-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-ink-900">
                      {v.trips.length} {v.trips.length === 1 ? "trip" : "trips"}
                    </span>
                    {v.trips[0] && (
                      <LiveWeatherBadge
                        slug={v.trips[0].trip.slug}
                        region={v.trips[0].trip.region}
                        initial={v.weather}
                        variant="temp"
                        className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink-900"
                      />
                    )}
                    <h3 className="absolute right-3 bottom-2.5 left-3 font-display text-xl leading-tight font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.35)]">
                      {v.category.name}
                    </h3>
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5 p-4">
                    {v.category.description && <p className="text-xs leading-relaxed text-ink-900/80">{v.category.description}</p>}
                    <ul className="flex flex-wrap gap-1.5">
                      {v.trips.slice(0, 3).map((t) => (
                        <li key={t.trip.id} className="th-chip rounded-full px-2 py-0.5 text-[11px] font-semibold">
                          {`${t.trip.destination.split(",")[0]}, ${t.trip.durationDays} ${t.trip.durationDays === 1 ? "day" : "days"}`}
                        </li>
                      ))}
                    </ul>
                    {v.trips[0] && (
                      <LiveWeatherBadge
                        slug={v.trips[0].trip.slug}
                        region={v.trips[0].trip.region}
                        initial={v.weather}
                        variant="now"
                        className="th-text flex items-start gap-1 text-[11px] font-semibold"
                      />
                    )}
                    <div className="mt-auto flex flex-wrap items-end justify-between gap-1 border-t border-black/5 pt-2.5">
                      <span className="text-sm font-bold text-ink-900">
                        <span className="text-[11px] font-medium text-stone-600">from </span>
                        {formatINR(v.fromPaise)}
                        <span className="text-[11px] font-medium text-stone-600"> / seat</span>
                      </span>
                      <span className="th-accent text-[11px] font-semibold">
                        {v.next ? `${v.next.seats} open, ${formatTripDay(v.next.date)}` : "New dates soon"}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {home.travellerCards.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {home.travellerCards.map((c) => {
                  const inner = (
                    <>
                      <span className="tile-num mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm">
                        <HomeIcon name={c.icon} className="h-4.5 w-4.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-ink-900">{c.title}</span>
                        {c.body && <span className="mt-0.5 block text-xs leading-snug text-ink-900/70">{c.body}</span>}
                      </span>
                    </>
                  );
                  const cls = `tile tile-${c.colour} card-lift flex flex-col items-start gap-2 p-4 sm:flex-row sm:gap-3`;
                  return c.href ? (
                    <Link key={c.title} href={c.href} className={cls}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={c.title} className={cls}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* How Sanchari works (cards from Admin) */}
      {home.howSection.show && home.howCards.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="mb-8">
            <SectionHead text={home.howSection} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {home.howCards.map((item, i) => (
              <div key={`${item.title}-${i}`} className={`tile tile-${item.colour} space-y-3 p-6`}>
                <span className="tile-num inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 shadow-sm">
                  <HomeIcon name={item.icon} className="h-5 w-5" />
                </span>
                <h3 className="font-display text-lg font-semibold text-ink-900">{item.title}</h3>
                {item.body && <p className="text-sm leading-relaxed text-ink-900/75">{item.body}</p>}
                {item.href && (
                  <Link href={item.href} className="tile-num inline-flex min-h-9 items-center gap-1 text-xs font-semibold">
                    Learn more <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Real photos of the car, shown once the owner has added some (Admin → Pictures & videos). */}
      <PhotoSection text={home.vehicleSection} photos={settings.siteMedia.vehiclePhotos} id="our-car" altPrefix="The Sanchari car" />

      {/* Coming soon: resorts, hotel rooms and pick-up-to-drop planning (words and cards from Admin) */}
      {home.beyondSection.show && (
        <section className="sec-sunrise border-y border-stone-200/70" aria-labelledby="beyond-trip">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-8">
            {/* The card's whole background is the pick-up → journey → moments → stay → drop film
                (made in Canva from free clips; replaceable in Admin → Pictures & videos). */}
            <JourneyReel {...resolveJourney(settings.siteMedia)} watermark={home.beyondSection.watermark} upcoming={home.beyondSection.upcomingSteps} className="p-6 pt-12 sm:p-8 sm:pt-14 lg:min-h-[470px]">
              <div className="space-y-5">
                <SectionHead text={home.beyondSection} id="beyond-trip" light />
                {home.beyondSection.tagline && (
                  <p className="font-display text-xl leading-snug font-semibold text-peach-100 sm:text-2xl">{home.beyondSection.tagline}</p>
                )}
                {home.beyondSection.buttonLabel && (
                  <Link href={home.planSection.show ? "#plan" : "/contact"} className="btn-sunset px-6 py-3 text-sm [text-shadow:none]">
                    {home.beyondSection.buttonLabel}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </JourneyReel>
            {home.beyondCards.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {home.beyondCards.map((item, i) => (
                  <div key={`${item.title}-${i}`} className={`tile tile-${item.colour} space-y-2.5 p-5`}>
                    <span className="tile-num inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 shadow-sm">
                      <HomeIcon name={item.icon} className="h-5 w-5" />
                    </span>
                    <h3 className="font-display text-lg font-semibold text-ink-900">{item.title}</h3>
                    {item.body && <p className="text-sm leading-relaxed text-ink-900/75">{item.body}</p>}
                    {item.href && (
                      <Link href={item.href} className="tile-num inline-flex min-h-9 items-center gap-1 text-xs font-semibold">
                        Learn more <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Comparison table (rows from Admin) */}
      {home.compareSection.show && home.compareRows.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="car-vs-bus">
          <div className="mb-6">
            <SectionHead text={home.compareSection} id="car-vs-bus" />
          </div>
          <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[var(--shadow-soft)]">
            <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1fr)] text-xs sm:text-sm">
              <div className="bg-cream-100 p-3 sm:p-4" />
              <div className="flex items-center gap-2 bg-gradient-to-br from-[#dcf3e3] to-[#d9f2f2] p-3 font-bold text-forest-900 sm:p-4">
                <Car className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" /> {home.compareSection.usLabel}
              </div>
              <div className="flex items-center gap-2 bg-stone-200/60 p-3 font-semibold text-stone-600 sm:p-4">
                <Bus className="h-4 w-4 shrink-0" aria-hidden="true" /> {home.compareSection.themLabel}
              </div>
              {home.compareRows.map((row, i) => (
                <div key={`${row.label}-${i}`} className="contents">
                  <div className={`p-3 font-semibold text-ink-900 sm:p-4 ${i % 2 ? "bg-cream-100/60" : "bg-white"}`}>{row.label}</div>
                  <div className={`flex gap-1.5 p-3 text-ink-900 sm:p-4 ${i % 2 ? "bg-[#eef8f1]" : "bg-[#f5fbf7]"}`}>
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest-700" aria-hidden="true" />
                    <span>{row.us}</span>
                  </div>
                  <div className={`flex gap-1.5 p-3 text-stone-600 sm:p-4 ${i % 2 ? "bg-cream-100/60" : "bg-white"}`}>
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-300" aria-hidden="true" />
                    <span>{row.them}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Safety, respect & privacy */}
      {home.safetySection.show && (
        <section className="bg-ocean text-cream-100">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-2">
            <div className="relative aspect-[3/2] overflow-hidden rounded-3xl border border-white/20 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.45)]">
              <LivingPhoto
                variant="card"
                region="Western Ghats"
                src={settings.siteMedia.safetyPhoto || BUILT_IN_MEDIA.safetyPhoto}
                alt={settings.siteMedia.safetyPhoto ? "Sanchari Trips travellers in Karnataka" : "Four friends sharing morning filter coffee on a Karnataka coffee-estate verandah"}
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            <div className="space-y-4">
              <SectionHead text={{ ...home.safetySection, body: "" }} light />
              {home.safetySection.body && <p className="text-sm leading-relaxed text-white/85">{home.safetySection.body}</p>}
              <div className="flex flex-wrap gap-3 pt-2">
                <Link href="/safety" className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-forest-900 hover:bg-lagoon-100">
                  Read safety &amp; comfort standards
                </Link>
                <Link href="/policies" className="glass inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-white hover:bg-white/20">
                  View policies
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* The people behind Sanchari (Admin → Pictures & videos → Team) */}
      <TeamSection text={home.teamSection} team={settings.siteMedia.team} />

      {/* Real photos from trips that ran, shown once the owner has added some. */}
      <PhotoSection text={home.journeysSection} photos={settings.siteMedia.tripPhotos} id="from-our-trips" altPrefix="A Sanchari trip" />

      {/* Verified reviews: shown once there are real, moderated ones. Until then the promises, the
          team and the published policies above carry the trust; no empty box, no stand-in quotes. */}
      {home.reviewsSection.show && reviews.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="mb-6">
            <SectionHead text={home.reviewsSection} />
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {reviews.map((rev, i) => (
              <blockquote key={rev.id} className={`tile ${["tile-lagoon", "tile-sunset", "tile-leaf"][i % 3]} space-y-3 p-5`}>
                <p className="text-sm leading-relaxed text-ink-900">“{rev.quote}”</p>
                <footer className="text-xs text-stone-600">
                  <strong className="text-forest-900">{rev.authorName}</strong>
                  {rev.departureLabel ? ` • ${rev.departureLabel}` : ""}
                </footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      {/* Plan a private / group / custom trip: reply on WhatsApp */}
      {home.planSection.show && (
        <section id="plan" className="sec-sunrise scroll-mt-20 border-y border-stone-200/70">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="space-y-3">
              <SectionHead text={home.planSection} />
              {whatsappUrl && (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-ocean min-h-11 px-5 text-sm">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Chat on WhatsApp
                </a>
              )}
            </div>
            <EnquiryForm defaultKind="group" />
          </div>
        </section>
      )}
    </div>
  );
}
