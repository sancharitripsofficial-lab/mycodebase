"use client";

import { AlertCircle, ArrowRight, Check, CheckCircle2, Clock, Minus, Plus, ShieldCheck, Users } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { WOMEN_ONLY_CONFIRM_LABEL } from "@/lib/women-only";
import { isBookable } from "@/lib/departure-rules";
import { ErtigaSeatMap, SEAT_INFO } from "@/components/booking/ErtigaSeatMap";
import { CarSeatPicker3D } from "@/components/three/CarSeatPicker3D";
// The UPI pay panel (and the Astryx styles it uses) loads only once a seat is held, so the
// trip page itself paints without that CSS. It starts downloading as soon as the visitor
// begins the booking form, so it is ready by the time the hold succeeds.
const loadUpiPanel = () => import("@/components/UpiPayPanel");
const UpiPayPanel = dynamic(() => loadUpiPanel().then((m) => m.UpiPayPanelThemed), {
  loading: () => <p className="rounded-xl bg-white/70 p-4 text-sm text-stone-600">Loading payment details…</p>,
});
const UpiSubmittedNotice = dynamic(() => loadUpiPanel().then((m) => m.UpiSubmittedNoticeThemed));
import { rupees, trackEvent, trackOnce, tripItem } from "@/lib/analytics";
import { advanceTerms, calculateBookingPricing, formatINR } from "@/lib/currency";
import { formatTripDates, formatTripDay } from "@/lib/trip-dates";
import { nextListedDeparture, seatSummary, visibleDepartureCode, wholeCarOpen } from "@/lib/trip-facts";
import type { BookingMode, PublicDepartureAvailability, SiteSettings, Trip, UpiPaymentInstructions, UpiSubmitResult } from "@/lib/types";

