import Script from "next/script";
import { cleanAdsId, cleanAdsLabel, cleanMeasurementId } from "@/lib/analytics";
import { WhatsAppClickTracker } from "./WhatsAppClickTracker";

/**
 * Google Analytics 4 for the store pages, only when a measurement ID is set (Admin → Website text →
 * Analytics, or NEXT_PUBLIC_GA_MEASUREMENT_ID). Without one, nothing is loaded and nothing is sent.
 *
 * The small inline script defines `gtag` while the page is parsed, so booking events fired during
 * hydration are queued in order; the Google library itself loads when the browser is idle and then
 * sends what is queued. The ID is checked against the "G-XXXXXXXXXX" shape before it is written.
 */
export function GoogleAnalytics({
  measurementId,
  adsId = "",
  adsPurchaseLabel = "",
}: {
  measurementId: string;
  /** Google Ads tag ID ("AW-…"): Admin → Website text → Analytics. */
  adsId?: string;
  /** Conversion label of the Google Ads "Purchase" action. */
  adsPurchaseLabel?: string;
}) {
  const id = cleanMeasurementId(measurementId) || cleanMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  const aw = cleanAdsId(adsId);
  const label = aw ? cleanAdsLabel(adsPurchaseLabel) : "";
  const first = id || aw;
  // Both IDs were checked against strict patterns above, so they are safe to write into the script.
  const config = [id && `gtag('config','${id}');`, aw && `gtag('config','${aw}');`, label && `window.__sanchariAdsPurchase='${aw}/${label}';`]
    .filter(Boolean)
    .join("");
  return (
    <>
      {first && (
        <>
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());${config}`,
            }}
          />
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${first}`} strategy="lazyOnload" />
        </>
      )}
      <WhatsAppClickTracker />
    </>
  );
}
