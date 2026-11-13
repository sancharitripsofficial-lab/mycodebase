import {
  ArrowRight,
  Calendar,
  Car,
  Compass,
  HeartHandshake,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CountUp, HeroCinematic, Reveal, RoadTripRoute, SeatPulse } from "@/components/motion";
import { TripCard } from "@/components/TripCard";
import { formatINR } from "@/lib/currency";
import {
  getPublishedTripsWithDetails,
  getSiteSettings,
  getVerifiedReviews,
} from "@/lib/data/repository";
import { buildClickToWhatsAppUrl } from "@/lib/messaging/provider";

// Served from the CDN; refreshed every 30 s and immediately after bookings / admin edits.
export const revalidate = 30;

export default async function HomePage() {
  const [{ trips }, { settings }, reviews] = await Promise.all([
    getPublishedTripsWithDetails(),
    getSiteSettings(),
    getVerifiedReviews(),
  ]);

  const upcomingDepartures = trips
    .flatMap((t) =>
      t.departures.map((d) => ({
        ...d,
        tripTitle: t.trip.title,
        tripSlug: t.trip.slug,
        destination: t.trip.destination,
        basePricePaise: t.trip.basePricePaise,
        heroImageUrl: t.trip.heroImageUrl,
      }))
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 6);

  const nextDeparture = upcomingDepartures.find((d) => d.seatsRemaining > 0) ?? null;

  const whatsappUrl = buildClickToWhatsAppUrl(
    "Hi Sanchari team, I have a question about upcoming 6-traveler Karnataka road trips."
  );

  return (
    <div>
      {/* Hero: looping road-trip film under an ocean-blue scrim */}
      <section className="relative isolate overflow-hidden text-cream-50">
        <HeroCinematic
          videoSrc="/media/motion/hero-loop.mp4"
          mobileVideoSrc="/media/motion/hero-loop-mobile.mp4"
          posterSrc="/media/motion/hero-loop-poster.jpg"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 pb-20 sm:px-6 md:grid-cols-[1.15fr_0.85fr] md:pt-20 md:pb-28">
          <div className="max-w-xl space-y-6">
            <Reveal>
              <p className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide text-white">
                <Compass className="h-3.5 w-3.5 text-saffron-500" aria-hidden="true" />
                Bengaluru • Karnataka • Max 6 travelers per car
              </p>
            </Reveal>

            <Reveal as="h1" delay={100} className="font-display text-[2.6rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl lg:text-[4.1rem]">
              {settings.brandIdentity.headline.split(".")[0]}.
              <span className="block text-gradient-sunrise">
                {settings.brandIdentity.headline.split(".").slice(1).join(".").trim() || "Return as a story."}
              </span>
            </Reveal>

            <Reveal as="p" delay={200} className="text-base leading-relaxed text-white/85 sm:text-lg">
              {settings.brandIdentity.subheadline}
            </Reveal>

            {nextDeparture && (
              <Reveal delay={260}>
                <Link
                  href={`/trips/${nextDeparture.tripSlug}?date=${nextDeparture.departureId}#book`}
                  className="glass group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-sm text-white transition hover:bg-white/20"
                >
                  <span className="rounded-full bg-copper-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider">
                    Next departure
                  </span>
                  <span className="font-semibold">{nextDeparture.destination.split(",")[0]}</span>
                  <span className="text-white/80">
                    {new Date(nextDeparture.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    {" – "}
                    {new Date(nextDeparture.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                  <span className="font-bold text-saffron-500">
                    {nextDeparture.seatsRemaining} of {nextDeparture.maxCapacity} seats left
                  </span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </Reveal>
            )}

            <Reveal delay={320} className="flex flex-wrap gap-3 pt-1">
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

          <Reveal delay={200} className="hidden md:block">
            <RoadTripRoute
              tone="onDark"
              labels={["Bengaluru", nextDeparture?.destination.split(",")[0] ?? "Chikmagalur"]}
              className="mx-auto max-w-[360px]"
            />
          </Reveal>
        </div>
      </section>

      {/* Trust numbers */}
      <section className="relative z-10 mx-auto -mt-10 max-w-5xl px-4 sm:px-6">
        <div className="card-soft grid grid-cols-2 gap-y-5 px-5 py-6 sm:grid-cols-4 sm:px-8">
          {[
            { value: 6, suffix: "", label: "seats max per car" },
            { value: trips.length, suffix: "", label: "curated Karnataka routes" },
            { value: settings.bookingPolicy.holdMinutes, suffix: " min", label: "seats held while you pay" },
            { value: 0, suffix: "", label: "fees on UPI payments", zero: true },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-display text-3xl font-semibold text-forest-900 sm:text-4xl">
                {stat.zero ? "₹0" : <CountUp value={stat.value} suffix={stat.suffix} />}
              </p>
              <p className="mt-1 text-xs font-medium text-stone-600">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming Departures Live Capacity Strip */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper-700">
              Live Departure Availability
            </p>
            <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
              Upcoming 6-Seat Departures
            </h2>
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
            <Reveal key={dep.departureId} delay={i * 80}>
            <Link
              href={`/trips/${dep.tripSlug}?date=${dep.departureId}#book`}
              className="card-soft card-lift flex h-full flex-col justify-between p-5"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-semibold text-stone-600">
                    {dep.departureCode}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-semibold ${
                      dep.seatsRemaining === 0
                        ? "bg-stone-200 text-stone-600"
                        : dep.seatsRemaining <= 2
                          ? "bg-copper-600/15 text-copper-700"
                          : "bg-forest-900/10 text-forest-900"
                    }`}
                  >
                    {dep.seatsRemaining === 0
                      ? "Sold out • Waitlist"
                      : `${dep.seatsRemaining} / ${dep.maxCapacity} open`}
                  </span>
                </div>
                <p className="font-display text-lg font-semibold text-forest-900">
                  {dep.tripTitle}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-stone-600">
                  <Calendar className="h-3.5 w-3.5 text-forest-700" aria-hidden="true" />
                  {dep.startDate} to {dep.endDate}
                  {dep.departureType === "women_only" && (
                    <span className="ml-1 rounded bg-copper-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-copper-700">
                      Women-Only
                    </span>
                  )}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-stone-200 pt-2.5 text-xs">
                <span className="font-bold text-forest-900">
                  {formatINR(dep.priceOverridePaise ?? dep.basePricePaise)} / seat
                </span>
                <span className="font-semibold text-copper-700">
                  {dep.seatsRemaining === 0 ? "Join waitlist →" : "Reserve seats →"}
                </span>
              </div>
              <SeatPulse taken={dep.seatsTaken} max={dep.maxCapacity} showLegend={false} className="mt-4 max-w-[150px]" />
            </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How Six-Person Trips Work */}
      <section className="border-y border-stone-200/70 bg-white/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="max-w-2xl space-y-2 mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper-700">
              How Sanchari Works
            </p>
            <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
              One comfortable MPV. Six seats. Zero bus-tour rush.
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Users,
                title: "Hard Cap of 6",
                body: "Whether you join solo, as a duo, or book the whole vehicle privately, departures never exceed six travelers.",
              },
              {
                icon: Car,
                title: "Ertiga-Class Comfort",
                body: "Curated weekend routes from Bengaluru with planned highway meal stops and ghat-road daylight pacing.",
              },
              {
                icon: HeartHandshake,
                title: "Private Comfort Care",
                body: "Optional co-traveler and room preferences are reviewed privately by operations and never exposed publicly.",
              },
              {
                icon: ShieldCheck,
                title: "Transparent Terms",
                body: "Clear inclusions, draft cancellation slabs, and server-verified booking holds before any payment step.",
              },
            ].map((item, i) => (
              <Reveal key={item.title} delay={i * 100} className="card-soft card-lift space-y-3 p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-lagoon-100 to-peach-100">
                  <item.icon className="h-5 w-5 text-copper-600" aria-hidden="true" />
                </span>
                <h3 className="font-display text-lg font-semibold text-forest-900">{item.title}</h3>
                <p className="text-sm leading-relaxed text-stone-600">{item.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Karnataka Routes */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper-700">
              Curated Sample Routes
            </p>
            <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
              Karnataka Micro-Expeditions
            </h2>
          </div>
          <Link
            href="/trips"
            className="rounded-full border border-forest-900 px-4 py-2 text-xs font-semibold text-forest-900 hover:bg-forest-900 hover:text-cream-50"
          >
            View All Trips
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
          {trips.map((item) => (
            <TripCard key={item.trip.id} item={item} />
          ))}
        </div>
      </section>

      {/* Editorial Story & Trust/Safety Summary */}
      <section className="bg-ocean text-cream-100">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-2">
          <div className="relative aspect-[3/2] overflow-hidden rounded-3xl border border-white/20 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.45)]">
            <Image
              src="/media/story-coffee-morning.jpg"
              alt="Illustrative editorial image: four travelers sharing morning filter coffee on a Karnataka estate verandah"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
            <span className="glass absolute bottom-3 left-3 rounded-full px-3 py-1 text-[11px] text-white">
              Illustrative editorial visual (not a customer testimonial photo)
            </span>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-saffron-500">
              Safety, Respect &amp; Privacy
            </p>
            <h2 className="font-display text-2xl font-semibold text-cream-50 sm:text-3xl">
              Designed for solo travelers, friends, and peace of mind.
            </h2>
            <p className="text-sm leading-relaxed text-white/85">
              We treat comfort and room requests as sensitive operational inputs—never public badges
              or marketing gimmicks. Women-only departures are explicitly scheduled by our team,
              and solo overnight stays default to same-gender shared rooms only where confirmed by
              the operator.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/safety"
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-forest-900 hover:bg-lagoon-100"
              >
                Read Safety &amp; Comfort Standards
              </Link>
              <Link
                href="/policies"
                className="glass rounded-full px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
              >
                View Policy Drafts
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Authentic Reviews (Only rendered when authentic moderated reviews exist) */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="max-w-2xl space-y-2 mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper-700">
            Traveler Notes
          </p>
          <h2 className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
            Verified Reflections
          </h2>
        </div>

        {reviews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-cream-50 p-6 text-sm text-stone-600">
            Authentic traveler reviews are published only after verified completed departures. No
            placeholder testimonials are displayed here.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {reviews.map((rev) => (
              <blockquote
                key={rev.id}
                className="rounded-2xl border border-stone-200 bg-cream-50 p-5 space-y-3"
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

      {/* FAQs & Contact */}
      <section className="border-t border-stone-200 bg-cream-50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-3">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper-700">
              Questions
            </p>
            <h2 className="font-display text-2xl font-semibold text-forest-900">
              Before you book
            </h2>
            <p className="text-sm text-stone-600">
              Have a question about luggage space, pickup timing, or private 6-seat dates?
            </p>
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ocean px-5 py-2.5 text-sm"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Chat on WhatsApp
              </a>
            ) : (
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full border border-forest-900 px-5 py-2.5 text-sm font-semibold text-forest-900 hover:bg-forest-900 hover:text-cream-50"
              >
                Contact &amp; Support Details
              </Link>
            )}
          </div>

          <div className="lg:col-span-2 space-y-3">
            {settings.faqs.map((faq) => (
              <details
                key={faq.id}
                className="group rounded-xl border border-stone-200 bg-white p-4"
              >
                <summary className="cursor-pointer list-none font-display text-base font-semibold text-forest-900 flex items-center justify-between gap-4">
                  {faq.question}
                  <span className="text-copper-700 text-lg leading-none group-open:rotate-45 transition-transform">
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

