import type { SiteSettings, Trip } from "@/lib/types";

/** Public address of the site, without a trailing slash (https://www.sancharitrips.com on live). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Absolute URL for a path on this site ("/trips" -> "https://www.sancharitrips.com/trips"). */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * The name people type into Google for a destination:
 * "Kodagu (Coorg), Karnataka" -> "Coorg", "Chikmagalur, Karnataka" -> "Chikmagalur".
 */
export function searchName(destination: string): string {
  const first = (destination || "").split(",")[0].trim();
  const inBrackets = first.match(/\(([^)]+)\)/);
  if (inBrackets) return inBrackets[1].trim();
  return first;
}

/** Cut text at a word boundary so it fits in Google's snippet (about 155-160 characters). */
export function clip(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const atSpace = cut.lastIndexOf(" ");
  return `${(atSpace > max * 0.6 ? cut.slice(0, atSpace) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** Search title for a trip page, e.g. "Kodagu Rainforest & Spice Drive – 3-Day Coorg Trip from Bangalore". */
export function tripSeoTitle(trip: Pick<Trip, "title" | "destination" | "durationDays">): string {
  const name = searchName(trip.destination);
  const days = trip.durationDays > 0 ? `${trip.durationDays}-Day ` : "";
  const place = name && !trip.title.toLowerCase().includes(name.toLowerCase()) ? `${name} ` : "";
  return `${trip.title} – ${days}${place}Trip from Bangalore`;
}

/** Search description for a trip page: the facts people compare first, then the trip's own line. */
export function tripSeoDescription(
  trip: Pick<Trip, "destination" | "durationDays" | "durationNights" | "basePricePaise" | "tagline">,
  maxGroupSize = 6
): string {
  const name = searchName(trip.destination) || "Karnataka";
  const nights = trip.durationNights > 0 ? `, ${trip.durationNights} night${trip.durationNights === 1 ? "" : "s"}` : "";
  const price =
    trip.basePricePaise > 0 ? `, from ₹${Math.round(trip.basePricePaise / 100).toLocaleString("en-IN")} per seat` : "";
  const facts = `${name} trip from Bangalore: ${trip.durationDays} day${trip.durationDays === 1 ? "" : "s"}${nights}, max ${maxGroupSize} per car${price}.`;
  return clip(`${facts} ${trip.tagline || ""}`);
}

function socialProfiles(settings: SiteSettings): string[] {
  const s = settings.socialLinks;
  return [s?.instagramUrl, s?.youtubeUrl, s?.facebookUrl, s?.whatsappChannelUrl]
    .map((u) => (u || "").trim())
    .filter((u) => /^https:\/\//i.test(u));
}

/** The business as Google should understand it (home page). */
export function businessJsonLd(settings: SiteSettings) {
  const brand = settings.brandIdentity;
  const phoneDigits = (settings.socialLinks?.whatsappNumber || "").replace(/\D/g, "");
  const business: Record<string, unknown> = {
    "@type": "TravelAgency",
    "@id": `${SITE_URL}/#business`,
    name: "Sanchari Micro Trips",
    alternateName: "Sanchari • Micro Trips",
    url: `${SITE_URL}/`,
    logo: absoluteUrl("/brand/sanchari-logo.png"),
    image: absoluteUrl("/opengraph-image"),
    description:
      "Small-group weekend road trips from Bengaluru to Coorg, Chikmagalur, Gokarna and Hampi, with at most six travellers in one car.",
    areaServed: { "@type": "State", name: "Karnataka" },
    address: {
      "@type": "PostalAddress",
      addressLocality: brand?.baseCity?.trim() || "Bengaluru",
      addressRegion: "Karnataka",
      addressCountry: "IN",
    },
    priceRange: "₹₹",
  };
  if (brand?.supportEmail?.includes("@")) business.email = brand.supportEmail.trim();
  if (phoneDigits.length >= 10) business.telephone = `+${phoneDigits}`;
  const sameAs = socialProfiles(settings);
  if (sameAs.length) business.sameAs = sameAs;

  return {
    "@context": "https://schema.org",
    "@graph": [
      business,
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "Sanchari Micro Trips",
        url: `${SITE_URL}/`,
        publisher: { "@id": `${SITE_URL}/#business` },
        inLanguage: "en-IN",
      },
    ],
  };
}

/** Breadcrumb trail for Google ("Home > Trips > Coorg ..."). */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** Safe text for a <script type="application/ld+json"> block (no "</script>" break-out). */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
