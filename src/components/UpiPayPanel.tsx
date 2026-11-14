"use client";

import "@/styles/astryx-components.css";
import { AstryxShell } from "@/components/AstryxShell";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Check, Copy, ScanLine, ShieldCheck, Smartphone, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatINR } from "@/lib/currency";
import { buildUpiAppLinks, validateUtr } from "@/lib/payments/upi";
import type { UpiPaymentInstructions, UpiSubmitResult } from "@/lib/types";

export type UpiPanelMode = "pay" | "late_reference";

interface UpiPayPanelProps {
  /** "pay": QR + UPI ID + reference box. "late_reference": hold ran out, reference box only. */
  mode: UpiPanelMode;
  instructions: UpiPaymentInstructions | null;
  bookingReference: string;
  email: string;
  heading?: string;
  onSubmitted: (result: UpiSubmitResult) => void;
  /** Scroll the panel into view when it appears (after the seat hold replaces the form). */
  scrollOnMount?: boolean;
}

function useScrollIntoViewOnMount(enabled: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [enabled]);
  return ref;
}

type Platform = "android" | "ios" | "desktop";

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Pay the owner's UPI ID directly, then send the 12-digit UPI reference for staff to check. */
export function UpiPayPanel({
  mode,
  instructions,
  bookingReference,
  email,
  heading,
  onSubmitted,
  scrollOnMount = false,
}: UpiPayPanelProps) {
  const panelRef = useScrollIntoViewOnMount(scrollOnMount);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [now, setNow] = useState<number | null>(null);
  const [utr, setUtr] = useState("");
  const [paidConfirmed, setPaidConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"id" | "amount" | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    setPlatform(/android/i.test(ua) ? "android" : /iphone|ipad|ipod/i.test(ua) ? "ios" : "desktop");
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const expiresAt = instructions?.holdExpiresAt ? Date.parse(instructions.holdExpiresAt) : null;
  const msLeft = expiresAt !== null && now !== null ? expiresAt - now : null;
  const timeUp = mode === "late_reference" || (msLeft !== null && msLeft <= 0);
  const showQr = mode === "pay" && instructions !== null && !timeUp;
  const amount = instructions?.amountPaise ?? null;
  const utrCheck = utr.trim() ? validateUtr(utr) : null;

  async function copy(text: string, which: "id" | "amount") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  }

  async function submit() {
    setError(null);
    const checked = validateUtr(utr);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    if (mode === "pay" && !timeUp && !paidConfirmed) {
      setError("Tick the box to confirm you have completed the payment in your UPI app.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments/upi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingReference, email, utr: checked.value }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not record your payment. Please try again.");
        return;
      }
      onSubmitted(json as UpiSubmitResult);
    } catch {
      setError("Network problem. Your payment is safe — please send the reference again.");
    } finally {
      setSubmitting(false);
    }
  }

  const appLinks = instructions ? buildUpiAppLinks(instructions.upiUri) : null;

  return (
    <section ref={panelRef} className="card-soft scroll-mt-28 overflow-hidden" aria-label="Pay by UPI">
      <div className="bg-ocean px-5 py-5 text-white sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">
              {heading ?? "Pay by UPI"} • {bookingReference}
            </p>
            {amount !== null && (
              <p className="mt-1 font-display text-4xl font-semibold tracking-tight">{formatINR(amount)}</p>
            )}
            {instructions && (
              <p className="mt-1 text-sm text-white/85">
                to <strong className="font-semibold text-white">{instructions.payeeName}</strong> •{" "}
                <span className="font-mono">{instructions.upiId}</span>
              </p>
            )}
          </div>
          {mode === "pay" && msLeft !== null && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                timeUp ? "bg-white text-copper-700" : "glass text-white"
              }`}
              aria-live="polite"
            >
              <Timer className="h-4 w-4" aria-hidden="true" />
              {timeUp ? "Seat hold time is up" : `Seats held ${formatCountdown(msLeft)}`}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {timeUp && (
          <Banner
            status="warning"
            title="Already paid? Send the UPI reference below."
            description="We'll keep your seats if they're still free; if not, the full amount is refunded. If you haven't paid yet, please don't pay now — go back and hold the seats again."
          />
        )}

        {showQr && instructions && (
          <div className="grid gap-5 sm:grid-cols-[220px_1fr] sm:items-start">
            <figure className="mx-auto w-full max-w-[220px] rounded-2xl border border-stone-200 bg-white p-3 shadow-[var(--shadow-soft)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR generated on our server */}
              <img
                src={instructions.qrDataUrl}
                alt={`UPI QR code to pay ${formatINR(instructions.amountPaise)} to ${instructions.payeeName}`}
                width={196}
                height={196}
                className="h-auto w-full"
              />
              <figcaption className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-stone-600">
                <ScanLine className="h-3.5 w-3.5 text-forest-700" aria-hidden="true" />
                Scan with any UPI app
              </figcaption>
            </figure>

            <div className="space-y-4">
              <ol className="space-y-2.5 text-sm">
                {[
                  "Scan the QR (or tap a UPI app button on your phone).",
                  `Check the amount is ${formatINR(instructions.amountPaise)} and the name is ${instructions.payeeName}, then pay.`,
                  "Copy the 12-digit UPI reference from the success screen and send it below.",
                ].map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lagoon-100 text-xs font-bold text-forest-900">
                      {i + 1}
                    </span>
                    <span className="text-ink-900/90">{step}</span>
                  </li>
                ))}
              </ol>

              {platform === "android" && (
                <a href={instructions.upiUri} className="btn-sunset w-full px-5 py-3 text-sm">
                  <Smartphone className="h-4 w-4" aria-hidden="true" />
                  Pay {formatINR(instructions.amountPaise)} with a UPI app
                </a>
              )}
              {platform === "ios" && appLinks && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["Google Pay", appLinks.gpay],
                    ["PhonePe", appLinks.phonepe],
                    ["Paytm", appLinks.paytm],
                  ].map(([name, href]) => (
                    <a
                      key={name}
                      href={href}
                      className="rounded-xl border border-stone-200 bg-white px-2 py-2.5 text-center text-xs font-semibold text-forest-900 hover:border-forest-800"
                    >
                      {name}
                    </a>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  label={copied === "id" ? "UPI ID copied" : "Copy UPI ID"}
                  icon={copied === "id" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  onClick={() => void copy(instructions.upiId, "id")}
                />
                <Button
                  size="sm"
                  label={copied === "amount" ? "Amount copied" : "Copy amount"}
                  icon={copied === "amount" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  onClick={() => void copy((instructions.amountPaise / 100).toFixed(2), "amount")}
                />
              </div>
              <p className="text-xs leading-relaxed text-stone-600">
                App doesn&apos;t open? Scan the QR from another phone, or pay the exact amount to the UPI ID by hand.
              </p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-stone-200 bg-cream-100/60 p-4 sm:p-5">
          <TextInput
            label="UPI reference number (UTR)"
            description="12 digits, from your UPI app's payment success screen."
            placeholder="e.g. 412356789012"
            value={utr}
            onChange={(v) => {
              setUtr(v.replace(/[^\d\s]/g, "").slice(0, 16));
              setError(null);
            }}
            onEnter={() => void submit()}
            status={
              utrCheck && !utrCheck.ok && utr.replace(/\s/g, "").length >= 12
                ? { type: "error", message: utrCheck.message }
                : utrCheck?.ok
                  ? { type: "success" }
                  : undefined
            }
          />

          <details className="mt-3 text-xs text-stone-600">
            <summary className="cursor-pointer font-semibold text-forest-900">Where do I find it?</summary>
            <ul className="mt-2 space-y-1 pl-4 [list-style:disc]">
              <li>
                <strong>Google Pay:</strong> open the payment → &quot;UPI transaction ID&quot;
              </li>
              <li>
                <strong>PhonePe:</strong> History → the payment → &quot;UTR&quot;
              </li>
              <li>
                <strong>Paytm:</strong> the payment → &quot;UPI Ref No.&quot;
              </li>
              <li>
                <strong>Bank app / BHIM:</strong> &quot;RRN&quot; or &quot;UPI Ref No.&quot; (12 digits)
              </li>
            </ul>
          </details>

          {mode === "pay" && !timeUp && amount !== null && instructions && (
            <label className="mt-4 flex items-start gap-2.5 text-sm text-ink-900">
              <input
                type="checkbox"
                checked={paidConfirmed}
                onChange={(e) => setPaidConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#0e5e8f]"
              />
              <span>
                I have paid <strong>{formatINR(amount)}</strong> to <span className="font-mono">{instructions.upiId}</span>.
              </span>
            </label>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-[#fdecec] px-3 py-2 text-sm text-[#9b1c1c]">
              {error}
            </p>
          )}

          <div className="mt-4">
            <Button
              variant="primary"
              size="lg"
              width="100%"
              label={submitting ? "Sending…" : "I've paid — send reference"}
              isLoading={submitting}
              onClick={() => void submit()}
            />
          </div>
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-stone-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
          Money goes straight to Sanchari&apos;s own UPI account. Your seats are confirmed once our team sees the
          payment — usually within a few hours. Never share your UPI PIN with anyone.
        </p>
        {mode === "pay" && <Badge variant="teal" label="No extra fees • Any UPI app" />}
      </div>
    </section>
  );
}

/** The pay panel inside the Astryx theme (for the trip page's booking box, which loads it lazily). */
export function UpiPayPanelThemed(props: React.ComponentProps<typeof UpiPayPanel>) {
  return (
    <AstryxShell>
      <UpiPayPanel {...props} />
    </AstryxShell>
  );
}

/** The "reference sent" notice inside the Astryx theme. */
export function UpiSubmittedNoticeThemed(props: React.ComponentProps<typeof UpiSubmittedNotice>) {
  return (
    <AstryxShell>
      <UpiSubmittedNotice {...props} />
    </AstryxShell>
  );
}

/** What the customer sees right after sending the reference. */
export function UpiSubmittedNotice({
  result,
  bookingReference,
  lookupHref,
}: {
  result: UpiSubmitResult;
  bookingReference: string;
  lookupHref: string;
}) {
  const noticeRef = useScrollIntoViewOnMount(true);
  return (
    <section ref={noticeRef} className="card-soft scroll-mt-28 overflow-hidden" aria-live="polite">
      <div className="bg-ocean px-5 py-6 text-white sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">Payment received for checking</p>
        <h2 className="mt-1 font-display text-3xl font-semibold">Booking {bookingReference}</h2>
        <p className="mt-1 text-sm text-white/85">{formatINR(result.amountPaise)} • reference sent</p>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        {result.seatsLost ? (
          <Banner
            status="warning"
            title="Your hold ran out and the seats were taken meanwhile"
            description={`We'll check your payment and refund ${formatINR(result.amountPaise)} to the same UPI account. We'll message you to offer another date.`}
          />
        ) : (
          <Banner
            status="success"
            title={result.lateAfterHold ? "Seats kept for you" : "Your seats are held"}
            description={
              result.lateAfterHold
                ? "Your hold had run out, but the seats were still free, so we've kept them while we check the payment."
                : "We hold your seats while our team checks the payment (usually within a few hours). You'll see 'Confirmed' in My Booking."
            }
            collapsible={false}
          />
        )}
        <a href={lookupHref} className="btn-ocean px-5 py-3 text-sm">
          Track this booking
        </a>
      </div>
    </section>
  );
}
