"use client";

import { LinkProvider } from "@astryxdesign/core/Link";
import { Theme } from "@astryxdesign/core/theme";
import Link from "next/link";
import { defaultThemeSlug, themes } from "@/astryx-themes";

/**
 * Astryx design system with the Sanchari brand theme (built by `npm run astryx -- theme build`).
 * Light mode only: the whole site is designed on the light, misty canvas.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Theme theme={themes[defaultThemeSlug]} mode="light">
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}
