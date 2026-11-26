"use client";

import "@/styles/astryx-components.css";
import { Badge } from "@astryxdesign/core/Badge";
import { AlertCircle, Car, CheckCircle2, MessageCircle, Pencil, Phone, Search, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ErtigaSeatMap } from "@/components/booking/ErtigaSeatMap";
import { TravellerDetailsForm } from "@/components/TravellerDetailsForm";
import { UpiPayPanel } from "@/components/UpiPayPanel";
import { WhatsAppChannelCta } from "@/components/WhatsAppChannelCta";
import { rupees, trackOnce } from "@/lib/analytics";
import { formatINR } from "@/lib/currency";
import { travelerIsComplete } from "@/lib/traveler-details";
import { formatTripDates, formatTripDay } from "@/lib/trip-dates";
import { visibleDepartureCode } from "@/lib/trip-facts";
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

const ROOM_LABEL: Record<string, string> = {
  shared_same_gender: "Shared same-gender room",
  private_room_request: "Private room, if available",
  couple_friends_room_request: "Room with partner or friends",
};

const BOOKING_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Waiting for payment",
  deposit_paid: "Advance paid",
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
  // Step 2 of booking: the traveller details form (open by itself until the details are complete).
  const [editingTravellers, setEditingTravellers] = useState(false);
  const [travellersSaved, setTravellersSaved] = useState(false);
  const travellersRef = useRef<HTMLDivElement | null>(null);
  const scrolledToTravellers = useRef(false);

  // Links from the booking box end in #travellers: bring step 2 into view once the booking has loaded.
  useEffect(() => {
    if (!bookingView || scrolledToTravellers.current || window.location.hash !== "#travellers") return;
    scrolledToTravellers.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => travellersRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
  }, [bookingView]);

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
        className="card-theme theme-brand space-y-4 p-5 pt-6 sm:p-6 sm:pt-7"
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
        <div className="card-theme theme-brand space-y-6 p-5 pt-6 sm:p-6 sm:pt-7">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-copper-700">
                Receipt &amp; Status • {bookingView.booking.bookingReference}
              </p>
              <h2 className="font-display text-2xl font-semibold text-forest-900">
                {bookingView.trip.title}
              </h2>
              <p className="text-sm text-stone-600">
                {formatTripDates(bookingView.departure.startDate, bookingView.departure.endDate, { weekday: true })}
                {visibleDepartureCode(bookingView.departure) && (
                  <span className="text-xs" data-no-translate>
                    {" "}
                    • {visibleDepartureCode(bookingView.departure)}
                  </span>
                )}
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
                          • {p.paymentType === "deposit" ? "Advance" : p.paymentType === "balance" ? "Balance" : "Full payment"}
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
              onSubmitted={(result) => {
                if (bookingView.booking.amountPaidPaise === 0) {
                  trackOnce(bookingView.booking.bookingReference, "purchase", {
                    transaction_id: bookingView.booking.bookingReference,
                    currency: "INR",
                    value: rupees(result.amountPaise),
                    booking_total: rupees(bookingView.booking.totalPaise),
                    payment_status: "payment_sent",
                  });
                }
                void runLookup(bookingView.booking.bookingReference, bookingView.booking.customerEmail);
              }}
            />
          )}

          <dl className="grid gap-4 sm:grid-cols-4 text-sm">
            <div>
              <dt className="text-xs text-stone-600">Your seats</dt>
              <dd className="font-semibold text-ink-900">
                {bookingView.seatNumbers && bookingView.seatNumbers.length > 0
                  ? `Seat ${bookingView.seatNumbers.join(", ")}`
                  : bookingView.assignedSeatCount}{" "}
                ({bookingView.booking.bookingMode === "private_vehicle" ? "private car" : "shared trip"})
              </dd>
            </div>
            <div>
              <dt className="text-xs text-stone-600">Total</dt>
              <dd className="font-semibold text-ink-900">
                {formatINR(bookingView.booking.totalPaise)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-stone-600">Paid</dt>
              <dd className="font-semibold text-forest-700">
                {formatINR(bookingView.booking.amountPaidPaise)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-stone-600">
                {bookingView.booking.status === "deposit_paid" && bookingView.booking.balanceDueAt
                  ? `Balance, by ${formatTripDay(bookingView.booking.balanceDueAt.slice(0, 10))}`
                  : "Still to pay"}
              </dt>
              <dd className="font-semibold text-ink-900">
                {formatINR(bookingView.booking.amountDuePaise)}
              </dd>
            </div>
          </dl>

          {bookingView.whatsappChannelUrl && ["deposit_paid", "confirmed"].includes(bookingView.booking.status) && (
            <WhatsAppChannelCta href={bookingView.whatsappChannelUrl} context="booking" />
          )}

          {bookingView.crew && (
            <div className="space-y-3 rounded-2xl border border-lagoon-500/40 bg-gradient-to-br from-white to-lagoon-100/60 p-4">
              <p className="flex items-center gap-2 font-display text-lg font-semibold text-forest-900">
                <Car className="h-5 w-5 text-copper-600" aria-hidden="true" /> Your trip crew
              </p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {bookingView.crew.vehicleNumber && (
                  <div>
                    <dt className="text-xs text-stone-600">Vehicle</dt>
                    <dd className="font-mono text-base font-bold tracking-wide text-ink-900">{bookingView.crew.vehicleNumber}</dd>
                  </div>
                )}
                {(bookingView.crew.driverName || bookingView.crew.driverPhone) && (
                  <div>
                    <dt className="text-xs text-stone-600">Driver</dt>
                    <dd className="font-semibold text-ink-900">
                      {bookingView.crew.driverName}
                      {bookingView.crew.driverPhone && (
                        <a href={`tel:+91${bookingView.crew.driverPhone}`} className="ml-2 inline-flex items-center gap-1 text-forest-800 underline">
                          <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {bookingView.crew.driverPhone}
                        </a>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              {bookingView.crew.reportingNote && (
                <p className="rounded-xl bg-white/80 px-3 py-2 text-sm text-ink-900">{bookingView.crew.reportingNote}</p>
              )}
              {bookingView.crew.whatsappGroupUrl && (
                <a
                  href={bookingView.crew.whatsappGroupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-95"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" /> Join the trip WhatsApp group
                </a>
              )}
            </div>
          )}

          {bookingView.seatNumbers &&
            bookingView.seatNumbers.length > 0 &&
            ["pending_payment", "deposit_paid", "confirmed", "cancel_requested"].includes(bookingView.booking.status) && (
              <details className="rounded-2xl border border-stone-200 bg-white p-4">
                <summary className="cursor-pointer text-sm font-semibold text-forest-900">
                  See where you sit (seat {bookingView.seatNumbers.join(", ")})
                </summary>
                <div className="mt-3">
                  <ErtigaSeatMap
                    mode="view"
                    takenSeats={[]}
                    selectedSeats={bookingView.seatNumbers}
                    maxCapacity={bookingView.departure.maxCapacity}
                    privateCar={bookingView.booking.bookingMode === "private_vehicle"}
                    showLegend={false}
                  />
                </div>
              </details>
            )}

          <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-forest-900">
              <ShieldCheck className="h-4 w-4 text-forest-700" aria-hidden="true" />
              Pick-up and requests
            </p>
            <p className="text-stone-600">
              <strong>Pick-up point:</strong>{" "}
              {bookingView.pickupPoint
                ? `${bookingView.pickupPoint.name} (${bookingView.pickupPoint.pickupTimeLabel})`
                : "Not chosen yet"}
            </p>
            <p className="text-stone-600">
              <strong>Co-traveller request:</strong> {bookingView.comfortSummaryLabel}
            </p>
          </div>

          {(() => {
            const open = ["pending_payment", "deposit_paid", "confirmed"].includes(bookingView.booking.status);
            const complete = Boolean(bookingView.travelerDetailsComplete);
            const lockedReason = bookingView.travelerDetailsLockedReason ?? null;
            const canEdit = open && !lockedReason;
            const showForm = canEdit && (!complete || editingTravellers);
            // The co-traveller request is asked only where it means something and is still unanswered.
            const comfort =
              bookingView.comfortEditable && bookingView.booking.bookingMode === "batch_seats" && bookingView.departure.departureType !== "women_only"
                ? { preference: bookingView.coTravelerPreference ?? "open_mixed" }
                : null;
            return (
              <div id="travellers" ref={travellersRef} className="scroll-mt-24 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-forest-900">
                    <UserRound className="h-5 w-5 text-copper-700" aria-hidden="true" /> Who is travelling
                  </h3>
                  {complete ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#dcf3e3] px-3 py-1 text-xs font-semibold text-[#12603e]">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Details complete
                    </span>
                  ) : (
                    open && <span className="rounded-full bg-[#fff0cc] px-3 py-1 text-xs font-semibold text-[#8a5200]">Step 2: details needed</span>
                  )}
                </div>

                {travellersSaved && complete && !showForm && (
                  <p role="status" className="rounded-2xl bg-[#dcf3e3] px-4 py-3 text-sm text-[#12603e]">
                    Saved. You are all set. We share the exact pick-up pin and time before the trip, and your driver and car details show here once
                    our team assigns them.
                  </p>
                )}

                {showForm ? (
                  <>
                    {!complete && (
                      <p className="text-sm leading-relaxed text-ink-900/80">
                        {bookingView.travelers.length === 1
                          ? "Your seat is reserved. Tell us who is travelling so we can plan rooms, food and the pick-up. Only our team sees this."
                          : "Your seats are reserved. Tell us who is travelling so we can plan rooms, food and the pick-up. Only our team sees this."}
                      </p>
                    )}
                    <TravellerDetailsForm
                      key={bookingView.travelers.map((t) => `${t.id}:${t.ageYears ?? ""}`).join("|")}
                      bookingReference={bookingView.booking.bookingReference}
                      email={bookingView.booking.customerEmail}
                      travelers={bookingView.travelers}
                      leadPhone={bookingView.booking.customerPhone}
                      pickupOptions={bookingView.pickupOptions ?? []}
                      pickupPointId={bookingView.booking.pickupPointId}
                      comfort={comfort}
                      onSaved={() => {
                        setEditingTravellers(false);
                        setTravellersSaved(true);
                        // The long form closes: keep "Saved" and the traveller list on screen.
                        void runLookup(bookingView.booking.bookingReference, bookingView.booking.customerEmail).then(() => {
                          window.requestAnimationFrame(() => travellersRef.current?.scrollIntoView({ behavior: "auto", block: "start" }));
                        });
                      }}
                      onCancel={complete ? () => setEditingTravellers(false) : undefined}
                    />
                  </>
                ) : (
                  <>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {bookingView.travelers.map((t, i) => (
                        <li key={t.id} className="space-y-1 rounded-xl border border-stone-200 bg-white p-3 text-xs">
                          <p className="text-sm font-semibold text-ink-900">
                            {travelerIsComplete(t) ? t.fullName : `Traveller ${i + 1}: details needed`}
                            {typeof t.ageYears === "number" && <span className="font-normal text-stone-600">, {t.ageYears}</span>}
                          </p>
                          {travelerIsComplete(t) && (
                            <>
                              <p className="text-stone-600">{ROOM_LABEL[t.roomPreference] ?? t.roomPreference.replace(/_/g, " ")}</p>
                              {t.dietaryNotes && <p className="text-stone-600">Needs: {t.dietaryNotes}</p>}
                              <p className="text-stone-600">ID check: {t.verificationChecked ? "Done" : "At pick-up"}</p>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                    {lockedReason && open && <p className="text-xs text-stone-600">{lockedReason}</p>}
                    {canEdit && complete && (
                      <button
                        type="button"
                        onClick={() => {
                          setTravellersSaved(false);
                          setEditingTravellers(true);
                        }}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-forest-900 px-4 text-xs font-semibold text-forest-900 hover:bg-forest-900 hover:text-cream-50"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Change traveller details
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })()}

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
                  placeholder="A short reason, or the date you would prefer"
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

