import { describe, expect, it } from "vitest";
import { cleanVisitorList, cleanVisitorText } from "@/lib/display-text";

describe("trip text shown to visitors", () => {
  it("drops the first-draft tags but keeps the owner's words", () => {
    expect(cleanVisitorText("Sample itinerary: A heritage-focused road trip to Hampi.")).toBe("A heritage-focused road trip to Hampi.");
    expect(cleanVisitorText("Sample: Breakfasts")).toBe("Breakfasts");
    expect(cleanVisitorText("Draft policy: Boutique guesthouse near Anegundi.")).toBe("Boutique guesthouse near Anegundi.");
    expect(cleanVisitorText("Draft operational note: Midday heat breaks built in.")).toBe("Midday heat breaks built in.");
  });

  it("hides notes meant for the owner", () => {
    expect(
      cleanVisitorText("Draft operational note: Daytime ghat driving only. Owner to confirm exact vehicle checklist & driver verification protocol.")
    ).toBe("Daytime ghat driving only.");
  });

  it("leaves normal text alone, including the word 'sample' inside a sentence", () => {
    expect(cleanVisitorText("Free coffee sample at the estate")).toBe("Free coffee sample at the estate");
    expect(cleanVisitorText("Drafting room tour")).toBe("Drafting room tour");
    expect(cleanVisitorText(null)).toBe("");
  });

  it("drops tags after names and owner placeholders in brackets", () => {
    expect(cleanVisitorText("Indiranagar 100ft Road (Sample Hub)")).toBe("Indiranagar 100ft Road");
    expect(cleanVisitorText("05:45 AM (Draft)")).toBe("05:45 AM");
    expect(cleanVisitorText("Draft: 14+ days before departure")).toBe("14+ days before departure");
    expect(cleanVisitorText("[Owner to confirm GST applicability and tax rate before launch]")).toBe("");
    expect(cleanVisitorText("Room (sea view)")).toBe("Room (sea view)");
  });

  it("cleans lists and drops empty items", () => {
    expect(cleanVisitorList(["Sample: AC 6-seat MPV travel", "Sample: ", "Breakfasts"])).toEqual(["AC 6-seat MPV travel", "Breakfasts"]);
  });
});
