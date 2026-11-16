import type { Metadata } from "next";
import Link from "next/link";
import { LivingPhoto } from "@/components/living/LivingPhoto";
import { PageCanvas } from "@/components/PageCanvas";
import { getSiteSettings } from "@/lib/data/repository";
import { BUILT_IN_MEDIA } from "@/lib/site-media";
import { ANY_DAY_LINE, BRAND_NAME, PAGE_SEO, jsonLdText, pageBreadcrumb, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(PAGE_SEO.about);

export default async function AboutPage() {
  const { settings } = await getSiteSettings();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 space-y-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(pageBreadcrumb("About us", "/about")) }} />
      <PageCanvas theme="about" />
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper-700">
          About Sanchari
        </p>
        <h1 className="font-display text-3xl font-semibold text-forest-900 sm:text-4xl">
          Road trips paced for real conversation, not crowded buses.
        </h1>
        <p className="text-base leading-relaxed text-stone-600">
          {/* Each sentence is one text node so the Kannada view (kn.json) can match it whole. */}
          Based in {settings.brandIdentity.baseCity}
          {`, ${BRAND_NAME} (sancharitrips.com) plans small-group road trips across Karnataka, strictly capped at six travellers per Ertiga-class vehicle.`}{" "}
          {ANY_DAY_LINE}
        </p>
      </div>

      <div className="relative aspect-[3/2] overflow-hidden rounded-2xl border border-stone-200">
        <LivingPhoto
          variant="card"
          region="Western Ghats"
          src={settings.siteMedia.aboutPhoto || BUILT_IN_MEDIA.aboutPhoto}
          alt={settings.siteMedia.aboutPhoto ? "Sanchari Trips travellers in Karnataka" : "Friends enjoying coffee at a Karnataka coffee estate"}
          sizes="(max-width: 768px) 100vw, 800px"
          className="object-cover"
        />
      </div>

      {/* Owner checklist: shown only while Admin → Brand identity still marks the copy as a draft. */}
      {settings.brandIdentity.isCopyDraft && (
      <div className="sec-contour rounded-2xl border border-stone-200 p-6 space-y-3 text-sm leading-relaxed text-stone-600">
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
      )}

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

