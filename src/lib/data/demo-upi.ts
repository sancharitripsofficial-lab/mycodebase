/**
 * Direct UPI payments for the in-memory store (used when Supabase is not configured).
 * Mirrors supabase/migrations/202611120003_upi_direct_payments.sql rule for rule;
 * tests/upi-payments.test.ts runs the same scenarios against both implementations.
 */
import crypto from "node:crypto";
import {
  computePublicAvailabilityDemo,
  getDemoState,
  recalculateDepartureStatusDemo,
  releaseExpiredHoldsDemo,
  type DemoDatabaseState,
  type PaymentRow,
  type SeatAllocRow,
} from "@/lib/data/demo-store";
import { validateUtr } from "@/lib/payments/upi";
import type {
  AdminPaymentRow,
  AuditLogEntry,
  PaymentRecord,
  UpiPaymentSettings,
  UpiReviewDecision,
  UpiReviewResult,
  UpiSubmitResult,
} from "@/lib/types";

function activeSeatNumbers(state: DemoDatabaseState, departureId: string): Set<number> {
  return new Set(
    state.seatAllocations
      .filter(
        (sa) =>
          sa.departureId === departureId &&
          (sa.allocationStatus === "held" ||
            sa.allocationStatus === "confirmed" ||
            sa.allocationStatus === "operator_blocked")
      )
      .map((sa) => sa.seatNumber)
  );
}

