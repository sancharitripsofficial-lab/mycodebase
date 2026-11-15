/**
 * Karnataka place list: shape and content rules (counts, unique ids, real districts, short and
 * modest blurbs, valid categories).
 */
import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  KARNATAKA_DISTRICTS,
  KARNATAKA_PLACES,
} from "@/lib/places/karnataka-places";
import type { PlaceCategory } from "@/lib/places/types";

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS) as PlaceCategory[];
const districtNames = new Set(KARNATAKA_DISTRICTS.map((d) => d.name));

describe("Karnataka districts", () => {
  it("has the 31 current districts with unique names", () => {
    expect(KARNATAKA_DISTRICTS).toHaveLength(31);
    expect(districtNames.size).toBe(31);
  });

  it("uses current official names, old names only as aliases", () => {
    for (const name of ["Bengaluru South", "Vijayanagara", "Kalaburagi", "Belagavi", "Mysuru", "Dakshina Kannada"]) {
      expect(districtNames.has(name)).toBe(true);
    }
    expect(districtNames.has("Ramanagara")).toBe(false);
    const south = KARNATAKA_DISTRICTS.find((d) => d.name === "Bengaluru South");
    expect(south?.aliases).toContain("Ramanagara");
    expect(KARNATAKA_DISTRICTS.find((d) => d.name === "Kodagu")?.aliases).toContain("Coorg");
  });
});

describe("Karnataka places", () => {
  it("has at least 200 places", () => {
    expect(KARNATAKA_PLACES.length).toBeGreaterThanOrEqual(200);
  });

  it("has unique kebab-case ids", () => {
    const ids = KARNATAKA_PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("puts every place in a real district, with that district's region", () => {
    for (const p of KARNATAKA_PLACES) {
      expect(districtNames.has(p.district), `${p.id}: ${p.district}`).toBe(true);
      const d = KARNATAKA_DISTRICTS.find((x) => x.name === p.district);
      expect(p.region, p.id).toBe(d?.region);
    }
  });

  it("covers every district with at least 3 places", () => {
    for (const d of KARNATAKA_DISTRICTS) {
      const n = KARNATAKA_PLACES.filter((p) => p.district === d.name).length;
      expect(n, d.name).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps blurbs short and modest", () => {
    for (const p of KARNATAKA_PLACES) {
      expect(p.blurb.length, `${p.id}: ${p.blurb.length}`).toBeLessThanOrEqual(90);
      expect(p.blurb.trim().length, p.id).toBeGreaterThan(0);
      const lower = p.blurb.toLowerCase();
      expect(lower.includes("₹"), p.id).toBe(false);
      expect(/\bbest\b/.test(lower), p.id).toBe(false);
      expect(lower.includes("#1"), p.id).toBe(false);
    }
  });

  it("uses only valid categories, at least one per place", () => {
    for (const p of KARNATAKA_PLACES) {
      expect(p.categories.length, p.id).toBeGreaterThan(0);
      for (const c of p.categories) expect(VALID_CATEGORIES, `${p.id}: ${c}`).toContain(c);
      expect(new Set(p.categories).size, p.id).toBe(p.categories.length);
    }
  });

  it("knows the well-known district facts", () => {
    const byId = new Map(KARNATAKA_PLACES.map((p) => [p.id, p]));
    expect(byId.get("hampi")?.district).toBe("Vijayanagara");
    expect(byId.get("jog-falls")?.district).toBe("Shivamogga");
    expect(byId.get("netravati-peak")?.district).toBe("Chikkamagaluru");
    expect(byId.get("kudremukh-peak")?.district).toBe("Chikkamagaluru");
    expect(byId.get("bylakuppe")?.district).toBe("Mysuru");
  });
});

describe("Category labels and order", () => {
  it("labels and orders all 12 categories exactly once", () => {
    expect(VALID_CATEGORIES).toHaveLength(12);
    expect(CATEGORY_ORDER).toHaveLength(12);
    expect(new Set(CATEGORY_ORDER).size).toBe(12);
    for (const c of CATEGORY_ORDER) expect(CATEGORY_LABELS[c]).toBeTruthy();
    expect(CATEGORY_LABELS.coffee_tea).toBe("Coffee & tea country");
  });
});
