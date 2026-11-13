/**
 * Colour + pattern theme for a trip, picked from its place so the cards look like where you go:
 * Coorg = rainforest leaves, Chikmagalur = coffee beans, Gokarna = sea waves,
 * Hampi = granite boulders and temple towers. Anything else gets the brand road pattern.
 * The class names are defined in globals.css (.theme-*).
 */
export type DestinationTheme = "coorg" | "chikmagalur" | "gokarna" | "hampi" | "brand";

const RULES: Array<[DestinationTheme, RegExp]> = [
  ["coorg", /coorg|kodagu|madikeri|rainforest|wayanad|sakleshpur/i],
  ["chikmagalur", /chikmagalur|chikkamagaluru|coffee|mullayanagiri|kudremukh/i],
  ["gokarna", /gokarna|coast|beach|murudeshwar|karwar|udupi|honnavar|sea/i],
  ["hampi", /hampi|heritage|ruins|badami|boulder|temple|mysore|mysuru/i],
];

export function destinationTheme(...hints: Array<string | null | undefined>): DestinationTheme {
  const hay = hints.filter(Boolean).join(" ");
  for (const [theme, re] of RULES) if (re.test(hay)) return theme;
  return "brand";
}

export function themeClass(...hints: Array<string | null | undefined>): string {
  return `theme-${destinationTheme(...hints)}`;
}
