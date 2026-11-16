import type { Metadata } from "next";
import type { BlogPost } from "@/lib/blog";
import type { TripPriceInfo } from "@/lib/trip-price";
import type { SiteSettings, Trip, TripWithDetails } from "@/lib/types";

export { TRIP_SLUG_REDIRECTS, resolveTripSlug, sameTripSlug, tripRedirectTarget, tripStaticSlugs } from "@/lib/trip-slugs";
export { tripPriceInfo, type TripPriceInfo } from "@/lib/trip-price";

/** Public address of the site, without a trailing slash (https://www.sancharitrips.com on live). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// One brand name everywhere (SEO plan §1). To lead with "Sanchari Micro Trips" instead, swap
// the first entry of BRAND_ALT_NAMES with BRAND_NAME: every title, OG tag and JSON-LD follows.
// ---------------------------------------------------------------------------

export const BRAND_NAME = "Sanchari Trips";
/** Other names people use for us; the lowercase domain stays last (Google site-name guide). */
export const BRAND_ALT_NAMES: readonly string[] = ["Sanchari Micro Trips", "sancharitrips", "sancharitrips.com"];
export const TITLE_SUFFIX = ` | ${BRAND_NAME}`;
/**
 * The share card (src/app/opengraph-image.tsx). Every page passes this image explicitly, which
 * turns off Next's own content-hashed address for it, so the "?v=" number is what tells WhatsApp,
 * Facebook and LinkedIn that the card changed: bump it whenever opengraph-image.tsx changes.
 * Keep `alt` the same as the `alt` export there.
 */
export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image?v=2",
  width: 1200,
  height: 630,
  alt: "Sanchari Trips – small-group road trips from Bengaluru, max 6 travellers per car",
};

/** The truthful "not only weekends" line used across the site (owner rule). */
export const ANY_DAY_LINE = "Join a scheduled date or ask for a private car on your own dates.";

export const HOME_TITLE = `${BRAND_NAME} | Small-Group Road Trips from Bangalore`;
export const HOME_DESCRIPTION =
  "Small-group Karnataka road trips from Bengaluru in a 6-seat car, max 6 travellers. Join a scheduled date or ask for a private car on your own dates.";
export const BUSINESS_DESCRIPTION =
  "Small-group Karnataka road trips from Bengaluru in a six-seat car, max 6 travellers: join a scheduled date, or ask for a private car on your own dates.";

/** Titles (without the " | Sanchari Trips" suffix) and descriptions of the fixed pages (SEO plan §3). */
export const PAGE_SEO = {
  blog: {
    path: "/blog",
    title: "Travel Stories & Trip Videos from Karnataka",
    description:
      // "what to pack for a day trip" is the Admin post "One Day Trip Packing List": change this line
      // if that post is hidden or deleted.
      "Videos and stories from Sanchari Trips’ small-group road trips from Bengaluru in a six-seat car, plus practical tips such as what to pack for a day trip.",
  },
  about: {
    path: "/about",
    title: "About Us: Small-Group Karnataka Road Trips",
    description:
      "Sanchari Trips runs small-group road trips from Bengaluru across Karnataka, at most six travellers per car: join a scheduled date or ask for a private car.",
  },
  safety: {
    path: "/safety",
    title: "Safety & Comfort on Every Road Trip",
    // Only facts the /safety page itself states.
    description:
      "How Sanchari Trips looks after you: women-only dates set by our team, co-traveller requests kept private, a clear room policy and no ID scans stored online.",
  },
  policies: {
    path: "/policies",
    title: "Booking Terms, Privacy & Refund Policy",
    description:
      "Booking terms, privacy notice, and cancellation and refund rules for Sanchari Trips road trips from Bengaluru. Please read them before you pay for a seat.",
  },
  faqs: {
    path: "/faqs",
    // Names only topics the live questions cover (no "dates" until a visible FAQ answers
    // "Do trips run only on weekends?"; then "Dates" may be added here too).
    title: "FAQs: 6 Seats, Solo Travel, Rooms & Pickup",
    // Both lines name only questions that are on the page (Admin → FAQs). Change them when the
    // FAQ list changes. No luggage line: the site gives no luggage allowance until the owner does.
    // Used only once a visible FAQ answers "Do trips run only on weekends?" (SEO plan §4.5).
    description:
      "Answers before you book a Sanchari trip: do trips run only on weekends, joining solo, co-traveller and room requests, pickup points and private car dates.",
    descriptionWithoutWeekendFaq:
      "Answers before you book a Sanchari trip: why the car takes at most six, joining solo, co-traveller and room requests, pickup points and how reviews work.",
  },
  contact: {
    path: "/contact",
    title: "Contact Us: WhatsApp & Email in Bengaluru",
    description:
      "Contact Sanchari Trips in Bengaluru on WhatsApp or email about bookings, a private car on your own dates, pickup points and changes to your trip.",
  },
  creators: {
    path: "/creators",
    // The only public reward tier is a discount; say "free seats" here once a free-seat tier is published.
    title: "Creators Programme: Trip Discounts",
    description:
      "Travel creators with a real audience can earn discounts or free seats on Sanchari Trips road trips from Bengaluru. Apply, get verified, travel and share.",
  },
  trips: { path: "/trips", title: "Upcoming Road Trips from Bangalore" },
  packages: { path: "/karnataka-tour-packages", title: "Karnataka Tour Packages from Bangalore" },
  bookingLookup: {
    path: "/booking-lookup",
    title: "Find & Manage Your Booking",
    description:
      "Find your Sanchari Trips booking with your booking reference and email: see your receipt, traveller list and request status, or ask us for a change.",
  },
  notFound: {
    path: "/404",
    title: "Page Not Found",
    description:
      "This page could not be found. See the upcoming Sanchari Trips road trips from Bengaluru, or ask us for a private car or custom trip on your own dates.",
  },
} as const;

