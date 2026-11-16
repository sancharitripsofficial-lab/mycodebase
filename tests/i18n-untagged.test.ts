import { describe, expect, it } from "vitest";
import { cleanVisitorText } from "@/lib/display-text";
import { translateText } from "@/lib/i18n/dom-translator";
import { addUntaggedKeys, untaggedPair } from "@/lib/i18n/untagged";
import kn from "@/lib/i18n/kn.json";

const builtIn = kn as Record<string, string>;
/** The dictionary as the ಕನ್ನಡ switch builds it (LanguageProvider → loadDictionary). */
const dict = addUntaggedKeys(new Map(Object.entries(builtIn)));

/**
 * Tagged keys whose shown English needs no Kannada of its own:
 * times like "05:00 AM (Draft)" read the same in Kannada ("05:00 AM").
 * ("[Owner to …]" placeholders are not listed: visitors see nothing of them.)
 */
const ALLOW_NO_KANNADA = new Set(["05:00 AM", "05:30 AM", "05:45 AM", "06:15 AM", "06:30 AM"]);

const KANNADA = /[ಀ-೿]/;

describe("Kannada for trip text shown without its first-draft tag", () => {
  const tagged = Object.keys(builtIn)
    .map((en) => ({ en, shown: cleanVisitorText(en) }))
    .filter(({ en, shown }) => shown && shown !== en);

  it("finds tagged keys to check", () => {
    expect(tagged.length).toBeGreaterThan(60);
  });

  it("every tagged key's visible English has Kannada", () => {
    const missing = tagged
      .filter(({ shown }) => !ALLOW_NO_KANNADA.has(shown))
      .filter(({ shown }) => !KANNADA.test(translateText(shown, dict) ?? ""))
      .map(({ en }) => en);
    expect(missing).toEqual([]);
  });

  it("allow-listed texts are still tagged keys (drop them from the list once gone)", () => {
    const shown = new Set(tagged.map((t) => t.shown));
    for (const s of ALLOW_NO_KANNADA) expect(shown.has(s), s).toBe(true);
  });

  it("the Kannada carries no tag or owner note", () => {
    for (const { shown } of tagged) {
      const k = dict.get(shown);
      if (!k) continue;
      expect(k, shown).not.toMatch(/^(ಮಾದರಿ|ಕರಡು)/);
      expect(k, shown).not.toMatch(/\((ಮಾದರಿ|ಕರಡು)[^)]*\)/);
      expect(k, shown).not.toMatch(/ಮಾಲೀಕ/);
    }
  });

  it("never replaces a key that is already in the dictionary", () => {
    for (const [en, k] of Object.entries(builtIn)) expect(dict.get(en), en).toBe(k);
    // The owner's saved Kannada is loaded before the untagged keys are added, so it wins too.
    const saved = addUntaggedKeys(new Map([["Sample: Dinner", "ಮಾದರಿ: ರಾತ್ರಿ ಊಟ"], ["Dinner", "ಊಟ (ಮಾಲೀಕರ ಪದ)"]]));
    expect(saved.get("Dinner")).toBe("ಊಟ (ಮಾಲೀಕರ ಪದ)");
  });

  it("strips each Kannada tag along with the English one", () => {
    expect(dict.get("Breakfasts")).toBe("ಬೆಳಗಿನ ತಿಂಡಿಗಳು");
    expect(dict.get("Optional forest entry permits")).toBe("ಐಚ್ಛಿಕ ಅರಣ್ಯ ಪ್ರವೇಶ ಪರವಾನಗಿಗಳು");
    expect(dict.get("14+ days before departure")).toBe("ಹೊರಡುವ ದಿನಾಂಕಕ್ಕೆ 14+ ದಿನಗಳ ಮೊದಲು");
    expect(dict.get("Indiranagar 100ft Road")).toBe("ಇಂದಿರಾನಗರ 100 ಅಡಿ ರಸ್ತೆ");
    // "Owner to confirm …" sentence dropped from both languages.
    expect(dict.get("Daytime ghat driving only, planned rest breaks every 2.5 hours.")).toBe(
      "ಘಾಟ್ ರಸ್ತೆಗಳಲ್ಲಿ ಹಗಲು ಹೊತ್ತಿನಲ್ಲಿ ಮಾತ್ರ ಚಾಲನೆ, ಪ್ರತಿ 2.5 ಗಂಟೆಗೊಮ್ಮೆ ಯೋಜಿತ ವಿಶ್ರಾಂತಿ.",
    );
  });

  it("skips a pair when the Kannada cannot be cleaned the same way", () => {
    // English tag, Kannada without one: unclear what to cut.
    expect(untaggedPair("Sample: Dinner", "ರಾತ್ರಿ ಊಟ")).toBeNull();
    // Owner note sentence, but the Kannada has a different number of sentences.
    expect(untaggedPair("Draft policy: Quiet rooms. Owner to confirm the hotel.", "ಕರಡು ನೀತಿ: ಶಾಂತ ಕೊಠಡಿಗಳು ಮತ್ತು ಹೋಟೆಲ್.")).toBeNull();
    // A Kannada owner sentence the English keeps would leak an owner note.
    expect(untaggedPair("Draft policy: Quiet rooms. Owner to confirm the hotel.", "ಕರಡು ನೀತಿ: ಮಾಲೀಕರು ನೋಡುತ್ತಾರೆ. ಹೋಟೆಲ್.")).toBeNull();
    // Trailing tag missing from the Kannada.
    expect(untaggedPair("Hebbal (Sample Hub)", "ಹೆಬ್ಬಾಳ")).toBeNull();
    // Nothing tagged, or nothing left to show.
    expect(untaggedPair("Breakfast", "ಉಪಹಾರ")).toBeNull();
    expect(untaggedPair("[Owner to verify legal entity name]", "[ಮಾಲೀಕರು ಹೆಸರನ್ನು ಪರಿಶೀಲಿಸಬೇಕು]")).toBeNull();
  });

  it("also works for the owner's saved Kannada from Admin", () => {
    const d = addUntaggedKeys(new Map([["Sample itinerary: Two quiet days in Sakleshpur.", "ಮಾದರಿ ಪ್ರವಾಸ ವಿವರ: ಸಕಲೇಶಪುರದಲ್ಲಿ ಎರಡು ಶಾಂತ ದಿನಗಳು."]]));
    expect(translateText("Two quiet days in Sakleshpur.", d)).toBe("ಸಕಲೇಶಪುರದಲ್ಲಿ ಎರಡು ಶಾಂತ ದಿನಗಳು.");
  });
});