interface BookingWidgetProps {
  trip: Trip;
  departures: PublicDepartureAvailability[];
  bookingPolicy: SiteSettings["bookingPolicy"];
  /** Taken seat numbers per departure, read while the page was built: the car map shows at once. */
  initialSeatMaps?: Record<string, number[]>;
  /** The terms are still an owner-review draft (Admin → Text & policies); the checkbox says "draft Terms" only then. */
  termsAreDraft?: boolean;
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

const FIELD =
  "mt-1.5 block min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-base text-ink-900 placeholder:text-stone-600/70 focus:border-forest-800 sm:text-sm";
const STEP_LABEL = "font-display text-lg font-semibold text-forest-900";

/** "Step 2" pointer shown once the seats are reserved: who is travelling is asked only now. */
function TravellerDetailsNext({ href, seats }: { href: string; seats: number }) {
  return (
    <div className="rounded-2xl border border-saffron-500/50 bg-gradient-to-br from-[#fff7e6] to-white p-4 sm:p-5">
      <p className="font-display text-lg font-semibold text-forest-900">Next: who is travelling?</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-900/80">
        {seats === 1
          ? "Add your age and an emergency contact, then choose your pick-up point. It takes about two minutes and can be done any time before the trip."
          : `Add the name, age and emergency contact for all ${seats} travellers, then choose your pick-up point. It takes about two minutes and can be done any time before the trip.`}
      </p>
      <Link href={href} className="btn-sunset mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 px-5 text-sm sm:w-auto">
        Add traveller details <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

export function BookingWidget({ trip, departures, bookingPolicy, initialSeatMaps, termsAreDraft = true }: BookingWidgetProps) {
  const formId = useId();
  const initialDep = nextListedDeparture(departures) ?? departures[0] ?? null;

  const [departureId, setDepartureId] = useState<string>(initialDep?.departureId ?? "");

  // Departure cards link here with ?date=<departureId>#book — preselect that exact date.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("date");
    // A date that has closed since the link was made is not preselected: the next open one stays.
    if (wanted && departures.some((d) => d.departureId === wanted && isBookable(d))) setDepartureId(wanted);
  }, [departures]);
  const [bookingMode, setBookingMode] = useState<BookingMode>("batch_seats");
  const [seatsRequested, setSeatsRequested] = useState<number>(1);
  /** Pay the advance now (where the date offers one) instead of the full amount. */
  const [payAdvance, setPayAdvance] = useState<boolean>(true);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
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

  const selectedDep = useMemo(() => departures.find((d) => d.departureId === departureId) ?? null, [departures, departureId]);

  const effectiveSeats = bookingMode === "private_vehicle" ? 6 : seatsRequested;
  // The live map (fetched with no cache) wins over the page's own counts (up to 5 minutes old).
  const liveTaken = selectedDep && seatMap?.departureId === selectedDep.departureId ? seatMap.taken : null;
  const seatsTakenNow = liveTaken ? liveTaken.length : selectedDep?.seatsTaken ?? 0;
  const seatsRemainingNow = selectedDep
    ? liveTaken
      ? Math.max(0, selectedDep.maxCapacity - liveTaken.length)
      : selectedDep.seatsRemaining
    : 0;
  const maxBatchSelectable = selectedDep ? Math.min(5, Math.max(1, seatsRemainingNow)) : 1;
  const privateEligible = selectedDep ? wholeCarOpen({ ...selectedDep, seatsTaken: seatsTakenNow }) : false;

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
        setSeatMap((cur) => (cur?.departureId === departureId && cur.taken.join() === taken.join() ? cur : { departureId, taken }));
        setPickedSeats((cur) => {
          const gone = cur.filter((s) => taken.includes(s));
          if (gone.length === 0) return cur;
          setSeatNote(`Seat ${gone.join(", ")} ${gone.length === 1 ? "was" : "were"} just taken by someone else. Please pick again.`);
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

  // Picked seats always decide how many seats are booked.
  useEffect(() => {
    if (bookingMode !== "batch_seats" || pickedSeats.length === 0) return;
    if (pickedSeats.length !== seatsRequested) setSeatsRequested(pickedSeats.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedSeats, bookingMode]);

  // Fewer seats are open than were chosen (someone else booked meanwhile): come down to what is left.
  // Never once the seats are held: from then on the seat map counts this booking's own seats as taken.
  useEffect(() => {
    if (holdResult) return;
    if (bookingMode === "batch_seats" && seatsRequested > maxBatchSelectable) setSeatsRequested(maxBatchSelectable);
  }, [bookingMode, seatsRequested, maxBatchSelectable, holdResult]);

  // select_seats: the visitor's latest choice of date, seats and seat/whole-car, once it settles.
  const interacted = useRef(false);
  useEffect(() => {
    if (!interacted.current || !selectedDep) return;
    const unit = selectedDep.priceOverridePaise ?? trip.basePricePaise;
    const t = window.setTimeout(() => {
      trackEvent("select_seats", {
        currency: "INR",
        seats: effectiveSeats,
        booking_mode: bookingMode === "private_vehicle" ? "whole_car" : "shared_seats",
        seat_map_used: pickedSeats.length > 0,
        items: [
          tripItem({
            slug: trip.slug,
            title: trip.title,
            destination: trip.destination,
            variant: selectedDep.startDate,
            pricePaise: unit,
            quantity: effectiveSeats,
          }),
        ],
      });
    }, 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only what the visitor chose
  }, [departureId, effectiveSeats, bookingMode, pickedSeats.length]);

  const toggleSeat = (seat: number) => {
    if (bookingMode !== "batch_seats") return;
    interacted.current = true;
    setSeatNote(null);
    setErrorMsg(null);
    if (!pickedSeats.includes(seat) && pickedSeats.length >= maxBatchSelectable) {
      setSeatNote(
        maxBatchSelectable === 5
          ? "A shared trip takes up to 5 seats. For all 6, choose the whole car."
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

  const handleSeatCountChange = (count: number) => {
    const next = Math.min(maxBatchSelectable, Math.max(1, count));
    interacted.current = true;
    setSeatsRequested(next);
    setSeatNote(null);
    // Keep any tapped seats in step with the new number: drop the last ones, or add the
    // nearest free seats so the group still sits together.
    if (pickedSeats.length === 0) return;
    if (next < pickedSeats.length) {
      setPickedSeats(pickedSeats.slice(0, next));
      return;
    }
    const used = new Set([...(liveTaken ?? []), ...pickedSeats]);
    const extra: number[] = [];
    for (let s = 1; s <= (selectedDep?.maxCapacity ?? 6) && pickedSeats.length + extra.length < next; s++) {
      if (!used.has(s)) extra.push(s);
    }
    setPickedSeats([...pickedSeats, ...extra]);
  };

  const handleModeChange = (mode: BookingMode) => {
    interacted.current = true;
    setBookingMode(mode);
    setPickedSeats([]);
    setSeatNote(null);
    setSeatsRequested(mode === "private_vehicle" ? 6 : Math.min(seatsRequested === 6 ? 1 : seatsRequested, maxBatchSelectable));
  };

  // The advance (and the day its balance is due) for the chosen date: the server uses the same rule.
  const advance = useMemo(
    () =>
      selectedDep
        ? advanceTerms({ tripDepositPercent: trip.depositPercent, tripBalanceDueDaysBefore: trip.balanceDueDaysBefore, bookingPolicy, startDate: selectedDep.startDate })
        : { available: false, percent: null, balanceDueDate: null, balanceDueDaysBefore: 0, reason: "full_only" as const },
    [selectedDep, trip.depositPercent, trip.balanceDueDaysBefore, bookingPolicy]
  );
  const payDepositOnly = payAdvance && advance.available;
  // (Where the rounded-up advance would be the whole total, the price is simply paid in full.)

  const priceFor = (depositOnly: boolean) => {
    if (!selectedDep) return null;
    try {
      return calculateBookingPricing({
        trip,
        priceOverridePaise: selectedDep.priceOverridePaise,
        bookingMode,
        seatsRequested: effectiveSeats,
        payDepositOnly: depositOnly,
        bookingPolicy,
        couponDiscountPaise: coupon?.couponDiscountPaise ?? 0,
      });
    } catch {
      return null;
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- priceFor reads exactly these
  const pricing = useMemo(() => priceFor(payDepositOnly), [selectedDep, trip, bookingMode, effectiveSeats, payDepositOnly, bookingPolicy, coupon]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const advancePricing = useMemo(() => (advance.available ? priceFor(true) : null), [selectedDep, trip, bookingMode, effectiveSeats, advance.available, bookingPolicy, coupon]);

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

  const analyticsItems = () =>
    selectedDep
      ? [
          tripItem({
            slug: trip.slug,
            title: trip.title,
            destination: trip.destination,
            variant: selectedDep.startDate,
            pricePaise: selectedDep.priceOverridePaise ?? trip.basePricePaise,
            quantity: effectiveSeats,
          }),
        ]
      : [];

  /** purchase: once per booking, whichever way it was completed. */
  const trackPurchase = (reference: string, paidNowPaise: number, status: "payment_sent" | "confirmed" | "free") => {
    trackOnce(reference, "purchase", {
      transaction_id: reference,
      currency: "INR",
      value: rupees(paidNowPaise),
      booking_total: pricing ? rupees(pricing.totalPaise) : undefined,
      payment_status: status,
      coupon: coupon?.code,
      items: analyticsItems(),
    });
  };

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
          preferredSeats: bookingMode === "batch_seats" && pickedSeats.length === effectiveSeats ? pickedSeats : undefined,
          couponCode: coupon && coupon.key === couponKey ? coupon.code : undefined,
          // Step 2 (My Booking) asks for the pick-up point and the travellers' details.
          pickupPointId: null,
          customerName,
          customerEmail,
          customerPhone,
          payDepositOnly,
          whatsappOptIn,
          womenOnlyConfirmed: selectedDep.departureType === "women_only" && womenOnlyConfirmed,
          // One tick covers both: the terms, and using the details shared to run the trip.
          acceptedTermsPrivacy: acceptedTerms,
          acceptedComfortProcessing: acceptedTerms,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Could not reserve the seats. Please check your details.");
        if (json.code === "SEAT_TAKEN") setSeatMapVersion((v) => v + 1);
        if (json.code === "ADVANCE_CLOSED") setPayAdvance(false);
        if (/coupon/i.test(String(json.error ?? ""))) {
          setCoupon(null);
          setCouponMsg({ kind: "error", text: String(json.error) });
        }
        return;
      }
      const hold = json as HoldResponse;
      trackEvent("begin_checkout", {
        currency: "INR",
        value: pricing ? rupees(pricing.totalPaise) : rupees(hold.amountDuePaise),
        pay_now: rupees(hold.amountDuePaise),
        payment_choice: payDepositOnly ? "advance" : "full",
        coupon: coupon?.code,
        items: analyticsItems(),
      });
      if (hold.freeConfirmed) trackPurchase(hold.bookingReference, 0, "free");
      setHoldResult(hold);
    } catch {
      setErrorMsg("Network problem while reserving the seats. Please try again.");
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
      const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
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
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
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
            setErrorMsg(json.error || "Payment verification pending. Check My Booking rather than paying again.");
            setSubmitting(false);
            return;
          }
          trackPurchase(json.bookingReference, holdResult.amountDuePaise, "confirmed");
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
      setErrorMsg(err instanceof Error ? err.message : "Could not open Razorpay Checkout. Please retry.");
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

  // Nothing to book: no dates at all, or every listed date has closed.
  if (departures.length === 0 || !departures.some((d) => isBookable(d))) {
    return (
      <div className="card-theme p-6 pt-7">
        <h2 className="font-display text-2xl font-semibold text-forest-900">New dates are being planned</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-900/80">
          No date is open for this trip right now. Leave your WhatsApp number and we will tell you as soon as one is announced, or ask for a
          private car on your own dates.
        </p>
        <a href="#ask" className="btn-sunset mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 px-5 text-sm">
          Notify me about new dates <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    );
  }

  // Once seats are held, the booking's size is what the server held, whatever the form shows later.
  const heldSeatCount = holdResult?.seatNumbers?.length || effectiveSeats;

  /** My Booking for this reservation, opened on step 2 (traveller details). */
  const myBookingHref = (reference: string, token: string, hash = "") =>
    `/booking-lookup?ref=${encodeURIComponent(reference)}&email=${encodeURIComponent(customerEmail)}&token=${encodeURIComponent(token)}${hash}`;

  if (holdResult && holdResult.freeConfirmed) {
    return (
      <div className="space-y-3">
        <div role="status" className="space-y-4 rounded-2xl border border-lagoon-500/40 bg-gradient-to-br from-white to-lagoon-100/60 p-5">
          <p className="font-display text-2xl font-semibold text-forest-900">You&apos;re booked: free with your code</p>
          <p className="text-sm text-ink-900">
            Booking <strong className="font-mono">{holdResult.bookingReference}</strong> is confirmed
            {holdResult.seatNumbers && holdResult.seatNumbers.length > 0 ? ` (seat ${holdResult.seatNumbers.join(", ")})` : ""}. Nothing to pay.
          </p>
          {holdResult.seatNumbers && holdResult.seatNumbers.length > 0 && (
            <ErtigaSeatMap mode="view" takenSeats={[]} selectedSeats={holdResult.seatNumbers} maxCapacity={selectedDep?.maxCapacity ?? 6} showLegend={false} />
          )}
        </div>
        <TravellerDetailsNext href={myBookingHref(holdResult.bookingReference, holdResult.lookupToken, "#travellers")} seats={heldSeatCount} />
      </div>
    );
  }

  if (holdResult && holdResult.paymentMethod === "upi") {
    const lookupHref = myBookingHref(holdResult.bookingReference, holdResult.lookupToken);

    if (upiResult) {
      return (
        <div className="space-y-3">
          <UpiSubmittedNotice result={upiResult} bookingReference={holdResult.bookingReference} lookupHref={lookupHref} />
          {!upiResult.seatsLost && <TravellerDetailsNext href={`${lookupHref}#travellers`} seats={heldSeatCount} />}
        </div>
      );
    }

    const heldSeats = holdResult.seatNumbers ?? [];
    return (
      <div className="space-y-3">
        {heldSeats.length > 0 && bookingMode === "batch_seats" && (
          <div className="rounded-2xl border border-lagoon-500/30 bg-white/80 p-3">
            <p className="mb-2 text-xs font-semibold text-forest-900">Held for you: seat {heldSeats.join(", ")} until the timer ends</p>
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
          heading={holdResult.amountDuePaise < (pricing?.totalPaise ?? holdResult.amountDuePaise) ? "Pay advance by UPI" : "Pay by UPI"}
          onSubmitted={(result) => {
            trackPurchase(holdResult.bookingReference, result.amountPaise, "payment_sent");
            setUpiResult(result);
          }}
          scrollOnMount
        />
        <p className="px-1 text-xs leading-relaxed text-stone-600">
          Paying later? Your booking reference is <strong>{holdResult.bookingReference}</strong>. Seats free up automatically if no payment
          reference arrives before the timer ends.{" "}
          <Link href={lookupHref} className="font-semibold text-forest-900 underline">
            Open My Booking
          </Link>
        </p>
      </div>
    );
  }

  if (verifiedReceipt && holdResult) {
    const lookupUrl = myBookingHref(verifiedReceipt.bookingReference, holdResult.lookupToken);

    return (
      <div className="space-y-3">
        <div className="card-theme space-y-4 p-6 pt-7">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-forest-700" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold tracking-wider text-forest-700 uppercase">
                {verifiedReceipt.mode === "sandbox" ? "Sandbox Verification Recorded" : "Payment Verified"}
              </p>
              <h2 className="font-display text-2xl font-semibold text-forest-900">Booking {verifiedReceipt.bookingReference}</h2>
              <p className="mt-1 text-sm text-stone-600">
                Status: <strong className="text-ink-900">{verifiedReceipt.bookingStatus}</strong> • {heldSeatCount}{" "}
                {heldSeatCount === 1 ? "seat" : "seats"} on {selectedDep ? formatTripDates(selectedDep.startDate, selectedDep.endDate) : "your date"}.
              </p>
            </div>
          </div>

          {verifiedReceipt.mode === "sandbox" && (
            <div className="rounded-lg border border-saffron-500/40 bg-saffron-500/10 p-3 text-xs text-ink-900">
              <strong>Sandbox Notice:</strong> Live Razorpay keys are not configured yet, so this confirmation used the server-verified sandbox
              flow for testing only. No real money was charged.
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={lookupUrl} className="rounded-full bg-forest-900 px-5 py-2.5 text-sm font-semibold text-cream-50 hover:bg-forest-800">
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
        <TravellerDetailsNext href={`${lookupUrl}#travellers`} seats={heldSeatCount} />
      </div>
    );
  }

  if (holdResult) {
    return (
      <div className="card-theme space-y-5 p-6 pt-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wider text-copper-700 uppercase">Temporary Seat Hold Active</p>
            <h2 className="font-display text-2xl font-semibold text-forest-900">Ref: {holdResult.bookingReference}</h2>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-3 py-1 text-xs font-medium text-forest-900">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Held until {new Date(holdResult.holdExpiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-stone-600">Amount Due Now</span>
            <span className="font-bold text-forest-900">{formatINR(holdResult.amountDuePaise)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-600">Gateway Mode</span>
            <span className="font-medium text-ink-900">
              {holdResult.paymentOrder?.isLiveGateway ? "Razorpay (Server-Verified)" : "Sandbox (Owner Gateway Setup Pending)"}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        {holdResult.paymentOrder?.isLiveGateway ? (
          <div className="space-y-3">
            <p className="text-xs text-stone-600">
              Your seats are temporarily held. Final confirmation is recorded only after Razorpay server signature / webhook verification.
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={handleLaunchRazorpay}
              className="w-full rounded-full bg-copper-600 px-5 py-3 text-sm font-semibold text-cream-50 hover:bg-copper-700 disabled:opacity-60"
            >
              {submitting ? "Opening Razorpay..." : `Proceed to Razorpay (${formatINR(holdResult.amountDuePaise)})`}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-saffron-500/40 bg-saffron-500/10 p-3 text-xs leading-relaxed text-ink-900">
              <strong>Owner Gateway Pending:</strong> Razorpay credentials are not configured in `.env.local`. You can complete a server-verified
              Sandbox confirmation below to test atomic seat allocation and receipts safely without real payment.
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={handleVerifySandboxPayment}
              className="w-full rounded-full bg-forest-900 px-5 py-3 text-sm font-semibold text-cream-50 hover:bg-forest-800 disabled:opacity-60"
            >
              {submitting ? "Verifying on server..." : `Complete Sandbox Verification (${formatINR(holdResult.amountDuePaise)})`}
            </button>
          </div>
        )}

        <button type="button" onClick={() => setHoldResult(null)} className="text-xs font-medium text-stone-600 underline hover:text-ink-900">
          Back to booking form
        </button>
      </div>
    );
  }

  const unitPaise = selectedDep ? selectedDep.priceOverridePaise ?? trip.basePricePaise : trip.basePricePaise;
  const soldOut = Boolean(selectedDep) && seatsRemainingNow === 0;
  const shownCode = selectedDep ? visibleDepartureCode(selectedDep) : null;
  const holdMinutes = Math.min(60, Math.max(5, Math.round(bookingPolicy.holdMinutes || 15)));
  const balanceByLabel = advance.balanceDueDate ? formatTripDay(advance.balanceDueDate) : "";
  const free = pricing !== null && pricing.totalPaise === 0;

  return (
    <div className="card-theme space-y-6 p-5 pt-6 sm:p-6 sm:pt-7">
      <div>
        <h2 className="font-display text-2xl font-semibold text-forest-900">Reserve your seat</h2>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">
          Three quick things now. Traveller names and your pick-up point come after you reserve.
        </p>
      </div>

      {/* 1. Date */}
      <fieldset className="space-y-2.5">
        <legend className={STEP_LABEL}>Choose your date</legend>
        <div className="grid gap-2.5">
          {departures.map((dep) => {
            const active = dep.departureId === departureId;
            const closed = !isBookable(dep);
            const seats = seatSummary(active ? { seatsRemaining: seatsRemainingNow, maxCapacity: dep.maxCapacity } : dep);
            return (
              <label
                key={dep.departureId}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 transition ${
                  closed ? "cursor-not-allowed opacity-60" : ""
                } ${active ? "border-forest-900 bg-white ring-1 ring-forest-900" : "border-stone-200 bg-white/70 hover:border-stone-300"}`}
              >
                <span className="flex min-w-0 items-start gap-3">
                  <input
                    type="radio"
                    name={`${formId}-departure`}
                    value={dep.departureId}
                    checked={active}
                    disabled={closed}
                    onChange={() => {
                      interacted.current = true;
                      setDepartureId(dep.departureId);
                      setErrorMsg(null);
                      setWaitlistSuccess(null);
                      setPickedSeats([]);
                      setSeatNote(null);
                      setWomenOnlyConfirmed(false);
                      if (dep.seatsTaken > 0 && bookingMode === "private_vehicle") {
                        setBookingMode("batch_seats");
                        setSeatsRequested(1);
                      } else if (bookingMode === "batch_seats" && dep.seatsRemaining > 0 && seatsRequested > dep.seatsRemaining) {
                        setSeatsRequested(Math.min(5, dep.seatsRemaining));
                      }
                    }}
                    className="mt-1 h-5 w-5 shrink-0 accent-forest-900"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-ink-900">
                      {formatTripDates(dep.startDate, dep.endDate, { weekday: true })}
                      {dep.departureType === "women_only" && (
                        <span className="rounded-full bg-[#fde3e6] px-2 py-0.5 text-[11px] font-semibold text-[#a3263a]">Women only</span>
                      )}
                    </span>
                    <span className={`mt-0.5 block text-xs ${closed || seats.tone === "full" ? "text-stone-600" : seats.tone === "few" ? "font-semibold text-copper-700" : "text-forest-700"}`}>
                      {closed ? (dep.status === "cancelled" ? "Cancelled" : "Booking closed") : seats.tone === "full" ? "Sold out. Waitlist open" : seats.label}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right leading-tight">
                  <span className="block text-base font-bold text-forest-900">{formatINR(dep.priceOverridePaise ?? trip.basePricePaise)}</span>
                  <span className="block text-[11px] text-stone-600">per seat</span>
                </span>
              </label>
            );
          })}
        </div>
        {selectedDep && selectedDep.minOccupancy > 1 && isBookable(selectedDep) && (
          <p className="text-xs text-stone-600">{`This date runs once at least ${selectedDep.minOccupancy} travellers have booked.`}</p>
        )}
        <a href="#ask" className="inline-flex min-h-9 items-center text-xs font-semibold text-forest-800 underline-offset-2 hover:underline">
          None of these dates work? Ask for your own date or a private car
        </a>
      </fieldset>

      {selectedDep && soldOut ? (
        <form onSubmit={handleWaitlistSubmit} className="space-y-4 border-t border-stone-200 pt-5">
          <div>
            <h3 className={STEP_LABEL}>This date is full. Join the waitlist</h3>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
              Joining does not reserve a seat and costs nothing. We message you only if a seat opens or a new date is announced.
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
            <label className="block text-xs font-semibold text-ink-900">
              Your name
              <input required type="text" autoComplete="name" value={waitlistName} onChange={(e) => setWaitlistName(e.target.value)} className={FIELD} />
            </label>
            <label className="block text-xs font-semibold text-ink-900">
              Email
              <input required type="email" autoComplete="email" value={waitlistEmail} onChange={(e) => setWaitlistEmail(e.target.value)} className={FIELD} />
            </label>
            <label className="block text-xs font-semibold text-ink-900">
              WhatsApp number
              <input required type="tel" inputMode="tel" autoComplete="tel" value={waitlistPhone} onChange={(e) => setWaitlistPhone(e.target.value)} className={FIELD} />
            </label>
            <label className="block text-xs font-semibold text-ink-900">
              Seats needed
              <select value={waitlistSeats} onChange={(e) => setWaitlistSeats(Number(e.target.value))} className={FIELD}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "seat" : "seats"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-stone-600">
            <input type="checkbox" checked={waitlistWhatsapp} onChange={(e) => setWaitlistWhatsapp(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-forest-900" />
            Optional: Notify me via WhatsApp if a seat opens.
          </label>

          <label className="flex items-start gap-2.5 text-xs text-ink-900">
            <input required type="checkbox" checked={waitlistConsent} onChange={(e) => setWaitlistConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-forest-900" />
            I consent to Sanchari contacting me regarding availability on this departure.
          </label>

          <button type="submit" disabled={submitting} className="btn-ocean min-h-12 w-full px-5 text-sm">
            {submitting ? "Sending…" : "Join the waitlist (no charge)"}
          </button>
        </form>
      ) : (
        selectedDep && (
          <form
            onSubmit={handleHoldSubmit}
            onFocusCapture={() => void loadUpiPanel()}
            onPointerDownCapture={() => void loadUpiPanel()}
            className="space-y-6 border-t border-stone-200 pt-5"
          >
            {/* 2. Seats */}
            <section aria-labelledby={`${formId}-seats`} className="space-y-3">
              <h3 id={`${formId}-seats`} className={STEP_LABEL}>
                How many seats?
              </h3>

              {/* Shared seats on the scheduled trip, or the whole car for one group: never mixed up. */}
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Shared seats or the whole car">
                <button
                  type="button"
                  aria-pressed={bookingMode === "batch_seats"}
                  onClick={() => handleModeChange("batch_seats")}
                  className={`rounded-2xl border p-3 text-left transition ${
                    bookingMode === "batch_seats" ? "border-forest-900 bg-white ring-1 ring-forest-900" : "border-stone-200 bg-white/60"
                  }`}
                >
                  <span className="block text-sm font-semibold text-ink-900">Join the group</span>
                  <span className="block text-xs text-stone-600">1 to 5 seats, shared car</span>
                </button>
                <button
                  type="button"
                  aria-pressed={bookingMode === "private_vehicle"}
                  disabled={!privateEligible}
                  onClick={() => handleModeChange("private_vehicle")}
                  className={`rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                    bookingMode === "private_vehicle" ? "border-forest-900 bg-white ring-1 ring-forest-900" : "border-stone-200 bg-white/60"
                  }`}
                >
                  <span className="block text-sm font-semibold text-ink-900">Book the whole car</span>
                  <span className="block text-xs text-stone-600">{privateEligible ? "All 6 seats, only your people" : "Open only while all 6 seats are free"}</span>
                </button>
              </div>

              {bookingMode === "batch_seats" ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-2.5 pl-4">
                  <span className="text-sm font-semibold text-ink-900" id={`${formId}-count`}>
                    Seats
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="One seat fewer"
                      disabled={seatsRequested <= 1}
                      onClick={() => handleSeatCountChange(seatsRequested - 1)}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-stone-300 bg-cream-100 text-forest-900 disabled:opacity-40"
                    >
                      <Minus className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <output aria-labelledby={`${formId}-count`} aria-live="polite" className="w-10 text-center font-display text-2xl font-semibold text-forest-900">
                      {seatsRequested}
                    </output>
                    <button
                      type="button"
                      aria-label="One seat more"
                      disabled={seatsRequested >= maxBatchSelectable}
                      onClick={() => handleSeatCountChange(seatsRequested + 1)}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-stone-300 bg-cream-100 text-forest-900 disabled:opacity-40"
                    >
                      <Plus className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-3.5 text-sm font-semibold text-ink-900">
                  <Users className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" /> All 6 seats: the car is yours
                </p>
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-900">
                    {bookingMode === "private_vehicle" ? "Your private car" : "Pick your seats on the car"}
                    {bookingMode === "batch_seats" && <span className="font-normal text-stone-600"> (optional)</span>}
                  </p>
                  <p className="text-[11px] text-stone-600">
                    {shownCode ? <span data-no-translate>{shownCode} • </span> : null}Driver sits on the right
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
                      <button type="button" onClick={() => handleModeChange("private_vehicle")} className="rounded-full bg-copper-600 px-3 py-1 text-[11px] font-bold text-white">
                        Book the whole car instead
                      </button>
                    )}
                  </div>
                )}
                {bookingMode === "batch_seats" && (
                  <p className="text-xs text-stone-600">
                    {pickedSeats.length > 0 ? (
                      <>
                        <span className="font-semibold text-ink-900">Your seats: </span>
                        {pickedSeats
                          .slice()
                          .sort((a, b) => a - b)
                          .map((s) => `${s} (${SEAT_INFO[s]?.label ?? "seat"})`)
                          .join(", ")}
                      </>
                    ) : (
                      "Skip this and we seat your group together automatically."
                    )}
                  </p>
                )}
              </div>
            </section>

            {/* 3. Who is booking */}
            <section aria-labelledby={`${formId}-who`} className="space-y-3">
              <h3 id={`${formId}-who`} className={STEP_LABEL}>
                Who is booking?
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-ink-900">
                  Your name
                  <input required type="text" autoComplete="name" minLength={2} maxLength={120} value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={FIELD} />
                </label>
                <label className="block text-xs font-semibold text-ink-900">
                  WhatsApp number
                  <input
                    required
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="98XXXXXXXX"
                    pattern="[0-9+\-\s\(\)]{8,20}"
                    title="Enter your 10-digit mobile number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className={FIELD}
                  />
                </label>
                <label className="block text-xs font-semibold text-ink-900 sm:col-span-2">
                  Email
                  <input required type="email" autoComplete="email" maxLength={160} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className={FIELD} />
                  <span className="mt-1 block font-normal text-stone-600">With your booking reference, this email opens My Booking.</span>
                </label>
              </div>
            </section>

            {/* Coupon / creator code */}
            <details className="group rounded-2xl border border-stone-200 bg-white/70 px-4 py-1" open={Boolean(coupon) || undefined}>
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-forest-900">Have a coupon or creator code?</summary>
              <div className="space-y-2 pb-3">
                <div className="flex gap-2">
                  <input
                    id={`${formId}-coupon`}
                    aria-label="Coupon or creator code"
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
                    className="min-h-12 min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 font-mono text-base tracking-wide uppercase sm:text-sm"
                  />
                  {coupon ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCoupon(null);
                        setCouponInput("");
                        setCouponMsg(null);
                      }}
                      className="min-h-12 shrink-0 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-600"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={couponBusy || couponInput.length < 4}
                      onClick={() => void applyCoupon(couponInput)}
                      className="min-h-12 shrink-0 rounded-xl bg-forest-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
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
            </details>

            {/* Price: the whole amount, and exactly what is paid now */}
            {pricing && (
              <section aria-labelledby={`${formId}-price`} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
                <h3 id={`${formId}-price`} className={STEP_LABEL}>
                  Your price
                </h3>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt>
                      {formatINR(unitPaise)} × {pricing.seatsCount} {pricing.seatsCount === 1 ? "seat" : "seats"}
                    </dt>
                    <dd>{formatINR(pricing.subtotalPaise)}</dd>
                  </div>
                  {pricing.discountPaise - pricing.couponDiscountPaise > 0 && (
                    <div className="flex justify-between gap-3 text-forest-700">
                      <dt>Whole-car saving</dt>
                      <dd>−{formatINR(pricing.discountPaise - pricing.couponDiscountPaise)}</dd>
                    </div>
                  )}
                  {coupon && pricing.couponDiscountPaise > 0 && (
                    <div className="flex justify-between gap-3 font-semibold text-copper-700">
                      <dt>
                        Coupon <span data-no-translate>{coupon.code}</span>
                      </dt>
                      <dd>−{formatINR(pricing.couponDiscountPaise)}</dd>
                    </div>
                  )}
                  {pricing.taxPaise > 0 && (
                    <div className="flex justify-between gap-3 text-stone-600">
                      <dt>Taxes / GST</dt>
                      <dd>{formatINR(pricing.taxPaise)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 border-t border-stone-200 pt-2 text-base font-bold text-forest-900">
                    <dt>Total</dt>
                    <dd>{formatINR(pricing.totalPaise)}</dd>
                  </div>
                </dl>

                {free ? (
                  <p className="rounded-xl bg-lagoon-100 px-3 py-2.5 text-sm font-semibold text-forest-900">Nothing to pay. Your seats are confirmed when you continue.</p>
                ) : advance.available && advancePricing && advancePricing.balanceLaterPaise > 0 ? (
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-semibold text-stone-600">Pay now</legend>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${payAdvance ? "border-forest-900 bg-[#f3fbf7] ring-1 ring-forest-900" : "border-stone-200"}`}>
                      <input type="radio" name={`${formId}-pay`} checked={payAdvance} onChange={() => setPayAdvance(true)} className="mt-0.5 h-5 w-5 shrink-0 accent-forest-900" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="text-sm font-semibold text-ink-900">{`${advance.percent}% advance`}</span>
                          <span className="text-base font-bold text-forest-900">{formatINR(advancePricing.payNowPaise)}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-stone-600">{`Balance ${formatINR(advancePricing.balanceLaterPaise)} by ${balanceByLabel}`}</span>
                      </span>
                    </label>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${!payAdvance ? "border-forest-900 bg-[#f3fbf7] ring-1 ring-forest-900" : "border-stone-200"}`}>
                      <input type="radio" name={`${formId}-pay`} checked={!payAdvance} onChange={() => setPayAdvance(false)} className="mt-0.5 h-5 w-5 shrink-0 accent-forest-900" />
                      <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-sm font-semibold text-ink-900">Full amount</span>
                        <span className="text-base font-bold text-forest-900">{formatINR(pricing.totalPaise)}</span>
                      </span>
                    </label>
                  </fieldset>
                ) : (
                  <p className="rounded-xl bg-cream-100 px-3 py-2.5 text-xs leading-relaxed text-ink-900/80">
                    {advance.reason === "too_close"
                      ? `The full amount is paid now: this trip leaves within ${Math.max(1, advance.balanceDueDaysBefore)} days, so there is no time left for a balance.`
                      : "The full amount is paid now for this trip."}
                  </p>
                )}

                <div className="flex justify-between gap-3 rounded-xl bg-forest-900 px-4 py-3 text-white">
                  <span className="text-sm font-semibold">You pay now</span>
                  <span className="font-display text-xl font-semibold">{formatINR(pricing.payNowPaise)}</span>
                </div>
                {pricing.balanceLaterPaise > 0 && (
                  <p className="text-xs text-stone-600">{`Then ${formatINR(pricing.balanceLaterPaise)} by ${balanceByLabel}, from My Booking.`}</p>
                )}
              </section>
            )}

            {/* One consent, plus the women-only confirmation where the date needs it */}
            <div className="space-y-3 text-sm text-ink-900">
              {selectedDep.departureType === "women_only" && (
                <label className="flex items-start gap-2.5 rounded-xl border border-[#f3c0c9] bg-[#fff1f3] p-3 font-semibold text-[#8a1f31]">
                  <input required type="checkbox" checked={womenOnlyConfirmed} onChange={(e) => setWomenOnlyConfirmed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#a3263a]" />
                  <span>{WOMEN_ONLY_CONFIRM_LABEL} This date is a women-only batch, so only women can travel on it.</span>
                </label>
              )}
              <label className="flex items-start gap-2.5">
                <input required type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-forest-900" />
                <span className="text-xs leading-relaxed">
                  I accept the{" "}
                  <Link href="/policies#terms" className="font-semibold text-copper-700 underline">
                    {termsAreDraft ? "draft Terms" : "Terms"}
                  </Link>
                  ,{" "}
                  <Link href="/policies#privacy" className="font-semibold text-copper-700 underline">
                    Privacy Notice
                  </Link>{" "}
                  and{" "}
                  <Link href="/policies#refunds" className="font-semibold text-copper-700 underline">
                    Cancellation &amp; refund rules
                  </Link>
                  , and agree that Sanchari may use the details I share to run this trip.
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-stone-600">
                <input type="checkbox" checked={whatsappOptIn} onChange={(e) => setWhatsappOptIn(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-forest-900" />
                <span className="text-xs leading-relaxed">Send my booking updates on WhatsApp (optional).</span>
              </label>
            </div>

            {errorMsg && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-2.5">
              <button type="submit" disabled={submitting} className="btn-sunset min-h-14 w-full px-6 text-base">
                {submitting ? "Reserving your seats…" : free ? "Confirm my free booking" : "Continue to reservation"}
                {!submitting && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
              </button>
              <ul className="space-y-1 text-xs leading-relaxed text-stone-600">
                {!free && (
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest-700" aria-hidden="true" />
                    <span>{`Your ${effectiveSeats === 1 ? "seat is" : "seats are"} held for ${holdMinutes} minutes while you pay by UPI.`}</span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest-700" aria-hidden="true" />
                  <span>Money goes straight to Sanchari&apos;s own UPI account. No extra fees.</span>
                </li>
              </ul>
            </div>
          </form>
        )
      )}
    </div>
  );
}