/**
 * Metadata of every "not found" page (app/not-found.tsx for unmatched URLs and
 * (store)/not-found.tsx for notFound() in store routes). Its own Open Graph and Twitter titles, and
 * no canonical or og:url, so a missing page never inherits the home page's share card or address.
 */
export const NOT_FOUND_METADATA: Metadata = {
  title: PAGE_SEO.notFound.title,
  description: PAGE_SEO.notFound.description,
  robots: { index: false, follow: true },
  openGraph: { title: PAGE_SEO.notFound.title, description: PAGE_SEO.notFound.description },
  twitter: { card: "summary_large_image", title: PAGE_SEO.notFound.title, description: PAGE_SEO.notFound.description },
};

const DESCRIPTION_MAX = 158;

/** /trips description, naming only places that have a live trip. */
export function tripsPageDescription(destinations: string): string {
  const withPlaces = `Upcoming road trips from Bangalore to ${destinations}. Max 6 travellers per car with live seat counts, or ask for a private car on your own dates.`;
  if (destinations && withPlaces.length <= DESCRIPTION_MAX) return withPlaces;
  return "Upcoming small-group road trips from Bangalore across Karnataka. Max 6 travellers per car with live seat counts, or ask for a private car on your own dates.";
}

/**
 * /karnataka-tour-packages description, naming only places that have a live trip. The private car
 * is a request (the team replies to confirm), so the line always says "ask for", never a promise.
 */
export function packagesPageDescription(destinations: string): string {
  const withPlaces = `Karnataka tour packages from Bangalore to ${destinations}: max 6 per car, join a scheduled date or ask for a private car on your dates. Pay by UPI.`;
  if (destinations && withPlaces.length <= DESCRIPTION_MAX) return withPlaces;
  return "Karnataka tour packages from Bangalore in small groups: max 6 per car, join a scheduled date or ask for a private car on your own dates. Pay by UPI.";
}

/**
 * The FAQ question that switches the /faqs description to its weekend line. Only a question that
 * really asks whether trips run only at weekends counts; "What should I pack for a weekend trip?"
 * does not.
 */
const WEEKEND_FAQ_QUESTION = /\bonly (?:on |at )?weekends?\b|\bweekends? only\b|\bon weekdays?\b/i;

