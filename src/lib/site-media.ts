import { isOptimizableImage } from "@/lib/media";

/**
 * Background videos, page banners and section photos the owner can replace
 * (Admin → Website → Site pictures & videos). Saved as the `site_media` site setting.
 * An empty link means "use the built-in file", so the site always has something to show.
 */

export type BannerScene = "trips" | "safety" | "policies" | "contact" | "booking";

export const BANNER_PAGES = ["trips", "karnataka", "blog", "faqs", "safety", "policies", "contact", "booking"] as const;
export type BannerPage = (typeof BANNER_PAGES)[number];

export const BANNER_PAGE_INFO: Record<BannerPage, { label: string; path: string; scene: BannerScene }> = {
  trips: { label: "Trips page", path: "/trips", scene: "trips" },
  karnataka: { label: "Karnataka tour packages page", path: "/karnataka-tour-packages", scene: "trips" },
  blog: { label: "Blog page", path: "/blog", scene: "trips" },
  faqs: { label: "FAQs page", path: "/faqs", scene: "contact" },
  safety: { label: "Safety & comfort page", path: "/safety", scene: "safety" },
  policies: { label: "Policies page", path: "/policies", scene: "policies" },
  contact: { label: "Contact page", path: "/contact", scene: "contact" },
  booking: { label: "My booking page", path: "/booking-lookup", scene: "booking" },
};

export interface BannerMedia {
  /** Wide picture (tablets and computers). */
  image: string;
  /** Tall picture for phones (optional: the wide one is used when empty). */
  mobileImage: string;
  /** Silent looping video over the picture (optional). */
  video: string;
}

export interface SiteMedia {
  /** "video": the looping film; "photo": still picture(s) only. */
  heroMode: "video" | "photo";
  heroVideo: string;
  heroMobileVideo: string;
  heroPoster: string;
  heroMobilePoster: string;
  /** Home page "Safety, respect & privacy" photo. */
  safetyPhoto: string;
  /** About page photo. */
  aboutPhoto: string;
  banners: Record<BannerPage, BannerMedia>;
  /** Home 'Pick-up to drop' card film: landscape (computers), portrait (phones), still picture. */
  journeyVideo: string;
  journeyPhoneVideo: string;
  journeyPoster: string;
}

/** The files that ship with the site. */
export const BUILT_IN_MEDIA = {
  heroVideo: "/media/motion/hero-loop.mp4",
  heroMobileVideo: "/media/motion/hero-loop-mobile.mp4",
  heroPoster: "/media/motion/hero-loop-poster.jpg",
  heroMobilePoster: "/media/motion/hero-loop-mobile-poster.jpg",
  safetyPhoto: "/media/story-coffee-morning.jpg",
  aboutPhoto: "/media/story-coffee-morning.jpg",
} as const;

/** Built-in 'Pick-up to drop' film (made in Canva from free clips): pick-up → journey → moments → stay → drop. */
export const BUILT_IN_JOURNEY = {
  wide: "/media/journey/journey-card-wide.mp4",
  tall: "/media/journey/journey-card-tall.mp4",
  widePoster: "/media/journey/journey-card-wide-poster.jpg",
  tallPoster: "/media/journey/journey-card-tall-poster.jpg",
} as const;

/** Built-in still of a page's 3D banner scene (shown in Admin as the "Built-in" preview). */
export const builtInBannerStill = (page: BannerPage) => `/media/banners/${BANNER_PAGE_INFO[page].scene}-wide.jpg`;

/** Ready-made banner picture for each page (designed in Canva from free photos). Optional: the 3D scene stays until the owner picks it. */
export const readyBannerPicture = (page: BannerPage) => `/media/banners/pages/${page}.jpg`;

const EMPTY_BANNER: BannerMedia = { image: "", mobileImage: "", video: "" };

export const EMPTY_SITE_MEDIA: SiteMedia = {
  heroMode: "video",
  heroVideo: "",
  heroMobileVideo: "",
  heroPoster: "",
  heroMobilePoster: "",
  safetyPhoto: "",
  aboutPhoto: "",
  banners: Object.fromEntries(BANNER_PAGES.map((p) => [p, EMPTY_BANNER])) as Record<BannerPage, BannerMedia>,
  journeyVideo: "",
  journeyPhoneVideo: "",
  journeyPoster: "",
};

