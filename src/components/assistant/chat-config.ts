import type { GuideEmotion } from "@/lib/assistant/types";

/**
 * Public chat guide settings sent to the browser (built in src/app/(store)/layout.tsx from the
 * owner's Admin → Chat guide settings). Never put secrets here: every field ends up in the page.
 */
export interface ChatAssistantConfig {
  guideName: string;
  guideRole: string;
  greeting: string;
  quickQuestions: string[];
  /** Customer care number, digits with country code (91XXXXXXXXXX). Empty = not shown. */
  careNumber: string;
  /** The same number written for people, e.g. "+91 98765 43210". */
  careDisplay: string;
  careHours: string;
  /** Same click-to-WhatsApp link as the floating WhatsApp button, or null. */
  whatsappUrl: string | null;
  /** Picture or video per emotion (Admin → Media). */
  guideMedia: Partial<Record<GuideEmotion, string>>;
}

/** Drives the guide's emotion (owned by ChatAssistant, used by the chat window). */
export interface GuideMoodActions {
  /** Chat opened: wave for 2.4 s, then idle. */
  wave(): void;
  /** Visitor is typing (on) or stopped (off). `soft` = don't interrupt a short wave / happy moment. */
  listen(on: boolean, soft?: boolean): void;
  /** Question sent, waiting for the first answer. */
  think(): void;
  /** Answer text is being written. */
  talk(): void;
  /** Answer finished: show its emotion for 3 s, then idle. */
  finish(emotion: GuideEmotion): void;
  /** Something went wrong. */
  sorry(): void;
  reset(): void;
}
