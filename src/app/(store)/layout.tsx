import { LazyChatAssistant } from "@/components/assistant/LazyChatAssistant";
import { EARLY_LANG_SCRIPT, LanguageProvider } from "@/components/i18n/LanguageProvider";
import type { ChatAssistantConfig } from "@/components/assistant/chat-config";
import { PromoPopup } from "@/components/promo/PromoPopup";
import { PromoTopBar } from "@/components/promo/PromoTopBar";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { displayPhone, mergeAssistantSettings } from "@/lib/assistant/settings";
import { forPlacement, getLivePromotions } from "@/lib/data/promotions";
import { getSiteSettings } from "@/lib/data/repository";
import { buildClickToWhatsAppUrl } from "@/lib/messaging/provider";

// Offers can start/end on a schedule: refresh every store page at least once a minute.
export const revalidate = 60;

/** Customer-facing storefront chrome. The admin panel never uses this layout or links. */
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [{ isDemoFallback, settings }, promotions] = await Promise.all([getSiteSettings(), getLivePromotions()]);
  const message = "Hi Sanchari team, I have a question about an upcoming trip.";
  // Number set in Admin → Text & policies → Social & WhatsApp wins over the env fallback.
  const whatsappUrl = settings.socialLinks.whatsappNumber
    ? `https://wa.me/${settings.socialLinks.whatsappNumber}?text=${encodeURIComponent(message)}`
    : buildClickToWhatsAppUrl(message);

  // Chat guide (Admin → Website text → Chat guide). Only public, display-ready fields go to the browser.
  const assistant = mergeAssistantSettings((settings as { assistant?: unknown }).assistant);
  const chatConfig: ChatAssistantConfig | null = assistant.enabled
    ? {
        guideName: assistant.guideName,
        guideRole: assistant.guideRole,
        greeting: assistant.greeting,
        quickQuestions: assistant.quickQuestions,
        careNumber: assistant.customerCareNumber,
        careDisplay: displayPhone(assistant.customerCareNumber),
        careHours: assistant.customerCareHours,
        whatsappUrl: whatsappUrl ?? null,
        guideMedia: assistant.guideMedia,
        guideCutout: assistant.guideCutout,
      }
    : null;

  return (
    <LanguageProvider>
    <div className="flex min-h-screen flex-col">
      {/* Kannada visitors: mark the page before it paints, so English never flashes. */}
      <script dangerouslySetInnerHTML={{ __html: EARLY_LANG_SCRIPT }} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-forest-900 focus:px-4 focus:py-2 focus:text-cream-50"
      >
        Skip to main content
      </a>
      <PromoTopBar promotions={forPlacement(promotions, "top_bar")} />
      <SiteHeader isDemoMode={isDemoFallback} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter social={settings.socialLinks} brand={settings.brandIdentity} />
      {whatsappUrl && <WhatsAppFloat href={whatsappUrl} />}
      {chatConfig && <LazyChatAssistant config={chatConfig} />}
      <PromoPopup promotions={forPlacement(promotions, "popup")} />
    </div>
    </LanguageProvider>
  );
}
