/**
 * Karnataka tourist places for the trips search (auto-suggestions while typing, grouped by
 * category, linked to the published trips that go there). Shared contract between the place list
 * (karnataka-places.ts) and the search (search.ts / TripSearch component).
 */

/** Categories shown as groups and browse chips in the search. */
export type PlaceCategory =
  | "hill_station"
  | "coffee_tea"
  | "waterfall"
  | "trek_peak"
  | "wildlife_forest"
  | "beach_coast"
  | "island"
  | "heritage"
  | "temple_pilgrimage"
  | "lake_river_dam"
  | "cave"
  | "city_town";

/** Karnataka tourism regions used for grouping (broad, well-known groupings). */
export type PlaceRegion =
  | "Bengaluru & surroundings"
  | "Mysuru & South Karnataka"
  | "Malnad & Western Ghats"
  | "Coastal Karnataka"
  | "North Karnataka"
  | "Hyderabad-Karnataka (Kalyana Karnataka)";

export interface KarnatakaDistrict {
  /** Official district name as used by the Government of Karnataka today (31 districts). */
  name: string;
  /** Other names people type: old names, English spellings, headquarters town ("Coorg", "Chikmagalur", "Bellary"). */
  aliases: string[];
  region: PlaceRegion;
}

export interface KarnatakaPlace {
  /** Stable kebab-case id, unique. */
  id: string;
  /** Common English display name ("Abbey Falls", "Mullayanagiri"). */
  name: string;
  /** Other spellings / names people type ("Abbi Falls", "Mullayanagiri peak"). Lower or mixed case. */
  aliases: string[];
  /** Must be one of KARNATAKA_DISTRICTS[].name. */
  district: string;
  region: PlaceRegion;
  /** First one is the main category. */
  categories: PlaceCategory[];
  /** One short factual line (<= 90 characters), no prices, no opening times, no superlatives we cannot prove. */
  blurb: string;
}
