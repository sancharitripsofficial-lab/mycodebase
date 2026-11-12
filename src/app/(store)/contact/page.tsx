import { Mail, MapPin, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/data/repository";
import { buildClickToWhatsAppUrl } from "@/lib/messaging/provider";

export const metadata: Metadata = {
  title: "Contact & WhatsApp Support",
  description: "Reach the Sanchari • Micro Trips team in Bengaluru.",
};

export default async function ContactPage() {
  const { settings } = await getSiteSettings();
  const whatsappUrl = buildClickToWhatsAppUrl(
    "Hello Sanchari team, I have an enquiry about a Karnataka micro-trip."
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper-700">
          Contact Operations
        </p>
        <h1 className="font-display text-3xl font-semibold text-forest-900">
          Get in Touch
        </h1>
        <p className="text-sm text-stone-600">
          For private 6-seat date requests, accessibility queries, or booking changes.
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-cream-50 p-6 space-y-4 text-sm">
        <div className="flex items-start gap-3">
          <MapPin className="h-5 w-5 text-forest-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold text-forest-900">Base Location</p>
            <p className="text-stone-600">{settings.brandIdentity.registeredAddress}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Mail className="h-5 w-5 text-forest-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold text-forest-900">Support Email &amp; Hours</p>
            <p className="text-stone-600">
              {settings.brandIdentity.supportEmail} • {settings.brandIdentity.supportHours}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <MessageCircle className="h-5 w-5 text-copper-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-2">
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
                WhatsApp support number not yet configured (`NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER`
                in `.env.local`). Official WhatsApp Business API notifications also require
                owner template approvals.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

