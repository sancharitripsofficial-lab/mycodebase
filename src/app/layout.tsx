import type { Metadata, Viewport } from "next";
import { Fraunces, Noto_Sans_Kannada, Plus_Jakarta_Sans } from "next/font/google";
import { TapFeedback } from "@/components/TapFeedback";
import { BRAND_NAME, DEFAULT_OG_IMAGE, HOME_DESCRIPTION, HOME_TITLE, SITE_URL } from "@/lib/seo";
import "./globals.css";
// Sanchari Astryx theme styles (CSS only; the Theme JavaScript loads only where Astryx is used).
import "@/themes/sanchari/sanchari.css";
import { Providers } from "./providers";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

// Kannada letters: only downloaded when Kannada text is on screen (unicode-range), never preloaded.
const notoKannada = Noto_Sans_Kannada({
  subsets: ["kannada"],
  variable: "--font-kannada",
  display: "swap",
  preload: false,
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

// Defaults for every page; each page sets its own title, description, canonical and share card
// through pageMetadata() (src/lib/seo.ts). No place names here: this metadata is static.
// No "keywords" list: Google ignores it and it read as keyword stuffing (SEO plan §3, §8.1).
export const metadata: Metadata = {
  title: {
    default: HOME_TITLE,
    template: `%s | ${BRAND_NAME}`,
  },
  description: HOME_DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  applicationName: BRAND_NAME,
  category: "travel",
  // The share picture is the official logo card (src/app/opengraph-image.tsx).
  // No og:url here: a page that sets no Open Graph of its own (admin, motion-preview) must not
  // claim the home address. The home page sets og:url "/" itself through pageMetadata().
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    siteName: BRAND_NAME,
    locale: "en_IN",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE.url],
  },
};

export const viewport: Viewport = {
  themeColor: "#135a4b",
};

/** Page shell only. Storefront chrome lives in (store)/layout.tsx; the admin has its own layout. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the store's early script may switch lang/data-lang to Kannada before React loads.
    // data-theme / data-astryx-theme: what the Astryx Theme used to set from JavaScript, now static.
    <html
      lang="en-IN"
      data-theme="light"
      data-astryx-theme="sanchari"
      className={`${fraunces.variable} ${plusJakarta.variable} ${notoKannada.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen text-ink-900">
        <Providers>
          <TapFeedback />
          {children}
        </Providers>
      </body>
    </html>
  );
}
