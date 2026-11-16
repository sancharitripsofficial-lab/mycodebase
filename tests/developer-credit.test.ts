/**
 * Footer "Designed & Developed by" credit: admin setting (schema + defaults), loader merge
 * (missing = ON), https-only link, and the rendered footer line.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import kn from "@/lib/i18n/kn.json";

const creditMock = vi.hoisted(() => ({ value: { enabled: true, url: "https://indraportfolio-psi.vercel.app/" } }));
vi.mock("@/lib/data/repository", () => ({ getDeveloperCredit: async () => creditMock.value }));

import { DeveloperCredit, DeveloperCreditLine } from "@/components/DeveloperCredit";
import { developerCreditSchema, settingsSaveSchema } from "@/lib/admin/content-schemas";
import {
  DEFAULT_DEVELOPER_CREDIT,
  DEFAULT_DEVELOPER_CREDIT_URL,
  isHttpsUrl,
  mergeDeveloperCredit,
} from "@/lib/developer-credit";

describe("developer credit setting (schema)", () => {
  it("defaults to ON with the portfolio link", () => {
    expect(DEFAULT_DEVELOPER_CREDIT).toEqual({ enabled: true, url: "https://indraportfolio-psi.vercel.app/" });
    expect(developerCreditSchema.parse({})).toEqual(DEFAULT_DEVELOPER_CREDIT);
    expect(developerCreditSchema.parse({ enabled: false })).toEqual({ enabled: false, url: DEFAULT_DEVELOPER_CREDIT_URL });
  });

  it("an empty link falls back to the default link", () => {
    expect(developerCreditSchema.parse({ enabled: true, url: "   " }).url).toBe(DEFAULT_DEVELOPER_CREDIT_URL);
  });

  it("accepts https links and trims them", () => {
    expect(developerCreditSchema.parse({ enabled: true, url: "  https://example.com/me  " }).url).toBe("https://example.com/me");
  });

  it("rejects http, javascript:, protocol-relative and malformed links", () => {
    for (const url of [
      "http://indraportfolio-psi.vercel.app/",
      "javascript:alert(1)",
      "//evil.example.com",
      "data:text/html,hi",
      "https://",
      "https://exa mple.com",
      "https://user:pass@example.com",
      "indraportfolio-psi.vercel.app",
    ]) {
      expect(developerCreditSchema.safeParse({ enabled: true, url }).success, url).toBe(false);
    }
  });

  it("rejects a non-boolean switch", () => {
    expect(developerCreditSchema.safeParse({ enabled: "yes", url: DEFAULT_DEVELOPER_CREDIT_URL }).success).toBe(false);
  });

  it("is saved through the existing settings.save key list", () => {
    const ok = settingsSaveSchema.safeParse({ key: "developer_credit", value: { enabled: false, url: "https://example.com/" } });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ key: "developer_credit", value: { enabled: false, url: "https://example.com/" } });
    expect(settingsSaveSchema.safeParse({ key: "developer_credit", value: { enabled: true, url: "http://example.com/" } }).success).toBe(false);
  });
});

describe("developer credit loader merge", () => {
  it("missing or broken saved row = ON with the default link", () => {
    for (const raw of [undefined, null, "on", 42, [], {}]) {
      expect(mergeDeveloperCredit(raw), String(raw)).toEqual(DEFAULT_DEVELOPER_CREDIT);
    }
  });

  it("keeps the owner's switch and a valid https link", () => {
    expect(mergeDeveloperCredit({ enabled: false })).toEqual({ enabled: false, url: DEFAULT_DEVELOPER_CREDIT_URL });
    expect(mergeDeveloperCredit({ enabled: true, url: " https://example.com/x " })).toEqual({ enabled: true, url: "https://example.com/x" });
  });

  it("drops an unsafe saved link back to the default", () => {
    expect(mergeDeveloperCredit({ enabled: true, url: "javascript:alert(1)" }).url).toBe(DEFAULT_DEVELOPER_CREDIT_URL);
    expect(mergeDeveloperCredit({ enabled: true, url: "http://example.com" }).url).toBe(DEFAULT_DEVELOPER_CREDIT_URL);
    expect(mergeDeveloperCredit({ enabled: "false" }).enabled).toBe(true);
  });

  it("isHttpsUrl only passes https addresses with a host", () => {
    expect(isHttpsUrl("https://indraportfolio-psi.vercel.app/")).toBe(true);
    expect(isHttpsUrl("HTTPS://Example.com")).toBe(true);
    expect(isHttpsUrl("")).toBe(false);
    expect(isHttpsUrl("ftp://example.com")).toBe(false);
  });
});

describe("footer credit line", () => {
  it("renders the words and a badge link that opens the portfolio safely in a new tab", () => {
    const html = renderToStaticMarkup(createElement(DeveloperCreditLine, { url: DEFAULT_DEVELOPER_CREDIT_URL }));
    expect(html).toContain("Designed &amp; Developed by");
    expect(html).toContain('href="https://indraportfolio-psi.vercel.app/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="K S Indra Kumar — portfolio"');
    expect(html).toContain("/brand/dev-badge.svg");
  });

  it("keeps the gold keyboard focus ring, readable text and stacks on very narrow phones", () => {
    const html = renderToStaticMarkup(createElement(DeveloperCreditLine, { url: DEFAULT_DEVELOPER_CREDIT_URL }));
    // `outline-none` would force outline-style to none and kill the focus-visible ring.
    expect(html).not.toMatch(/(^|[\s"])outline-none([\s"]|$)/);
    expect(html).toContain("focus-visible:outline-2");
    expect(html).toContain("focus-visible:outline-[#f8d66e]");
    expect(html).toContain("text-white/80");
    expect(html).toContain("max-[359px]:flex-col");
  });

  it("never links to an unsafe address", () => {
    const html = renderToStaticMarkup(createElement(DeveloperCreditLine, { url: "javascript:alert(1)" }));
    expect(html).not.toContain("javascript:");
    expect(html).toContain(`href="${DEFAULT_DEVELOPER_CREDIT_URL}"`);
  });

  it("shows when ON and hides when the owner switches it off", async () => {
    creditMock.value = { enabled: true, url: "https://example.com/me" };
    const on = await DeveloperCredit();
    expect(on && renderToStaticMarkup(on)).toContain('href="https://example.com/me"');

    creditMock.value = { enabled: false, url: DEFAULT_DEVELOPER_CREDIT_URL };
    expect(await DeveloperCredit()).toBeNull();
  });

  it("has Kannada wording for the Kannada switch", () => {
    const d = kn as Record<string, string>;
    expect(d["Designed & Developed by"]).toMatch(/[ಀ-೿]/);
  });
});
