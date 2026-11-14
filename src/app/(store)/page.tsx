import { ArrowRight, Bus, Calendar, Car, Check, Compass, MessageCircle, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CountUp, HeroCinematic, Reveal, SeatPulse } from "@/components/motion";
import { EnquiryForm } from "@/components/EnquiryForm";
import { HomeIcon } from "@/components/home/icons";
import { LivingPhoto } from "@/components/living/LivingPhoto";
import type { LiveWeather } from "@/components/living/weather";
import { PromoBanner } from "@/components/promo/PromoBanner";
import { RoadTripMinimap } from "@/components/three/RoadTripMinimap";
import { TripCard } from "@/components/TripCard";
import { formatINR } from "@/lib/currency";
import { forPlacement, getLivePromotions } from "@/lib/data/promotions";
import { getPublishedTripsWithDetails, getSiteSettings, getVerifiedReviews } from "@/lib/data/repository";
import { themeClass } from "@/lib/destination-theme";
import type { HomeCategory, SectionText } from "@/lib/home-content";
import { isOptimizableImage } from "@/lib/media";
import { buildClickToWhatsAppUrl } from "@/lib/messaging/provider";
import type { TripWithDetails } from "@/lib/types";
import { getDestinationWeather } from "@/lib/weather-server";
import { businessJsonLd, jsonLdText } from "@/lib/seo";
import type { Metadata } from "next";
import { LiveWeatherBadge } from "@/components/living/LiveWeatherBadge";
import { isBookable } from "@/lib/departure-rules";

// Served from the CDN; refreshed every 30 s and immediately after bookings / admin edits.
export const revalidate = 30;

// The one address Google should list for the home page (not ?lang=kn, not the old vercel.app link).
export const metadata: Metadata = { alternates: { canonical: "/" } };

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** Dates a visitor can still book (not cancelled, not left yet, booking cut-off not passed). */
const isOpen = (d: TripWithDetails["departures"][number]) => isBookable(d);