/** True when a visible FAQ answers whether trips run only on weekends. */
export function hasWeekendFaq(faqs: readonly { question: string; answer: string }[]): boolean {
  return faqs.some((f) => WEEKEND_FAQ_QUESTION.test(f.question) && f.answer.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

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
export function clip(text: string, max = DESCRIPTION_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const atSpace = cut.lastIndexOf(" ");
  return `${(atSpace > max * 0.6 ? cut.slice(0, atSpace) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** "A", "A and B", "A, B and C". */
function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** Places that have a published trip, as people search them: "Coorg and Chikmagalur". */
export function liveDestinations(trips: readonly (Pick<Trip, "destination" | "isPublished"> | Pick<TripWithDetails, "trip">)[]): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const t of trips) {
    const trip = "trip" in t ? t.trip : t;
    if (!trip.isPublished) continue;
    const name = searchName(trip.destination);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  }
  return listWords(names);
}

/** "Bengaluru, Karnataka" -> "Bengaluru". */
export function cityOnly(baseCity: string | null | undefined): string {
  return (baseCity || "").split(",")[0].trim();
}

/** Share/tracking parameters dropped from profile links; anything else (e.g. ?id= on profile.php) stays. */
const TRACKING_PARAM = /^(utm_.+|si|igsh|igshid|dlrf|fbclid|gclid|mibextid|ref|ref_src|ref_type|fref|__tn__|__cft__.*|rdid|share_url|sfnsn|feature)$/i;

/**
 * A social profile link without tracking bits (?utm_source=qr, ?si=…, #…):
 * https://www.instagram.com/<handle>/ and https://www.youtube.com/@<handle>. Other hosts keep
 * their real query parameters, so https://www.facebook.com/profile.php?id=… still names the page.
 * Null if not https.
 */
export function cleanProfileUrl(url: string | null | undefined): string | null {
  const raw = (url || "").trim();
  if (!/^https:\/\//i.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "instagram.com" && parts[0]) return `https://www.instagram.com/${parts[0]}/`;
  if (host === "youtube.com" && parts[0]?.startsWith("@")) return `https://www.youtube.com/${parts[0]}`;
  if (host === "youtube.com" && (parts[0] === "channel" || parts[0] === "c") && parts[1]) return `https://www.youtube.com/${parts[0]}/${parts[1]}`;
  const path = u.pathname.replace(/\/+$/, "");
  const kept = new URLSearchParams();
  u.searchParams.forEach((value, key) => {
    if (!TRACKING_PARAM.test(key)) kept.append(key, value);
  });
  const query = kept.toString();
  return `${u.protocol}//${u.host}${path}${query ? `?${query}` : ""}`;
}

/** True for text the owner has not filled in yet ("[Owner to verify …]"). */
function isPlaceholder(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  return !t || t.startsWith("[");
}

// ---------------------------------------------------------------------------
// Page metadata
// ---------------------------------------------------------------------------

export interface PageMetadataInput {
  /** Without the suffix: the layout template adds " | Sanchari Trips" (unless absoluteTitle). */
  title: string;
  /** 140-158 characters for indexable pages (checked by tests). */
  description: string;
  /** Relative canonical, e.g. "/trips". Query strings never go here. */
  path: string;
  ogTitle?: string;
  ogDescription?: string;
  image?: { url: string; width?: number; height?: number; alt: string };
  type?: "website" | "article";
  /** Home only: the title is used as is, brand first. */
  absoluteTitle?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
}

/** One builder for every page: canonical + full Open Graph + Twitter, never half an openGraph. */
export function pageMetadata(o: PageMetadataInput): Metadata {
  const ogTitle = o.ogTitle ?? o.title;
  const ogDescription = o.ogDescription || o.description;
  const image = o.image ?? DEFAULT_OG_IMAGE;
  const type = o.type ?? "website";
  const openGraph: NonNullable<Metadata["openGraph"]> =
    type === "article"
      ? {
          type: "article",
          title: ogTitle,
          description: ogDescription,
          url: o.path,
          siteName: BRAND_NAME,
          locale: "en_IN",
          images: [image],
          ...(o.publishedTime && { publishedTime: o.publishedTime }),
          ...(o.modifiedTime && { modifiedTime: o.modifiedTime }),
        }
      : {
          type: "website",
          title: ogTitle,
          description: ogDescription,
          url: o.path,
          siteName: BRAND_NAME,
          locale: "en_IN",
          images: [image],
        };
  return {
    title: o.absoluteTitle ? { absolute: o.title } : o.title,
    description: o.description,
    alternates: { canonical: o.path },
    openGraph,
    twitter: { card: "summary_large_image", title: ogTitle, description: ogDescription, images: [image.url] },
    ...(o.noindex && { robots: { index: false, follow: true } }),
  };
}

// ---------------------------------------------------------------------------
// Trip pages
// ---------------------------------------------------------------------------

/** Longest title before " | Sanchari Trips" that keeps the whole title within 60 characters. */
export const TRIP_TITLE_MAX = 60 - TITLE_SUFFIX.length;

function cutTitle(text: string, max = TRIP_TITLE_MAX): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const atSpace = cut.lastIndexOf(" ");
  return (atSpace > max * 0.6 ? cut.slice(0, atSpace) : cut).replace(/[\s,.;:–&-]+$/, "");
}

/** True when the trip's own title already names the place ("Chikmagalur Coffee & Mist Trails"). */
function titleNamesPlace(title: string, place: string): boolean {
  return Boolean(place) && title.toLowerCase().includes(place.toLowerCase());
}

/**
 * True when the day count can be printed: no itinerary to compare with, or as many itinerary days
 * as durationDays. A trip saved as 2 days with a Day 1-3 itinerary (owner fact F1) prints neither.
 */
function durationAgrees(trip: Pick<Trip, "durationDays">, itineraryDays?: number): boolean {
  return !itineraryDays || itineraryDays === trip.durationDays;
}

/**
 * Search title for a trip page, before the brand suffix:
 * "Coorg Trip from Bangalore – 3D/2N", "Coorg Day Trip from Bangalore" (no nights), or
 * "{trip title} – Coorg Trip" when two live trips go to the same place. The days/nights are left
 * out when they disagree with the itinerary (`itineraryDays`), so a disputed figure is never shown.
 */
export function tripSeoTitle(
  trip: Pick<Trip, "id" | "title" | "destination" | "durationDays" | "durationNights">,
  liveTrips: readonly Pick<Trip, "id" | "destination">[] = [],
  itineraryDays?: number
): string {
  const place = searchName(trip.destination) || "Karnataka";
  const shared = liveTrips.some((t) => t.id !== trip.id && searchName(t.destination).toLowerCase() === place.toLowerCase());
  if (shared) {
    // Never "Chikmagalur Coffee & Mist Trails – Chikmagalur Trip".
    if (!titleNamesPlace(trip.title, place)) return cutTitle(`${trip.title} – ${place} Trip`);
    return [`${trip.title} – Trip from Bangalore`, trip.title].find((c) => c.length <= TRIP_TITLE_MAX) ?? cutTitle(trip.title);
  }
  const candidates = !durationAgrees(trip, itineraryDays)
    ? [`${place} Trip from Bangalore`, `${place} Trip`]
    : trip.durationNights > 0
      ? [`${place} Trip from Bangalore – ${trip.durationDays}D/${trip.durationNights}N`, `${place} Trip from Bangalore`, `${place} Trip`]
      : [`${place} Day Trip from Bangalore`, `${place} Day Trip`];
  return candidates.find((c) => c.length <= TRIP_TITLE_MAX) ?? cutTitle(candidates[candidates.length - 1]);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "₹3,999" from paise. */
export const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

/**
 * Search description for a trip page. `fromPaise` must be the same "From" price the page shows
 * (tripPriceInfo), so the snippet, the structured data and the page always agree. The days and
 * nights are left out when they disagree with the itinerary (see tripSeoTitle).
 */
export function tripSeoDescription(
  trip: Pick<Trip, "destination" | "durationDays" | "durationNights">,
  fromPaise: number,
  maxGroupSize = 6,
  itineraryDays?: number
): string {
  const place = searchName(trip.destination) || "Karnataka";
  const nights = trip.durationNights > 0 ? `, ${plural(trip.durationNights, "night")}` : "";
  const length = durationAgrees(trip, itineraryDays) ? `${plural(trip.durationDays, "day")}${nights}, ` : "";
  const price = fromPaise > 0 ? `, from ${rupees(fromPaise)} per seat` : "";
  const facts = `${place} trip from Bangalore: ${length}max ${maxGroupSize} per car${price}.`;
  return clip(`${facts} Join a listed date or ask for a private car on your own dates.`);
}

/**
 * og:title for a trip page: "{trip title} – {Place} Trip from Bangalore", or
 * "{trip title} – Trip from Bangalore" when the title already names the place.
 */
export function tripOgTitle(trip: Pick<Trip, "title" | "destination">): string {
  const place = searchName(trip.destination) || "Karnataka";
  return titleNamesPlace(trip.title, place) ? `${trip.title} – Trip from Bangalore` : `${trip.title} – ${place} Trip from Bangalore`;
}

/** Alt text of a trip's hero picture: "{trip title}, {Place}", without repeating the place. */
export function tripImageAlt(trip: Pick<Trip, "title" | "destination">): string {
  const place = searchName(trip.destination) || trip.destination;
  return titleNamesPlace(trip.title, place) || !place ? trip.title : `${trip.title}, ${place}`;
}

const unique = <T,>(list: readonly T[]) => list.filter((v, i) => list.indexOf(v) === i);

/**
 * TouristTrip for one trip page. No Product, Review or rating fields: there are no verified reviews.
 * The description is the trip's tagline instead of its summary when the itinerary's day count
 * disagrees with durationDays (owner fact F1), the same guard as tripSeoTitle/tripSeoDescription.
 */
export function tripJsonLd(item: Pick<TripWithDetails, "trip" | "itinerary">, price: TripPriceInfo) {
  const { trip, itinerary } = item;
  const tripUrl = absoluteUrl(`/trips/${trip.slug}`);
  const images = unique([trip.heroImageUrl, ...trip.galleryUrls.slice(0, 3)].filter((u) => typeof u === "string" && u.trim()).map((u) => absoluteUrl(u)));
  const inr = (paise: number) => (paise / 100).toFixed(0);
  const offers =
    price.bookable && price.offerCount > 1 && price.lowPaise !== price.highPaise
      ? {
          "@type": "AggregateOffer",
          priceCurrency: "INR",
          lowPrice: inr(price.lowPaise),
          highPrice: inr(price.highPaise),
          offerCount: price.offerCount,
          availability: "https://schema.org/InStock",
          url: `${tripUrl}#book`,
        }
      : {
          "@type": "Offer",
          priceCurrency: "INR",
          price: inr(price.fromPaise),
          url: `${tripUrl}#book`,
          availability: price.bookable ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
        };
  return {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    "@id": `${tripUrl}#trip`,
    name: trip.title,
    description: (durationAgrees(trip, itinerary.length) ? trip.summary || trip.tagline : trip.tagline || trip.summary),
    url: tripUrl,
    ...(images.length > 0 && { image: images }),
    touristType: ["Small groups (max 6 travellers per car)", "Solo travellers", "Private groups (whole 6-seat car)"],
    provider: { "@type": "TravelAgency", "@id": `${SITE_URL}/#business`, name: BRAND_NAME, url: `${SITE_URL}/` },
    ...(itinerary.length > 0 && {
      itinerary: {
        "@type": "ItemList",
        numberOfItems: itinerary.length,
        itemListElement: itinerary.map((day) => ({
          "@type": "ListItem",
          position: day.dayNumber,
          name: `Day ${day.dayNumber}: ${day.title}`,
        })),
      },
    }),
    offers,
  };
}

// ---------------------------------------------------------------------------
// Site-wide structured data
// ---------------------------------------------------------------------------

function socialProfiles(settings: SiteSettings): string[] {
  const s = settings.socialLinks;
  // Only real profiles linked from the site; a Google Business Profile is added once it exists.
  return unique(
    [s?.instagramUrl, s?.youtubeUrl, s?.facebookUrl].map((u) => cleanProfileUrl(u)).filter((u): u is string => Boolean(u))
  );
}

/** The business and the website as Google should understand them (home page). */
export function businessJsonLd(settings: SiteSettings, opts: { searchAction?: boolean } = { searchAction: true }) {
  const brand = settings.brandIdentity;
  const phoneDigits = (settings.socialLinks?.whatsappNumber || "").replace(/\D/g, "");
  const business: Record<string, unknown> = {
    "@type": "TravelAgency",
    "@id": `${SITE_URL}/#business`,
    name: BRAND_NAME,
    alternateName: [...BRAND_ALT_NAMES],
    url: `${SITE_URL}/`,
    logo: absoluteUrl("/brand/sanchari-logo.png"),
    image: absoluteUrl(DEFAULT_OG_IMAGE.url),
    description: BUSINESS_DESCRIPTION,
    areaServed: { "@type": "State", name: "Karnataka" },
    address: {
      "@type": "PostalAddress",
      addressLocality: cityOnly(brand?.baseCity) || "Bengaluru",
      addressRegion: "Karnataka",
      addressCountry: "IN",
    },
  };
  // Only once the owner has verified the business details (Admin → Brand identity, "copy is a
  // draft" off): the About page still calls them unverified while that switch is on (F5/F6).
  if (!brand?.isCopyDraft && !isPlaceholder(brand?.legalEntityName)) business.legalName = brand.legalEntityName.trim();
  const email = (brand?.supportEmail || "").trim();
  if (!isPlaceholder(email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) business.email = email;
  if (phoneDigits.length >= 10) business.telephone = `+${phoneDigits}`;
  const sameAs = socialProfiles(settings);
  if (sameAs.length) business.sameAs = sameAs;

  const website: Record<string, unknown> = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: BRAND_NAME,
    alternateName: [...BRAND_ALT_NAMES],
    url: `${SITE_URL}/`,
    publisher: { "@id": `${SITE_URL}/#business` },
    inLanguage: "en-IN",
  };
  // /trips?q=… filters the trips in the browser (TripsCatalogClient), so the search target is real.
  if (opts.searchAction !== false) {
    website.potentialAction = {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/trips?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    };
  }

  return { "@context": "https://schema.org", "@graph": [business, website] };
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

/** Home › {page}: the trail for a page one level under home. */
export function pageBreadcrumb(name: string, path: string) {
  return breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name, path },
  ]);
}

