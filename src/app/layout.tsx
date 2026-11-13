import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { TapFeedback } from "@/components/TapFeedback";
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
    default: "Weekend Trips from Bangalore in a 6-Seat Car | Sanchari Micro Trips",
    template: "%s | Sanchari • Micro Trips",
  },
  description:
    "Weekend road trips from Bengaluru (Bangalore) to Coorg, Chikmagalur, Gokarna and Hampi with at most 6 travellers per car. Pick your exact seat on a live car map, pay by UPI, solo, women-only or private car.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  openGraph: {
    title: "Sanchari • Micro Trips",
    description: "Curated Karnataka road trips, shared with no more than six travelers.",
    images: ["/media/hero-western-ghats.jpg"],
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
    <html lang="en" className={`${fraunces.variable} ${plusJakarta.variable}`}>
      <body className="min-h-screen text-ink-900">
        <Providers>
          <TapFeedback />
          {children}
        </Providers>
      </body>
    </html>
  );
}
