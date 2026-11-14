/**
 * Living photo presets.
 *
 * Two layers, merged by `resolveScene`:
 *  - DESTINATIONS: per trip slug (with region fallbacks) — where the place is (for live
 *    weather), what drifts through the air there (leaves, birds, dust, mist).
 *  - PHOTOS: per known photo file — things that only make sense on that exact picture
 *    (where the sun is, where the temple top is for the flag, where the sea is, what must
 *    never move). Photos an admin uploads later have no entry here and get the generic,
 *    colour-keyed treatment only.
 *
 * All photo coordinates are fractions of the photo: x from the left, y from the TOP.
 * This file is pure data (no three.js) so the weather API route can import it too.
 */

export type RGB = [number, number, number];

/** Soft ellipse on the photo: centre (x, y) and radii, all 0-1 of the photo. */
export type Ellipse = { x: number; y: number; rx: number; ry: number };

export type FlagSpec = {
  /** Foot of the flag pole on the photo (the very top of the temple). */
  x: number;
  y: number;
  /** Pole height and cloth height, as fractions of the photo height. */
  pole: number;
  size: number;
};

export type PlumeSpec = {
  /** Where the smoke / steam starts, and how wide and tall it grows (fractions of the photo). */
  x: number;
  y: number;
  w: number;
  h: number;
  strength: number;
  color: RGB;
};

export type LivingEffect =
  | "foliage"
  | "sky"
  | "rays"
  | "water"
  | "mist"
  | "leaves"
  | "birds"
  | "motes"
  | "flags"
  | "plumes";

export type PhotoPreset = {
  /** Golden-hour photo: plants are olive / yellow, not green, so widen the foliage colour key. */
  golden?: boolean;
  /** Nothing below this line (y from top) is ever treated as sky. */
  horizon?: number;
  sun?: { x: number; y: number; strength: number; color: RGB };
  /** Areas that must stay perfectly still (buildings, people, vehicles). */
  still?: Ellipse[];
  water?: { mode: "sea" | "river"; regions: Ellipse[] };
  /** Sun path glitter on water. */
  glitter?: Ellipse;
  mist?: Ellipse[];
  mistColor?: RGB;
  mistAmount?: number;
  flags?: FlagSpec[];
  plumes?: PlumeSpec[];
  /** Height of the bird flock, y from top. */
  birdsY?: number;
  /** Effects that make no sense on this picture (e.g. falling leaves on a verandah). */
  disable?: LivingEffect[];
};

export type DestinationPreset = {
  place: string;
  latitude: number;
  longitude: number;
  effects: LivingEffect[];
  /** Two leaf colours the falling leaves are mixed from. */
  leaves: [RGB, RGB];
  /** Bird silhouette colour. */
  birds: RGB;
};

export type ResolvedScene = DestinationPreset &
  PhotoPreset & {
    /** Key the weather API understands: a known slug or a region. */
    weatherKey: { slug?: string; region?: string } | null;
    known: boolean;
  };

const GREEN_LEAVES: [RGB, RGB] = [
  [0.2, 0.36, 0.12],
  [0.58, 0.5, 0.14],
];
const DRY_LEAVES: [RGB, RGB] = [
  [0.4, 0.25, 0.09],
  [0.3, 0.25, 0.09],
];

const WESTERN_GHATS: DestinationPreset = {
  place: "Western Ghats",
  latitude: 13.3161,
  longitude: 75.772,
  effects: ["foliage", "sky", "rays", "mist", "leaves", "birds", "plumes"],
  leaves: GREEN_LEAVES,
  birds: [0.16, 0.15, 0.15],
};

const COAST: DestinationPreset = {
  place: "Karnataka coast",
  latitude: 14.5479,
  longitude: 74.3188,
  effects: ["foliage", "sky", "rays", "water", "leaves", "birds"],
  leaves: [
    [0.32, 0.34, 0.1],
    [0.56, 0.42, 0.12],
  ],
  birds: [0.13, 0.1, 0.09],
};

const HERITAGE: DestinationPreset = {
  place: "Hampi",
  latitude: 15.335,
  longitude: 76.46,
  // No falling leaves here: it is a bare rock hilltop, dust in the low sun is what drifts.
  effects: ["foliage", "sky", "rays", "water", "mist", "motes", "birds", "flags"],
  leaves: DRY_LEAVES,
  birds: [0.15, 0.1, 0.08],
};

