import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { getSiteSettings } from "@/lib/data/repository";
import { buildClickToWhatsAppUrl } from "@/lib/messaging/provider";

/** Customer-facing storefront chrome. The admin panel never uses this layout or links. */
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const { isDemoFallback, settings } = await getSiteSettings();
  const message = "Hi Sanchari team, I have a question about an upcoming trip.";
  // Number set in Admin → Text & policies → Social & WhatsApp wins over the env fallback.
  const whatsappUrl = settings.socialLinks.whatsappNumber
    ? `https://wa.me/${settings.socialLinks.whatsappNumber}?text=${encodeURIComponent(message)}`
    : buildClickToWhatsAppUrl(message);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-forest-900 focus:px-4 focus:py-2 focus:text-cream-50"
      >
        Skip to main content
      </a>
      <SiteHeader isDemoMode={isDemoFallback} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter social={settings.socialLinks} brand={settings.brandIdentity} />
      {whatsappUrl && <WhatsAppFloat href={whatsappUrl} />}
    </div>
  );
}
