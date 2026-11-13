/** Home page content edited in Admin → Website text → Home page. */
import { describe, expect, it } from "vitest";
import { homePageSchema, settingsSaveSchema } from "@/lib/admin/content-schemas";
import { categoryOfTrip, DEFAULT_HOME_CONTENT, mergeHomeContent } from "@/lib/home-content";

describe("home page content", () => {
  it("the built-in default passes the same rules the admin save uses", () => {
    expect(() => homePageSchema.parse(DEFAULT_HOME_CONTENT)).not.toThrow();
    const parsed = settingsSaveSchema.parse({ key: "home_page", value: DEFAULT_HOME_CONTENT });
    expect(parsed.key).toBe("home_page");
  });

  it("a saved copy missing newer fields still renders complete", () => {
    const merged = mergeHomeContent({ kannadaLine: "", heroChip: "Hello", categoriesSection: { title: "Pick one" } });
    expect(merged.kannadaLine).toBe(""); // owner may hide the Kannada line on purpose
    expect(merged.heroChip).toBe("Hello");
    expect(merged.categoriesSection.title).toBe("Pick one");
    expect(merged.categoriesSection.show).toBe(true);
    expect(merged.compareRows.length).toBeGreaterThan(0);
    expect(mergeHomeContent(null)).toEqual(DEFAULT_HOME_CONTENT);
  });

  it("refuses two categories with the same short name, bad links and unknown colours", () => {
    const twin = { ...DEFAULT_HOME_CONTENT, categories: [DEFAULT_HOME_CONTENT.categories[0], DEFAULT_HOME_CONTENT.categories[0]] };
    expect(homePageSchema.safeParse(twin).success).toBe(false);

    const badLink = {
      ...DEFAULT_HOME_CONTENT,
      travellerCards: [{ ...DEFAULT_HOME_CONTENT.travellerCards[0], href: "javascript:alert(1)" }],
    };
    expect(homePageSchema.safeParse(badLink).success).toBe(false);

    const badColour = {
      ...DEFAULT_HOME_CONTENT,
      howCards: [{ ...DEFAULT_HOME_CONTENT.howCards[0], colour: "black" }],
    };
    expect(homePageSchema.safeParse(badColour).success).toBe(false);

    const badId = { ...DEFAULT_HOME_CONTENT, categories: [{ ...DEFAULT_HOME_CONTENT.categories[0], id: "Hills & Forest" }] };
    expect(homePageSchema.safeParse(badId).success).toBe(false);
  });

  it("finds the category a trip belongs to", () => {
    expect(categoryOfTrip(DEFAULT_HOME_CONTENT.categories, "gokarna-coastal-headlands")?.id).toBe("coast");
    expect(categoryOfTrip(DEFAULT_HOME_CONTENT.categories, "unknown-trip")).toBeNull();
  });
});
