"use client";

import { LinkProvider } from "@astryxdesign/core/Link";
import { Theme } from "@astryxdesign/core/theme";
import Link from "next/link";
import { defaultThemeSlug, themes } from "@/astryx-themes";

/**
 * Astryx design-system context (Sanchari theme + Next links) for the screens that use Astryx
 * components: the admin panel, booking lookup and the UPI pay panel. Public pages don't load it
 * (it is ~140 KB of JavaScript); they get the same theme attributes statically on <html>.
 */
export function AstryxShell({ children }: { children: React.ReactNode }) {
  return (
    <Theme theme={themes[defaultThemeSlug]} mode="light">
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}
