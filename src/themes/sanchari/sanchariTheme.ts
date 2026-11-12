import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

/**
 * Sanchari brand theme for Astryx components.
 * Colours come from the logo: ocean blue → teal road, sunset-orange accents, misty canvas.
 * Fonts reuse the next/font variables set in src/app/layout.tsx (Fraunces + Plus Jakarta Sans).
 * Light only: the storefront is designed on a light canvas (no black/near-black surfaces).
 * Rebuild after editing: npm run astryx -- theme build src/themes/sanchari/sanchariTheme.ts
 */
export const sanchariTheme = defineTheme({
  name: "sanchari",
  extends: neutralTheme,
  radius: { base: 6, multiplier: 1.5 },
  // Replaces the base theme's Figtree everywhere, including its touch/narrow adaptation.
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: {
      family: "Plus Jakarta Sans",
      fallbacks: "var(--font-plus-jakarta), ui-sans-serif, system-ui, -apple-system, sans-serif",
    },
    heading: {
      family: "Fraunces",
      fallbacks: "var(--font-fraunces), ui-serif, Georgia, Cambria, serif",
      weights: { 3: "bold", 4: "bold" },
    },
    code: {
      family: "ui-monospace",
      fallbacks: '"SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
  },
  tokens: {

    "--color-accent": ["#0E5E8F", "#0E5E8F"],
    "--color-accent-muted": ["#E2F0F7", "#E2F0F7"],
    "--color-on-accent": ["#FFFFFF", "#FFFFFF"],
    "--color-text-accent": ["#0E5E8F", "#0E5E8F"],
    "--color-icon-accent": ["#0C7A8C", "#0C7A8C"],

    "--color-background-body": ["#F2F8FA", "#F2F8FA"],
    "--color-background-surface": ["#FFFEFC", "#FFFEFC"],
    "--color-background-card": ["#FFFFFF", "#FFFFFF"],
    "--color-background-muted": ["#EAF3F7", "#EAF3F7"],
    "--color-background-popover": ["#FFFFFF", "#FFFFFF"],

    "--color-border": ["#DCE8EE", "#DCE8EE"],
    "--color-border-emphasized": ["#B9CEDA", "#B9CEDA"],

    "--color-text-primary": ["#0F2A3D", "#0F2A3D"],
    "--color-text-secondary": ["#4B6273", "#4B6273"],
    "--color-icon-primary": ["#0F2A3D", "#0F2A3D"],
    "--color-icon-secondary": ["#4B6273", "#4B6273"],

    "--color-warning": ["#C2470A", "#C2470A"],
    "--color-warning-muted": ["#FFEBDD", "#FFEBDD"],
    "--color-on-warning-muted": ["#8A3205", "#8A3205"],
    "--color-text-warning": ["#B4420A", "#B4420A"],
    "--color-border-warning": ["#F5B58A", "#F5B58A"],
  },
  components: {
    button: {
      base: { borderRadius: "9999px", fontWeight: "600" },
    },
    card: {
      base: { borderRadius: "20px" },
    },
  },
});
