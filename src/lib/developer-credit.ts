import type { DeveloperCreditSettings } from "@/lib/types";

/** Where the footer badge goes unless the owner sets another https link in Admin. */
export const DEFAULT_DEVELOPER_CREDIT_URL = "https://indraportfolio-psi.vercel.app/";

/** Shown by default: a site that never saved the setting still carries the credit. */
export const DEFAULT_DEVELOPER_CREDIT: DeveloperCreditSettings = {
  enabled: true,
  url: DEFAULT_DEVELOPER_CREDIT_URL,
};

/** A full https:// address with a real host, no spaces and no user:password part. */
export function isHttpsUrl(value: string): boolean {
  if (!value || /\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && Boolean(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Saved "developer_credit" row → settings. A missing or broken row means ON with the default link. */
export function mergeDeveloperCredit(raw: unknown): DeveloperCreditSettings {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const url = typeof r.url === "string" ? r.url.trim() : "";
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_DEVELOPER_CREDIT.enabled,
    url: isHttpsUrl(url) ? url : DEFAULT_DEVELOPER_CREDIT_URL,
  };
}
