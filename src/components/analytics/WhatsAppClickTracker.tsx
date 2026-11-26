"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * click_whatsapp: one listener for every WhatsApp link on the store pages (chat, channel, trip
 * group), wherever it is and whoever adds the next one. Only the kind of link and the page are
 * reported, never a phone number.
 */
export function WhatsAppClickTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      let host = "";
      let path = "";
      try {
        const url = new URL(link.href);
        host = url.hostname.toLowerCase();
        path = url.pathname;
      } catch {
        return;
      }
      const kind =
        host === "wa.me" || host === "api.whatsapp.com"
          ? "chat"
          : host === "chat.whatsapp.com"
            ? "group"
            : (host === "whatsapp.com" || host === "www.whatsapp.com") && path.startsWith("/channel/")
              ? "channel"
              : null;
      if (!kind) return;
      trackEvent("click_whatsapp", { link_kind: kind, page_path: window.location.pathname });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
