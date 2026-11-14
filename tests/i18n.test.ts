import { describe, expect, it } from "vitest";
import { translateText } from "@/lib/i18n/dom-translator";
import { translateDate, translatePattern } from "@/lib/i18n/patterns";
import { collectSiteTexts } from "@/lib/i18n/site-texts";
import kn from "@/lib/i18n/kn.json";

const dict = new Map<string, string>([
  ["Explore Trips", "ಪ್ರವಾಸಗಳನ್ನು ನೋಡಿ"],
  ["Kodagu (Coorg)", "ಕೊಡಗು (ಕೂರ್ಗ್)"],
  ["Ravi", "ರವಿ"],
]);

describe("Kannada switch: wording", () => {
  it("uses the dictionary whatever the spacing", () => {
    expect(translateText("  Explore   Trips \n", dict)).toBe("ಪ್ರವಾಸಗಳನ್ನು ನೋಡಿ");
    expect(translateText("Nothing like this", dict)).toBeNull();
    expect(translateText("₹12,400", dict)).toBeNull(); // no words: left alone
  });

  it("puts live numbers into Kannada word order and keeps them exact", () => {
    expect(translateText("6 of 6 seats left", dict)).toBe("6 ರಲ್ಲಿ 6 ಸೀಟುಗಳು ಉಳಿದಿವೆ");
    expect(translateText("1 of 6 seats open", dict)).toBe("6 ರಲ್ಲಿ 1 ಸೀಟು ಖಾಲಿ");
    expect(translateText("Hold 2 Seats & Continue to Payment", dict)).toBe("2 ಸೀಟುಗಳನ್ನು ಹಿಡಿದಿಟ್ಟು ಪಾವತಿಗೆ ಮುಂದುವರಿಯಿರಿ");
    expect(translateText("Check the amount is ₹12,400 and the name is Sanchari Trips, then pay.", dict)).toBe(
      "ಮೊತ್ತ ₹12,400 ಮತ್ತು ಹೆಸರು Sanchari Trips ಎಂದು ಪರಿಶೀಲಿಸಿ, ನಂತರ ಪಾವತಿಸಿ.",
    );
    expect(translateText("3D / 2N", dict)).toBe("3 ದಿನ / 2 ರಾತ್ರಿ");
  });

  it("translates dates with Kannada month and day names, digits unchanged", () => {
    expect(translateDate("27 Nov – 29 Nov")).toBe("27 ನವೆಂಬರ್ – 29 ನವೆಂಬರ್");
    expect(translateDate("Fri, 11 Dec")).toBe("ಶುಕ್ರ, 11 ಡಿಸೆಂಬರ್");
    expect(translateDate("Kodagu")).toBeNull();
    expect(translatePattern("Book Fri 27 Nov", (s) => dict.get(s))).toBe("ಬುಕ್ ಮಾಡಿ: ಶುಕ್ರ 27 ನವೆಂಬರ್");
  });

  it("translates names inside chat labels from the dictionary", () => {
    expect(translateText("Ravi, your Sanchari guide", dict)).toBe("ರವಿ, ನಿಮ್ಮ ಸಂಚಾರಿ ಗೈಡ್");
    expect(translateText("Bengaluru → Kodagu (Coorg)", new Map([...dict, ["Bengaluru", "ಬೆಂಗಳೂರು"]]))).toBe("ಬೆಂಗಳೂರು → ಕೊಡಗು (ಕೂರ್ಗ್)");
  });
});

describe("Kannada switch: built-in dictionary", () => {
  const entries = Object.entries(kn as Record<string, string>);

  it("covers the main pages and every value is real Kannada text", () => {
    expect(entries.length).toBeGreaterThan(900);
    for (const [en, k] of entries) {
      expect(k.trim(), en).not.toBe("");
      expect(en, "keys are stored trimmed with single spaces").toBe(en.replace(/\s+/g, " ").trim());
    }
    const withKannada = entries.filter(([, k]) => /[ಀ-೿]/.test(k)).length;
    expect(withKannada / entries.length).toBeGreaterThan(0.95);
  });

  it("has the header, booking and chat words", () => {
    const d = kn as Record<string, string>;
    for (const en of ["Explore Trips", "My Booking", "Policies", "Grab your seat", "Kodagu Rainforest & Spice Drive"]) {
      expect(d[en], en).toMatch(/[ಀ-೿]/);
    }
  });

  it("keeps prices, numbers and codes exactly as in English", () => {
    for (const [en, k] of entries) {
      for (const token of en.match(/₹\s?[\d,]+|\bSAN-[A-Z0-9-]+|\b\d{2,}\b/g) ?? []) {
        expect(k.replace(/\s/g, ""), `${en} → ${k}`).toContain(token.replace(/\s/g, ""));
      }
    }
  });
});

describe("Admin → Kannada: texts from the owner's data", () => {
  it("lists trip, itinerary, offer and chat texts, never ids, links or codes", () => {
    const texts = collectSiteTexts({
      settings: { assistant: { greeting: "Namaskara! Ask me anything.", guideMedia: { idle: "/media/a.jpg" } }, homePage: { heroTitle: "Return as a story." } },
      trips: [
        {
          trip: { id: "11111111-1111-4111-8111-111111111101", slug: "coorg", title: "Coorg Weekend", heroImageUrl: "https://x/y.jpg", summary: "Coffee estates.\nMisty mornings." },
          itinerary: [{ id: "x", dayNumber: 1, title: "Day out", description: "Estate walk" }],
          pickupPoints: [{ id: "p", name: "Hebbal flyover", mapsUrl: "https://maps" }],
        },
      ],
      promotions: [{ title: "Children's Day special", message: "Flat ₹1000 off", ctaUrl: "/trips", ctaLabel: "See dates" }],
    });
    const en = texts.map((t) => t.en);
    for (const want of ["Coorg Weekend", "Coffee estates.", "Misty mornings.", "Day out", "Estate walk", "Hebbal flyover", "Children's Day special", "See dates", "Namaskara! Ask me anything.", "Return as a story."]) {
      expect(en, want).toContain(want);
    }
    expect(en.some((s) => /^https?:|^\/|1111/.test(s))).toBe(false);
  });
});
