/**
 * Coupons and the creator programme on the real migrations: follower ranges, approving a
 * creator, personal one-time codes, limits under concurrency-safe locks, free seats that
 * confirm at once, and codes coming back when a booking expires or is cancelled.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMigratedDb, STAFF_USER_ID } from "./helpers/payment-backends";

let db: PGlite;
let tripId: string;
let otherTripId: string;
let n = 0;
const PRICE = 1_000_000; // ₹10,000 per seat

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}
const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const day = (days: number) => at(days).slice(0, 10);

async function newDeparture(trip = tripId): Promise<string> {
  n += 1;
  return (
    await one<{ id: string }>(
      `SELECT public.admin_save_departure(NULL,$1,$2,$3,$4,6,1,'open_batch',$5,$6,NULL,true,$7,'owner') AS id`,
      [trip, `CPN-${n}-${Date.now().toString(36).toUpperCase()}`, day(40), day(42), at(37), at(36), STAFF_USER_ID]
    )
  ).id;
}

async function coupon(fields: Record<string, unknown>): Promise<string> {
  const row = { kind: "public", discount_type: "percent", discount_value: 10, ...fields };
  const keys = Object.keys(row);
  return (
    await one<{ id: string }>(
      `INSERT INTO public.coupons (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      Object.values(row)
    )
  ).id;
}

async function check(code: string, opts: { seats?: number; base?: number; email?: string; phone?: string; trip?: string } = {}) {
  const seats = opts.seats ?? 1;
  return one<{ coupon_id: string; code: string; discount_paise: number; summary: string }>(
    `SELECT * FROM public.coupon_check($1,$2,$3,$4,$5,$6,$7,false)`,
    [code, opts.trip ?? tripId, seats, PRICE, opts.base ?? PRICE * seats, opts.email ?? "a@example.com", opts.phone ?? "9800000001"]
  );
}

/** Hold seats with a coupon the way the app does: quote first, then hold with that amount. */
async function holdWith(dep: string, code: string, opts: { seats?: number; email?: string; phone?: string; claimed?: number } = {}) {
  const seats = opts.seats ?? 1;
  const subtotal = PRICE * seats;
  const q = await check(code, { seats, base: subtotal, email: opts.email, phone: opts.phone });
  const discount = opts.claimed ?? Number(q.discount_paise);
  const total = subtotal - discount;
  const travelers = JSON.stringify(Array.from({ length: seats }, (_, i) => ({ fullName: `T${i}`, emergencyContact: "+919800000000" })));
  return one<{ booking_id: string; booking_status: string; coupon_discount_paise: number; hold_expires_at: string | null }>(
    `SELECT * FROM public.reserve_departure_seats_with_coupon($1,$2,$3,$4,NULL,'A',$5,$6,'batch_seats',$7,NULL,
       $8,$9,$10,0,$11,$11,NULL,15,'{}'::jsonb,'{}'::jsonb,'upi',$12::jsonb,'open_mixed','',false,'v1',NULL)`,
    [
      code,
      discount,
      `SAN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      dep,
      opts.email ?? "a@example.com",
      opts.phone ?? "9800000001",
      seats,
      PRICE,
      subtotal,
      discount,
      total,
      travelers,
    ]
  );
}

async function redemption(bookingId: string) {
  return one<{ status: string }>(`SELECT status FROM public.coupon_redemptions WHERE booking_id = $1`, [bookingId]);
}

beforeAll(async () => {
  db = await createMigratedDb();
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner@test.local')`, [STAFF_USER_ID]);
  const mk = async (slug: string) =>
    (
      await one<{ id: string }>(
        `INSERT INTO public.trips (slug, title, destination, region, tagline, summary, duration_days, duration_nights,
           difficulty, vibe, base_price_paise, hero_image_url, is_published)
         VALUES ($1,'Trip','X','Y','t','s',3,2,'Easy','v',$2,'/x.jpg',true) RETURNING id`,
        [slug, PRICE]
      )
    ).id;
  tripId = await mk("coupon-trip");
  otherTripId = await mk("other-trip");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("coupon rules", () => {
  it("percent (with cap), flat and free seats are worked out by the database", async () => {
    await coupon({ code: "PCT20", discount_value: 20, max_discount_paise: 300_000 });
    await coupon({ code: "FLAT500", discount_type: "flat", discount_value: 50_000 });
    await coupon({ code: "FREE1", discount_type: "free_seats", discount_value: 1 });
    expect((await check("pct20", { seats: 1 })).discount_paise).toBe(200_000); // 20% of ₹10,000
    expect((await check("PCT20", { seats: 3 })).discount_paise).toBe(300_000); // capped at ₹3,000
    expect((await check(" flat500 ")).discount_paise).toBe(50_000);
    expect((await check("FREE1", { seats: 2 })).discount_paise).toBe(PRICE);
    expect((await check("FREE1", { seats: 1, base: 600_000 })).discount_paise).toBe(600_000); // never more than the price
  });

  it("refuses unknown, switched-off, not-started, expired, other-trip and too-small orders", async () => {
    await coupon({ code: "OFFCODE", is_active: false });
    await coupon({ code: "LATER1", valid_from: at(2) });
    await coupon({ code: "OLD1", valid_from: at(-10), valid_until: at(-1) });
    await coupon({ code: "OTHERTRIP", trip_id: otherTripId });
    await coupon({ code: "BIGONLY", min_order_paise: 5_000_000 });
    await expect(check("NOPE")).rejects.toThrow(/COUPON_UNKNOWN/);
    await expect(check("OFFCODE")).rejects.toThrow(/COUPON_UNKNOWN/);
    await expect(check("LATER1")).rejects.toThrow(/COUPON_NOT_STARTED/);
    await expect(check("OLD1")).rejects.toThrow(/COUPON_EXPIRED/);
    await expect(check("OTHERTRIP")).rejects.toThrow(/COUPON_OTHER_TRIP/);
    await expect(check("BIGONLY")).rejects.toThrow(/COUPON_MIN_ORDER/);
  });

  it("a total use limit and one use per customer hold, and a held code comes back when the booking expires", async () => {
    await coupon({ code: "TWOUSES", max_redemptions: 2 });
    const dep = await newDeparture();
    const b1 = await holdWith(dep, "TWOUSES", { email: "one@example.com", phone: "9800000011" });
    expect(b1.booking_status).toBe("pending_payment");
    await expect(holdWith(dep, "TWOUSES", { email: "ONE@example.com", phone: "9800000099" })).rejects.toThrow(/COUPON_ALREADY_USED/);
    await expect(holdWith(dep, "TWOUSES", { email: "x@example.com", phone: "+91 98000 00011" })).rejects.toThrow(/COUPON_ALREADY_USED/);
    await holdWith(dep, "TWOUSES", { email: "two@example.com", phone: "9800000012" });
    await expect(holdWith(dep, "TWOUSES", { email: "three@example.com", phone: "9800000013" })).rejects.toThrow(/COUPON_USED_UP/);

    await db.query(`UPDATE public.bookings SET status = 'expired' WHERE id = $1`, [b1.booking_id]);
    expect((await redemption(b1.booking_id)).status).toBe("released");
    const b3 = await holdWith(dep, "TWOUSES", { email: "three@example.com", phone: "9800000013" });
    expect(b3.booking_status).toBe("pending_payment");
  });

  it("refuses a tampered amount and rolls the whole hold back", async () => {
    await coupon({ code: "TEN10", discount_value: 10 });
    const dep = await newDeparture();
    await expect(holdWith(dep, "TEN10", { claimed: 900_000 })).rejects.toThrow(/COUPON_CHANGED/);
    const seats = await one<{ c: number }>(`SELECT COUNT(*)::int AS c FROM public.seat_allocations WHERE departure_id = $1`, [dep]);
    expect(seats.c).toBe(0);
  });

  it("paying turns the redemption into used; a full free seat confirms at once with nothing to pay", async () => {
    await coupon({ code: "HALFOFF", discount_value: 50 });
    await coupon({ code: "FREESEAT", discount_type: "free_seats", discount_value: 1 });
    const dep = await newDeparture();
    const paid = await holdWith(dep, "HALFOFF", { email: "p@example.com", phone: "9800000021" });
    await db.query(`UPDATE public.bookings SET status = 'confirmed' WHERE id = $1`, [paid.booking_id]);
    expect((await redemption(paid.booking_id)).status).toBe("used");

    const free = await holdWith(dep, "FREESEAT", { email: "f@example.com", phone: "9800000022" });
    expect(free.booking_status).toBe("confirmed");
    expect(free.hold_expires_at).toBeNull();
    expect((await redemption(free.booking_id)).status).toBe("used");
    const seat = await one<{ allocation_status: string }>(`SELECT allocation_status FROM public.seat_allocations WHERE booking_id = $1`, [free.booking_id]);
    expect(seat.allocation_status).toBe("confirmed");
    const b = await one<{ coupon_code: string; coupon_discount_paise: number; total_paise: number }>(
      `SELECT coupon_code, coupon_discount_paise, total_paise FROM public.bookings WHERE id = $1`,
      [free.booking_id]
    );
    expect(b).toEqual({ coupon_code: "FREESEAT", coupon_discount_paise: PRICE, total_paise: 0 });

    await db.query(`UPDATE public.bookings SET status = 'cancelled' WHERE id = $1`, [free.booking_id]);
    expect((await redemption(free.booking_id)).status).toBe("released");
  });
});

describe("creator programme", () => {
  it("follower ranges cannot overlap", async () => {
    await db.query(`INSERT INTO public.influencer_tiers (label, min_followers, max_followers, discount_type, discount_value) VALUES
      ('Rising', 10000, 49999, 'percent', 25), ('Pro', 50000, 199999, 'flat', 200000), ('Star', 200000, NULL, 'free_seats', 1)`);
    await expect(
      db.query(`INSERT INTO public.influencer_tiers (label, min_followers, max_followers, discount_type, discount_value) VALUES ('Clash', 40000, 60000, 'percent', 30)`)
    ).rejects.toThrow(/TIER_OVERLAP/);
    // A switched-off range may overlap (kept for history).
    await db.query(`INSERT INTO public.influencer_tiers (label, min_followers, max_followers, discount_type, discount_value, is_active) VALUES ('Old', 40000, 60000, 'percent', 30, false)`);
  });

  async function apply(email: string, phone: string): Promise<string> {
    return (
      await one<{ id: string }>(
        `INSERT INTO public.influencer_applications (full_name, phone, email, platform, profile_url, followers_claimed)
         VALUES ('Asha Creator', $1, $2, 'instagram', 'https://www.instagram.com/asha', 80000) RETURNING id`,
        [phone, email]
      )
    ).id;
  }

  const approve = (id: string, followers: number, code: string, role = "owner") =>
    one<{ code: string; tier_label: string; discount_type: string; discount_value: number; valid_until: string }>(
      `SELECT * FROM public.admin_approve_creator($1,$2,$3,$4,$5,'Checked profile')`,
      [id, followers, code, STAFF_USER_ID, role]
    );

  it("approving uses the VERIFIED follower count to pick the range and issues a personal one-time code", async () => {
    const appId = await apply("asha@example.com", "9811111111");
    await expect(approve(appId, 60000, "ASHA-IG", "support")).rejects.toThrow(/NOT_ALLOWED/);
    const r = await approve(appId, 62000, "asha-ig");
    expect(r).toMatchObject({ code: "ASHA-IG", tier_label: "Pro", discount_type: "flat", discount_value: 200000 });
    await expect(approve(appId, 62000, "ASHA-IG2")).rejects.toThrow(/ALREADY_DECIDED/);

    // Only Asha can use it, once.
    await expect(check("ASHA-IG", { email: "someone@example.com", phone: "9822222222" })).rejects.toThrow(/COUPON_PERSONAL/);
    expect((await check("ASHA-IG", { email: "Asha@Example.com", phone: "9822222222" })).discount_paise).toBe(200000);
    const dep = await newDeparture();
    await holdWith(dep, "ASHA-IG", { email: "asha@example.com", phone: "9811111111" });
    await expect(holdWith(dep, "ASHA-IG", { email: "asha@example.com", phone: "9811111111" })).rejects.toThrow(/COUPON_USED_UP|COUPON_ALREADY_USED/);
  });

  it("refuses when no range covers the follower count, and refuses a code that already exists", async () => {
    const small = await apply("small@example.com", "9833333333");
    await expect(approve(small, 900, "SMALL-1")).rejects.toThrow(/NO_TIER/);
    const star = await apply("star@example.com", "9844444444");
    await expect(approve(star, 450000, "ASHA-IG")).rejects.toThrow(/CODE_TAKEN/);
    const ok = await approve(star, 450000, "STAR-YT");
    expect(ok).toMatchObject({ tier_label: "Star", discount_type: "free_seats", discount_value: 1 });
  });
});
