import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Sanchari • Micro Trips — Curated 6-Traveler Karnataka Road Trips",
    template: "%s | Sanchari • Micro Trips",
  },
  description:
    "Small-group Karnataka weekend road trips from Bengaluru in a 6-passenger MPV. Transparent itineraries, safety-first pacing, and solo or private-group booking.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  openGraph: {
    title: "Sanchari • Micro Trips",
    description: "Curated Karnataka road trips, shared with no more than six travelers.",
    images: ["/media/hero-western-ghats.jpg"],
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e5e8f",
};

/** Page shell only. Storefront chrome lives in (store)/layout.tsx; the admin has its own layout. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plusJakarta.variable}`}>
      <body className="min-h-screen text-ink-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
