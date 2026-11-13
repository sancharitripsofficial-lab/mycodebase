import { MessageCircle } from "lucide-react";

/**
 * Floating "chat on WhatsApp" button (shown only when the owner set a support number).
 * Phones: a round icon in the bottom-right corner, with the chat guide launcher stacked above it.
 * Larger screens: the "Ask on WhatsApp" pill.
 */
export function WhatsAppFloat({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Sanchari on WhatsApp"
      className="fixed right-[calc(1rem+2px)] bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 inline-flex h-14 w-14 items-center justify-center gap-2 rounded-full bg-[#1fa855] text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgb(31_168_85/0.7)] ring-2 ring-white/80 transition hover:-translate-y-0.5 hover:bg-[#178f47] sm:right-6 sm:bottom-6 sm:h-auto sm:w-auto sm:px-4 sm:py-3 sm:ring-0"
    >
      <MessageCircle className="h-6 w-6 sm:h-5 sm:w-5" aria-hidden="true" />
      <span className="hidden sm:inline">Ask on WhatsApp</span>
    </a>
  );
}
