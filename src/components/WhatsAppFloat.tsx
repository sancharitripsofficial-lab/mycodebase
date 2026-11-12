import { MessageCircle } from "lucide-react";

/** Floating "chat on WhatsApp" button (shown only when the owner set a support number). */
export function WhatsAppFloat({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Sanchari on WhatsApp"
      className="fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-[#1fa855] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgb(31_168_85/0.7)] transition hover:-translate-y-0.5 hover:bg-[#178f47] sm:right-6 sm:bottom-6"
    >
      <MessageCircle className="h-5 w-5" aria-hidden="true" />
      <span className="hidden sm:inline">Ask on WhatsApp</span>
    </a>
  );
}
