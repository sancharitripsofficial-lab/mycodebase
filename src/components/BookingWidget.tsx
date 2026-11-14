"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  Shield,
  Users,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { WOMEN_ONLY_CONFIRM_LABEL } from "@/lib/women-only";
import { AGE_RANGES } from "@/lib/age";
import { isBookable } from "@/lib/departure-rules";
import { ErtigaSeatMap, SEAT_INFO } from "@/components/booking/ErtigaSeatMap";
import { CarSeatPicker3D } from "@/components/three/CarSeatPicker3D";
// The UPI pay panel (and the Astryx styles it uses) loads only once a seat is held, so the
// trip page itself paints without that CSS. It starts downloading as soon as the visitor
// begins the booking form, so it is ready by the time the hold succeeds.
const loadUpiPanel = () => import("@/components/UpiPayPanel");
const UpiPayPanel = dynamic(() => loadUpiPanel().then((m) => m.UpiPayPanel), {
  loading: () => <p className="rounded-xl bg-white/70 p-4 text-sm text-stone-600">Loading payment details…</p>,
});
const UpiSubmittedNotice = dynamic(() => loadUpiPanel().then((m) => m.UpiSubmittedNotice));
import { calculateBookingPricing, formatINR } from "@/lib/currency";
import type {
  BookingMode,
  CoTravelerPreference,
  PickupPoint,
  PublicDepartureAvailability,
  RoomPreference,
  SeatRowRequest,
  SiteSettings,
  Trip,
  UpiPaymentInstructions,
  UpiSubmitResult,
} from "@/lib/types";

interface BookingWidgetProps {
  trip: Trip;
  departures: PublicDepartureAvailability[];
  pickupPoints: PickupPoint[];
  bookingPolicy: SiteSettings["bookingPolicy"];
  /** Taken seat numbers per departure, read while the page was built: the car map shows at once. */
  initialSeatMaps?: Record<string, number[]>;
}

interface TravelerFormRow {
  fullName: string;
  ageGroup: "adult" | "senior";
  /** Typed age (kept as text while typing; sent as a number). */
  ageYears: string;
  emergencyContact: string;
  dietaryNotes: string;
  seatRowRequest: SeatRowRequest;
  roomPreference: RoomPreference;
}

interface HoldResponse {
  bookingId: string;
  bookingReference: string;
  holdExpiresAt: string;
  amountDuePaise: number;
  seatNumbers?: number[];
  couponDiscountPaise?: number;
  freeConfirmed?: boolean;
  lookupToken: string;
  paymentMethod: "upi" | "razorpay" | "sandbox" | "free";
  upi: UpiPaymentInstructions | null;
  paymentOrder: {
    provider: "razorpay" | "sandbox";
    orderId: string;
    amountPaise: number;
    currency: "INR";
    keyId: string | null;
    sandboxSignature: string | null;
    isLiveGateway: boolean;
  } | null;
}

function emptyTraveler(): TravelerFormRow {
  return {
    fullName: "",
    ageGroup: "adult",
    ageYears: "",
    emergencyContact: "",
    dietaryNotes: "",
    seatRowRequest: "no_preference",
    roomPreference: "shared_same_gender",
  };
}

