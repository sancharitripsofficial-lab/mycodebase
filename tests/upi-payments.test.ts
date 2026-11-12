/**
 * Every UPI money flow, run against BOTH the real Postgres migrations (PGlite) and the
 * in-memory store. If either implementation breaks a rule, the matching test fails.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createLocalBackend,
  createPostgresBackend,
  newUtr,
  type PaymentBackend,
} from "./helpers/payment-backends";

const backends: { label: string; create: () => Promise<PaymentBackend> | PaymentBackend; shared: boolean }[] = [
  { label: "postgres (Supabase migrations)", create: createPostgresBackend, shared: true },
  { label: "local preview store", create: createLocalBackend, shared: false },
];

for (const { label, create, shared } of backends) {
  describe(`UPI payments — ${label}`, () => {
    let be: PaymentBackend;
    let dep: string;

    beforeAll(async () => {
      if (shared) be = await create();
    }, 60_000);

    afterAll(async () => {
      await be?.close();
    });

    beforeEach(async () => {
      if (!shared) be = await create();
      await be.setUpi(true);
      dep = await be.newDeparture();
    });

    it("refuses a reference that is not exactly 12 digits", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 1 });
      await expect(be.submit(bookingId, "12345")).rejects.toThrow(/UTR_FORMAT/);
      await expect(be.submit(bookingId, "T2311ABCDEF12")).rejects.toThrow(/UTR_FORMAT/);
      await expect(be.submit(bookingId, "1234567890123")).rejects.toThrow(/UTR_FORMAT/);
    });

    it("accepts a reference typed with spaces and stores it clean", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 1 });
      const utr = newUtr();
      const spaced = `${utr.slice(0, 4)} ${utr.slice(4, 8)} ${utr.slice(8)}`;
      const r = await be.submit(bookingId, spaced);
      expect((await be.payment(r.paymentId)).utr).toBe(utr);
    });

    it("refuses payments while UPI is switched off", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 1 });
      await be.setUpi(false);
      await expect(be.submit(bookingId, newUtr())).rejects.toThrow(/UPI_DISABLED/);
    });

    it("full payment: seats stay held until checked, then confirm makes the booking confirmed", async () => {
      const { bookingId, totalPaise } = await be.hold({ departureId: dep, seats: 2 });
      const r = await be.submit(bookingId, newUtr());

      expect(r.amountPaise).toBe(totalPaise); // server decides the amount, never the browser
      expect(r.lateAfterHold).toBe(false);
      const pay = await be.payment(r.paymentId);
      expect(pay).toMatchObject({ status: "submitted", paymentType: "full", amountPaise: 2_000_000 });

      const waiting = await be.booking(bookingId);
      expect(waiting).toMatchObject({ status: "pending_payment", holdExpiresAt: null, heldSeatsWithoutExpiry: 2 });
      expect(await be.seatsTaken(dep)).toBe(2);

      // Nobody can take those 2 seats while the payment waits for a check
      await expect(be.hold({ departureId: dep, seats: 5 })).rejects.toThrow(/Insufficient seats/);

      const done = await be.review(r.paymentId, "confirm");
      expect(done).toMatchObject({
        paymentStatus: "captured",
        bookingStatus: "confirmed",
        amountPaidPaise: totalPaise,
        amountDuePaise: 0,
      });
      expect(await be.booking(bookingId)).toMatchObject({ confirmedSeats: 2, heldSeats: 0 });
      expect(await be.seatsTaken(dep)).toBe(2);

      // A double click / second staff member cannot apply the money twice
      await expect(be.review(r.paymentId, "confirm")).rejects.toThrow(/ALREADY_REVIEWED/);
      expect((await be.booking(bookingId)).amountPaidPaise).toBe(totalPaise);
    });

    it("one UPI reference can pay only one booking, ever", async () => {
      const a = await be.hold({ departureId: dep, seats: 1 });
      const b = await be.hold({ departureId: dep, seats: 1 });
      const utr = newUtr();
      const ra = await be.submit(a.bookingId, utr);
      await expect(be.submit(b.bookingId, utr)).rejects.toThrow(/UTR_USED/);
      await be.review(ra.paymentId, "confirm");
      await expect(be.submit(b.bookingId, utr)).rejects.toThrow(/UTR_USED/);
    });

    it("a booking can have only one payment waiting for a check", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 1 });
      await be.submit(bookingId, newUtr());
      await expect(be.submit(bookingId, newUtr())).rejects.toThrow(/ALREADY_WAITING/);
    });

    it("deposit first, balance later: amounts add up exactly", async () => {
      const { bookingId, amountDuePaise, totalPaise } = await be.hold({ departureId: dep, seats: 3, deposit: true });
      expect(totalPaise).toBe(3_000_000);
      expect(amountDuePaise).toBe(900_000); // 30%

      const dep1 = await be.submit(bookingId, newUtr());
      expect(await be.payment(dep1.paymentId)).toMatchObject({ paymentType: "deposit", amountPaise: 900_000 });
      expect(await be.review(dep1.paymentId, "confirm")).toMatchObject({
        bookingStatus: "deposit_paid",
        amountPaidPaise: 900_000,
        amountDuePaise: 2_100_000,
      });
      expect(await be.booking(bookingId)).toMatchObject({ confirmedSeats: 3 });

      const bal = await be.submit(bookingId, newUtr());
      expect(await be.payment(bal.paymentId)).toMatchObject({ paymentType: "balance", amountPaise: 2_100_000 });
      expect(await be.review(bal.paymentId, "confirm")).toMatchObject({
        bookingStatus: "confirmed",
        amountPaidPaise: 3_000_000,
        amountDuePaise: 0,
      });
      await expect(be.submit(bookingId, newUtr())).rejects.toThrow(/BOOKING_NOT_PAYABLE|NOTHING_DUE/);
    });

    it("not received → customer gets a fresh window and can resend (even the same number)", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 2 });
      const utr = newUtr();
      const first = await be.submit(bookingId, utr);

      await expect(be.review(first.paymentId, "reject_retry", "")).rejects.toThrow(/NOTE_REQUIRED/);
      const r = await be.review(first.paymentId, "reject_retry", "Not in bank statement yet");
      expect(r).toMatchObject({ paymentStatus: "rejected", bookingStatus: "pending_payment" });

      const b = await be.booking(bookingId);
      expect(b.heldSeats).toBe(2);
      const minutesLeft = (Date.parse(b.holdExpiresAt!) - Date.now()) / 60_000;
      expect(minutesLeft).toBeGreaterThan(14);
      expect(minutesLeft).toBeLessThanOrEqual(15.1);

      const again = await be.submit(bookingId, utr);
      expect((await be.payment(again.paymentId)).status).toBe("submitted");
    });

    it("not received → cancel booking frees the seats", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 3 });
      const r = await be.submit(bookingId, newUtr());
      expect(await be.seatsTaken(dep)).toBe(3);
      const out = await be.review(r.paymentId, "reject_cancel", "Customer sent a fake reference");
      expect(out).toMatchObject({ paymentStatus: "rejected", bookingStatus: "cancelled" });
      expect(await be.seatsTaken(dep)).toBe(0);
      await expect(be.submit(bookingId, newUtr())).rejects.toThrow(/BOOKING_NOT_PAYABLE/);
    });

    it("cancel is refused once a deposit is paid; the balance payment can only be rejected", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 1, deposit: true });
      const d = await be.submit(bookingId, newUtr());
      await be.review(d.paymentId, "confirm");
      const bal = await be.submit(bookingId, newUtr());
      await expect(be.review(bal.paymentId, "reject_cancel", "Balance not received")).rejects.toThrow(
        /HAS_PAID_DEPOSIT/
      );
      const r = await be.review(bal.paymentId, "reject_retry", "Balance not received");
      expect(r).toMatchObject({ paymentStatus: "rejected", bookingStatus: "deposit_paid", amountPaidPaise: 300_000 });
      expect(await be.booking(bookingId)).toMatchObject({ confirmedSeats: 1 });
    });

    it("paid after the hold ran out, seats still free → seats taken again, booking kept", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 2 });
      await be.expireHold(bookingId);
      const r = await be.submit(bookingId, newUtr());
      expect(r).toMatchObject({ lateAfterHold: true, seatsLost: false, bookingStatus: "pending_payment" });
      expect(await be.booking(bookingId)).toMatchObject({ heldSeatsWithoutExpiry: 2 });
      expect(await be.seatsTaken(dep)).toBe(2);
      expect(await be.review(r.paymentId, "confirm")).toMatchObject({ bookingStatus: "confirmed" });
    });

    it("paid after the hold ran out and someone else took the seats → flagged for refund, never overbooked", async () => {
      dep = await be.newDeparture({ blockedSeats: 2 });
      const a = await be.hold({ departureId: dep, seats: 4 });
      await be.expireHold(a.bookingId);
      await be.hold({ departureId: dep, seats: 4 }); // B takes the freed seats
      expect(await be.seatsTaken(dep)).toBe(6);

      const r = await be.submit(a.bookingId, newUtr());
      expect(r).toMatchObject({ lateAfterHold: true, seatsLost: true, bookingStatus: "expired" });
      expect(await be.seatsTaken(dep)).toBe(6);

      await expect(be.review(r.paymentId, "confirm")).rejects.toThrow(/CANNOT_CONFIRM/);
      await expect(be.review(r.paymentId, "reject_retry", "Seats were gone")).rejects.toThrow(/USE_REFUND/);
      const out = await be.review(r.paymentId, "refund_late", "Refunded via UPI to customer");
      expect(out.paymentStatus).toBe("refunded");
      expect(await be.refundCount(r.paymentId)).toBe(1);
      expect(await be.seatsTaken(dep)).toBe(6);
    });

    it("whole-car booking paid late loses the car if anyone booked a seat meanwhile", async () => {
      const car = await be.hold({ departureId: dep, seats: 6, mode: "private_vehicle" });
      expect(car.totalPaise).toBe(5_400_000);
      await be.expireHold(car.bookingId);
      await be.hold({ departureId: dep, seats: 1 });
      const r = await be.submit(car.bookingId, newUtr());
      expect(r.seatsLost).toBe(true);
      expect(await be.seatsTaken(dep)).toBe(1);
    });

    it("refund is only for late payments whose seats were gone", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 1 });
      const r = await be.submit(bookingId, newUtr());
      await expect(be.review(r.paymentId, "refund_late", "Trying to refund")).rejects.toThrow(/NOT_LATE/);
    });

    it("support staff cannot approve or reject money", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 1 });
      const r = await be.submit(bookingId, newUtr());
      await expect(be.review(r.paymentId, "confirm", "", "support")).rejects.toThrow(/NOT_ALLOWED/);
      expect((await be.payment(r.paymentId)).status).toBe("submitted");
    });

    it("confirm is blocked if the amount due changed after the customer paid", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 1 });
      const r = await be.submit(bookingId, newUtr());
      await be.setAmountDue(bookingId, 1);
      await expect(be.review(r.paymentId, "confirm")).rejects.toThrow(/AMOUNT_CHANGED/);
    });

    it("customer cancelling an unpaid booking frees seats at once; cancelled bookings take no money", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 2 });
      expect(await be.seatsTaken(dep)).toBe(2);
      expect(await be.cancelUnpaid(bookingId)).toBe(true);
      expect(await be.seatsTaken(dep)).toBe(0);
      await expect(be.submit(bookingId, newUtr())).rejects.toThrow(/BOOKING_NOT_PAYABLE/);
    });

    it("an unpaid booking with a payment waiting is not auto-cancelled", async () => {
      const { bookingId } = await be.hold({ departureId: dep, seats: 2 });
      await be.submit(bookingId, newUtr());
      expect(await be.cancelUnpaid(bookingId)).toBe(false);
      expect(await be.seatsTaken(dep)).toBe(2);
    });
  });
}
