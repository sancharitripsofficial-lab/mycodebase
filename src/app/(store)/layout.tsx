import type { Metadata } from "next";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { cleanVerificationCode, mergeAnalyticsSettings } from "@/lib/analytics";
import { LazyChatAssistant } from "@/components/assistant/LazyChatAssistant";
import { MobileBar } from "@/components/MobileBar";
import { EARLY_LANG_SCRIPT, LanguageProvider } from "@/components/i18n/LanguageProvider";
import type { ChatAssistantConfig } from "@/components/assistant/chat-config";
import { PromoPopup } from "@/components/promo/PromoPopup";
import { PromoTopBar } from "@/components/promo/PromoTopBar";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { displayPhone, mergeAssistantSettings } from "@/lib/assistant/settings";
import { forPlacement, getLivePromotions, getPopupChoice } from "@/lib/data/promotions";
import { getSiteSettings } from "@/lib/data/repository";
import { buildClickToWhatsAppUrl } from "@/lib/messaging/provider";

/**
 * Search-engine ownership tags (Admin → Website text → Analytics, or the GOOGLE_SITE_VERIFICATION /
 * BING_SITE_VERIFICATION environment variables). Only on store pages, never on the admin panel.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSiteSettings();
  const a = mergeAnalyticsSettings(settings.analytics);
  const google = a.googleSiteVerification || cleanVerificationCode(process.env.GOOGLE_SITE_VERIFICATION);
  const bing = a.bingSiteVerification || cleanVerificationCode(process.env.BING_SITE_VERIFICATION);
  if (!google && !bing) return {};
  return { verification: { ...(google ? { google } : {}), ...(bing ? { other: { "msvalidate.01": bing } } : {}) } };
}

// Offers can start/end on a schedule: every store page is rebuilt at least every 5 minutes (and at
// once after bookings / admin edits). Not more often: each rebuild is a paid write on the host.
export const revalidate = 300;

/** Customer-facing storefront chrome. The admin panel never uses this layout or links. */
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [{ isDemoFallback, settings }, promotions, popupChoice] = await Promise.all([getSiteSettings(), getLivePromotions(), getPopupChoice()]);
  // The offer the owner picked to pop up (Admin → Offers & ads), only while that offer is live.
  // With a pick, only that offer pops up; without one the pop-up is automatic (newest first).
  const pickedOffer = popupChoice ? promotions.find((p) => p.id === popupChoice.promotionId) : undefined;
  const pickedPopup = pickedOffer && popupChoice ? { promo: pickedOffer, since: popupChoice.since } : null;
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
    <div className="store-shell flex min-h-screen flex-col">
      {/* Kannada visitors: mark the page before it paints, so English never flashes. */}
      <script dangerouslySetInnerHTML={{ __html: EARLY_LANG_SCRIPT }} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-forest-900 focus:px-4 focus:py-2 focus:text-cream-50"
      >
        Skip to main content
      </a>
      <PromoTopBar promotions={forPlacement(promotions, "top_bar")} ticker={settings.adTicker} />
      <SiteHeader isDemoMode={isDemoFallback} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter social={settings.socialLinks} brand={settings.brandIdentity} />
      {whatsappUrl && <WhatsAppFloat href={whatsappUrl} />}
      {chatConfig && <LazyChatAssistant config={chatConfig} />}
      {/* Phones and tablets: Explore, WhatsApp and My Booking at the bottom of every page. */}
      <MobileBar whatsappUrl={whatsappUrl ?? null} />
      {/* Booking-funnel events for Google Analytics 4, only when the owner has set a measurement ID. */}
      <GoogleAnalytics measurementId={settings.analytics.gaMeasurementId} />
      <PromoPopup promotions={forPlacement(promotions, "popup")} picked={pickedPopup} />
    </div>
    </LanguageProvider>
  );
}
