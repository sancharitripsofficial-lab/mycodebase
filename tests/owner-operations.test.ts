/**
 * Owner operations on the real migrations (PGlite): seat choice, public seat map,
 * offline payments, refunds, trip crew and enquiry constraints.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMigratedDb, STAFF_USER_ID } from "./helpers/payment-backends";

let db: PGlite;
let tripId: string;
let n = 0;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}

const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const day = (days: number) => at(days).slice(0, 10);

async function newDeparture(max = 6): Promise<string> {
  n += 1;
  return (
    await one<{ id: string }>(
      `SELECT public.admin_save_departure(NULL,$1,$2,$3,$4,$5,1,'open_batch',$6,$7,NULL,true,$8,'owner') AS id`,
      [tripId, `OPS-${n}-${Date.now().toString(36).toUpperCase()}`, day(40), day(42), max, at(37), at(36), STAFF_USER_ID]
    )
  ).id;
}

async function hold(dep: string, seats: number, opts: { preferred?: number[]; mode?: string; totalPaise?: number; duePaise?: number } = {}) {
  const total = opts.totalPaise ?? 100_000 * seats;
  const due = opts.duePaise ?? total;
  const travelers = JSON.stringify(Array.from({ length: seats }, (_, i) => ({ fullName: `T${i}`, emergencyContact: "+919800000000" })));
  return one<{ booking_id: string; assigned_seats: number[] }>(
    `SELECT * FROM public.reserve_departure_seats($1,$2,NULL,'A','a@example.com','+919800000001',$3,$4,NULL,
       100000,$5,0,0,$5,$6,NULL,15,'{}'::jsonb,'{}'::jsonb,'upi',$7::jsonb,'open_mixed','',false,'v1',$8)`,
    [`SAN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, dep, opts.mode ?? "batch_seats", seats, total, due, travelers, opts.preferred ?? null]
  );
}

async function seatMap(dep: string): Promise<number[]> {
  return (await db.query<{ seat_number: number }>(`SELECT seat_number FROM public.get_departure_seat_map($1)`, [dep])).rows.map((r) => r.seat_number);
}

async function booking(id: string) {
  return one<{ status: string; amount_paid_paise: number; amount_due_paise: number; amount_refunded_paise: number }>(
    `SELECT status, amount_paid_paise, amount_due_paise, amount_refunded_paise FROM public.bookings WHERE id = $1`,
    [id]
  );
}

const recordPayment = (bookingId: string, amount: number, ref: string, role = "owner", method = "bank_transfer") =>
  one<{ booking_status: string; amount_paid_paise: number; amount_due_paise: number }>(
    `SELECT * FROM public.admin_record_payment($1,$2,$3,$4,$5,$6,'Paid at office')`,
    [bookingId, amount, method, ref, STAFF_USER_ID, role]
  );

const recordRefund = (bookingId: string, amount: number, ref: string, close: boolean, note = "Cancelled 10 days before") =>
  one<{ booking_status: string; amount_paid_paise: number; amount_refunded_paise: number }>(
    `SELECT * FROM public.admin_record_refund($1,$2,$3,$4,'owner',$5,$6)`,
    [bookingId, amount, ref, STAFF_USER_ID, note, close]
  );

beforeAll(async () => {
  db = await createMigratedDb();
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner@test.local')`, [STAFF_USER_ID]);
  tripId = (
    await one<{ id: string }>(
      `INSERT INTO public.trips (slug, title, destination, region, tagline, summary, duration_days, duration_nights,
         difficulty, vibe, base_price_paise, hero_image_url, is_published)
       VALUES ('ops-test','Ops','X','Y','t','s',3,2,'Easy','v',100000,'/x.jpg',true) RETURNING id`
    )
  ).id;
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("customers pick exact seats", () => {
  it("reserves exactly the seats picked (front + back window)", async () => {
    const dep = await newDeparture();
    const r = await hold(dep, 2, { preferred: [6, 1] });
    expect(r.assigned_seats).toEqual([1, 6]);
    expect(await seatMap(dep)).toEqual([1, 6]);
  });

  it("refuses a seat someone else already holds, and names it", async () => {
    const dep = await newDeparture();
    await hold(dep, 1, { preferred: [3] });
    await expect(hold(dep, 2, { preferred: [3, 4] })).rejects.toThrow(/SEAT_TAKEN: Seat 3 was just taken/);
    expect(await seatMap(dep)).toEqual([3]);
  });

  it("refuses wrong counts, duplicates and seats beyond the car", async () => {
    const dep = await newDeparture(4);
    await expect(hold(dep, 2, { preferred: [1] })).rejects.toThrow(/SEAT_COUNT/);
    await expect(hold(dep, 2, { preferred: [2, 2] })).rejects.toThrow(/SEAT_DUPLICATE/);
    await expect(hold(dep, 1, { preferred: [5] })).rejects.toThrow(/SEAT_INVALID/);
    expect(await seatMap(dep)).toEqual([]);
  });

  it("without a choice it still gives the lowest free seats; whole-car ignores choices", async () => {
    const dep = await newDeparture();
    expect((await hold(dep, 2)).assigned_seats).toEqual([1, 2]);
    const car = await newDeparture();
    expect((await hold(car, 6, { mode: "private_vehicle", preferred: [1, 2, 3, 4, 5, 6] })).assigned_seats).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("an expired unpaid hold frees its seats for others to pick", async () => {
    const dep = await newDeparture();
    const a = await hold(dep, 1, { preferred: [2] });
    await db.query(`UPDATE public.bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`, [a.booking_id]);
    await db.query(`UPDATE public.seat_allocations SET hold_expires_at = now() - interval '1 minute' WHERE booking_id = $1`, [a.booking_id]);
    expect(await seatMap(dep)).toEqual([]);
    expect((await hold(dep, 1, { preferred: [2] })).assigned_seats).toEqual([2]);
  });

  it("the public seat map hides unpublished dates", async () => {
    const dep = await newDeparture();
    await hold(dep, 1, { preferred: [1] });
    await db.query(`UPDATE public.departures SET is_published = false WHERE id = $1`, [dep]);
    expect(await seatMap(dep)).toEqual([]);
  });
});

describe("staff record offline payments", () => {
  it("full payment by bank transfer confirms the booking and its seats", async () => {
    const dep = await newDeparture();
    const b = await hold(dep, 2);
    const r = await recordPayment(b.booking_id, 200_000, `NEFT-${n}-A`);
    expect(r).toMatchObject({ booking_status: "confirmed", amount_paid_paise: 200_000, amount_due_paise: 0 });
    const seats = await one<{ c: number }>(`SELECT COUNT(*)::int c FROM public.seat_allocations WHERE booking_id = $1 AND allocation_status = 'confirmed'`, [b.booking_id]);
    expect(seats.c).toBe(2);
  });

  it("deposit then cash balance; amounts can never exceed the total", async () => {
    const dep = await newDeparture();
    const b = await hold(dep, 1, { totalPaise: 100_000, duePaise: 30_000 });
    await expect(recordPayment(b.booking_id, 10_000, `NEFT-${n}-low`)).rejects.toThrow(/AMOUNT_TOO_LOW/);
    expect(await recordPayment(b.booking_id, 30_000, `NEFT-${n}-dep`)).toMatchObject({ booking_status: "deposit_paid", amount_due_paise: 70_000 });
    await expect(recordPayment(b.booking_id, 70_001, `CASH-${n}-x`, "owner", "cash")).rejects.toThrow(/AMOUNT_TOO_HIGH/);
    expect(await recordPayment(b.booking_id, 70_000, `CASH-${n}-bal`, "owner", "cash")).toMatchObject({ booking_status: "confirmed", amount_paid_paise: 100_000 });
    await expect(recordPayment(b.booking_id, 1, `CASH-${n}-y`)).rejects.toThrow(/BOOKING_NOT_PAYABLE/);
  });

  it("a reference can be used once; support staff and expired holds are refused", async () => {
    const dep = await newDeparture();
    const a = await hold(dep, 1);
    const b = await hold(dep, 1);
    await recordPayment(a.booking_id, 100_000, `REF-${n}-dup`);
    await expect(recordPayment(b.booking_id, 100_000, `REF-${n}-dup`)).rejects.toThrow(/REFERENCE_USED/);
    await expect(recordPayment(b.booking_id, 100_000, `REF-${n}-ok`, "support")).rejects.toThrow(/NOT_ALLOWED/);
    await db.query(`UPDATE public.bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`, [b.booking_id]);
    await expect(recordPayment(b.booking_id, 100_000, `REF-${n}-late`)).rejects.toThrow(/HOLD_EXPIRED/);
  });

  it("is refused while a customer's UPI payment waits for a check (no double counting)", async () => {
    const dep = await newDeparture();
    const b = await hold(dep, 1);
    await db.query(`UPDATE public.upi_payment_settings SET is_enabled = true, upi_id = 'x.y@okaxis', payee_name = 'Test Payee' WHERE id = 1`);
    await one(`SELECT * FROM public.submit_upi_payment($1, $2)`, [b.booking_id, String(400000000000 + n)]);
    await expect(recordPayment(b.booking_id, 100_000, `REF-${n}-w`)).rejects.toThrow(/ALREADY_WAITING/);
  });
});

describe("staff record refunds", () => {
  it("partial refund keeps the booking; full refund with close frees the seats", async () => {
    const dep = await newDeparture();
    const b = await hold(dep, 2);
    await recordPayment(b.booking_id, 200_000, `PAY-${n}-r`);

    await expect(recordRefund(b.booking_id, 50_000, `RF-${n}-1`, false, "")).rejects.toThrow(/NOTE_REQUIRED/);
    expect(await recordRefund(b.booking_id, 50_000, `RF-${n}-1`, false)).toMatchObject({ booking_status: "confirmed", amount_refunded_paise: 50_000 });
    await expect(recordRefund(b.booking_id, 150_001, `RF-${n}-2`, true)).rejects.toThrow(/REFUND_TOO_HIGH/);
    expect(await recordRefund(b.booking_id, 150_000, `RF-${n}-2`, true)).toMatchObject({ booking_status: "refunded", amount_refunded_paise: 200_000 });
    expect(await seatMap(dep)).toEqual([]);
    const refunds = await one<{ c: number; s: number }>(`SELECT COUNT(*)::int c, SUM(amount_paise)::int s FROM public.refunds WHERE booking_id = $1`, [b.booking_id]);
    expect(refunds).toEqual({ c: 2, s: 200_000 });
  });

  it("closing with a partial refund marks it cancelled (not refunded) and frees seats", async () => {
    const dep = await newDeparture();
    const b = await hold(dep, 1);
    await recordPayment(b.booking_id, 100_000, `PAY-${n}-c`);
    expect(await recordRefund(b.booking_id, 80_000, `RF-${n}-c`, true, "80% slab, 10 days before")).toMatchObject({ booking_status: "cancelled" });
    expect((await booking(b.booking_id)).amount_refunded_paise).toBe(80_000);
    expect(await seatMap(dep)).toEqual([]);
  });

  it("nothing can be refunded on an unpaid booking", async () => {
    const dep = await newDeparture();
    const b = await hold(dep, 1);
    await expect(recordRefund(b.booking_id, 1, `RF-${n}-z`, true)).rejects.toThrow(/REFUND_TOO_HIGH/);
  });
});

describe("crew details and enquiries keep clean data", () => {
  it("only real WhatsApp group links and Indian mobiles are stored", async () => {
    const dep = await newDeparture();
    await expect(
      db.query(`INSERT INTO public.departure_ops_notes (departure_id, whatsapp_group_url) VALUES ($1, 'https://evil.example/join')`, [dep])
    ).rejects.toThrow(/check constraint/);
    await expect(db.query(`INSERT INTO public.departure_ops_notes (departure_id, driver_phone) VALUES ($1, '12345')`, [dep])).rejects.toThrow(/check constraint/);
    await db.query(
      `INSERT INTO public.departure_ops_notes (departure_id, driver_name, driver_phone, vehicle_number, whatsapp_group_url)
       VALUES ($1, 'Ravi', '9876543210', 'KA 01 AB 1234', 'https://chat.whatsapp.com/AbCdEfGhIjKlMn')`,
      [dep]
    );
  });

  it("enquiries need a name and a 10-digit mobile", async () => {
    await expect(db.query(`INSERT INTO public.enquiries (kind, full_name, phone) VALUES ('group', 'A', '9876543210')`)).rejects.toThrow(/check constraint/);
    await expect(db.query(`INSERT INTO public.enquiries (kind, full_name, phone) VALUES ('group', 'Asha', '98765')`)).rejects.toThrow(/check constraint/);
    await db.query(`INSERT INTO public.enquiries (kind, full_name, phone, group_size) VALUES ('private_date', 'Asha Rao', '9876543210', 6)`);
  });
});
