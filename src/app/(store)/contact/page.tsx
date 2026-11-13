import { Mail, MapPin, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { PageBanner3D } from "@/components/banners/PageBanner3D";
import { getSiteSettings } from "@/lib/data/repository";
import { buildClickToWhatsAppUrl } from "@/lib/messaging/provider";

export const metadata: Metadata = {
  title: "Contact & WhatsApp Support",
  description: "Reach the Sanchari • Micro Trips team in Bengaluru.",
};

export default async function ContactPage() {
  const { settings } = await getSiteSettings();
  const message = "Hello Sanchari team, I have an enquiry about a Karnataka micro-trip.";
  // Same number as the floating WhatsApp button (Admin → Text & policies → social & WhatsApp);
  // the old environment-variable number is only a fallback.
  const whatsappUrl = settings.socialLinks.whatsappNumber
    ? `https://wa.me/${settings.socialLinks.whatsappNumber}?text=${encodeURIComponent(message)}`
    : buildClickToWhatsAppUrl(message);

  return (
    <>
      <PageBanner3D
        scene="contact"
        width="3xl"
        eyebrow="Contact Operations"
        title="Get in Touch"
        subtitle="For private 6-seat date requests, accessibility queries, or booking changes."
      />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12 space-y-8">
        <div className="sec-route rounded-2xl border border-stone-200 p-6 space-y-4 text-sm">
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-forest-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 break-words">
              <p className="font-semibold text-forest-900">Base Location</p>
              <p className="text-stone-600">{settings.brandIdentity.registeredAddress}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-forest-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 break-words">
              <p className="font-semibold text-forest-900">Support Email &amp; Hours</p>
              <p className="text-stone-600">
                {settings.brandIdentity.supportEmail} • {settings.brandIdentity.supportHours}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MessageCircle className="h-5 w-5 text-copper-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 space-y-2 break-words">
              <p className="font-semibold text-forest-900">WhatsApp Support</p>
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-forest-900 px-4 py-2 text-xs font-semibold text-cream-50"
                >
                  Open Click-to-WhatsApp Chat
                </a>
              ) : (
                <p className="text-xs text-stone-600">
                  Our WhatsApp line is being set up. Please email us meanwhile — we reply within the hours above.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