/** Eyebrow + title (+ optional line) heading used by every section; all words come from Admin. */
function SectionHead({ text, id, light = false }: { text: SectionText; id?: string; light?: boolean }) {
  return (
    <div className="max-w-2xl space-y-1.5">
      {text.eyebrow && <p className={light ? "text-xs font-semibold tracking-[0.14em] text-saffron-500 uppercase" : "eyebrow"}>{text.eyebrow}</p>}
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
  const homeOffers = forPlacement(promotions, "home_banner");

  // Live weather at every destination, looked up while the page is built (cached 15 min), so the
  // cards show it with the first paint instead of fetching after load.
  const weatherBySlug = new Map(
    await Promise.all(
      trips.map(
        async (t) => [t.trip.slug, await getDestinationWeather(t.trip.slug, t.trip.region, { timeoutMs: 2500, destination: t.trip.destination })] as const
      )
    )
  );

  // Categories from Admin, each with its live trips. Published trips not in any category are
  // collected under "More trips", so nothing the owner publishes is ever hidden.
  const bySlug = new Map(trips.map((t) => [t.trip.slug, t]));
  const used = new Set<string>();
  const categoryViews: CategoryView[] = [];
  const pushView = (category: HomeCategory, list: TripWithDetails[]) => {
    if (list.length === 0) return;
    const deps = list
      .flatMap((t) => t.departures.filter((d) => isOpen(d) && d.seatsRemaining > 0).map((d) => ({ d, slug: t.trip.slug })))
      .sort((a, b) => a.d.startDate.localeCompare(b.d.startDate));
    const first = deps[0];
    categoryViews.push({
      category,
      trips: list,
      fromPaise: Math.min(...list.map((t) => t.trip.basePricePaise)),
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

  const upcomingDepartures = trips
    .flatMap((t) =>
      t.departures.map((d) => ({
        ...d,
        tripTitle: t.trip.title,
        tripSlug: t.trip.slug,
        destination: t.trip.destination,
        region: t.trip.region,
        basePricePaise: t.trip.basePricePaise,
      }))
    )
    .filter(isOpen)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 6);

  const nextDeparture = upcomingDepartures.find((d) => d.seatsRemaining > 0) ?? null;
  const openSeats = trips.reduce(
    (sum, t) => sum + t.departures.filter(isOpen).reduce((s, d) => s + Math.max(0, d.seatsRemaining), 0),
    0
  );

  const chatText = "Hi Sanchari team, I have a question about upcoming 6-traveler Karnataka road trips.";
  const whatsappUrl = settings.socialLinks.whatsappNumber
    ? `https://wa.me/${settings.socialLinks.whatsappNumber}?text=${encodeURIComponent(chatText)}`
    : buildClickToWhatsAppUrl(chatText);

  const headline = settings.brandIdentity.headline;

  return (
    <div>
      {/* Who we are, for Google (business card in search results). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(businessJsonLd(settings)) }} />
      {/* Hero: looping road-trip film (tea hills at sunrise) under a soft tea-green shade */}
      <section className="relative isolate overflow-hidden text-cream-50">
        <HeroCinematic
          videoSrc="/media/motion/hero-loop.mp4"
          mobileVideoSrc="/media/motion/hero-loop-mobile.mp4"
          posterSrc="/media/motion/hero-loop-poster.jpg"
          mobilePosterSrc="/media/motion/hero-loop-mobile-poster.jpg"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-20 sm:px-6 md:grid-cols-[1.15fr_0.85fr] md:pt-20 md:pb-28">
          <div className="max-w-xl space-y-5 [text-shadow:0_1px_3px_rgb(10_40_30/0.45)]">
            {/* Game-style minimap: floats beside the headline on phones, pinned top-right from md up */}
            <RoadTripMinimap
              labels={["Bengaluru", nextDeparture?.destination.split(",")[0] ?? "Chikmagalur"]}
              className="float-right mb-2 ml-3 w-[104px] min-[360px]:w-[128px] md:absolute md:top-8 md:right-6 md:m-0 md:w-[232px] lg:w-[252px]"
            />
            <Reveal onLoad>
              {/* The page's main heading for Google: what we are ("Weekend trips from Bengaluru • Max 6 per car").
                  Looks exactly like before (small chip); the big slogan below is a styled paragraph. */}
              <h1 className="glass inline-flex max-w-[calc(100%-7.4rem)] items-center gap-2 rounded-2xl px-3.5 py-1.5 text-xs font-semibold tracking-wide text-white [font-family:inherit] min-[360px]:max-w-[calc(100%-8.9rem)] md:max-w-none md:rounded-full">
                <Compass className="h-3.5 w-3.5 text-saffron-500" aria-hidden="true" />
                {home.heroChip}
              </h1>
            </Reveal>

            {home.kannadaLine && (
              <Reveal onLoad delay={60}>
                <p lang="kn" className="text-lg font-semibold text-saffron-500 sm:text-xl">
                  {home.kannadaLine}
                </p>
              </Reveal>
            )}

            <Reveal as="p" onLoad delay={100} className="font-display text-[2.5rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl lg:text-[4.1rem]">
              {headline.split(".")[0]}.
              <span className="text-gradient-sunrise block">{headline.split(".").slice(1).join(".").trim() || "Return as a story."}</span>
            </Reveal>

            <Reveal as="p" onLoad delay={180} className="text-base leading-relaxed text-white/90 sm:text-lg">
              {settings.brandIdentity.subheadline}
            </Reveal>

            {nextDeparture && (
              <Reveal onLoad delay={240}>
                <Link
                  href={`/trips/${nextDeparture.tripSlug}?date=${nextDeparture.departureId}#book`}
                  className="glass group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-sm text-white transition hover:bg-white/20"
                >
                  <span className="rounded-full bg-copper-700 px-2.5 py-0.5 text-[11px] font-bold tracking-wider uppercase">Next departure</span>
                  <span className="font-semibold">{nextDeparture.destination.split(",")[0]}</span>
                  <span className="text-white/85">
                    {shortDate(nextDeparture.startDate)} – {shortDate(nextDeparture.endDate)}
                  </span>
                  <span className="font-bold text-saffron-500">
                    {nextDeparture.seatsRemaining} of {nextDeparture.maxCapacity} seats left
                  </span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </Reveal>
            )}

            <Reveal onLoad delay={300} className="flex flex-wrap gap-3 pt-1">
              <Link href="/trips" className="btn-sunset px-6 py-3.5 text-sm">
                Grab your seat
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/trips?mode=private" className="glass inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/20">
                Book the whole car
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Live numbers: four colour tiles, all from live data */}
      <section className="relative z-10 mx-auto -mt-10 max-w-5xl px-4 sm:px-6">
        <div className="card-soft grid grid-cols-2 gap-2.5 p-2.5 sm:grid-cols-4 sm:gap-3 sm:p-3">
          {[
            { value: settings.bookingPolicy.maxGroupSize, label: "seats max per car", tile: "tile-sunset" },
            { value: trips.length, label: "Karnataka routes", tile: "tile-lagoon" },
            { value: openSeats, label: "seats open now", tile: "tile-leaf", live: true },
            { value: 0, label: "fees on UPI payments", tile: "tile-amber", zero: true },
          ].map((stat) => (
            <div key={stat.label} className={`tile ${stat.tile} text-center`}>
              <p className="tile-num font-display text-3xl font-semibold sm:text-4xl">{stat.zero ? "₹0" : <CountUp value={stat.value} />}</p>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-ink-900/75">
                {stat.live && (
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-forest-700 opacity-50 motion-reduce:hidden" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-forest-700" />
                  </span>
                )}
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Offers & ads from Admin → Offers & ads (home banner) */}
      {homeOffers.length > 0 && (
        <section aria-label="Current offers" className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
          <PromoBanner promotions={homeOffers} />
        </section>
      )}

      {/* Categories (Admin → Home page): photo header in the place's colours, description, trips, price, next date, live weather */}
      {home.categoriesSection.show && categoryViews.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-4 sm:px-6" aria-labelledby="pick-weekend">
          <div className="mb-6">
            <SectionHead text={home.categoriesSection} id="pick-weekend" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categoryViews.map((v, i) => (
              <Reveal key={v.category.id} className="h-full" delay={i * 60}>
                <Link
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
                    <span className="absolute top-2.5 left-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold tracking-wider text-ink-900 uppercase">
                      {v.trips.length} {v.trips.length === 1 ? "trip" : "trips"}
                    </span>
                    {v.trips[0] && (
                      <LiveWeatherBadge
                        slug={v.trips[0].trip.slug}
                        region={v.trips[0].trip.region}
                        initial={v.weather}
                        variant="temp"
                        className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-ink-900"
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
                        <li key={t.trip.id} className="th-chip rounded-full px-2 py-0.5 text-[10px] font-semibold">
                          {t.trip.destination.split(",")[0]} · {t.trip.durationDays}D
                        </li>
                      ))}
                    </ul>
                    {v.trips[0] && (
                      <LiveWeatherBadge
                        slug={v.trips[0].trip.slug}
                        region={v.trips[0].trip.region}
                        initial={v.weather}
                        variant="now"
                        className="th-text flex items-center gap-1 text-[11px] font-semibold"
                      />
                    )}
                    <div className="mt-auto flex flex-wrap items-end justify-between gap-1 border-t border-black/5 pt-2.5">
                      <span className="text-sm font-bold text-ink-900">
                        <span className="text-[10px] font-medium text-stone-600">from </span>
                        {formatINR(v.fromPaise)}
                        <span className="text-[10px] font-medium text-stone-600"> / seat</span>
                      </span>
                      <span className="th-accent text-[11px] font-semibold">
                        {v.next ? `${v.next.seats} open · ${shortDate(v.next.date)}` : "New dates soon"}
                      </span>
                    </div>
                  </div>
                </Link>
              </Reveal>
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
        </section>
      )}

      {/* Upcoming departures: live seats, each card in its destination's colours */}
      {home.departuresSection.show && upcomingDepartures.length > 0 && (
        <section id="upcoming-dates" className="sec-route mt-12 scroll-mt-16 border-y border-stone-200/70">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <SectionHead text={home.departuresSection} />
              <Link href="/trips" className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700">
                Filter all dates <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingDepartures.map((dep, i) => (
                <Reveal key={dep.departureId} delay={i * 60} className="h-full">
                  <Link
                    href={`/trips/${dep.tripSlug}?date=${dep.departureId}#book`}
                    className={`card-theme card-lift ${themeClass(dep.tripSlug, dep.destination, dep.region)} flex h-full flex-col justify-between p-5`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-stone-600">{dep.departureCode}</span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-semibold ${
                            dep.seatsRemaining === 0 ? "bg-stone-200 text-stone-600" : dep.seatsRemaining <= 2 ? "bg-copper-600 text-white" : "th-chip"
                          }`}
                        >
                          {dep.seatsRemaining === 0 ? "Sold out • Waitlist" : `${dep.seatsRemaining} / ${dep.maxCapacity} open`}
                        </span>
                      </div>
                      <p className="th-text font-display text-lg font-semibold">{dep.tripTitle}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-900/75">
                        <Calendar className="th-accent h-3.5 w-3.5" aria-hidden="true" />
                        {shortDate(dep.startDate)} – {shortDate(dep.endDate)}
                        {dep.departureType === "women_only" && (
                          <span className="ml-1 rounded bg-copper-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-copper-700">Women-only</span>
                        )}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2.5 text-xs">
                      <span className="font-bold text-ink-900">{formatINR(dep.priceOverridePaise ?? dep.basePricePaise)} / seat</span>
                      <span className="font-semibold text-copper-700">{dep.seatsRemaining === 0 ? "Join waitlist →" : "Reserve seats →"}</span>
                    </div>
                    <SeatPulse taken={dep.seatsTaken} max={dep.maxCapacity} showLegend={false} className="mt-4 max-w-[150px]" />
                  </Link>
                </Reveal>
              ))}
            </div>
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

      {/* How Sanchari works (cards from Admin) */}
      {home.howSection.show && home.howCards.length > 0 && (
        <section className="sec-contour border-y border-stone-200/70">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="mb-10">
              <SectionHead text={home.howSection} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
              {home.howCards.map((item, i) => (
                <Reveal key={`${item.title}-${i}`} delay={i * 80} className={`tile tile-${item.colour} card-lift space-y-3 p-6`}>
                  <span className="tile-num inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 shadow-sm">
                    <HomeIcon name={item.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-lg font-semibold text-ink-900">{item.title}</h3>
                  {item.body && <p className="text-sm leading-relaxed text-ink-900/75">{item.body}</p>}
                  {item.href && (
                    <Link href={item.href} className="tile-num inline-flex items-center gap-1 text-xs font-semibold">
                      Learn more <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Karnataka routes */}
      {home.routesSection.show && (
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <SectionHead text={home.routesSection} />
            <Link
              href="/trips"
              className="rounded-full border border-forest-900 px-4 py-2 text-xs font-semibold text-forest-900 hover:bg-forest-900 hover:text-cream-50"
            >
              View all trips
            </Link>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {trips.map((item) => (
              <TripCard key={item.trip.id} item={item} weather={weatherBySlug.get(item.trip.slug) ?? null} />
            ))}
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
                src="/media/story-coffee-morning.jpg"
                alt="Four friends sharing morning filter coffee on a Karnataka coffee-estate verandah"
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            <div className="space-y-4">
              <SectionHead text={{ ...home.safetySection, body: "" }} light />
              {home.safetySection.body && <p className="text-sm leading-relaxed text-white/85">{home.safetySection.body}</p>}
              <div className="flex flex-wrap gap-3 pt-2">
                <Link href="/safety" className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-forest-900 hover:bg-lagoon-100">
                  Read safety &amp; comfort standards
                </Link>
                <Link href="/policies" className="glass rounded-full px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/20">
                  View policies
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Verified reviews (only real, moderated reviews) */}
      {home.reviewsSection.show && (
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="mb-6">
            <SectionHead text={home.reviewsSection} />
          </div>
          {reviews.length === 0 ? (
            <div className="sec-sunrise rounded-2xl border border-dashed border-stone-300 p-6 text-sm text-stone-600">
              Authentic traveler reviews are published only after verified completed departures. No placeholder testimonials are displayed here.
            </div>
          ) : (
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
          )}
        </section>
      )}

      {/* Plan a private / group / custom trip: reply on WhatsApp */}
      {home.planSection.show && (
        <section id="plan" className="sec-sunrise scroll-mt-20 border-y border-stone-200/70">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="space-y-3">
              <SectionHead text={home.planSection} />
              {whatsappUrl && (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-ocean px-5 py-2.5 text-sm">
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
