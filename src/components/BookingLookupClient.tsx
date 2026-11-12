"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { AlertCircle, CheckCircle2, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { UpiPayPanel } from "@/components/UpiPayPanel";
import { formatINR } from "@/lib/currency";
import type { CustomerPaymentView } from "@/lib/payments/customer-view";
import type { CustomerBookingView, CustomerPaymentSummary } from "@/lib/types";

const PAYMENT_STATUS: Record<
  CustomerPaymentSummary["status"],
  { label: string; variant: "info" | "success" | "warning" | "error" | "neutral" }
> = {
  created: { label: "Started", variant: "neutral" },
  authorized: { label: "Authorised", variant: "info" },
  submitted: { label: "Waiting for our check", variant: "info" },
  captured: { label: "Received", variant: "success" },
  rejected: { label: "Not found — please check", variant: "error" },
  failed: { label: "Failed", variant: "error" },
  refunded: { label: "Refunded", variant: "warning" },
};

const BOOKING_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Waiting for payment",
  deposit_paid: "Deposit paid",
  confirmed: "Confirmed",
  cancel_requested: "Cancellation requested",
  cancelled: "Cancelled",
  refunded: "Refunded",
  expired: "Hold expired",
};

export function BookingLookupClient({
  initialRef,
  initialEmail,
  initialToken,
}: {
  initialRef?: string;
  initialEmail?: string;
  initialToken?: string;
}) {
  const [bookingReference, setBookingReference] = useState(initialRef ?? "");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bookingView, setBookingView] = useState<CustomerBookingView | null>(null);
  const [payment, setPayment] = useState<CustomerPaymentView | null>(null);

  const [requestType, setRequestType] = useState<"reschedule" | "cancel">("reschedule");
  const [requestReason, setRequestReason] = useState("");
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  async function runLookup(ref: string, mail: string, token?: string) {
    setLoading(true);
    setErrorMsg(null);
    setRequestNotice(null);
    try {
      const res = await fetch("/api/bookings/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingReference: ref,
          email: mail,
          ...(token ? { token } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setBookingView(null);
        setErrorMsg(json.error || "Booking not found.");
        return;
      }
      setBookingView(json.bookingView as CustomerBookingView);
      setPayment((json.payment as CustomerPaymentView) ?? null);
    } catch {
      setErrorMsg("Unable to reach booking server. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialRef && initialEmail) {
      void runLookup(initialRef, initialEmail, initialToken);
    }
  }, [initialRef, initialEmail, initialToken]);

  async function handleSubmitLookup(e: React.FormEvent) {
    e.preventDefault();
    await runLookup(bookingReference, email);
  }

  async function handleRequestChange(e: React.FormEvent) {
    e.preventDefault();
    if (!bookingView) return;
    setLoading(true);
    setRequestNotice(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/bookings/lookup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingReference: bookingView.booking.bookingReference,
          email: bookingView.booking.customerEmail,
          requestType,
          reason: requestReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Could not submit request.");
        return;
      }
      setRequestNotice(json.message);
      setRequestReason("");
      await runLookup(bookingView.booking.bookingReference, bookingView.booking.customerEmail);
    } catch {
      setErrorMsg("Network error while submitting request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmitLookup}
        className="rounded-2xl border border-stone-200 bg-cream-50 p-5 sm:p-6 space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium">
            Booking Reference
            <input
              required
              type="text"
              placeholder="e.g. SAN-A1B2C3"
              value={bookingReference}
              onChange={(e) => setBookingReference(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm uppercase"
            />
          </label>
          <label className="block text-xs font-medium">
            Email Used at Checkout
            <input
              required
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm"
            />
          </label>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-forest-900 px-5 py-2.5 text-sm font-semibold text-cream-50 hover:bg-forest-800 disabled:opacity-60"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          {loading ? "Looking up..." : "Find My Booking"}
        </button>
      </form>

      {bookingView && (
        <div className="space-y-6 rounded-2xl border border-stone-200 bg-cream-50 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-copper-700">
                Receipt &amp; Status • {bookingView.booking.bookingReference}
              </p>
              <h2 className="font-display text-2xl font-semibold text-forest-900">
                {bookingView.trip.title}
              </h2>
              <p className="text-xs text-stone-600">
                {bookingView.departure.departureCode} • {bookingView.departure.startDate} to{" "}
                {bookingView.departure.endDate}
              </p>
            </div>
            <span className="rounded-full bg-forest-900 px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-cream-50">
              {BOOKING_STATUS_LABEL[bookingView.booking.status] ?? bookingView.booking.status.replace(/_/g, " ")}
            </span>
          </div>

          {payment && payment.payments.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-display text-lg font-semibold text-forest-900">Payments</h3>
              <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                {payment.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-ink-900">
                        {formatINR(p.amountPaise)}{" "}
                        <span className="font-normal text-stone-600">
                          • {p.paymentType === "deposit" ? "Deposit" : p.paymentType === "balance" ? "Balance" : "Full payment"}
                          {p.utrMasked ? ` • UPI ref ${p.utrMasked}` : ""}
                        </span>
                      </p>
                      {p.submittedAt && (
                        <p className="text-xs text-stone-600">
                          Sent {new Date(p.submittedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      )}
                      {p.customerNote && <p className="mt-1 text-xs text-[#9b1c1c]">Our note: {p.customerNote}</p>}
                      {p.seatsLost && p.status !== "refunded" && (
                        <p className="mt-1 text-xs text-copper-700">
                          Seats were taken before this payment arrived — it will be refunded after our check.
                        </p>
                      )}
                    </div>
                    <Badge variant={PAYMENT_STATUS[p.status].variant} label={PAYMENT_STATUS[p.status].label} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {payment?.waitingForCheck && (
            <p className="rounded-2xl bg-lagoon-100 px-4 py-3 text-sm text-forest-900">
              We have your UPI reference. Your seats are held while our team checks the payment — this page will
              show <strong>Received</strong> once it&apos;s done.
            </p>
          )}

          {payment && payment.mode !== "none" && (
            <UpiPayPanel
              mode={payment.mode}
              instructions={payment.upi}
              bookingReference={bookingView.booking.bookingReference}
              email={bookingView.booking.customerEmail}
              heading={
                bookingView.booking.status === "deposit_paid"
                  ? "Pay balance by UPI"
                  : payment.mode === "late_reference"
                    ? "Already paid?"
                    : "Complete payment by UPI"
              }
              onSubmitted={() =>
                void runLookup(bookingView.booking.bookingReference, bookingView.booking.customerEmail)
              }
            />
          )}

          <dl className="grid gap-4 sm:grid-cols-4 text-sm">
            <div>
              <dt className="text-xs text-stone-600">Seats Allocated</dt>
              <dd className="font-semibold text-ink-900">
                {bookingView.assignedSeatCount} ({bookingView.booking.bookingMode.replace("_", " ")})
              </dd>
            </div>
            <div>
              <dt className="text-xs text-stone-600">Total Snapshot</dt>
              <dd className="font-semibold text-ink-900">
                {formatINR(bookingView.booking.totalPaise)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-stone-600">Amount Paid</dt>
              <dd className="font-semibold text-forest-700">
                {formatINR(bookingView.booking.amountPaidPaise)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-stone-600">Balance Due</dt>
              <dd className="font-semibold text-ink-900">
                {formatINR(bookingView.booking.amountDuePaise)}
              </dd>
            </div>
          </dl>

          <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-forest-900">
              <ShieldCheck className="h-4 w-4 text-forest-700" aria-hidden="true" />
              Operational Comfort &amp; Pickup Summary
            </p>
            <p className="text-stone-600">
              <strong>Comfort Request Status:</strong> {bookingView.comfortSummaryLabel}
            </p>
            <p className="text-stone-600">
              <strong>Pickup Hub:</strong>{" "}
              {bookingView.pickupPoint
                ? `${bookingView.pickupPoint.name} (${bookingView.pickupPoint.pickupTimeLabel})`
                : "To be assigned"}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-lg font-semibold text-forest-900">
              Your Traveler Roster (Private to Your Booking)
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {bookingView.travelers.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-stone-200 bg-white p-3 text-xs space-y-1"
                >
                  <p className="font-semibold text-ink-900">{t.fullName}</p>
                  <p className="text-stone-600">
                    Room request: {t.roomPreference.replace(/_/g, " ")} • Row:{" "}
                    {t.seatRowRequest.replace(/_/g, " ")}
                  </p>
                  <p className="text-stone-600">
                    Verification status: {t.verificationChecked ? "Checked" : "Pending check"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleRequestChange}
            className="border-t border-stone-200 pt-5 space-y-3"
          >
            <h3 className="font-display text-lg font-semibold text-forest-900">
              Request Cancellation or Reschedule
            </h3>
            <p className="text-xs text-stone-600">
              Requests are logged against your booking’s policy snapshot and reviewed by an
              operator.
            </p>

            {requestNotice && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-lg bg-forest-900/10 p-3 text-xs font-medium text-forest-900"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>{requestNotice}</span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-medium">
                Request Type
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as "reschedule" | "cancel")}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="reschedule">Reschedule to another date</option>
                  <option value="cancel">Request cancellation / refund</option>
                </select>
              </label>
              <label className="block text-xs font-medium sm:col-span-2">
                Reason / Preferred Alternate Date
                <input
                  required
                  type="text"
                  minLength={5}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="Share brief reason or preferred next weekend..."
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded-full border border-forest-900 px-4 py-2 text-xs font-semibold text-forest-900 hover:bg-forest-900 hover:text-cream-50"
            >
              Submit Request to Operations
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

