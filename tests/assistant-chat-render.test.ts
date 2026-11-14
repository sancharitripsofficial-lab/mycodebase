import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatAssistant } from "@/components/assistant/ChatAssistant";
import { ChatMessage, RichText } from "@/components/assistant/ChatMessage";
import { GuideAvatar } from "@/components/assistant/GuideAvatar";
import type { GuideMessage } from "@/components/assistant/chat-stream";

const look = { guideName: "Ravi", media: {} };

describe("chat guide rendering", () => {
  it("renders light markdown without raw HTML and only safe links", () => {
    const html = renderToStaticMarkup(
      createElement(RichText, {
        text: "**Coorg** is ₹4,999.\n- Seats: 4 left\n- [Book now](/trips/coorg?date=d1#book)\n\n[evil](javascript:alert(1)) <b>x</b>",
      }),
    );
    expect(html).toContain("<strong");
    expect(html).toContain("<li>");
    expect(html).toContain('href="/trips/coorg?date=d1#book"');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain("[evil](javascript:alert(1))");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("never turns protocol-relative or backslash links into site links", () => {
    const html = renderToStaticMarkup(
      createElement(RichText, { text: "[a](//evil.example/x) [b](/\\evil.example) [c](/trips/coorg)" }),
    );
    expect(html).not.toContain('href="//evil');
    expect(html).not.toContain('href="/\\');
    expect(html).toContain('href="/trips/coorg"');
  });

  it("shows a women-only label on a trip card's next date, and old answers say when seats were checked", () => {
    const old = Date.now() - 60 * 60_000;
    const msg: GuideMessage = {
      id: "g7",
      role: "guide",
      text: "Coorg next date.",
      cards: [
        {
          kind: "trip",
          slug: "coorg",
          title: "Coorg",
          destination: "Coorg",
          theme: "coorg",
          imageUrl: "/images/coorg.jpg",
          durationLabel: "3D / 2N",
          difficulty: "Easy",
          pricePaise: 1_240_000,
          privatePricePaise: null,
          next: { departureId: "d1", startDate: "2026-12-11", endDate: "2026-12-13", seatsRemaining: 6, maxCapacity: 6, womenOnly: true },
        },
      ],
      actions: [],
      suggestions: [],
      source: "guide",
      status: "done",
      at: old,
    };
    const html = renderToStaticMarkup(
      createElement(ChatMessage, { message: msg, shownChars: null, look, showSuggestions: false, busy: false, onSuggestion: () => {} }),
    );
    expect(html).toContain("Women-only batch");
    expect(html).toContain("Seats and prices as of");
    expect(html).not.toContain("From the live trip calendar");
  });

  it("renders an answer with trip, departure and pickup cards", () => {
    const msg: GuideMessage = {
      id: "g1",
      role: "guide",
      text: "Here are the next dates.",
      source: "guide",
      status: "done",
      suggestions: ["Pickup points?"],
      actions: [
        { kind: "call", label: "Call +91 98765 43210", tel: "tel:+919876543210" },
        { kind: "link", label: "All trips", href: "/trips" },
        { kind: "link", label: "Bad", href: "https://evil.example" },
      ],
      cards: [
        {
          kind: "trip",
          slug: "coorg",
          title: "Coorg Coffee Trail",
          destination: "Coorg",
          theme: "coorg",
          imageUrl: "/images/coorg.jpg",
          durationLabel: "3D / 2N",
          difficulty: "Easy",
          pricePaise: 499900,
          privatePricePaise: 2700000,
          next: { departureId: "d1", startDate: "2026-11-21", endDate: "2026-11-23", seatsRemaining: 4, maxCapacity: 6 },
        },
        {
          kind: "departure",
          tripSlug: "coorg",
          tripTitle: "Coorg Coffee Trail",
          theme: "coorg",
          departureId: "d2",
          code: "CRG-02",
          startDate: "2026-11-28",
          endDate: "2026-11-30",
          seatsRemaining: 6,
          maxCapacity: 6,
          pricePaise: 499900,
          womenOnly: true,
          privateCarPossible: true,
        },
        {
          kind: "pickup",
          tripSlug: "coorg",
          tripTitle: "Coorg Coffee Trail",
          name: "Hebbal flyover",
          area: "North Bengaluru",
          time: "5:30 AM",
          mapsUrl: "https://maps.google.com/?q=hebbal",
          confirmed: true,
        },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(ChatMessage, {
        message: msg,
        shownChars: null,
        look,
        showSuggestions: true,
        busy: false,
        onSuggestion: () => undefined,
      }),
    );
    expect(html).toContain("Coorg Coffee Trail");
    expect(html).toContain("₹4,999");
    expect(html).toContain("/trips/coorg?date=d2#book");
    expect(html).toContain("/trips/coorg?date=d2&amp;mode=private#book");
    expect(html).toContain("Women only");
    expect(html).toContain("6 of 6 seats left");
    expect(html).toContain("Hebbal flyover");
    expect(html).toContain('href="tel:+919876543210"');
    expect(html).not.toContain("evil.example");
    expect(html).toContain("Pickup points?");
    expect(html).toContain("From the live trip calendar");
  });

  it("hides cards until the answer is fully written", () => {
    const msg: GuideMessage = {
      id: "g2",
      role: "guide",
      text: "Here is **Hampi** for you",
      source: "ai",
      status: "streaming",
      suggestions: [],
      actions: [],
      cards: [],
    };
    const html = renderToStaticMarkup(
      createElement(ChatMessage, { message: msg, shownChars: 15, look, showSuggestions: false, busy: true, onSuggestion: () => undefined }),
    );
    expect(html).toContain("Here is Hampi"); // "Here is **Hampi": the open bold marker is hidden, not shown as **
    expect(html).not.toContain("**");
    expect(html).toContain("_caret_"); // still being written (screen readers get the whole answer once, from the chat window)
  });

  it("server-renders only the light launcher, never the chat window", () => {
    const html = renderToStaticMarkup(
      createElement(ChatAssistant, {
        config: {
          guideName: "Ravi",
          guideRole: "Your Sanchari trip guide",
          greeting: "Namaskara!",
          quickQuestions: ["Which trips are coming up?"],
          careNumber: "919876543210",
          careDisplay: "+91 98765 43210",
          careHours: "Mon–Sun, 9 AM – 8 PM",
          whatsappUrl: "https://wa.me/919876543210",
          guideMedia: {},
          guideCutout: true,
        },
      }),
    );
    expect(html).toContain('aria-label="Ask Ravi — live trip answers from your Sanchari guide"'); // starts with the visible words
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Namaskara!");
  });

  it("draws a see-through guide picture as a pop-out character (no circle); photos keep the round frame", () => {
    const cut = renderToStaticMarkup(createElement(GuideAvatar, { emotion: "idle", media: { idle: "/media/guide/guide-idle.webp" }, size: 52, name: "Ravi", cutout: true }));
    expect(cut).toContain('data-cutout="true"');
    expect(cut).toContain("/media/guide/guide-idle.webp");
    const photo = renderToStaticMarkup(createElement(GuideAvatar, { emotion: "idle", media: { idle: "/media/a.jpg" }, size: 52, name: "Ravi" }));
    expect(photo).toContain('data-cutout="false"');
    // no media at all: the round Sanchari badge, never a pop-out
    const badge = renderToStaticMarkup(createElement(GuideAvatar, { emotion: "idle", media: {}, size: 52, name: "Ravi", cutout: true }));
    expect(badge).toContain('data-cutout="false"');
    expect(badge).toContain("sanchari-mark");
  });

  it("renders the guide badge and an uploaded picture", () => {
    const badge = renderToStaticMarkup(createElement(GuideAvatar, { emotion: "thinking", media: {}, size: 76, name: "Ravi" }));
    expect(badge).toContain("sanchari-mark.png");
    expect(badge).toContain('data-emotion="thinking"');
    const pic = renderToStaticMarkup(
      createElement(GuideAvatar, { emotion: "happy", media: { idle: "https://cdn.example/ravi.webp", happy: "javascript:x" }, size: 52, name: "Ravi" }),
    );
    expect(pic).toContain("https://cdn.example/ravi.webp");
    expect(pic).not.toContain("javascript:");
    const vid = renderToStaticMarkup(createElement(GuideAvatar, { emotion: "talking", media: { talking: "/media/ravi-talk.mp4" }, size: 76, name: "Ravi" }));
    expect(vid).toContain("<video");
  });
});
