import { visiblePosts } from "@/lib/blog";
import { GUIDE_HUB, GUIDE_PAGES } from "@/lib/places/guide";
import { BRAND_NAME, BUSINESS_DESCRIPTION, PAGE_SEO, rupees, tripPriceInfo } from "@/lib/seo";
import { formatTripDates, formatTripLength } from "@/lib/trip-dates";
import { nextOpenDeparture } from "@/lib/trip-facts";
import type { SiteSettings, TripWithDetails } from "@/lib/types";

/**
 * /llms.txt: a plain summary of the business for AI assistants and AI search (ChatGPT, Perplexity,
 * Gemini, Claude), in the llmstxt.org layout. Built from the same live data as the pages, so it
 * never says anything the website itself does not say: trips, their next open date and "From" price,
 * and the main pages. No customer data, no admin addresses.
 */
export function buildLlmsTxt(input: {
  baseUrl: string;
  trips: TripWithDetails[];
  isDemoFallback: boolean;
  settings: Pick<SiteSettings, "socialLinks" | "blogPosts">;
  now?: number;
}): string {
  const { baseUrl, settings } = input;
  const now = input.now ?? Date.now();
  const url = (path: string) => `${baseUrl}${path}`;
  const trips = input.isDemoFallback ? [] : input.trips.filter((t) => t.trip.isPublished);

  const lines: string[] = [
    `# ${BRAND_NAME}`,
    "",
    `> ${BUSINESS_DESCRIPTION}`,
    "",
    `${BRAND_NAME} (also written "sancharitrips", earlier "Sanchari Micro Trips") is a travel company in Bengaluru, Karnataka, India. ` +
      "Every trip leaves from Bengaluru by road in one six-seat car with a driver, with at most six travellers. " +
      "Visitors can join a scheduled date and book single seats, or book the whole car privately. " +
      "A seat can be reserved by paying part of the price now (advance) and the rest before the trip, where the trip allows it.",
    "",
    "## Trips",
    "",
  ];

  if (trips.length === 0) {
    lines.push(`- [All trips](${url("/trips")}): the current list of road trips from Bengaluru`);
  }
  for (const item of trips) {
    const { trip } = item;
    const price = tripPriceInfo(trip, item.departures, now);
    const next = nextOpenDeparture(item.departures, now);
    const facts = [
      trip.destination,
      formatTripLength(trip.durationDays, trip.durationNights),
      `from ${rupees(price.fromPaise)} per person`,
      next ? `next open date ${formatTripDates(next.startDate, next.endDate)} (${next.seatsRemaining} of ${next.maxCapacity} seats open)` : "no open date right now",
    ].filter(Boolean);
    const about = (trip.tagline || trip.summary || "").replace(/\s+/g, " ").trim();
    lines.push(`- [${trip.title}](${url(`/trips/${trip.slug}`)}): ${facts.join("; ")}.${about ? ` ${about}` : ""}`);
  }

  lines.push(
    "",
    "## Ways to travel",
    "",
    `- [${PAGE_SEO.weekend.title}](${url(PAGE_SEO.weekend.path)}): ${PAGE_SEO.weekend.description}`,
    `- [${PAGE_SEO.privateCar.title}](${url(PAGE_SEO.privateCar.path)}): ${PAGE_SEO.privateCar.description}`,
    `- [Karnataka tour packages](${url("/karnataka-tour-packages")}): every trip as a package with its price`,
    `- [Offers](${url(PAGE_SEO.offers.path)}): ${PAGE_SEO.offers.description}`,
    "",
    "## Karnataka travel guide",
    "",
    `- [${GUIDE_HUB.name}](${url(GUIDE_HUB.path)}): places to visit in Karnataka, by region, district and theme`
  );
  for (const page of GUIDE_PAGES.filter((p) => p.kind !== "district")) {
    lines.push(`- [${page.name}](${url(page.path)})`);
  }

  lines.push(
    "",
    "## Booking and help",
    "",
    `- [FAQs](${url("/faqs")}): pickup, payments, cancellations, what to carry`,
    `- [Safety & comfort](${url("/safety")})`,
    `- [Terms, privacy & refunds](${url("/policies")})`,
    `- [About us](${url("/about")})`,
    `- [Contact](${url("/contact")})`
  );
  const phone = (settings.socialLinks?.whatsappNumber || "").replace(/\D/g, "");
  if (phone.length >= 10) lines.push(`- WhatsApp: +${phone}`);

  const posts = visiblePosts(settings.blogPosts ?? []).slice(0, 8);
  if (posts.length > 0) {
    lines.push("", "## Optional", "");
    for (const p of posts) lines.push(`- [${p.title}](${url(`/blog/${p.id}`)})`);
  }

  return `${lines.join("\n")}\n`;
}

