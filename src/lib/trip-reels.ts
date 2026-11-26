import type { TripReel } from "@/components/home/TripReels";
import { absoluteUrl } from "@/lib/seo";

/**
 * Short UGC-style reels made from real Sanchari trip photos (owner uploads) and copyright-safe
 * footage, 26 Nov 2026 (build files: schoolERP/sanchari-promo/v1/ugc). Silent; no prices, dates or
 * seat counts in them, so they do not go out of date. Files live in public/media/ugc.
 */
export const TRIP_REELS: (TripReel & { uploadDate: string })[] = [
  {
    src: "/media/ugc/sanchari-reel-1.mp4",
    poster: "/media/ugc/sanchari-reel-1.jpg",
    title: "A weekend in Chikmagalur",
    description: "From Bangalore traffic to a coffee estate stay in Chikmagalur, estate breakfast, and home by Sunday.",
    seconds: 15,
    uploadDate: "2026-11-26",
  },
  {
    src: "/media/ugc/sanchari-reel-2.mp4",
    poster: "/media/ugc/sanchari-reel-2.jpg",
    title: "Kumara Parvatha trek",
    description: "An early forest trail, a steep climb and the view from the top of Kumara Parvatha in the Western Ghats.",
    seconds: 13,
    uploadDate: "2026-11-26",
  },
  {
    src: "/media/ugc/sanchari-reel-3.mp4",
    poster: "/media/ugc/sanchari-reel-3.jpg",
    title: "Murudeshwara by the sea",
    description: "A road trip from Bangalore to the coast: Murudeshwara's temple tower and the giant Shiva statue by the sea.",
    seconds: 12,
    uploadDate: "2026-11-26",
  },
];

/** VideoObject markup for the reels, so they can show in Google's video results. */
export function tripReelsJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": TRIP_REELS.map((r) => ({
      "@type": "VideoObject",
      name: `${r.title} | Sanchari Trips`,
      description: r.description,
      contentUrl: absoluteUrl(r.src),
      thumbnailUrl: absoluteUrl(r.poster),
      uploadDate: `${r.uploadDate}T12:00:00+05:30`,
      duration: `PT${r.seconds}S`,
      publisher: { "@id": absoluteUrl("/#business") },
    })),
  };
}
