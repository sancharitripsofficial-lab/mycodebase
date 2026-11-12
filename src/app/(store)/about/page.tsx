import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getSiteSettings } from "@/lib/data/repository";

export const metadata: Metadata = {
  title: "About Sanchari • Micro Trips",
  description: "Small-group road trips from Bengaluru capped at six travelers per departure.",
};

export default async function AboutPage() {
  const { settings } = await getSiteSettings();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 space-y-10">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper-700">
          About Sanchari
        </p>
        <h1 className="font-display text-3xl font-semibold text-forest-900 sm:text-4xl">
          Road trips paced for real conversation, not crowded buses.
        </h1>
        <p className="text-base leading-relaxed text-stone-600">
          Based in {settings.brandIdentity.baseCity}, Sanchari • Micro Trips curates weekend
          drives across Karnataka’s Western Ghats, coast, and heritage regions—strictly capped at
          six travelers per Ertiga-class vehicle.
        </p>
      </div>

      <div className="relative aspect-[3/2] overflow-hidden rounded-2xl border border-stone-200">
        <Image
          src="/media/story-coffee-morning.jpg"
          alt="Illustrative editorial photograph of friends enjoying coffee at a Karnataka estate"
          fill
          sizes="(max-width: 768px) 100vw, 800px"
          className="object-cover"
        />
      </div>

      <div className="rounded-2xl border border-stone-200 bg-cream-50 p-6 space-y-3 text-sm leading-relaxed text-stone-600">
        <h2 className="font-display text-xl font-semibold text-forest-900">
          Business Identity &amp; Owner Verification Checklist
        </h2>
        <p>
          <strong>Legal Entity:</strong> {settings.brandIdentity.legalEntityName}
        </p>
        <p>
          <strong>Registered Base:</strong> {settings.brandIdentity.registeredAddress}
        </p>
        <p>
          <strong>Support Hours:</strong> {settings.brandIdentity.supportHours}
        </p>
        <p className="text-xs text-copper-700">
          All bracketed items above are configurable in Admin and must be verified by the owner
          before live launch.
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href="/trips"
          className="rounded-full bg-forest-900 px-5 py-2.5 text-sm font-semibold text-cream-50"
        >
          Browse Departures
        </Link>
        <Link
          href="/safety"
          className="rounded-full border border-forest-900 px-5 py-2.5 text-sm font-semibold text-forest-900"
        >
          Safety &amp; Comfort Model
        </Link>
      </div>
    </div>
  );
}