/** List of published trips (/trips and /karnataka-tour-packages). */
export function tripListJsonLd(name: string, trips: readonly Pick<TripWithDetails, "trip">[]) {
  const published = trips.filter((t) => t.trip.isPublished);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: published.length,
    itemListElement: published.map(({ trip }, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absoluteUrl(`/trips/${trip.slug}`),
      name: trip.title,
    })),
  };
}

/** FAQPage for the visible questions and answers on /faqs only. */
export function faqJsonLd(faqs: readonly { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs
      .filter((f) => f.question.trim() && f.answer.trim())
      .map((f) => ({
        "@type": "Question",
        name: f.question.trim(),
        acceptedAnswer: { "@type": "Answer", text: f.answer.trim() },
      })),
  };
}

/** BlogPosting for one story (with its video when it has one). */
export function blogPostingJsonLd(post: Pick<BlogPost, "id" | "title" | "excerpt" | "publishedOn" | "posterUrl" | "videoUrl">) {
  const postUrl = absoluteUrl(`/blog/${post.id}`);
  const published = `${post.publishedOn}T12:00:00+05:30`;
  const image = post.posterUrl ? absoluteUrl(post.posterUrl) : absoluteUrl(DEFAULT_OG_IMAGE.url);
  const org = { "@type": "Organization", "@id": `${SITE_URL}/#business`, name: BRAND_NAME, url: `${SITE_URL}/` };
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    ...(post.excerpt && { description: post.excerpt }),
    datePublished: published,
    // No separate edit date is stored yet (lib/blog.ts), so the publish date is the last change.
    dateModified: published,
    inLanguage: "en-IN",
    url: postUrl,
    mainEntityOfPage: postUrl,
    image,
    author: org,
    publisher: { ...org, logo: { "@type": "ImageObject", url: absoluteUrl("/brand/sanchari-logo.png") } },
    ...(post.videoUrl && {
      video: {
        "@type": "VideoObject",
        name: post.title,
        description: post.excerpt || post.title,
        contentUrl: absoluteUrl(post.videoUrl),
        thumbnailUrl: image,
        uploadDate: published,
      },
    }),
  };
}

/** Safe text for a <script type="application/ld+json"> block (no "</script>" break-out). */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