export const isVideoLink = (url: string) => /\.(mp4|webm)(\?|#|$)/i.test(url);

/** A link the site can show: a site file ("/media/…") or a file uploaded to the Media library. */
export function isSiteMediaLink(url: string): boolean {
  if (/[\s"'<>\\`]/.test(url) || url.includes("..")) return false;
  return isOptimizableImage(url);
}

const str = (v: unknown) => (typeof v === "string" && isSiteMediaLink(v.trim()) ? v.trim() : "");
const videoStr = (v: unknown) => {
  const s = str(v);
  return s && isVideoLink(s) ? s : "";
};
const imageStr = (v: unknown) => {
  const s = str(v);
  return s && !isVideoLink(s) ? s : "";
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Saved copy → checked media (bad or missing links fall back to the built-in files). */
export function mergeSiteMedia(saved: unknown): SiteMedia {
  if (!isObj(saved)) return EMPTY_SITE_MEDIA;
  const banners = isObj(saved.banners) ? saved.banners : {};
  return {
    heroMode: saved.heroMode === "photo" ? "photo" : "video",
    heroVideo: videoStr(saved.heroVideo),
    heroMobileVideo: videoStr(saved.heroMobileVideo),
    heroPoster: imageStr(saved.heroPoster),
    heroMobilePoster: imageStr(saved.heroMobilePoster),
    safetyPhoto: imageStr(saved.safetyPhoto),
    aboutPhoto: imageStr(saved.aboutPhoto),
    banners: Object.fromEntries(
      BANNER_PAGES.map((p) => {
        const b = isObj(banners[p]) ? (banners[p] as Record<string, unknown>) : {};
        return [p, { image: imageStr(b.image), mobileImage: imageStr(b.mobileImage), video: videoStr(b.video) }];
      })
    ) as Record<BannerPage, BannerMedia>,
    journeyVideo: videoStr(saved.journeyVideo),
    journeyPhoneVideo: videoStr(saved.journeyPhoneVideo),
    journeyPoster: imageStr(saved.journeyPoster),
  };
}

/**
 * What the home page hero plays. A new computer video without a phone version plays on phones
 * too (instead of the old built-in phone film); the same goes for the still picture.
 */
export function resolveHero(m: SiteMedia): {
  videoSrc?: string;
  mobileVideoSrc?: string;
  posterSrc: string;
  mobilePosterSrc?: string;
  slides?: { src: string }[];
} {
  const posterSrc = m.heroPoster || BUILT_IN_MEDIA.heroPoster;
  const mobilePosterSrc = m.heroMobilePoster || (m.heroPoster ? undefined : BUILT_IN_MEDIA.heroMobilePoster);
  if (m.heroMode === "photo") {
    // Still picture only. With the owner's own picture, show just that; otherwise the built-in photo slideshow.
    return { posterSrc, mobilePosterSrc, slides: m.heroPoster ? [{ src: m.heroPoster }] : undefined };
  }
  return {
    videoSrc: m.heroVideo || BUILT_IN_MEDIA.heroVideo,
    mobileVideoSrc: m.heroMobileVideo || (m.heroVideo ? undefined : BUILT_IN_MEDIA.heroMobileVideo),
    posterSrc,
    mobilePosterSrc,
  };
}

/** The owner's banner for a page, or null for the built-in 3D scene. */
export function customBanner(m: SiteMedia, page: BannerPage): BannerMedia | null {
  const b = m.banners[page];
  return b && (b.image || b.mobileImage || b.video) ? b : null;
}

/**
 * Films for the 'Pick-up to drop' card. Nothing set → the built-in film. The owner's film is used
 * for both screens when only one is given; their still picture (or the built-in one) shows first.
 */
export function resolveJourney(m: SiteMedia): {
  wideSrc: string;
  tallSrc: string;
  widePoster: string;
  tallPoster: string;
  custom: boolean;
} {
  const own = m.journeyVideo || m.journeyPhoneVideo;
  if (!own) {
    return { wideSrc: BUILT_IN_JOURNEY.wide, tallSrc: BUILT_IN_JOURNEY.tall, widePoster: BUILT_IN_JOURNEY.widePoster, tallPoster: BUILT_IN_JOURNEY.tallPoster, custom: false };
  }
  return {
    wideSrc: m.journeyVideo || m.journeyPhoneVideo,
    tallSrc: m.journeyPhoneVideo || m.journeyVideo,
    widePoster: m.journeyPoster || BUILT_IN_JOURNEY.widePoster,
    tallPoster: m.journeyPoster || BUILT_IN_JOURNEY.tallPoster,
    custom: true,
  };
}
