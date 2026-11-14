/** Chat guide settings edited in Admin → Website text → Chat guide (saved as the `assistant` site setting). */
import { describe, expect, it } from "vitest";
import { assistantSettingsSchema, isSafeGuideMediaLink, settingsSaveSchema } from "@/lib/admin/content-schemas";
import { DEFAULT_ASSISTANT_SETTINGS, displayPhone, mergeAssistantSettings, type AssistantSettings } from "@/lib/assistant/settings";
import { getDemoState } from "@/lib/data/demo-store";

const withValue = (patch: Partial<AssistantSettings>) => ({ ...DEFAULT_ASSISTANT_SETTINGS, ...patch });
const saves = (patch: Partial<AssistantSettings>) => settingsSaveSchema.safeParse({ key: "assistant", value: withValue(patch) }).success;

describe("chat guide settings", () => {
  it("uses the cut-out guide pictures, also for saved copies of the old built-in photos", () => {
    expect(DEFAULT_ASSISTANT_SETTINGS.guideCutout).toBe(true);
    expect(DEFAULT_ASSISTANT_SETTINGS.guideMedia.idle).toBe("/media/guide/guide-idle.webp");
    const saved = mergeAssistantSettings({ guideName: "Sandeep", guideMedia: { idle: "/media/guide/guide-idle.jpg", wave: "/media/own-wave.mp4" } });
    expect(saved.guideMedia.idle).toBe("/media/guide/guide-idle.webp");
    expect(saved.guideMedia.wave).toBe("/media/own-wave.mp4"); // the owner's own uploads stay
    expect(saved.guideCutout).toBe(true);
    expect(mergeAssistantSettings({ guideCutout: false }).guideCutout).toBe(false);
  });

  it("the built-in default passes the same rules the admin save uses", () => {
    const parsed = settingsSaveSchema.parse({ key: "assistant", value: DEFAULT_ASSISTANT_SETTINGS });
    expect(parsed.key).toBe("assistant");
    expect(parsed.value).toEqual(DEFAULT_ASSISTANT_SETTINGS);
  });

  it("the preview store carries the default chat guide", () => {
    expect(getDemoState().settings.assistant).toEqual(DEFAULT_ASSISTANT_SETTINGS);
  });

  it("a saved copy missing fields is filled from the defaults", () => {
    expect(mergeAssistantSettings(null)).toEqual(DEFAULT_ASSISTANT_SETTINGS);
    expect(mergeAssistantSettings("nonsense")).toEqual(DEFAULT_ASSISTANT_SETTINGS);
    const merged = mergeAssistantSettings({ guideName: "Asha", customerCareNumber: "+91 98765-43210", enabled: false, guideMedia: { idle: " /media/a.mp4 ", wave: "", bogus: "x" } });
    expect(merged.guideName).toBe("Asha");
    expect(merged.enabled).toBe(false);
    expect(merged.customerCareNumber).toBe("919876543210");
    expect(merged.greeting).toBe(DEFAULT_ASSISTANT_SETTINGS.greeting);
    expect(merged.quickQuestions).toEqual(DEFAULT_ASSISTANT_SETTINGS.quickQuestions);
    expect(merged.smartAnswers).toBe(DEFAULT_ASSISTANT_SETTINGS.smartAnswers);
    // Built-in Ravi pictures stay for the emotions the owner did not set; idle is replaced.
    expect(merged.guideMedia).toEqual({ ...DEFAULT_ASSISTANT_SETTINGS.guideMedia, idle: "/media/a.mp4" });
  });

  it("customer care number: empty or 91 + 10 digits", () => {
    expect(saves({ customerCareNumber: "919876543210" })).toBe(true);
    expect(saves({ customerCareNumber: "" })).toBe(true);
    expect(saves({ customerCareNumber: "98765" })).toBe(false);
    expect(saves({ customerCareNumber: "1234567890123" })).toBe(false);
    expect(saves({ customerCareNumber: "9876543210" })).toBe(false); // 91 missing
    expect(saves({ customerCareNumber: "910123456789" })).toBe(false); // no Indian number starts with 0 after 91
    expect(saves({ customerCareNumber: "918041234567" })).toBe(true); // Bengaluru landline with STD code

    const spaced = assistantSettingsSchema.parse(withValue({ customerCareNumber: "+91 98765 43210" }));
    expect(spaced.customerCareNumber).toBe("919876543210");
    expect(displayPhone(spaced.customerCareNumber)).toBe("+91 98765 43210");
    // Landlines and toll-free numbers are grouped too, never shown as one long run of digits.
    expect(displayPhone("912223456789")).toBe("+91 22 2345 6789");
    expect(displayPhone("914422334455")).toBe("+91 44 2233 4455");
    expect(displayPhone("913862234567")).toBe("+91 386 223 4567");
    expect(displayPhone("18001234567")).toBe("1800 123 4567");
    expect(displayPhone("")).toBe("");

    const bad = settingsSaveSchema.safeParse({ key: "assistant", value: withValue({ customerCareNumber: "98765" }) });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toBe("Customer care number: 91 followed by the 10-digit number");
  });

  it("guide picture/video links: https or a site path only", () => {
    expect(saves({ guideMedia: { idle: "https://cdn.example.com/guide/idle.mp4" } })).toBe(true);
    expect(saves({ guideMedia: { wave: "/media/x.mp4" } })).toBe(true);
    expect(saves({ guideMedia: { idle: "javascript:alert(1)" } })).toBe(false);
    expect(saves({ guideMedia: { idle: "http://example.com/a.jpg" } })).toBe(false);
    expect(saves({ guideMedia: { idle: "data:image/png;base64,AAAA" } })).toBe(false);
    expect(saves({ guideMedia: { idle: "//evil.example/a.jpg" } })).toBe(false);
    expect(saves({ guideMedia: { idle: "/\\evil.example/a.jpg" } })).toBe(false);
    expect(saves({ guideMedia: { idle: "/media/../secret" } })).toBe(false);
    expect(saves({ guideMedia: { idle: '/media/a.jpg" onerror="x' } })).toBe(false);
    expect(isSafeGuideMediaLink("https://")).toBe(false);
    expect(isSafeGuideMediaLink("/")).toBe(false);
  });

  it("empty media links are dropped and unknown emotions ignored", () => {
    const parsed = assistantSettingsSchema.parse(
      withValue({ guideMedia: { idle: " /media/idle.mp4 ", wave: "", thinking: "   " } as AssistantSettings["guideMedia"] })
    );
    expect(parsed.guideMedia).toEqual({ idle: "/media/idle.mp4" });
    const extra = assistantSettingsSchema.parse({ ...DEFAULT_ASSISTANT_SETTINGS, guideMedia: { dance: "/media/d.mp4" } });
    expect(extra.guideMedia).toEqual({});
  });

  it("quick questions: at most 8, each 3–80 characters", () => {
    const eight = Array.from({ length: 8 }, (_, i) => `Question number ${i + 1}?`);
    expect(saves({ quickQuestions: eight })).toBe(true);
    expect(saves({ quickQuestions: [...eight, "One too many?"] })).toBe(false);
    expect(saves({ quickQuestions: [] })).toBe(true);
    expect(saves({ quickQuestions: ["Hi"] })).toBe(false);
    expect(saves({ quickQuestions: ["x".repeat(81)] })).toBe(false);
  });

  it("name, role line, greeting and hours have sensible lengths", () => {
    expect(saves({ guideName: "R" })).toBe(false);
    expect(saves({ guideName: "x".repeat(41) })).toBe(false);
    expect(saves({ guideRole: "x".repeat(81) })).toBe(false);
    expect(saves({ guideRole: "" })).toBe(true);
    expect(saves({ greeting: "Hello" })).toBe(false);
    expect(saves({ greeting: "x".repeat(401) })).toBe(false);
    expect(saves({ customerCareHours: "x".repeat(81) })).toBe(false);
  });
});
