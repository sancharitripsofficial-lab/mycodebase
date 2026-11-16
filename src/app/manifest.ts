import type { MetadataRoute } from "next";
import { BRAND_NAME } from "@/lib/seo";

/** Phone browsers (Android "Add to Home screen", tab colour): Sanchari logo on white. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: "Sanchari",
    description: "Small-group road trips from Bengaluru in a 6-seat car. Join a scheduled date or ask for a private car on your dates.",
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#0d5f6b",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