export function BookingWidget({
  trip,
  departures,
  pickupPoints,
  bookingPolicy,
  initialSeatMaps,
}: BookingWidgetProps) {
  const initialDep =
    departures.find((d) => isBookable(d) && d.status !== "sold_out") ??
    departures.find((d) => isBookable(d)) ??
    departures[0] ??
    null;

  const [departureId, setDepartureId] = useState<string>(initialDep?.departureId ?? "");

  // Departure cards link here with ?date=<departureId>#book — preselect that exact date.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("date");
    if (wanted && departures.some((d) => d.departureId === wanted)) setDepartureId(wanted);
  }, [departures]);
  const [bookingMode, setBookingMode] = useState<BookingMode>("batch_seats");
  const [seatsRequested, setSeatsRequested] = useState<number>(1);
  const [pickupPointId, setPickupPointId] = useState<string>(pickupPoints[0]?.id ?? "");
  const [payDepositOnly, setPayDepositOnly] = useState<boolean>(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [travelers, setTravelers] = useState<TravelerFormRow[]>([emptyTraveler()]);

  const [coTravelerPreference, setCoTravelerPreference] =
    useState<CoTravelerPreference>("open_mixed");
  const [preferenceNotes, setPreferenceNotes] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [acceptedTermsPrivacy, setAcceptedTermsPrivacy] = useState(false);
  const [acceptedComfortProcessing, setAcceptedComfortProcessing] = useState(false);
  /** Women-only batches: "every traveller in this booking is a woman" (the server checks it too). */
  const [womenOnlyConfirmed, setWomenOnlyConfirmed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Live seat map for the chosen date (numbers only) + the exact seats this customer tapped.
  // Seat maps already known (from the page, or fetched earlier this visit) show instantly; the
  // live map is then re-read quietly in the background, so switching dates never shows a spinner.
  const knownMapsRef = useRef<Record<string, number[]>>({ ...(initialSeatMaps ?? {}) });
  const [seatMap, setSeatMap] = useState<{ departureId: string; taken: number[] } | null>(() => {
    const id = initialDep?.departureId;
    const known = id ? initialSeatMaps?.[id] : undefined;
    return id && known ? { departureId: id, taken: known } : null;
  });
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [pickedSeats, setPickedSeats] = useState<number[]>([]);
  const [seatNote, setSeatNote] = useState<string | null>(null);
  const [seatMapVersion, setSeatMapVersion] = useState(0);
  // Coupon / creator code: priced by the server, checked again when the seats are held.
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; summary: string; couponDiscountPaise: number; key: string } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMsg, setCouponMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [holdResult, setHoldResult] = useState<HoldResponse | null>(null);
  const [upiResult, setUpiResult] = useState<UpiSubmitResult | null>(null);
  const [verifiedReceipt, setVerifiedReceipt] = useState<{
    bookingReference: string;
    bookingStatus: string;
    mode: string;
  } | null>(null);

  // Waitlist state for sold-out departures
  const [waitlistName, setWaitlistName] = useState("");
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistPhone, setWaitlistPhone] = useState("");
  const [waitlistSeats, setWaitlistSeats] = useState(1);
  const [waitlistWhatsapp, setWaitlistWhatsapp] = useState(false);
  const [waitlistConsent, setWaitlistConsent] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState<string | null>(null);

  const selectedDep = useMemo(
    () => departures.find((d) => d.departureId === departureId) ?? null,
    [departures, departureId]
  );

  const effectiveSeats = bookingMode === "private_vehicle" ? 6 : seatsRequested;
  // The live map (fetched with no cache) wins over the page's 30-second-old counts.
  const liveTaken =
    selectedDep && seatMap?.departureId === selectedDep.departureId ? seatMap.taken : null;
  const seatsTakenNow = liveTaken ? liveTaken.length : selectedDep?.seatsTaken ?? 0;
  const seatsRemainingNow = selectedDep
    ? liveTaken
      ? Math.max(0, selectedDep.maxCapacity - liveTaken.length)
      : selectedDep.seatsRemaining
    : 0;
  const maxBatchSelectable = selectedDep ? Math.min(5, Math.max(1, seatsRemainingNow)) : 1;
  const privateEligible = selectedDep
    ? seatsTakenNow === 0 && selectedDep.maxCapacity === 6 && selectedDep.status !== "cancelled"
    : false;

  // The chat guide's "Book whole car" links add &mode=private: open the whole-car form once,
  // after the ?date preselect, and only if that date can still be booked as a whole car.
  const wantPrivate = useRef<boolean | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (wantPrivate.current === null) wantPrivate.current = params.get("mode") === "private";
    if (!wantPrivate.current || !privateEligible) return;
    const wanted = params.get("date");
    if (wanted && departures.some((d) => d.departureId === wanted) && wanted !== departureId) return;
    wantPrivate.current = false;
    handleModeChange("private_vehicle");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the date / eligibility settles
  }, [privateEligible, departureId, departures]);

  // Load the live seat map whenever the date changes (and again after a seat clash).
  useEffect(() => {
    if (!departureId) return;
    let cancelled = false;
    const known = knownMapsRef.current[departureId];
    if (known) setSeatMap((cur) => (cur?.departureId === departureId ? cur : { departureId, taken: known }));
    else setSeatsLoading(true);
    fetch(`/api/departures/${departureId}/seats`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { taken?: number[] } | null) => {
        if (cancelled || !json || !Array.isArray(json.taken)) return;
        const taken = json.taken;
        knownMapsRef.current[departureId] = taken;
        setSeatMap((cur) =>
          cur?.departureId === departureId && cur.taken.join() === taken.join() ? cur : { departureId, taken }
        );
        setPickedSeats((cur) => {
          const gone = cur.filter((s) => taken.includes(s));
          if (gone.length === 0) return cur;
          setSeatNote(
            `Seat ${gone.join(", ")} ${gone.length === 1 ? "was" : "were"} just taken by someone else. Please pick again.`
          );
          return cur.filter((s) => !taken.includes(s));
        });
      })
      .catch(() => {
        /* the map is a nicety: without it we still seat people together automatically */
      })
      .finally(() => {
        if (!cancelled) setSeatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [departureId, seatMapVersion]);

  // Picked seats always decide how many travellers there are.
  useEffect(() => {
    if (bookingMode !== "batch_seats" || pickedSeats.length === 0) return;
    if (pickedSeats.length !== seatsRequested) {
      setSeatsRequested(pickedSeats.length);
      syncTravelerRows(pickedSeats.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedSeats, bookingMode]);

  const toggleSeat = (seat: number) => {
    if (bookingMode !== "batch_seats") return;
    setSeatNote(null);
    setErrorMsg(null);
    if (!pickedSeats.includes(seat) && pickedSeats.length >= maxBatchSelectable) {
      setSeatNote(
        maxBatchSelectable === 5
          ? "A shared trip takes up to 5 seats. For all 6, choose the private car."
          : `Only ${maxBatchSelectable} seat${maxBatchSelectable === 1 ? " is" : "s are"} open on this date.`
      );
    }
    // Functional update so two quick taps never overwrite each other.
    setPickedSeats((cur) => {
      if (cur.includes(seat)) return cur.filter((s) => s !== seat);
      if (cur.length >= maxBatchSelectable) return cur;
      return [...cur, seat];
    });
  };

  const syncTravelerRows = (nextCount: number) => {
    setTravelers((prev) => {
      if (prev.length === nextCount) return prev;
      if (prev.length > nextCount) return prev.slice(0, nextCount);
      return [...prev, ...Array.from({ length: nextCount - prev.length }, () => emptyTraveler())];
    });
  };

  const handleSeatCountChange = (count: number) => {
    setSeatsRequested(count);
    syncTravelerRows(count);
    // Keep any tapped seats in step with the new number: drop the last ones, or add the
    // nearest free seats so the group still sits together.
    if (pickedSeats.length === 0) return;
    if (count < pickedSeats.length) {
      setPickedSeats(pickedSeats.slice(0, count));
      return;
    }
    const used = new Set([...(liveTaken ?? []), ...pickedSeats]);
    const extra: number[] = [];
    for (let s = 1; s <= (selectedDep?.maxCapacity ?? 6) && pickedSeats.length + extra.length < count; s++) {
      if (!used.has(s)) extra.push(s);
    }
    setPickedSeats([...pickedSeats, ...extra]);
  };

  const handleModeChange = (mode: BookingMode) => {
    setBookingMode(mode);
    setPickedSeats([]);
    setSeatNote(null);
    if (mode === "private_vehicle") {
      setSeatsRequested(6);
      syncTravelerRows(6);
    } else {
      const clamped = Math.min(seatsRequested, maxBatchSelectable);
      setSeatsRequested(clamped);
      syncTravelerRows(clamped);
    }
  };

  const pricing = useMemo(() => {
    if (!selectedDep) return null;
    try {
      return calculateBookingPricing({
        trip,
        priceOverridePaise: selectedDep.priceOverridePaise,
        bookingMode,
        seatsRequested: effectiveSeats,
        payDepositOnly,
        bookingPolicy,
        couponDiscountPaise: coupon?.couponDiscountPaise ?? 0,
      });
    } catch {
      return null;
    }
  }, [selectedDep, trip, bookingMode, effectiveSeats, payDepositOnly, bookingPolicy, coupon]);

  // Anything that changes the price or who is booking → the coupon must be priced again.
  const couponKey = `${departureId}|${bookingMode}|${effectiveSeats}|${payDepositOnly}|${customerEmail.trim().toLowerCase()}|${customerPhone.replace(/\D/g, "").slice(-10)}`;

  async function applyCoupon(code: string, silent = false) {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    if (!customerEmail.trim() || customerPhone.replace(/\D/g, "").length < 10) {
      setCouponMsg({ kind: "error", text: "Enter your email and phone above first — creator codes are tied to them." });
      return;
    }
    setCouponBusy(true);
    if (!silent) setCouponMsg(null);
    try {
      const res = await fetch("/api/coupons/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: clean,
          departureId,
          bookingMode,
          seatsRequested: effectiveSeats,
          payDepositOnly,
          email: customerEmail,
          phone: customerPhone,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCoupon(null);
        setCouponMsg({ kind: "error", text: json.error || "That coupon could not be applied." });
        return;
      }
      setCoupon({ code: json.code, summary: json.summary, couponDiscountPaise: json.couponDiscountPaise, key: couponKey });
      setCouponMsg({
        kind: "ok",
        text:
          json.totalPaise === 0
            ? `${json.code}: ${json.summary} — this booking is free. Your seats are confirmed as soon as you continue.`
            : `${json.code}: ${json.summary} — you save ${formatINR(json.couponDiscountPaise)}.`,
      });
    } catch {
      setCouponMsg({ kind: "error", text: "Network problem — try the code again." });
    } finally {
      setCouponBusy(false);
    }
  }

  useEffect(() => {
    if (coupon && coupon.key !== couponKey) {
      const t = window.setTimeout(() => void applyCoupon(coupon.code, true), 450);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponKey]);

  const depositPercentAvailable =
    trip.depositPercent ??
    (bookingPolicy.allowDepositCheckout ? bookingPolicy.depositPercent : null);

  async function handleHoldSubmit(e: React.FormEvent) {
    void loadUpiPanel(); // fetch the pay panel while the hold request runs
    e.preventDefault();
    if (!selectedDep) return;
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/bookings/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departureId: selectedDep.departureId,
          bookingMode,
          seatsRequested: effectiveSeats,
          preferredSeats:
            bookingMode === "batch_seats" && pickedSeats.length === effectiveSeats
              ? pickedSeats
              : undefined,
          couponCode: coupon && coupon.key === couponKey ? coupon.code : undefined,
          pickupPointId: pickupPointId || null,
          customerName,
          customerEmail,
          customerPhone,
          payDepositOnly,
          travelers: travelers.map(({ ageYears, ...t }) => ({
            ...t,
            ageYears: ageYears.trim() ? Number(ageYears) : undefined,
          })),
          coTravelerPreference,
          preferenceNotes,
          whatsappOptIn,
          womenOnlyConfirmed: selectedDep.departureType === "women_only" && womenOnlyConfirmed,
          acceptedTermsPrivacy,
          acceptedComfortProcessing,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Unable to reserve seats. Please check your details.");
        if (json.code === "SEAT_TAKEN") setSeatMapVersion((v) => v + 1);
        if (/coupon/i.test(String(json.error ?? ""))) {
          setCoupon(null);
          setCouponMsg({ kind: "error", text: String(json.error) });
        }
        return;
      }
      setHoldResult(json as HoldResponse);
    } catch {
      setErrorMsg("Network error while creating temporary seat hold. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLaunchRazorpay() {
    if (!holdResult || !holdResult.paymentOrder?.keyId) {
      setErrorMsg("Razorpay key is not configured.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
      );
      if (!existingScript) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Razorpay checkout script."));
          document.body.appendChild(script);
        });
      }

      type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void };
      const Razorpay = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
      if (!Razorpay) {
        throw new Error("Razorpay checkout library unavailable.");
      }

      const rzp = new Razorpay({
        key: holdResult.paymentOrder.keyId,
        amount: holdResult.paymentOrder.amountPaise,
        currency: holdResult.paymentOrder.currency,
        name: "Sanchari • Micro Trips",
        description: `${trip.title} (${holdResult.bookingReference})`,
        order_id: holdResult.paymentOrder.orderId,
        prefill: {
          name: customerName,
          email: customerEmail,
          contact: customerPhone,
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          const res = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId: holdResult.bookingId,
              provider: "razorpay",
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          });
          const json = await res.json();
          if (!res.ok) {
            setErrorMsg(
              json.error ||
                "Payment verification pending. Check My Booking rather than paying again."
            );
            setSubmitting(false);
            return;
          }
          setVerifiedReceipt({
            bookingReference: json.bookingReference,
            bookingStatus: json.bookingStatus,
            mode: json.mode,
          });
          setSubmitting(false);
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
          },
        },
      });
      rzp.open();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Could not open Razorpay Checkout. Please retry."
      );
      setSubmitting(false);
    }
  }

  async function handleVerifySandboxPayment() {
    if (!holdResult) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: holdResult.bookingId,
          provider: "sandbox",
          orderId: holdResult.paymentOrder?.orderId,
          sandboxOrderSignature: holdResult.paymentOrder?.sandboxSignature,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Verification failed.");
        return;
      }
      setVerifiedReceipt({
        bookingReference: json.bookingReference,
        bookingStatus: json.bookingStatus,
        mode: json.mode,
      });
    } catch {
      setErrorMsg("Unable to verify payment status. Check your booking lookup before retrying.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWaitlistSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDep) return;
    setErrorMsg(null);
    setWaitlistSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departureId: selectedDep.departureId,
          fullName: waitlistName,
          email: waitlistEmail,
          phone: waitlistPhone,
          seatsNeeded: waitlistSeats,
          whatsappOptIn: waitlistWhatsapp,
          acceptedWaitlistConsent: waitlistConsent,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Could not join waitlist.");
        return;
      }
      setWaitlistSuccess(json.message);
    } catch {
      setErrorMsg("Network error while submitting waitlist request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (departures.length === 0) {
    return (
      <div className="card-theme p-6 pt-7">
        <h2 className="font-display text-xl font-semibold text-forest-900">
          Upcoming Departures
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          No active dates are currently scheduled for this route. Check back soon or contact
          operations for a private 6-seat date request.
        </p>
      </div>
    );
  }

  if (holdResult && holdResult.freeConfirmed) {
    const lookupHref = `/booking-lookup?ref=${encodeURIComponent(holdResult.bookingReference)}&email=${encodeURIComponent(
      customerEmail
    )}&token=${encodeURIComponent(holdResult.lookupToken)}`;
    return (
      <div role="status" className="space-y-4 rounded-2xl border border-lagoon-500/40 bg-gradient-to-br from-white to-lagoon-100/60 p-5">
        <p className="font-display text-2xl font-semibold text-forest-900">You&apos;re booked — free with your code 🎉</p>
        <p className="text-sm text-ink-900">
          Booking <strong className="font-mono">{holdResult.bookingReference}</strong> is confirmed
          {holdResult.seatNumbers && holdResult.seatNumbers.length > 0 ? ` (seat ${holdResult.seatNumbers.join(", ")})` : ""}. Nothing to pay.
        </p>
        {holdResult.seatNumbers && holdResult.seatNumbers.length > 0 && (
          <ErtigaSeatMap mode="view" takenSeats={[]} selectedSeats={holdResult.seatNumbers} maxCapacity={selectedDep?.maxCapacity ?? 6} showLegend={false} />
        )}
        <Link href={lookupHref} className="btn-sunset inline-flex items-center gap-2 px-5 py-3 text-sm">
          Open My Booking
        </Link>
      </div>
    );
  }

  if (holdResult && holdResult.paymentMethod === "upi") {
    const lookupHref = `/booking-lookup?ref=${encodeURIComponent(
      holdResult.bookingReference
    )}&email=${encodeURIComponent(customerEmail)}&token=${encodeURIComponent(holdResult.lookupToken)}`;

    if (upiResult) {
      return (
        <UpiSubmittedNotice
          result={upiResult}
          bookingReference={holdResult.bookingReference}
          lookupHref={lookupHref}
        />
      );
    }

    const heldSeats = holdResult.seatNumbers ?? [];
    return (
      <div className="space-y-3">
        {heldSeats.length > 0 && bookingMode === "batch_seats" && (
          <div className="rounded-2xl border border-lagoon-500/30 bg-white/80 p-3">
            <p className="mb-2 text-xs font-semibold text-forest-900">
              Held for you: seat {heldSeats.join(", ")} until the timer ends
            </p>
            <ErtigaSeatMap
              mode="view"
              takenSeats={(liveTaken ?? []).filter((s) => !heldSeats.includes(s))}
              selectedSeats={heldSeats}
              maxCapacity={selectedDep?.maxCapacity ?? 6}
              showLegend={false}
            />
          </div>
        )}
        <UpiPayPanel
          mode="pay"
          instructions={holdResult.upi}
          bookingReference={holdResult.bookingReference}
          email={customerEmail}
          heading={
            holdResult.amountDuePaise < (pricing?.totalPaise ?? holdResult.amountDuePaise)
              ? "Pay deposit by UPI"
              : "Pay by UPI"
          }
          onSubmitted={setUpiResult}
          scrollOnMount
        />
        <p className="px-1 text-xs text-stone-600">
          Paying later? Your booking reference is <strong>{holdResult.bookingReference}</strong>. Seats free up
          automatically if no payment reference arrives before the timer ends.{" "}
          <Link href={lookupHref} className="font-semibold text-forest-900 underline">
            Open My Booking
          </Link>
        </p>
      </div>
    );
  }

  if (verifiedReceipt && holdResult) {
    const lookupUrl = `/booking-lookup?ref=${encodeURIComponent(
      verifiedReceipt.bookingReference
    )}&email=${encodeURIComponent(customerEmail)}&token=${encodeURIComponent(
      holdResult.lookupToken
    )}`;

    return (
      <div className="card-theme space-y-4 p-6 pt-7">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-forest-700" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-forest-700">
              {verifiedReceipt.mode === "sandbox"
                ? "Sandbox Verification Recorded"
                : "Payment Verified"}
            </p>
            <h2 className="font-display text-2xl font-semibold text-forest-900">
              Booking {verifiedReceipt.bookingReference}
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Status: <strong className="text-ink-900">{verifiedReceipt.bookingStatus}</strong> •{" "}
              {effectiveSeats} {effectiveSeats === 1 ? "seat" : "seats"} allocated on{" "}
              {selectedDep?.departureCode}.
            </p>
          </div>
        </div>

        {verifiedReceipt.mode === "sandbox" && (
          <div className="rounded-lg border border-saffron-500/40 bg-saffron-500/10 p-3 text-xs text-ink-900">
            <strong>Sandbox Notice:</strong> Live Razorpay keys are not configured yet, so this
            confirmation used the server-verified sandbox flow for testing only. No real money was
            charged.
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href={lookupUrl}
            className="rounded-full bg-forest-900 px-5 py-2.5 text-sm font-semibold text-cream-50 hover:bg-forest-800"
          >
            View Receipt &amp; Manage Booking
          </Link>
          <button
            type="button"
            onClick={() => {
              setVerifiedReceipt(null);
              setHoldResult(null);
            }}
            className="rounded-full border border-stone-300 px-4 py-2.5 text-sm font-medium text-forest-900 hover:bg-stone-200/60"
          >
            Book Another Departure
          </button>
        </div>
      </div>
    );
  }

  if (holdResult) {
    return (
      <div className="card-theme space-y-5 p-6 pt-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-copper-700">
              Temporary Seat Hold Active
            </p>
            <h2 className="font-display text-2xl font-semibold text-forest-900">
              Ref: {holdResult.bookingReference}
            </h2>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-3 py-1 text-xs font-medium text-forest-900">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Held until {new Date(holdResult.holdExpiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-stone-600">Amount Due Now</span>
            <span className="font-bold text-forest-900">
              {formatINR(holdResult.amountDuePaise)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-600">Gateway Mode</span>
            <span className="font-medium text-ink-900">
              {holdResult.paymentOrder?.isLiveGateway
                ? "Razorpay (Server-Verified)"
                : "Sandbox (Owner Gateway Setup Pending)"}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        {holdResult.paymentOrder?.isLiveGateway ? (
          <div className="space-y-3">
            <p className="text-xs text-stone-600">
              Your seats are temporarily held. Final confirmation is recorded only after Razorpay
              server signature / webhook verification.
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={handleLaunchRazorpay}
              className="w-full rounded-full bg-copper-600 px-5 py-3 text-sm font-semibold text-cream-50 hover:bg-copper-700 disabled:opacity-60"
            >
              {submitting
                ? "Opening Razorpay..."
                : `Proceed to Razorpay (${formatINR(holdResult.amountDuePaise)})`}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-saffron-500/40 bg-saffron-500/10 p-3 text-xs leading-relaxed text-ink-900">
              <strong>Owner Gateway Pending:</strong> Razorpay credentials are not configured in
              `.env.local`. You can complete a server-verified Sandbox confirmation below to test
              atomic seat allocation and receipts safely without real payment.
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={handleVerifySandboxPayment}
              className="w-full rounded-full bg-forest-900 px-5 py-3 text-sm font-semibold text-cream-50 hover:bg-forest-800 disabled:opacity-60"
            >
              {submitting
                ? "Verifying on server..."
                : `Complete Sandbox Verification (${formatINR(holdResult.amountDuePaise)})`}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setHoldResult(null)}
          className="text-xs font-medium text-stone-600 underline hover:text-ink-900"
        >
          Back to booking form
        </button>
      </div>
    );
  }

  return (
    <div className="card-theme space-y-6 p-5 pt-6 sm:p-6 sm:pt-7">
      <div>
        <h2 className="font-display text-2xl font-semibold text-forest-900">
          Select Departure &amp; Seats
        </h2>
        <p className="mt-1 text-xs text-stone-600">
          Every vehicle carries a strict maximum of 6 travelers.
        </p>
      </div>

      {/* Departure Picker */}
      <fieldset className="space-y-2.5">
        <legend className="text-xs font-semibold uppercase tracking-wider text-stone-600">
          1. Choose a Scheduled Date
        </legend>
        <div className="grid gap-2.5">
          {departures.map((dep) => {
            const active = dep.departureId === departureId;
            const closed = !isBookable(dep);
            return (
              <label
                key={dep.departureId}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 transition ${
                  active
                    ? "border-forest-900 bg-white ring-1 ring-forest-900"
                    : "border-stone-200 bg-white/70 hover:border-stone-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="departureId"
                    value={dep.departureId}
                    checked={active}
                    disabled={closed}
                    onChange={() => {
                      setDepartureId(dep.departureId);
                      setErrorMsg(null);
                      setWaitlistSuccess(null);
                      setPickedSeats([]);
                      setSeatNote(null);
                      if (dep.seatsTaken > 0 && bookingMode === "private_vehicle") {
                        setBookingMode("batch_seats");
                        setSeatsRequested(1);
                        syncTravelerRows(1);
                      } else if (dep.seatsRemaining > 0 && seatsRequested > dep.seatsRemaining) {
                        const clamped = Math.min(5, dep.seatsRemaining);
                        setSeatsRequested(clamped);
                        syncTravelerRows(clamped);
                      }
                    }}
                    className="mt-1 h-4 w-4 accent-forest-900"
                  />
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">
                      <Calendar className="h-3.5 w-3.5 text-forest-700" aria-hidden="true" />
                      {dep.startDate} → {dep.endDate}
                      {dep.departureType === "women_only" && (
                        <span className="rounded-full bg-copper-600/15 px-2 py-0.5 text-[11px] font-semibold text-copper-700">
                          Women-Only Departure
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-stone-600">
                      Code: {dep.departureCode} • Min batch {dep.minOccupancy} •{" "}
                      {closed
                        ? dep.status === "cancelled"
                          ? "Cancelled"
                          : "Booking closed"
                        : dep.seatsRemaining === 0
                          ? "Sold out (waitlist open)"
                          : `${dep.seatsRemaining} of ${dep.maxCapacity} seats open`}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-forest-900">
                  {formatINR(dep.priceOverridePaise ?? trip.basePricePaise)}
                </span>
              </label>
            );
          })}
        </div>
        <a href="#ask" className="inline-block pt-0.5 text-xs font-semibold text-forest-800 underline-offset-2 hover:underline">
          None of these dates work? Ask for your own date or a private car →
        </a>
      </fieldset>

      {selectedDep && (
        <section aria-labelledby="seat-map-title" className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p id="seat-map-title" className="text-xs font-semibold uppercase tracking-wider text-stone-600">
              {bookingMode === "private_vehicle"
                ? "Your private car"
                : seatsRemainingNow === 0
                  ? "This car is full"
                  : "Tap the seats you want"}
            </p>
            <p className="text-[11px] text-stone-500">
              {selectedDep.departureCode} &bull; Driver sits on the right
            </p>
          </div>
          <CarSeatPicker3D
            mode={bookingMode === "batch_seats" && seatsRemainingNow > 0 ? "pick" : "view"}
            takenSeats={liveTaken ?? []}
            selectedSeats={bookingMode === "batch_seats" ? pickedSeats : []}
            maxCapacity={selectedDep.maxCapacity}
            privateCar={bookingMode === "private_vehicle"}
            loading={seatsLoading && !liveTaken}
            onToggleSeat={toggleSeat}
          />
          {seatNote && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-sunset-400/15 px-3 py-2 text-xs font-medium text-copper-700">
              <span>{seatNote}</span>
              {/* Tried to take all six on a shared trip: offer the whole car in one tap. */}
              {bookingMode === "batch_seats" && privateEligible && pickedSeats.length >= maxBatchSelectable && maxBatchSelectable === 5 && (
                <button
                  type="button"
                  onClick={() => handleModeChange("private_vehicle")}
                  className="rounded-full bg-copper-600 px-3 py-1 text-[11px] font-bold text-white"
                >
                  Book the whole car instead
                </button>
              )}
            </div>
          )}
          {bookingMode === "batch_seats" && seatsRemainingNow > 0 && (
            <div className="space-y-1 text-xs text-stone-600">
              {pickedSeats.length > 0 ? (
                <>
                  <p>
                    <span className="font-semibold text-ink-900">Your seats: </span>
                    {pickedSeats
                      .slice()
                      .sort((a, b) => a - b)
                      .map((s) => `${s} (${SEAT_INFO[s]?.label ?? "seat"})`)
                      .join(", ")}
                  </p>
                  {selectedDep && (
                    <p className="font-semibold text-forest-900">
                      {pickedSeats.length} {pickedSeats.length === 1 ? "seat" : "seats"} ×{" "}
                      {formatINR(selectedDep.priceOverridePaise ?? trip.basePricePaise)} ={" "}
                      {formatINR((selectedDep.priceOverridePaise ?? trip.basePricePaise) * pickedSeats.length)}
                      <span className="font-normal text-stone-600"> before any coupon</span>
                    </p>
                  )}
                  <p>Seats are locked for you only when you continue to payment.</p>
                </>
              ) : (
                <p>Skip this and we seat your group together automatically.</p>
              )}
            </div>
          )}
        </section>
      )}

      {selectedDep && seatsRemainingNow === 0 ? (
        <form onSubmit={handleWaitlistSubmit} className="space-y-4 border-t border-stone-200 pt-5">
          <div>
            <h3 className="font-display text-lg font-semibold text-forest-900">
              Departure Full — Join Consented Waitlist
            </h3>
            <p className="mt-1 text-xs text-stone-600">
              Joining the waitlist does not reserve a seat or charge your card. We will reach out
              only if a seat opens or a new departure is scheduled.
            </p>
          </div>

          {errorMsg && (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-900">
              {errorMsg}
            </div>
          )}
          {waitlistSuccess && (
            <div role="status" className="rounded-lg bg-forest-900/10 p-3 text-xs font-medium text-forest-900">
              {waitlistSuccess}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium">
              Full Name
              <input
                required
                type="text"
                value={waitlistName}
                onChange={(e) => setWaitlistName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium">
              Email
              <input
                required
                type="email"
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium">
              Phone
              <input
                required
                type="tel"
                value={waitlistPhone}
                onChange={(e) => setWaitlistPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium">
              Seats Needed (1–6)
              <select
                value={waitlistSeats}
                onChange={(e) => setWaitlistSeats(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "seat" : "seats"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-start gap-2 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={waitlistWhatsapp}
              onChange={(e) => setWaitlistWhatsapp(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-forest-900"
            />
            Optional: Notify me via WhatsApp if a seat opens.
          </label>

          <label className="flex items-start gap-2 text-xs text-ink-900">
            <input
              required
              type="checkbox"
              checked={waitlistConsent}
              onChange={(e) => setWaitlistConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-forest-900"
            />
            I consent to Sanchari contacting me regarding availability on this departure.
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-forest-900 px-5 py-3 text-sm font-semibold text-cream-50 hover:bg-forest-800 disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Join Waitlist (No Charge)"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={handleHoldSubmit}
          onFocusCapture={() => void loadUpiPanel()}
          onPointerDownCapture={() => void loadUpiPanel()}
          className="space-y-6 border-t border-stone-200 pt-5"
        >
          {/* Mode & Seat Count */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">
              2. Booking Mode &amp; Travelers
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleModeChange("batch_seats")}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                  bookingMode === "batch_seats"
                    ? "border-forest-900 bg-white ring-1 ring-forest-900"
                    : "border-stone-200 bg-white/60"
                }`}
              >
                <Users className="mt-0.5 h-4 w-4 text-forest-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">Join Small Batch</p>
                  <p className="text-xs text-stone-600">1–5 seats with fellow travelers</p>
                </div>
              </button>

              <button
                type="button"
                disabled={!privateEligible}
                onClick={() => handleModeChange("private_vehicle")}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                  bookingMode === "private_vehicle"
                    ? "border-forest-900 bg-white ring-1 ring-forest-900"
                    : "border-stone-200 bg-white/60"
                } disabled:cursor-not-allowed disabled:opacity-55`}
              >
                <Lock className="mt-0.5 h-4 w-4 text-copper-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">Private 6-Seat Vehicle</p>
                  <p className="text-xs text-stone-600">
                    {privateEligible
                      ? "Reserve entire vehicle for your group"
                      : "Requires all 6 seats to be free"}
                  </p>
                </div>
              </button>
            </div>

            {bookingMode === "batch_seats" && (
              <label className="block text-xs font-medium text-ink-900">
                Number of Seats (Max {maxBatchSelectable} available for batch)
                <select
                  value={seatsRequested}
                  onChange={(e) => handleSeatCountChange(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  {Array.from({ length: maxBatchSelectable }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "Traveler" : "Travelers"}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Pickup & Lead Contact */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">
              3. Bengaluru Pickup &amp; Contact
            </p>
            <label className="block text-xs font-medium">
              Preferred Pickup Hub
              <select
                value={pickupPointId}
                onChange={(e) => setPickupPointId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                {pickupPoints.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.pickupTimeLabel} ({p.isConfirmed ? "Confirmed" : "Draft"})
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-medium">
                Lead Contact Name
                <input
                  required
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium">
                Email (for receipt &amp; lookup)
                <input
                  required
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium">
                Phone / WhatsApp Number
                <input
                  required
                  type="tel"
                  placeholder="+91 98XXXXXXXX"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          {/* Per-Traveler Details */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">
              4. Traveler Roster ({travelers.length})
            </p>
            <div className="space-y-3">
              {travelers.map((t, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-stone-200 bg-white p-3.5 space-y-3"
                >
                  <p className="text-xs font-semibold text-forest-900">
                    Traveler {index + 1}
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <label className="block text-xs font-medium">
                      Full Name
                      <input
                        required
                        type="text"
                        value={t.fullName}
                        onChange={(e) => {
                          const next = [...travelers];
                          next[index] = { ...t, fullName: e.target.value };
                          setTravelers(next);
                        }}
                        className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block text-xs font-medium">
                      Age Group
                      <select
                        value={t.ageGroup}
                        onChange={(e) => {
                          const next = [...travelers];
                          next[index] = { ...t, ageGroup: e.target.value as "adult" | "senior" };
                          setTravelers(next);
                        }}
                        className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm"
                      >
                        <option value="adult">Adult (18–59)</option>
                        <option value="senior">Senior (60+)</option>
                      </select>
                    </label>
                    {/* Exact age, inside the chosen group: 18–59 for adults, 60+ for seniors. */}
                    <label className="block text-xs font-medium">
                      Age (years)
                      <input
                        required
                        type="number"
                        inputMode="numeric"
                        min={AGE_RANGES[t.ageGroup].min}
                        max={AGE_RANGES[t.ageGroup].max}
                        step={1}
                        placeholder={t.ageGroup === "adult" ? "18 to 59" : "60 or above"}
                        value={t.ageYears}
                        onChange={(e) => {
                          const next = [...travelers];
                          next[index] = { ...t, ageYears: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) };
                          setTravelers(next);
                        }}
                        className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm"
                      />
                      <span className="mt-1 block text-[11px] font-normal text-stone-600">
                        {t.ageGroup === "adult" ? "Adults: any age from 18 to 59." : "Seniors: 60 or above."}
                      </span>
                    </label>
                    <label className="block text-xs font-medium">
                      Emergency Contact Phone
                      <input
                        required
                        type="tel"
                        value={t.emergencyContact}
                        onChange={(e) => {
                          const next = [...travelers];
                          next[index] = { ...t, emergencyContact: e.target.value };
                          setTravelers(next);
                        }}
                        className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm"
                      />
                    </label>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <label className="block text-xs font-medium">
                      Room Request (subject to confirmation)
                      <select
                        value={t.roomPreference}
                        onChange={(e) => {
                          const next = [...travelers];
                          next[index] = {
                            ...t,
                            roomPreference: e.target.value as RoomPreference,
                          };
                          setTravelers(next);
                        }}
                        className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
                      >
                        <option value="shared_same_gender">Shared same-gender room (default)</option>
                        <option value="private_room_request">Private room request</option>
                        <option value="couple_friends_room_request">Couple / friends room request</option>
                      </select>
                    </label>

                    <label className="block text-xs font-medium">
                      Seat Row Request (optional)
                      <select
                        value={t.seatRowRequest}
                        onChange={(e) => {
                          const next = [...travelers];
                          next[index] = {
                            ...t,
                            seatRowRequest: e.target.value as SeatRowRequest,
                          };
                          setTravelers(next);
                        }}
                        className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
                      >
                        <option value="no_preference">No preference</option>
                        <option value="front_middle">Front / middle row</option>
                        <option value="rear_window">Rear window</option>
                      </select>
                    </label>

                    <label className="block text-xs font-medium">
                      Dietary / Motion Notes (optional)
                      <input
                        type="text"
                        placeholder="Veg, allergies, etc."
                        value={t.dietaryNotes}
                        onChange={(e) => {
                          const next = [...travelers];
                          next[index] = { ...t, dietaryNotes: e.target.value };
                          setTravelers(next);
                        }}
                        className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Private Co-Traveler Comfort Preference */}
          <div className="rounded-xl border border-forest-700/25 bg-white p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-forest-900">
                  5. Private Co-Traveler Comfort Request (Optional)
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
                  Handled privately by operations only — never shown on public pages, seat maps, or
                  group chats. Preferences are requests (not guarantees) subject to capacity and
                  departure type. If we cannot fulfill a request by{" "}
                  {bookingPolicy.preferenceDecisionHoursBefore} hours before departure, we will
                  contact you with options to accept, switch dates, or receive a refund per policy.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              {[
                {
                  value: "open_mixed" as const,
                  title: "Open to a mixed group",
                  desc: "Comfortable joining any standard small-batch departure.",
                },
                {
                  value: "prefer_same_gender" as const,
                  title: "Prefer same-gender co-travelers",
                  desc: "Operations will review feasibility and contact you if unable to accommodate.",
                },
                {
                  value: "request_women_only" as const,
                  title: "Request a women-only departure",
                  desc: "Women-only batches are explicitly scheduled by Sanchari (never auto-created).",
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-stone-200 p-2.5 hover:bg-cream-50"
                >
                  <input
                    type="radio"
                    name="coTravelerPreference"
                    value={opt.value}
                    checked={coTravelerPreference === opt.value}
                    onChange={() => setCoTravelerPreference(opt.value)}
                    className="mt-0.5 h-4 w-4 accent-forest-900"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-ink-900">{opt.title}</span>
                    <span className="block text-[11px] text-stone-600">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>

            <label className="block text-xs font-medium">
              Optional private comfort note for operator
              <input
                type="text"
                maxLength={300}
                placeholder="Anything else our team should know privately..."
                value={preferenceNotes}
                onChange={(e) => setPreferenceNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-xs"
              />
            </label>
          </div>

          {/* Coupon / creator code */}
          <div className="space-y-2">
            <label htmlFor="coupon-code" className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
              Coupon or creator code
            </label>
            <div className="flex gap-2">
              <input
                id="coupon-code"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void applyCoupon(couponInput);
                  }
                }}
                placeholder="e.g. MONSOON10"
                autoComplete="off"
                autoCapitalize="characters"
                className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm uppercase tracking-wide"
              />
              {coupon ? (
                <button
                  type="button"
                  onClick={() => {
                    setCoupon(null);
                    setCouponInput("");
                    setCouponMsg(null);
                  }}
                  className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-600"
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  disabled={couponBusy || couponInput.length < 4}
                  onClick={() => void applyCoupon(couponInput)}
                  className="shrink-0 rounded-lg bg-forest-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {couponBusy ? "Checking…" : "Apply"}
                </button>
              )}
            </div>
            {couponMsg && (
              <p
                role={couponMsg.kind === "error" ? "alert" : "status"}
                className={`rounded-lg px-3 py-2 text-xs ${couponMsg.kind === "error" ? "bg-red-50 text-red-900" : "bg-lagoon-100 font-medium text-forest-900"}`}
              >
                {couponMsg.text}
              </p>
            )}
          </div>

          {/* Pricing Breakdown */}
          {pricing && (
            <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">
                Itemized Estimate (Authoritative total confirmed on server)
              </p>
              <div className="flex justify-between">
                <span>
                  {formatINR(pricing.unitPricePaise)} × {pricing.seatsCount}{" "}
                  {pricing.seatsCount === 1 ? "seat" : "seats"}
                </span>
                <span>{formatINR(pricing.subtotalPaise)}</span>
              </div>
              {pricing.discountPaise - pricing.couponDiscountPaise > 0 && (
                <div className="flex justify-between text-forest-700">
                  <span>Private 6-seat vehicle discount</span>
                  <span>−{formatINR(pricing.discountPaise - pricing.couponDiscountPaise)}</span>
                </div>
              )}
              {coupon && pricing.couponDiscountPaise > 0 && (
                <div className="flex justify-between font-semibold text-copper-700">
                  <span>
                    Coupon {coupon.code} ({coupon.summary})
                  </span>
                  <span>−{formatINR(pricing.couponDiscountPaise)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-stone-600">
                <span>Taxes / GST ({bookingPolicy.gstIncludedOrNote})</span>
                <span>{formatINR(pricing.taxPaise)}</span>
              </div>

              {depositPercentAvailable && (
                <label className="flex items-center gap-2 border-t border-stone-200 pt-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={payDepositOnly}
                    onChange={(e) => setPayDepositOnly(e.target.checked)}
                    className="h-4 w-4 accent-forest-900"
                  />
                  Pay {depositPercentAvailable}% deposit now (balance due{" "}
                  {bookingPolicy.balanceDueDaysBefore} days prior)
                </label>
              )}

              <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-bold text-forest-900">
                <span>Due Now</span>
                <span>{formatINR(pricing.payNowPaise)}</span>
              </div>
              {pricing.balanceLaterPaise > 0 && (
                <div className="flex justify-between text-xs text-stone-600">
                  <span>Balance due later</span>
                  <span>{formatINR(pricing.balanceLaterPaise)}</span>
                </div>
              )}
            </div>
          )}

          {/* Consent Checkboxes */}
          <div className="space-y-2.5 text-xs text-ink-900">
            {selectedDep?.departureType === "women_only" && (
              <label className="flex items-start gap-2 rounded-lg border border-[#f3c0c9] bg-[#fff1f3] p-2.5 font-semibold text-[#8a1f31]">
                <input
                  required
                  type="checkbox"
                  checked={womenOnlyConfirmed}
                  onChange={(e) => setWomenOnlyConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#a3263a]"
                />
                <span>
                  {WOMEN_ONLY_CONFIRM_LABEL} This date is a women-only batch, so only women can travel on it.
                </span>
              </label>
            )}
            <label className="flex items-start gap-2">
              <input
                required
                type="checkbox"
                checked={acceptedTermsPrivacy}
                onChange={(e) => setAcceptedTermsPrivacy(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-forest-900"
              />
              <span>
                I have read and accept the{" "}
                <Link href="/policies#terms" className="underline text-copper-700">
                  draft Terms
                </Link>
                ,{" "}
                <Link href="/policies#privacy" className="underline text-copper-700">
                  Privacy Notice
                </Link>
                , and{" "}
                <Link href="/policies#refunds" className="underline text-copper-700">
                  Cancellation/Refund terms
                </Link>
                .
              </span>
            </label>

            <label className="flex items-start gap-2">
              <input
                required
                type="checkbox"
                checked={acceptedComfortProcessing}
                onChange={(e) => setAcceptedComfortProcessing(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-forest-900"
              />
              <span>
                I consent to operations using my traveler, room, and optional comfort preferences
                solely to coordinate this trip.
              </span>
            </label>

            <label className="flex items-start gap-2 text-stone-600">
              <input
                type="checkbox"
                checked={whatsappOptIn}
                onChange={(e) => setWhatsappOptIn(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-forest-900"
              />
              <span>
                Optional: Send my booking receipt and batch WhatsApp invite link (when configured)
                via WhatsApp.
              </span>
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
            disabled={submitting}
            className="btn-sunset w-full px-6 py-3.5 text-sm"
          >
            {submitting
              ? "Holding Seats Securely..."
              : `Hold ${effectiveSeats} ${effectiveSeats === 1 ? "Seat" : "Seats"} & Continue to Payment`}
          </button>
        </form>
      )}
    </div>
  );
}

