import { BellRing } from "lucide-react";

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

/** Compact "Follow on WhatsApp" pill (footer, light text on the ocean footer). */
export function WhatsAppChannelButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#073B1F] shadow-sm transition hover:brightness-95"
    >
      <WhatsAppGlyph className="h-5 w-5" />
      Follow our WhatsApp channel
    </a>
  );
}

/** Card inviting visitors to follow the channel for new dates, offers and coupons. */
export function WhatsAppChannelCta({ href, context = "general" }: { href: string; context?: "trip" | "booking" | "general" }) {
  const copy =
    context === "booking"
      ? "Trip-day updates, photos from the road and members-only offers — follow our WhatsApp channel."
      : context === "trip"
        ? "New dates, last-seat alerts and coupons reach our WhatsApp channel first."
        : "New trips, offers and coupons — first on our WhatsApp channel.";
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#25D366]/35 bg-[linear-gradient(120deg,#EAFBF1,#F2F8FA)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2.5 text-sm text-ink-900">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-[#128C4B]" aria-hidden="true" />
        <span>{copy}</span>
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#073B1F] shadow-sm transition hover:brightness-95"
      >
        <WhatsAppGlyph className="h-5 w-5" />
        Follow on WhatsApp
      </a>
    </div>
  );
}