function audit(state: DemoDatabaseState, entry: Omit<AuditLogEntry, "id" | "createdAt">): void {
  state.auditLogs.unshift({ ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
}

export function getUpiSettingsDemo(stateOverride?: DemoDatabaseState): UpiPaymentSettings {
  const state = stateOverride ?? getDemoState();
  return { ...state.upiSettings };
}

export function updateUpiSettingsDemo(
  input: { isEnabled: boolean; upiId: string; payeeName: string; supportPhone: string },
  actor: { userId: string; role: string },
  stateOverride?: DemoDatabaseState
): UpiPaymentSettings {
  const state = stateOverride ?? getDemoState();
  if (input.isEnabled && (!input.upiId || input.payeeName.trim().length < 2)) {
    throw new Error("UPI_INCOMPLETE: Enter the UPI ID and payee name before switching UPI payments on.");
  }
  const before = { ...state.upiSettings };
  state.upiSettings = {
    isEnabled: input.isEnabled,
    upiId: input.upiId,
    payeeName: input.payeeName,
    supportPhone: input.supportPhone,
    updatedAt: new Date().toISOString(),
  };
  const changed =
    before.isEnabled !== input.isEnabled ||
    before.upiId !== input.upiId ||
    before.payeeName !== input.payeeName ||
    before.supportPhone !== input.supportPhone;
  if (changed) {
    audit(state, {
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "upi_settings_changed",
      entityType: "upi_payment_settings",
      entityId: "1",
      reason: "UPI receiving account changed",
      beforeState: {
        is_enabled: before.isEnabled,
        upi_id: before.upiId,
        payee_name: before.payeeName,
        support_phone: before.supportPhone,
      },
      afterState: {
        is_enabled: input.isEnabled,
        upi_id: input.upiId,
        payee_name: input.payeeName,
        support_phone: input.supportPhone,
      },
    });
  }
  return { ...state.upiSettings };
}

export function submitUpiPaymentDemo(
  params: { bookingId: string; utr: string },
  stateOverride?: DemoDatabaseState
): UpiSubmitResult {
  const state = stateOverride ?? getDemoState();
  const checked = validateUtr(params.utr);
  if (!checked.ok) {
    throw new Error("UTR_FORMAT: The UPI reference number must be exactly 12 digits.");
  }
  const utr = checked.value;

  if (!state.upiSettings.isEnabled) {
    throw new Error("UPI_DISABLED: UPI payments are switched off. Please contact us.");
  }

  const booking = state.bookings.find((b) => b.id === params.bookingId);
  const dep = booking ? state.departures.find((d) => d.id === booking.departureId) : undefined;
  if (!booking || !dep) throw new Error("BOOKING_NOT_FOUND: Booking not found.");

  if (!["pending_payment", "deposit_paid", "expired"].includes(booking.status)) {
    throw new Error(
      `BOOKING_NOT_PAYABLE: This booking is ${booking.status.replace(/_/g, " ")} and cannot take a payment. Please contact us before paying.`
    );
  }
  if (booking.amountDuePaise <= 0) {
    throw new Error("NOTHING_DUE: Nothing is due on this booking.");
  }
  if (state.payments.some((p) => p.bookingId === booking.id && p.status === "submitted")) {
    throw new Error("ALREADY_WAITING: A payment for this booking is already waiting for our check.");
  }
  if (
    state.payments.some(
      (p) =>
        p.utr === utr &&
        (p.status === "submitted" || p.status === "captured" || p.status === "refunded")
    )
  ) {
    throw new Error("UTR_USED: This UPI reference number has already been used for a payment.");
  }

  const now = Date.now();
  let late = false;
  let lost = false;

  if (
    booking.status === "expired" ||
    (booking.status === "pending_payment" &&
      booking.holdExpiresAt !== null &&
      Date.parse(booking.holdExpiresAt) <= now)
  ) {
    // Paid after the hold ran out: take the seats again if they are still free.
    late = true;
    for (const sa of state.seatAllocations) {
      if (sa.bookingId === booking.id && sa.allocationStatus === "held") {
        sa.allocationStatus = "released";
      }
    }
    releaseExpiredHoldsDemo(state, dep.id);
    const active = activeSeatNumbers(state, dep.id);

    if (
      !dep.isPublished ||
      dep.status === "cancelled" ||
      dep.status === "completed" ||
      Date.parse(dep.bookingCutoffAt) < now ||
      (booking.bookingMode === "private_vehicle" && active.size > 0) ||
      active.size + booking.seatsRequested > dep.maxCapacity
    ) {
      lost = true;
      booking.status = "expired";
    } else {
      const free: number[] = [];
      for (let s = 1; s <= dep.maxCapacity && free.length < booking.seatsRequested; s++) {
        if (!active.has(s)) free.push(s);
      }
      for (const seatNumber of free) {
        state.seatAllocations.push({
          id: crypto.randomUUID(),
          departureId: dep.id,
          bookingId: booking.id,
          seatNumber,
          allocationStatus: "held",
          holdExpiresAt: null,
          reason: null,
        });
      }
      booking.status = "pending_payment";
      booking.holdExpiresAt = null;
    }
  } else if (booking.status === "pending_payment") {
    // Keep the seats until staff have checked the money (no silent expiry of a paying customer).
    booking.holdExpiresAt = null;
    for (const sa of state.seatAllocations) {
      if (sa.bookingId === booking.id && sa.allocationStatus === "held") {
        sa.holdExpiresAt = null;
      }
    }
  }
  booking.updatedAt = new Date().toISOString();

  const paymentType: PaymentRecord["paymentType"] =
    booking.amountPaidPaise > 0
      ? "balance"
      : booking.amountDuePaise < booking.totalPaise
        ? "deposit"
        : "full";

  const nowIso = new Date().toISOString();
  const payment: PaymentRow = {
    id: crypto.randomUUID(),
    bookingId: booking.id,
    provider: "upi",
    providerOrderId: null,
    providerPaymentId: null,
    idempotencyKey: `upi:${crypto.randomUUID()}`,
    amountPaise: booking.amountDuePaise,
    paymentType,
    status: "submitted",
    utr,
    paidToUpiId: state.upiSettings.upiId,
    paidToName: state.upiSettings.payeeName,
    submittedAt: nowIso,
    lateAfterHold: late,
    seatsLost: lost,
    reviewedAt: null,
    reviewNote: null,
    createdAt: nowIso,
  };
  state.payments.push(payment);

  recalculateDepartureStatusDemo(state, dep.id);
  audit(state, {
    actorUserId: null,
    actorRole: "customer",
    action: "upi_payment_submitted",
    entityType: "booking",
    entityId: booking.id,
    reason: lost
      ? "UPI reference sent after the hold expired; seats no longer free"
      : late
        ? "UPI reference sent after the hold expired; seats taken again"
        : "UPI reference sent; waiting for staff check",
    beforeState: null,
    afterState: {
      payment_id: payment.id,
      amount_paise: payment.amountPaise,
      utr_last4: utr.slice(-4),
      late,
      seats_lost: lost,
    },
  });

  return {
    paymentId: payment.id,
    amountPaise: payment.amountPaise,
    lateAfterHold: late,
    seatsLost: lost,
    bookingStatus: booking.status,
  };
}

export function reviewUpiPaymentDemo(
  params: {
    paymentId: string;
    decision: UpiReviewDecision;
    actorUserId: string;
    actorRole: string;
    note: string;
    retryMinutes?: number;
  },
  stateOverride?: DemoDatabaseState
): UpiReviewResult {
  const state = stateOverride ?? getDemoState();
  const note = (params.note ?? "").trim() || null;

  if (!["confirm", "reject_retry", "reject_cancel", "refund_late"].includes(params.decision)) {
    throw new Error(`BAD_DECISION: Unknown decision ${params.decision}.`);
  }
  if (params.actorRole !== "owner" && params.actorRole !== "ops") {
    throw new Error("NOT_ALLOWED: Only owner or operations staff can review payments.");
  }
  if (params.decision !== "confirm" && (!note || note.length < 5)) {
    throw new Error("NOTE_REQUIRED: Write what you found (at least 5 characters).");
  }

  const payment = state.payments.find((p) => p.id === params.paymentId);
  const booking = payment ? state.bookings.find((b) => b.id === payment.bookingId) : undefined;
  if (!payment || !booking) throw new Error("PAYMENT_NOT_FOUND: Payment not found.");

  if (payment.provider !== "upi") throw new Error("NOT_UPI: Only UPI payments are reviewed here.");
  if (payment.status !== "submitted") {
    throw new Error(`ALREADY_REVIEWED: This payment was already marked ${payment.status}.`);
  }

  const before = {
    booking_status: booking.status,
    amount_paid_paise: booking.amountPaidPaise,
    payment_status: payment.status,
  };
  const nowIso = new Date().toISOString();
  const markReviewed = (status: PaymentRecord["status"]) => {
    payment.status = status;
    payment.reviewedAt = nowIso;
    payment.reviewNote = note;
  };
  const releaseSeats = (statuses: SeatAllocRow["allocationStatus"][]) => {
    for (const sa of state.seatAllocations) {
      if (sa.bookingId === booking.id && statuses.includes(sa.allocationStatus)) {
        sa.allocationStatus = "released";
      }
    }
  };

  if (params.decision === "confirm") {
    if (
      payment.seatsLost ||
      !["pending_payment", "deposit_paid", "cancel_requested"].includes(booking.status)
    ) {
      throw new Error(
        `CANNOT_CONFIRM: The booking is ${booking.status.replace(/_/g, " ")} so this money cannot be applied to it. Refund the customer instead.`
      );
    }
    if (payment.amountPaise !== booking.amountDuePaise) {
      throw new Error(
        "AMOUNT_CHANGED: The amount due changed after this payment was sent. Check the booking before confirming."
      );
    }
    if (booking.status === "pending_payment") {
      const held = state.seatAllocations.filter(
        (sa) => sa.bookingId === booking.id && sa.allocationStatus === "held"
      ).length;
      if (held !== booking.seatsRequested) {
        throw new Error("SEATS_MISSING: The seats for this booking are no longer held.");
      }
    }

    markReviewed("captured");
    const newPaid = booking.amountPaidPaise + payment.amountPaise;
    const newDue = Math.max(0, booking.totalPaise - newPaid);
    booking.amountPaidPaise = newPaid;
    booking.amountDuePaise = newDue;
    booking.status =
      booking.status === "cancel_requested"
        ? "cancel_requested"
        : newDue === 0
          ? "confirmed"
          : "deposit_paid";
    booking.holdExpiresAt = null;
    booking.paymentProvider = "upi";
    for (const sa of state.seatAllocations) {
      if (sa.bookingId === booking.id && sa.allocationStatus === "held") {
        sa.allocationStatus = "confirmed";
        sa.holdExpiresAt = null;
      }
    }
  } else if (params.decision === "reject_retry") {
    if (payment.seatsLost) {
      throw new Error(
        "USE_REFUND: The seats for this late payment are gone. Mark it refunded or not received (cancel)."
      );
    }
    markReviewed("rejected");
    if (booking.status === "pending_payment") {
      // Fresh short window to send the correct reference; after that the seats free up as usual.
      const minutes = Math.max(5, Math.min(params.retryMinutes ?? 15, 60));
      const retryUntil = new Date(Date.now() + minutes * 60_000).toISOString();
      booking.holdExpiresAt = retryUntil;
      for (const sa of state.seatAllocations) {
        if (sa.bookingId === booking.id && sa.allocationStatus === "held") {
          sa.holdExpiresAt = retryUntil;
        }
      }
    } else if (booking.status === "cancel_requested" && booking.amountPaidPaise === 0) {
      booking.status = "cancelled";
      booking.holdExpiresAt = null;
      releaseSeats(["held"]);
    }
  } else if (params.decision === "reject_cancel") {
    if (booking.amountPaidPaise > 0) {
      throw new Error(
        'HAS_PAID_DEPOSIT: This booking already has money paid. Use "let customer retry" for this payment.'
      );
    }
    markReviewed("rejected");
    if (booking.status === "pending_payment" || booking.status === "cancel_requested") {
      booking.status = "cancelled";
      booking.holdExpiresAt = null;
      releaseSeats(["held", "confirmed"]);
    }
  } else {
    if (!payment.seatsLost) {
      throw new Error("NOT_LATE: Only late payments whose seats were gone can be marked refunded here.");
    }
    markReviewed("refunded");
    state.refunds.push({
      id: crypto.randomUUID(),
      bookingId: booking.id,
      paymentId: payment.id,
      amountPaise: payment.amountPaise,
      reason: note ?? "",
      processedBy: params.actorUserId,
      createdAt: nowIso,
    });
  }

  booking.updatedAt = nowIso;
  recalculateDepartureStatusDemo(state, booking.departureId);
  audit(state, {
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    action: `upi_payment_${params.decision}`,
    entityType: "booking",
    entityId: booking.id,
    reason: note ?? "Money seen in the account",
    beforeState: before,
    afterState: {
      payment_id: payment.id,
      payment_status: payment.status,
      amount_paise: payment.amountPaise,
      utr_last4: payment.utr?.slice(-4) ?? null,
    },
  });

  return {
    paymentStatus: payment.status,
    bookingStatus: booking.status,
    amountPaidPaise: booking.amountPaidPaise,
    amountDuePaise: booking.amountDuePaise,
  };
}

/** Customer cancels a booking they never paid for: seats free up at once. */
export function cancelUnpaidBookingDemo(
  bookingId: string,
  reason: string,
  stateOverride?: DemoDatabaseState
): boolean {
  const state = stateOverride ?? getDemoState();
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (
    !booking ||
    booking.status !== "pending_payment" ||
    booking.amountPaidPaise > 0 ||
    state.payments.some((p) => p.bookingId === booking.id && p.status === "submitted")
  ) {
    return false;
  }
  booking.status = "cancelled";
  booking.holdExpiresAt = null;
  booking.updatedAt = new Date().toISOString();
  for (const sa of state.seatAllocations) {
    if (sa.bookingId === booking.id && sa.allocationStatus === "held") {
      sa.allocationStatus = "released";
    }
  }
  recalculateDepartureStatusDemo(state, booking.departureId);
  audit(state, {
    actorUserId: null,
    actorRole: "customer",
    action: "customer_cancelled_unpaid",
    entityType: "booking",
    entityId: booking.id,
    reason,
    beforeState: { status: "pending_payment" },
    afterState: { status: "cancelled" },
  });
  return true;
}

export function hasWaitingPaymentDemo(bookingId: string, stateOverride?: DemoDatabaseState): boolean {
  const state = stateOverride ?? getDemoState();
  return state.payments.some((p) => p.bookingId === bookingId && p.status === "submitted");
}

export function toPaymentRecord(row: PaymentRecord): PaymentRecord {
  return {
    id: row.id,
    bookingId: row.bookingId,
    provider: row.provider,
    amountPaise: row.amountPaise,
    paymentType: row.paymentType,
    status: row.status,
    utr: row.utr,
    paidToUpiId: row.paidToUpiId,
    paidToName: row.paidToName,
    submittedAt: row.submittedAt,
    lateAfterHold: row.lateAfterHold,
    seatsLost: row.seatsLost,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
  };
}

export function getBookingPaymentsDemo(bookingId: string): PaymentRecord[] {
  return getDemoState()
    .payments.filter((p) => p.bookingId === bookingId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPaymentRecord);
}

export function getAdminPaymentRowsDemo(): AdminPaymentRow[] {
  const state = getDemoState();
  const avail = computePublicAvailabilityDemo(state);
  const depMap = new Map(avail.map((d) => [d.departureId, d]));
  const tripMap = new Map(state.trips.map((t) => [t.id, t]));
  return state.payments
    .slice()
    .sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt))
    .flatMap((p) => {
      const booking = state.bookings.find((b) => b.id === p.bookingId);
      if (!booking) return [];
      const dep =
        depMap.get(booking.departureId) ??
        state.departures.find((d) => d.id === booking.departureId);
      const trip = dep ? tripMap.get(dep.tripId) : undefined;
      return [
        {
          payment: toPaymentRecord(p),
          bookingId: booking.id,
          bookingReference: booking.bookingReference,
          bookingStatus: booking.status,
          bookingTotalPaise: booking.totalPaise,
          bookingPaidPaise: booking.amountPaidPaise,
          customerName: booking.customerName,
          customerEmail: booking.customerEmail,
          customerPhone: booking.customerPhone,
          tripTitle: trip?.title ?? "Unknown trip",
          departureCode: dep?.departureCode ?? "—",
          departureStartDate: dep?.startDate ?? "—",
          seatsRequested: booking.seatsRequested,
        },
      ];
    });
}
