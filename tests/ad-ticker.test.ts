import { describe, expect, it } from "vitest";
import { adTickerSchema } from "@/lib/admin/content-schemas";
import { DEFAULT_AD_TICKER, isTickerLink, mergeAdTicker, tickerDurationSeconds } from "@/lib/ad-ticker";

describe("moving advertisement strip above the menu", () => {
  it("is on by default with no extra lines, and a broken saved copy falls back to that", () => {
    expect(mergeAdTicker(undefined)).toEqual(DEFAULT_AD_TICKER);
    expect(mergeAdTicker("junk")).toEqual(DEFAULT_AD_TICKER);
    expect(mergeAdTicker({ enabled: false, speed: "warp" })).toEqual({ enabled: false, speed: "normal", lines: [] });
  });

  it("keeps the owner's lines, tidied, with only safe links", () => {
    const got = mergeAdTicker({
      enabled: true,
      speed: "fast",
      lines: [{ text: "  New   Coorg dates  ", href: "/trips" }, { text: "Bad link", href: "javascript:alert(1)" }, { text: "", href: "/x" }, "junk", { text: "Out", href: "https://example.com/a" }],
    });
    expect(got.speed).toBe("fast");
    expect(got.lines).toEqual([
      { text: "New Coorg dates", href: "/trips" },
      { text: "Bad link", href: "" },
      { text: "Out", href: "https://example.com/a" },
    ]);
  });

  it("only site paths and https links may be opened", () => {
    for (const ok of ["", "/trips", "/trips/x?date=1#book", "https://wa.me/911234567890"]) expect(isTickerLink(ok)).toBe(true);
    for (const bad of ["//evil.com", "http://x.com", "javascript:alert(1)", "/a b", "data:text/html,x", '/x"onclick']) expect(isTickerLink(bad)).toBe(false);
  });

  it("moves at the same pace however long the strip is", () => {
    expect(tickerDurationSeconds(1200, "normal")).toBe(20);
    expect(tickerDurationSeconds(2400, "normal")).toBe(40);
    expect(tickerDurationSeconds(1200, "fast")).toBeLessThan(tickerDurationSeconds(1200, "slow"));
    expect(tickerDurationSeconds(10, "fast")).toBe(8);
    expect(tickerDurationSeconds(1_000_000, "slow")).toBe(240);
  });

  it("the admin form refuses long lines, bad links and too many lines", () => {
    expect(adTickerSchema.safeParse({ enabled: true, speed: "slow", lines: [{ text: "Hello there", href: "" }] }).success).toBe(true);
    expect(adTickerSchema.safeParse({ enabled: true, speed: "slow", lines: [{ text: "x".repeat(91), href: "" }] }).success).toBe(false);
    expect(adTickerSchema.safeParse({ enabled: true, speed: "slow", lines: [{ text: "Hello", href: "http://x.com" }] }).success).toBe(false);
    expect(adTickerSchema.safeParse({ enabled: true, speed: "slow", lines: Array.from({ length: 9 }, () => ({ text: "Hello", href: "" })) }).success).toBe(false);
  });
});
