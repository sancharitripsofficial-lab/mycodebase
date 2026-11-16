import { describe, expect, it } from "vitest";
import { translateText, translateTitleParts } from "@/lib/i18n/dom-translator";
import { translateTripTitle } from "@/lib/i18n/patterns";
import { addUntaggedKeys } from "@/lib/i18n/untagged";
import kn from "@/lib/i18n/kn.json";

/** The dictionary as the ಕನ್ನಡ switch builds it (LanguageProvider → loadDictionary). */
const dict = addUntaggedKeys(new Map(Object.entries(kn as Record<string, string>)));
const KANNADA = /[ಀ-೿]/;

describe("Kannada on a trip page: the words that were still English", () => {
  // Texts as they appear on the live Coorg / Chikmagalur pages (each one is its own text node).
  const shown = [
    "days",
    "nights",
    "night",
    "(exact time shared before the trip)",
    "(confirmed)",
    "(draft)",
    "Taxes / GST",
    "No-refund",
    "row",
    "fog",
    "light rain",
    "· today",
    "· rain",
    "updated",
    "Rain, mist and ghat roads",
    "Monsoon in the Western Ghats",
    "Only Peace ✌️",
    "Good ‘Ravana’ In us",
    "Plan for unplanned🔥",
    "See your comfort",
  ];

  it.each(shown)("%s", (en) => {
    expect(translateText(en, dict)).toMatch(KANNADA);
  });

  it("every weather label the site can show has Kannada", () => {
    for (const label of ["thunderstorm", "drizzle", "heavy rain", "light rain", "rain", "fog", "misty", "overcast", "partly cloudy", "mostly clear", "clear"]) {
      expect(translateText(label, dict), label).toMatch(KANNADA);
    }
  });

  it("puts the live values into Kannada word order and keeps them exact", () => {
    expect(translateText("Next date: 4 Dec – 6 Dec · 6 of 6 seats open", dict)).toBe("ಮುಂದಿನ ದಿನಾಂಕ: 4 ಡಿಸೆಂಬರ್ – 6 ಡಿಸೆಂಬರ್ · 6 ರಲ್ಲಿ 6 ಸೀಟುಗಳು ಖಾಲಿ");
    expect(translateText("Next date: 4 Dec – 5 Dec · 1 of 6 seats open", dict)).toBe("ಮುಂದಿನ ದಿನಾಂಕ: 4 ಡಿಸೆಂಬರ್ – 5 ಡಿಸೆಂಬರ್ · 6 ರಲ್ಲಿ 1 ಸೀಟು ಖಾಲಿ");
    expect(translateText("From ₹3,999 / seat", dict)).toBe("ಪ್ರತಿ ಸೀಟಿಗೆ ₹3,999 ರಿಂದ");
    expect(translateText(" · Whole car ₹27,999", dict)).toBe("· ಸಂಪೂರ್ಣ ಕಾರು ₹27,999");
    expect(translateText("Refund 100%", dict)).toBe("100% ಮರುಪಾವತಿ");
    expect(translateText("Refund 50%", dict)).toBe("50% ಮರುಪಾವತಿ");
    expect(translateText("Updated 1:15 am", dict)).toBe("ನವೀಕರಿಸಿದ ಸಮಯ 1:15 am");
  });

  it("translates the trip page title in the browser tab (today's and the new search titles)", () => {
    expect(translateTitleParts("Kodagu Rainforest & Spice Drive – 3-Day Coorg Trip from Bangalore | Sanchari", dict)).toBe(
      "ಕೊಡಗು ಮಳೆಕಾಡು ಮತ್ತು ಸಾಂಬಾರ ತೋಟಗಳ ಡ್ರೈವ್ – ಬೆಂಗಳೂರಿನಿಂದ 3 ದಿನಗಳ ಕೊಡಗು ಪ್ರವಾಸ | ಸಂಚಾರಿ",
    );
    expect(translateTitleParts("Chikmagalur Coffee & Mist Trails – 2-Day Trip from Bangalore | Sanchari", dict)).toBe(
      "ಚಿಕ್ಕಮಗಳೂರು ಕಾಫಿ ಮತ್ತು ಮಂಜಿನ ಹಾದಿಗಳು – ಬೆಂಗಳೂರಿನಿಂದ 2 ದಿನಗಳ ಪ್ರವಾಸ | ಸಂಚಾರಿ",
    );
    const part = (t: string) => translateTripTitle(t, (s) => dict.get(s));
    expect(part("Coorg Trip from Bangalore – 3D/2N")).toBe("ಬೆಂಗಳೂರಿನಿಂದ ಕೊಡಗು ಪ್ರವಾಸ – 3 ದಿನ / 2 ರಾತ್ರಿ");
    expect(part("Hampi Day Trip from Bangalore")).toBe("ಬೆಂಗಳೂರಿನಿಂದ ಹಂಪಿ ಒಂದು ದಿನದ ಪ್ರವಾಸ");
    expect(part("Chikmagalur Trip from Bangalore")).toBe("ಬೆಂಗಳೂರಿನಿಂದ ಚಿಕ್ಕಮಗಳೂರು ಪ್ರವಾಸ");
    expect(part("Kodagu Rainforest & Spice Drive – Coorg Trip")).toBe("ಕೊಡಗು ಮಳೆಕಾಡು ಮತ್ತು ಸಾಂಬಾರ ತೋಟಗಳ ಡ್ರೈವ್ – ಕೊಡಗು ಪ್ರವಾಸ");
    expect(part("Gokarna Trip")).toBe("ಗೋಕರ್ಣ ಪ್ರವಾಸ");
    // Short forms need a known name; title-only rules never touch ordinary page text.
    expect(part("Plan a Custom Trip")).toBeNull();
    expect(translateText("Plan your Trip", dict)).toBeNull();
  });

  it("leaves other texts that merely start the same way alone", () => {
    expect(translateText("Updated cancellation policy", dict)).toBeNull();
    expect(translateText("Refund policy details", dict)).toBeNull();
  });
});
