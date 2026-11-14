import type { Metadata, Viewport } from "next";
import { Fraunces, Noto_Sans_Kannada, Plus_Jakarta_Sans } from "next/font/google";
import { TapFeedback } from "@/components/TapFeedback";
import "./globals.css";
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

export const metadata: Metadata = {
  title: {
    default: "Weekend Trips from Bangalore in a 6-Seat Car | Sanchari Micro Trips",
    template: "%s | Sanchari • Micro Trips",
  },
  description:
    "Weekend road trips from Bengaluru (Bangalore) to Coorg, Chikmagalur, Gokarna and Hampi with at most 6 travellers per car. Pick your exact seat on a live car map, pay by UPI, solo, women-only or private car.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  // The share picture is the official logo card (src/app/opengraph-image.tsx).
  openGraph: {
    title: "Sanchari • Micro Trips — weekend trips from Bengaluru, max 6 per car",
    description: "Coorg, Chikmagalur, Gokarna and Hampi in a 6-seat car. Pick your seat on a live car map and pay by UPI.",
    siteName: "Sanchari Micro Trips",
    type: "website",
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
    <html lang="en" className={`${fraunces.variable} ${plusJakarta.variable} ${notoKannada.variable}`} suppressHydrationWarning>
      <body className="min-h-screen text-ink-900">
        <Providers>
          <TapFeedback />
          {children}
        </Providers>
      </body>
    </html>
  );
}
