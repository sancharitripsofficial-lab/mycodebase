import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { signBookingLookupToken, verifyBookingLookupToken } from "@/lib/lookup-token";
import { getPaymentProvider } from "@/lib/payments/provider";
import { getSafeComfortCustomerLabel, sanitizeCsvCell } from "@/lib/privacy";

describe("Security, privacy & payment signature controls", () => {
  it("prevents CSV formula injection in admin exports", () => {
    expect(sanitizeCsvCell("=CMD('calc')")).toBe('"\'=CMD(\'calc\')"');
    expect(sanitizeCsvCell("+SUM(A1:A2)")).toBe('"\'+SUM(A1:A2)"');
    expect(sanitizeCsvCell("Normal Name")).toBe('"Normal Name"');
  });

  it("renders comfort labels without exposing batch gender counts", () => {
    const label = getSafeComfortCustomerLabel("prefer_same_gender", "pending_review");
    expect(label).toContain("privately queued");
    expect(label).not.toMatch(/\d+ (men|women|male|female)/i);
  });

  it("verifies signed guest booking lookup tokens safely", () => {
    const token = signBookingLookupToken("SAN-ABC123", "Guest@Example.com");
    expect(verifyBookingLookupToken("san-abc123", "guest@example.com", token)).toBe(true);
    expect(verifyBookingLookupToken("SAN-OTHER1", "guest@example.com", token)).toBe(false);
    expect(verifyBookingLookupToken("SAN-ABC123", "attacker@example.com", token)).toBe(false);
  });

  it("rejects tampered webhook signatures", () => {
    const provider = getPaymentProvider();
    const body = JSON.stringify({ event: "payment.captured" });
    const fakeSig = crypto.createHmac("sha256", "wrong-secret").update(body).digest("hex");
    expect(provider.verifyWebhookSignature(body, fakeSig)).toBe(false);
    expect(provider.verifyWebhookSignature(body, null)).toBe(false);
  });
});

