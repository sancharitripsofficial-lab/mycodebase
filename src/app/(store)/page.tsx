import {
  ArrowRight,
  Bus,
  Calendar,
  Car,
  Check,
  CloudRain,
  CloudSun,
  Compass,
  HeartHandshake,
  MessageCircle,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { CountUp, HeroCinematic, Reveal, SeatPulse } from "@/components/motion";
import { EnquiryForm } from "@/components/EnquiryForm";
import { LivingPhoto } from "@/components/living/LivingPhoto";
import type { LiveWeather } from "@/components/living/weather";
import { PromoBanner } from "@/components/promo/PromoBanner";
import { RoadTripMinimap } from "@/components/three/RoadTripMinimap";
import { TripCard } from "@/components/TripCard";
import { formatINR } from "@/lib/currency";
import { forPlacement, getLivePromotions } from "@/lib/data/promotions";
import { getPublishedTripsWithDetails, getSiteSettings, getVerifiedReviews } from "@/lib/data/repository";
import { themeClass } from "@/lib/destination-theme";
import { buildClickToWhatsAppUrl } from "@/lib/messaging/provider";
import { getDestinationWeather } from "@/lib/weather-server";

// Served from the CDN; refreshed every 30 s and immediately after bookings / admin edits.
export const revalidate = 30;

function WeatherIcon({ w }: { w: LiveWeather }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (w.condition === "rain" || w.condition === "storm") return <CloudRain className={cls} aria-hidden="true" />;
  if (w.condition === "clear" && w.isDay) return <Sun className={cls} aria-hidden="true" />;
  return <CloudSun className={cls} aria-hidden="true" />;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export default async function HomePage() {
  const [{ trips }, { settings }, reviews, promotions] = await Promise.all([
    getPublishedTripsWithDetails(),
    getSiteSettings(),
    getVerifiedReviews(),
    getLivePromotions(),
  ]);
  const homeOffers = forPlacement(promotions, "home_banner");

  // Live weather at every destination, looked up while the page is built (cached 15 min), so the
  // cards show it with the first paint instead of fetching after load.
  const weatherBySlug = new Map(
    await Promise.all(
      trips.map(
        async (t) => [t.trip.slug, await getDestinationWeather(t.trip.slug, t.trip.region, { timeoutMs: 2500 })] as const
      )
    )
  );

  const upcomingDepartures = trips
    .flatMap((t) =>
      t.departures.map((d) => ({
        ...d,
        tripTitle: t.trip.title,
        tripSlug: t.trip.slug,
        destination: t.trip.destination,
        region: t.trip.region,
        basePricePaise: t.trip.basePricePaise,
        heroImageUrl: t.trip.heroImageUrl,
      }))
    )
    .filter((d) => d.status !== "cancelled" && d.status !== "completed")
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 6);

  const nextDeparture = upcomingDepartures.find((d) => d.seatsRemaining > 0) ?? null;
  const openSeats = trips.reduce(
    (sum, t) =>
      sum +
      t.departures
        .filter((d) => d.status !== "cancelled" && d.status !== "completed")
        .reduce((s, d) => s + Math.max(0, d.seatsRemaining), 0),
    0
  );

  const whatsappUrl = settings.socialLinks.whatsappNumber
    ? `https://wa.me/${settings.socialLinks.whatsappNumber}?text=${encodeURIComponent(
        "Hi Sanchari team, I have a question about upcoming 6-traveler Karnataka road trips."
      )}`
    : buildClickToWhatsAppUrl("Hi Sanchari team, I have a question about upcoming 6-traveler Karnataka road trips.");

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: settings.faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  const travellerTypes = [
    {
      icon: UserRound,
      title: "Going solo",
      body: "Buy one seat, ride with five others. Pick a window on the live car map.",
      href: "/trips",
      tile: "tile-lagoon",
    },
    {
      icon: ShieldCheck,
      title: "Women-only batches",
      body: "Dates run only with women travellers, scheduled by our team.",
      href: "/trips?mode=women",
      tile: "tile-rose",
    },
    {
      icon: HeartHandshake,
      title: "Couples & families",
      body: "Book the whole car: all six seats, just your people.",
      href: "/trips?mode=private",
      tile: "tile-sunset",
    },
    {
      icon: UsersRound,
      title: "Friends & teams",
      body: "More than six? We run two or more cars on your date.",
      href: "#plan",
      tile: "tile-leaf",
    },
  ];

  const comparison: Array<{ label: string; us: string; bus: string }> = [
    { label: "People on board", us: "6 at most, always", bus: "Often 30 to 50" },
    { label: "Your seat", us: "You pick it on a live car map", bus: "Given out on boarding day" },
    {
      label: "Booking",
      us: `Live dates and seats, held ${settings.bookingPolicy.holdMinutes} min while you pay by UPI`,
      bus: "Fill a form, wait for a call-back",
    },
    { label: "Driver and car", us: "Name, car and WhatsApp group shown 3 days before", bus: "Shared on the day" },
    { label: "Whole vehicle", us: "Book all six seats for your group", bus: "Rarely possible" },
  ];

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

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
            {/* Live 3D minimap HUD: floats beside the headline on phones (text wraps round it), pinned to the hero's top-right corner from md up */}
            <RoadTripMinimap
              labels={["Bengaluru", nextDeparture?.destination.split(",")[0] ?? "Chikmagalur"]}
              className="float-right mb-2 ml-3 w-[104px] min-[360px]:w-[128px] md:absolute md:right-6 md:top-8 md:m-0 md:w-[232px] lg:w-[252px]"
            />
            <Reveal onLoad>
              <p className="glass inline-flex max-w-[calc(100%-7.4rem)] items-center gap-2 rounded-2xl px-3.5 py-1.5 text-xs font-semibold tracking-wide text-white min-[360px]:max-w-[calc(100%-8.9rem)] md:max-w-none md:rounded-full">
                <Compass className="h-3.5 w-3.5 text-saffron-500" aria-hidden="true" />
                Weekend trips from Bengaluru • Max 6 per car
              </p>
            </Reveal>

            <Reveal onLoad delay={60}>
              <p lang="kn" className="text-lg font-semibold text-saffron-500 sm:text-xl">
                ಬನ್ನಿ, ಕರ್ನಾಟಕ ಸುತ್ತೋಣ
              </p>
            </Reveal>

            <Reveal
              as="h1"
              onLoad
              delay={100}
              className="font-display text-[2.5rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl lg:text-[4.1rem]"
            >
              {settings.brandIdentity.headline.split(".")[0]}.
              <span className="block text-gradient-sunrise">
                {settings.brandIdentity.headline.split(".").slice(1).join(".").trim() || "Return as a story."}
              </span>
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
                  <span className="rounded-full bg-copper-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider">
                    Next departure
                  </span>
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
              <Link
                href="/trips?mode=private"
                className="glass inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                Book the whole car
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Live numbers: four colour tiles */}
      <section className="relative z-10 mx-auto -mt-10 max-w-5xl px-4 sm:px-6">
        <div className="card-soft grid grid-cols-2 gap-2.5 p-2.5 sm:grid-cols-4 sm:gap-3 sm:p-3">
          {[
            { value: 6, suffix: "", label: "seats max per car", tile: "tile-sunset" },
            { value: trips.length, suffix: "", label: "Karnataka routes", tile: "tile-lagoon" },
            { value: openSeats, suffix: "", label: "seats open now", tile: "tile-leaf", live: true },
            { value: 0, suffix: "", label: "fees on UPI payments", tile: "tile-amber", zero: true },
          ].map((stat) => (
            <div key={stat.label} className={`tile ${stat.tile} text-center`}>
              <p className="tile-num font-display text-3xl font-semibold sm:text-4xl">
                {stat.zero ? "₹0" : <CountUp value={stat.value} suffix={stat.suffix} />}
              </p>
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

      {/* Pick your weekend: every destination in its own colours, with live weather and price */}
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-4 sm:px-6" aria-labelledby="pick-weekend">
        <div className="mb-6 max-w-2xl space-y-1.5">
          <p className="eyebrow">Pick your weekend</p>
          <h2 id="pick-weekend" className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
            Hills, coffee, coast or ruins?
          </h2>
          <p className="text-sm text-stone-600">Live weather at each place right now, and the price per seat.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {trips.map(({ trip, departures }, i) => {
            const w = weatherBySlug.get(trip.slug);
            const next = departures.find((d) => d.seatsRemaining > 0 && d.status !== "cancelled");
            return (
              <Reveal key={trip.id} className="h-full" delay={i * 60}>
                <Link
                  href={`/trips/${trip.slug}`}
                  className={`card-theme card-lift ${themeClass(trip.slug, trip.destination, trip.region)} flex h-full flex-col gap-2 p-4 pt-5`}
                >
                  <span className="th-chip w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    {trip.region}
                  </span>
                  <span className="th-text font-display text-lg leading-tight font-semibold sm:text-xl">
                    {trip.destination.split(",")[0]}
                  </span>
                  <span className="line-clamp-2 text-xs text-ink-900/75">{trip.vibe}</span>
                  {w?.live && (
                    <span className="th-text flex items-center gap-1 text-[11px] font-semibold">
                      <WeatherIcon w={w} />
                      Now {w.tempC}°C · {w.label}
                    </span>
                  )}
                  <span className="mt-auto flex flex-wrap items-end justify-between gap-1 border-t border-black/5 pt-2">
                    <span className="text-sm font-bold text-ink-900">
                      {formatINR(trip.basePricePaise)}
                      <span className="text-[10px] font-medium text-stone-600"> / seat</span>
                    </span>
                    <span className="th-accent text-[11px] font-semibold">
                      {next ? `${next.seatsRemaining} open ${shortDate(next.startDate)}` : "New dates soon"}
                    </span>
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {travellerTypes.map((t) => (
            <Link key={t.title} href={t.href} className={`tile ${t.tile} card-lift flex flex-col items-start gap-2 p-4 sm:flex-row sm:gap-3`}>
              <span className="tile-num mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm">
                <t.icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink-900">{t.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-ink-900/70">{t.body}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Upcoming departures: live seats, each card in its destination's colours */}
      <section className="sec-route mt-12 border-y border-stone-200/70">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Live departure availability</p>
              <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">Upcoming 6-seat departures</h2>
            </div>
            <Link
              href="/trips"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-900 hover:text-copper-700"
            >
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
                          dep.seatsRemaining === 0
                            ? "bg-stone-200 text-stone-600"
                            : dep.seatsRemaining <= 2
                              ? "bg-copper-600 text-white"
                              : "th-chip"
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
                        <span className="ml-1 rounded bg-copper-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-copper-700">
                          Women-only
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2.5 text-xs">
                    <span className="font-bold text-ink-900">{formatINR(dep.priceOverridePaise ?? dep.basePricePaise)} / seat</span>
                    <span className="font-semibold text-copper-700">
                      {dep.seatsRemaining === 0 ? "Join waitlist →" : "Reserve seats →"}
                    </span>
                  </div>
                  <SeatPulse taken={dep.seatsTaken} max={dep.maxCapacity} showLegend={false} className="mt-4 max-w-[150px]" />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 6-seat car vs big bus */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="car-vs-bus">
        <div className="mb-6 max-w-2xl space-y-1.5">
          <p className="eyebrow">Why a car, not a bus</p>
          <h2 id="car-vs-bus" className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
            A 6-seat car beats a 40-seat bus
          </h2>
        </div>
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[var(--shadow-soft)]">
          <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1fr)] text-xs sm:text-sm">
            <div className="bg-cream-100 p-3 sm:p-4" />
            <div className="flex items-center gap-2 bg-gradient-to-br from-[#dcf3e3] to-[#d9f2f2] p-3 font-bold text-forest-900 sm:p-4">
              <Car className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" /> Sanchari car
            </div>
            <div className="flex items-center gap-2 bg-stone-200/60 p-3 font-semibold text-stone-600 sm:p-4">
              <Bus className="h-4 w-4 shrink-0" aria-hidden="true" /> Big-bus tour
            </div>
            {comparison.map((row, i) => (
              <div key={row.label} className="contents">
                <div className={`p-3 font-semibold text-ink-900 sm:p-4 ${i % 2 ? "bg-cream-100/60" : "bg-white"}`}>{row.label}</div>
                <div className={`flex gap-1.5 p-3 text-ink-900 sm:p-4 ${i % 2 ? "bg-[#eef8f1]" : "bg-[#f5fbf7]"}`}>
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest-700" aria-hidden="true" />
                  <span>{row.us}</span>
                </div>
                <div className={`flex gap-1.5 p-3 text-stone-600 sm:p-4 ${i % 2 ? "bg-cream-100/60" : "bg-white"}`}>
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-300" aria-hidden="true" />
                  <span>{row.bus}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How six-person trips work */}
      <section className="sec-contour border-y border-stone-200/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-10 max-w-2xl space-y-2">
            <p className="eyebrow">How Sanchari works</p>
            <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
              One comfortable MPV. Six seats. Zero bus-tour rush.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {[
              {
                icon: Users,
                tile: "tile-lagoon",
                title: "Hard cap of 6",
                body: "Whether you join solo, as a duo, or book the whole vehicle privately, departures never exceed six travelers.",
              },
              {
                icon: Car,
                tile: "tile-sunset",
                title: "Ertiga-class comfort",
                body: "Curated weekend routes from Bengaluru with planned highway meal stops and ghat-road daylight pacing.",
              },
              {
                icon: HeartHandshake,
                tile: "tile-rose",
                title: "Private comfort care",
                body: "Optional co-traveler and room preferences are reviewed privately by operations and never exposed publicly.",
              },
              {
                icon: ShieldCheck,
                tile: "tile-leaf",
                title: "Transparent terms",
                body: "Clear inclusions, cancellation slabs, and server-verified seat holds before any payment step.",
              },
            ].map((item, i) => (
              <Reveal key={item.title} delay={i * 80} className={`tile ${item.tile} card-lift space-y-3 p-6`}>
                <span className="tile-num inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 shadow-sm">
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="font-display text-lg font-semibold text-ink-900">{item.title}</h3>
                <p className="text-sm leading-relaxed text-ink-900/75">{item.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Karnataka routes */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Curated routes</p>
            <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">Karnataka micro-expeditions</h2>
          </div>
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

      {/* Editorial story & trust/safety summary */}
      <section className="bg-ocean text-cream-100">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-2">
          <div className="relative aspect-[3/2] overflow-hidden rounded-3xl border border-white/20 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.45)]">
            <LivingPhoto
              variant="card"
              region="Western Ghats"
              src="/media/story-coffee-morning.jpg"
              alt="Illustrative editorial image: four travelers sharing morning filter coffee on a Karnataka estate verandah"
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
            <span className="glass absolute bottom-3 left-3 rounded-full px-3 py-1 text-[11px] text-white">
              Illustrative editorial visual (not a customer testimonial photo)
            </span>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-saffron-500">Safety, respect &amp; privacy</p>
            <h2 className="font-display text-2xl font-semibold text-cream-50 sm:text-3xl">
              Designed for solo travelers, friends, and peace of mind.
            </h2>
            <p className="text-sm leading-relaxed text-white/85">
              We treat comfort and room requests as sensitive operational inputs—never public badges or marketing
              gimmicks. Women-only departures are explicitly scheduled by our team, and solo overnight stays default to
              same-gender shared rooms only where confirmed by the operator.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/safety"
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-forest-900 hover:bg-lagoon-100"
              >
                Read safety &amp; comfort standards
              </Link>
              <Link href="/policies" className="glass rounded-full px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/20">
                View policies
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Authentic reviews (only shown when moderated reviews exist) */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-6 max-w-2xl space-y-2">
          <p className="eyebrow">Traveler notes</p>
          <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">Verified reflections</h2>
        </div>

        {reviews.length === 0 ? (
          <div className="sec-sunrise rounded-2xl border border-dashed border-stone-300 p-6 text-sm text-stone-600">
            Authentic traveler reviews are published only after verified completed departures. No placeholder
            testimonials are displayed here.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {reviews.map((rev, i) => (
              <blockquote
                key={rev.id}
                className={`tile ${["tile-lagoon", "tile-sunset", "tile-leaf"][i % 3]} space-y-3 p-5`}
              >
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

      {/* Plan a private / group / custom trip: reply on WhatsApp */}
      <section id="plan" className="sec-sunrise scroll-mt-20 border-y border-stone-200/70">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="space-y-3">
            <p className="eyebrow">Plan my trip</p>
            <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
              Your date, your group, your route.
            </h2>
            <p className="text-sm leading-relaxed text-stone-600">
              Private car on a date we don&apos;t list, a group bigger than six, or a place we don&apos;t run yet. Tell
              us once and we reply on WhatsApp.
            </p>
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

      {/* FAQs */}
      <section className="sec-kolam">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-3">
          <div className="space-y-3">
            <p className="eyebrow">Questions</p>
            <h2 className="font-display text-2xl font-semibold text-forest-900">Before you book</h2>
            <p className="text-sm text-stone-600">Luggage space, pickup timing, private 6-seat dates and more.</p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full border border-forest-900 px-5 py-2.5 text-sm font-semibold text-forest-900 hover:bg-forest-900 hover:text-cream-50"
            >
              Contact &amp; support details
            </Link>
          </div>

          <div className="space-y-3 lg:col-span-2">
            {settings.faqs.map((faq) => (
              <details
                key={faq.id}
                className="group rounded-2xl border border-white/70 bg-white/85 p-4 shadow-[var(--shadow-soft)] open:bg-white"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-semibold text-forest-900">
                  {faq.question}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-peach-100 text-lg leading-none text-copper-700 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2.5 text-sm leading-relaxed text-stone-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
