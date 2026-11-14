/**
 * Chat guide settings, edited in Admin → Website text → Chat guide and saved as the
 * `assistant` site setting (no database migration: site_settings is key → JSON).
 * Anything missing in a saved copy falls back to these defaults.
 */
import { GUIDE_EMOTIONS, type GuideEmotion } from "./types";

export interface AssistantSettings {
  /** Show the chat guide on the website. */
  enabled: boolean;
  /** The guide's name, e.g. "Ravi". */
  guideName: string;
  /** Line under the name, e.g. "Your Sanchari trip guide". */
  guideRole: string;
  /** First message when the chat opens. */
  greeting: string;
  /** Customer care number shown in the chat, digits with country code (91XXXXXXXXXX). Empty = hidden. */
  customerCareNumber: string;
  /** When customer care answers, e.g. "Mon–Sun, 9 AM – 8 PM". */
  customerCareHours: string;
  /** Quick question buttons shown under the greeting. */
  quickQuestions: string[];
  /** Let the AI answer questions the exact-answer guide does not understand (needs ANTHROPIC_API_KEY on the server). */
  smartAnswers: boolean;
  /**
   * Picture or video for each emotion of the guide character (uploaded in Admin → Media).
   * Missing emotions fall back to "idle", then to the built-in Sanchari badge.
   */
  guideMedia: Partial<Record<GuideEmotion, string>>;
  /**
   * The pictures have a see-through background: show the guide as a 3D pop-out character with no
   * circle around him. Switch off for photos that have their own background (they get a round frame).
   */
  guideCutout: boolean;
}

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  enabled: true,
  guideName: "Ravi",
  guideRole: "Your Sanchari trip guide",
  greeting:
    "Namaskara! I'm Ravi, your Sanchari guide. Ask me about trips, dates, seats left, prices, pickup points or how booking works — I answer from our live calendar.",
  customerCareNumber: "",
  customerCareHours: "Mon–Sun, 9 AM – 8 PM",
  quickQuestions: [
    "Which trips are coming up?",
    "How many seats are left?",
    "What does the Coorg trip cost?",
    "Where are the pickup points?",
    "Can I book the whole car?",
    "What is the cancellation policy?",
  ],
  smartAnswers: true,
  // Ravi, the photoreal guide (wearing the official Sanchari S mark). Missing emotions use idle.
  guideMedia: {
    idle: "/media/guide/guide-idle.webp",
    wave: "/media/guide/guide-wave.webp",
    thinking: "/media/guide/guide-thinking.webp",
  },
  guideCutout: true,
};

/** The first built-in pictures had a studio background; saved copies of them move to the cut-outs. */
const OLD_BUILT_IN: Record<string, string> = {
  "/media/guide/guide-idle.jpg": "/media/guide/guide-idle.webp",
  "/media/guide/guide-wave.jpg": "/media/guide/guide-wave.webp",
  "/media/guide/guide-thinking.jpg": "/media/guide/guide-thinking.webp",
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Saved copy + defaults for anything missing or malformed. */
export function mergeAssistantSettings(saved: unknown): AssistantSettings {
  const d = DEFAULT_ASSISTANT_SETTINGS;
  if (!isObj(saved)) return d;
  const str = (k: keyof AssistantSettings, fallback: string) => (typeof saved[k] === "string" ? (saved[k] as string) : fallback);
  // Built-in pictures first; anything the owner set in Admin replaces them emotion by emotion.
  const media: Partial<Record<GuideEmotion, string>> = { ...d.guideMedia };
  if (isObj(saved.guideMedia)) {
    for (const e of GUIDE_EMOTIONS) {
      const v = saved.guideMedia[e];
      if (typeof v === "string" && v.trim()) media[e] = OLD_BUILT_IN[v.trim()] ?? v.trim();
    }
  }
  return {
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : d.enabled,
    guideName: str("guideName", d.guideName).trim() || d.guideName,
    guideRole: str("guideRole", d.guideRole),
    greeting: str("greeting", d.greeting).trim() || d.greeting,
    customerCareNumber: str("customerCareNumber", d.customerCareNumber).replace(/\D/g, ""),
    customerCareHours: str("customerCareHours", d.customerCareHours),
    quickQuestions: Array.isArray(saved.quickQuestions)
      ? (saved.quickQuestions as unknown[]).filter((q): q is string => typeof q === "string" && q.trim().length > 0).slice(0, 8)
      : d.quickQuestions,
    smartAnswers: typeof saved.smartAnswers === "boolean" ? saved.smartAnswers : d.smartAnswers,
    guideMedia: media,
    guideCutout: typeof saved.guideCutout === "boolean" ? saved.guideCutout : d.guideCutout,
  };
}

/**
 * "+91 98765 43210" from "919876543210" (Indian mobile), "+91 80 4123 4567" from "918041234567"
 * (Indian landline: 2-digit city codes for the metros, else 3 digits), "1800 123 4567" for toll-free,
 * else "+<digits>".
 */
export function displayPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (!d) return "";
  if (/^91[6-9]\d{9}$/.test(d)) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (/^(91)?1800\d{6,7}$/.test(d)) {
    const t = d.replace(/^91/, "");
    return `${t.slice(0, 4)} ${t.slice(4, 7)} ${t.slice(7)}`;
  }
  if (/^91[2-5]\d{9}$/.test(d)) {
    const local = d.slice(2);
    // Metros (Delhi 11, Mumbai 22, Kolkata 33, Chennai 44, Bengaluru 80, Hyderabad 40, Pune 20, Ahmedabad 79).
    const metro = /^(11|20|22|33|40|44|79|80)/.test(local);
    const code = metro ? local.slice(0, 2) : local.slice(0, 3);
    const rest = local.slice(code.length);
    return `+91 ${code} ${rest.slice(0, rest.length - 4)} ${rest.slice(-4)}`;
  }
  return `+${d}`;
}