/** Per trip slug. */
export const DESTINATIONS: Record<string, DestinationPreset> = {
  "chikmagalur-coffee-trails": { ...WESTERN_GHATS, place: "Chikkamagaluru" },
  "coorg-rainforest-slow-drive": {
    ...WESTERN_GHATS,
    place: "Kodagu",
    latitude: 12.4244,
    longitude: 75.7382,
  },
  "gokarna-coastal-headlands": { ...COAST, place: "Gokarna" },
  "hampi-boulders-and-ruins": { ...HERITAGE },
};

/** Fallbacks for trips the owner adds later, by region. */
export const REGIONS: Record<string, DestinationPreset> = {
  "western ghats": WESTERN_GHATS,
  "coastal karnataka": COAST,
  heritage: HERITAGE,
};

const GENERIC: DestinationPreset = {
  place: "Karnataka",
  latitude: 12.9716,
  longitude: 77.5946,
  effects: ["foliage", "sky", "leaves"],
  leaves: GREEN_LEAVES,
  birds: [0.15, 0.14, 0.14],
};

/** Per known photo file (matched on the file name). */
export const PHOTOS: Record<string, PhotoPreset> = {
  "dest-hampi.jpg": {
    golden: true,
    horizon: 0.38,
    sun: { x: 0.385, y: 0.335, strength: 1, color: [1, 0.72, 0.42] },
    still: [
      { x: 0.265, y: 0.5, rx: 0.2, ry: 0.36 }, // the mandapa
      { x: 0.86, y: 0.47, rx: 0.12, ry: 0.07 }, // far temple complex
      { x: 0.28, y: 0.9, rx: 0.5, ry: 0.17 }, // foreground rock
      { x: 0.74, y: 0.78, rx: 0.15, ry: 0.13 }, // boulders
    ],
    water: {
      mode: "river",
      regions: [
        { x: 0.62, y: 0.5, rx: 0.1, ry: 0.07 },
        { x: 0.88, y: 0.63, rx: 0.24, ry: 0.07 },
      ],
    },
    mist: [{ x: 0.56, y: 0.44, rx: 0.34, ry: 0.08 }],
    mistColor: [1, 0.87, 0.74],
    mistAmount: 0.5,
    // Saffron flag on the mandapa dome, and a tiny one on the distant gopuram.
    flags: [
      { x: 0.2646, y: 0.199, pole: 0.07, size: 0.04 },
      { x: 0.8438, y: 0.4185, pole: 0.013, size: 0.0075 },
    ],
    birdsY: 0.17,
  },
  "dest-gokarna.jpg": {
    golden: true,
    horizon: 0.272,
    sun: { x: 0.215, y: 0.205, strength: 0.9, color: [1, 0.74, 0.4] },
    water: {
      mode: "sea",
      regions: [
        { x: 0.79, y: 0.63, rx: 0.42, ry: 0.4 },
        { x: 0.86, y: 0.34, rx: 0.22, ry: 0.075 },
      ],
    },
    glitter: { x: 0.265, y: 0.287, rx: 0.1, ry: 0.016 },
    birdsY: 0.13,
    disable: ["mist"],
  },
  "dest-coorg.jpg": {
    horizon: 0.17,
    still: [{ x: 0.65, y: 0.51, rx: 0.135, ry: 0.095 }], // the homestay
    mist: [
      { x: 0.38, y: 0.29, rx: 0.46, ry: 0.11 },
      { x: 0.72, y: 0.33, rx: 0.22, ry: 0.08 },
    ],
    mistColor: [0.86, 0.9, 0.9],
    mistAmount: 0.75,
    // A wisp of kitchen smoke from the homestay chimney.
    plumes: [{ x: 0.7025, y: 0.447, w: 0.036, h: 0.17, strength: 0.62, color: [0.86, 0.9, 0.91] }],
    birdsY: 0.09,
    disable: ["rays"],
  },
  "dest-chikmagalur.jpg": {
    golden: true,
    horizon: 0.25,
    sun: { x: 0.93, y: 0.235, strength: 0.75, color: [1, 0.8, 0.5] },
    still: [{ x: 0.385, y: 0.69, rx: 0.065, ry: 0.05 }], // the coffee pickers
    mist: [{ x: 0.47, y: 0.42, rx: 0.27, ry: 0.1 }],
    mistColor: [0.96, 0.87, 0.7],
    mistAmount: 0.6,
    birdsY: 0.12,
  },
  "story-coffee-morning.jpg": {
    horizon: 0.1,
    still: [
      { x: 0.5, y: 0.74, rx: 0.52, ry: 0.34 }, // the four friends and the table
      { x: 0.08, y: 0.74, rx: 0.2, ry: 0.24 }, // verandah railing
      { x: 0.96, y: 0.72, rx: 0.1, ry: 0.26 },
      { x: 0.46, y: 0.2, rx: 0.07, ry: 0.4 }, // verandah pillar
      { x: 0.94, y: 0.35, rx: 0.07, ry: 0.4 },
    ],
    sun: { x: 0.87, y: 0.2, strength: 0.55, color: [1, 0.9, 0.66] },
    mist: [{ x: 0.2, y: 0.3, rx: 0.24, ry: 0.11 }],
    mistColor: [0.94, 0.95, 0.94],
    mistAmount: 0.7,
    // Steam off the filter coffee tumblers.
    plumes: [
      { x: 0.455, y: 0.6, w: 0.03, h: 0.12, strength: 0.42, color: [0.97, 0.96, 0.93] },
      { x: 0.712, y: 0.7, w: 0.034, h: 0.14, strength: 0.42, color: [0.97, 0.96, 0.93] },
    ],
    disable: ["leaves", "birds", "motes", "flags", "water"],
  },
  "hero-western-ghats.jpg": {
    horizon: 0.3,
    sun: { x: 0.56, y: 0.3, strength: 0.7, color: [1, 0.88, 0.66] },
    still: [{ x: 0.6, y: 0.72, rx: 0.19, ry: 0.19 }], // the car
    mist: [{ x: 0.3, y: 0.36, rx: 0.32, ry: 0.08 }],
    mistColor: [0.95, 0.93, 0.88],
    mistAmount: 0.6,
    birdsY: 0.1,
    disable: ["flags", "water", "motes"],
  },
};

