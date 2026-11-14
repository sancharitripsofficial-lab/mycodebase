/**
 * The UPI pay panel the trip page loads after a seat hold renders inside the Astryx theme
 * (the Theme JavaScript no longer runs app-wide, so the panel brings its own).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UpiPayPanelThemed, UpiSubmittedNoticeThemed } from "@/components/UpiPayPanel";

const instructions = {
  upiId: "sanchari@ybl",
  payeeName: "Sanchari Micro Trips",
  supportPhone: null,
  amountPaise: 1_240_000,
  note: "SAN-AB12CD",
  upiUri: "upi://pay?pa=sanchari@ybl&pn=Sanchari&am=12400.00&cu=INR&tn=SAN-AB12CD",
  qrDataUrl: "data:image/png;base64,iVBORw0KGgo=",
  holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
};

describe("UPI pay panel (lazy, themed)", () => {
  it("renders the UPI ID, amount and reference box inside the Sanchari Astryx theme", () => {
    const html = renderToStaticMarkup(
      createElement(UpiPayPanelThemed, {
        mode: "pay",
        instructions,
        bookingReference: "SAN-AB12CD",
        email: "asha@example.com",
        onSubmitted: () => {},
      })
    );
    expect(html).toContain("data-astryx-theme");
    expect(html).toContain("sanchari@ybl");
    expect(html).toMatch(/12,400/);
  });

  it("renders the 'reference sent' notice inside the theme too", () => {
    const html = renderToStaticMarkup(
      createElement(UpiSubmittedNoticeThemed, {
        result: {
          paymentId: "p1",
          amountPaise: 1_240_000,
          lateAfterHold: false,
          seatsLost: false,
          bookingStatus: "payment_pending",
        } as never,
        bookingReference: "SAN-AB12CD",
        lookupHref: "/booking-lookup?ref=SAN-AB12CD",
      })
    );
    expect(html).toContain("data-astryx-theme");
    expect(html).toContain("SAN-AB12CD");
  });
});
