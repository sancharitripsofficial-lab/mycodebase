import crypto from "node:crypto";
import { getBookingLookupSecret } from "@/lib/env";

export function signBookingLookupToken(bookingReference: string, email: string): string {
  const secret = getBookingLookupSecret();
  const payload = `${bookingReference.trim().toUpperCase()}:${email.trim().toLowerCase()}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyBookingLookupToken(
  bookingReference: string,
  email: string,
  token: string
): boolean {
  const expected = signBookingLookupToken(bookingReference, email);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(token.trim(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