function fileName(src: string): string {
  // Works for "/media/x.jpg", full URLs and "/_next/image?url=%2Fmedia%2Fx.jpg&w=640".
  let s = src;
  const m = /[?&]url=([^&]+)/.exec(s);
  if (m) {
    try {
      s = decodeURIComponent(m[1]);
    } catch {
      /* keep s */
    }
  }
  s = s.split("?")[0].split("#")[0];
  return s.slice(s.lastIndexOf("/") + 1).toLowerCase();
}

export function findDestination(slug?: string | null, region?: string | null): DestinationPreset | null {
  if (slug && DESTINATIONS[slug]) return DESTINATIONS[slug];
  if (region) {
    const r = REGIONS[region.trim().toLowerCase()];
    if (r) return r;
  }
  return null;
}

export function resolveScene(src: string, slug?: string | null, region?: string | null): ResolvedScene {
  const dest = findDestination(slug, region);
  const photo = PHOTOS[fileName(src)];
  const base = dest ?? GENERIC;
  const disabled = new Set<LivingEffect>(photo?.disable ?? []);
  // Flags, plumes and water only exist where a photo preset placed them.
  if (!photo?.flags?.length) disabled.add("flags");
  if (!photo?.plumes?.length) disabled.add("plumes");
  if (!photo?.water) disabled.add("water");
  if (!photo?.sun) disabled.add("rays");
  const effects = Array.from(new Set<LivingEffect>([...base.effects, ...(photo?.plumes ? (["plumes"] as const) : [])])).filter(
    (e) => !disabled.has(e)
  );
  return {
    ...base,
    ...(photo ?? {}),
    effects,
    // Always by the trip when we know it: the server then uses the trip's own destination
    // (exact place) for trips without built-in coordinates, not the region's generic spot.
    weatherKey: slug ? { slug, ...(region ? { region } : {}) } : region && dest ? { region } : null,
    known: Boolean(photo),
  };
}
