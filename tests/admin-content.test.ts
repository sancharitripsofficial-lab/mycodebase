/**
 * Admin content rules, run against the real migrations in PGlite (in-process Postgres 17).
 * Departures, trips and pickup points must never lose seats, bookings or money.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMigratedDb, STAFF_USER_ID } from "./helpers/payment-backends";

let db: PGlite;
let tripId: string;
let pickupId: string;
let counter = 0;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params);
  return r.rows[0];
}

function code(): string {
  counter += 1;
  return `T-${Date.now().toString(36).toUpperCase()}-${counter}`;
}

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const at = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

async function saveDeparture(over: Partial<{
  id: string | null;
  code: string;
  start: string;
  end: string;
  max: number;
  min: number;
  type: string;
  cutoff: string;
  pref: string;
  price: number | null;
  role: string;
}> = {}) {
  const r = await one<{ id: string }>(
    `SELECT public.admin_save_departure($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$13) AS id`,
    [
      over.id ?? null,
      tripId,
      over.code ?? code(),
      over.start ?? day(40),
      over.end ?? day(42),
      over.max ?? 6,
      over.min ?? 3,
      over.type ?? "open_batch",
      over.cutoff ?? at(37),
      over.pref ?? at(36),
      over.price ?? null,
      STAFF_USER_ID,
      over.role ?? "owner",
    ]
  );
  return r.id;
}

async function hold(departureId: string, seats: number, ref = `SAN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`) {
  const travelers = JSON.stringify(
    Array.from({ length: seats }, (_, i) => ({ fullName: `T${i}`, emergencyContact: "+919800000000" }))
  );
  const r = await one<{ booking_id: string }>(
    `SELECT * FROM public.reserve_departure_seats($1,$2,NULL,'A','a@example.com','+919800000001','batch_seats',$3,$4,
       100000,100000,0,0,100000,100000,NULL,15,'{}'::jsonb,'{}'::jsonb,'upi',$5::jsonb,'open_mixed','',false,'v1')`,
    [ref, departureId, seats, pickupId, travelers]
  );
  return r.booking_id;
}

async function seatsInUse(departureId: string) {
  return (await one<{ n: number }>(`SELECT public.admin_seats_in_use($1) AS n`, [departureId])).n;
}

describe("admin content rules (real migrations)", () => {
  beforeAll(async () => {
    db = await createMigratedDb();
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner@test.local')`, [STAFF_USER_ID]);
    tripId = (
      await one<{ id: string }>(
        `INSERT INTO public.trips (slug, title, destination, region, tagline, summary, duration_days, duration_nights,
           difficulty, vibe, base_price_paise, hero_image_url, is_published)
         VALUES ('admin-test', 'Admin Test', 'X', 'Y', 't', 's', 3, 2, 'Easy', 'v', 100000, '/x.jpg', true) RETURNING id`
      )
    ).id;
    pickupId = (
      await one<{ id: string }>(
        `INSERT INTO public.pickup_points (trip_id, name, area, pickup_time_label) VALUES ($1, 'Hub', 'East', '6 AM') RETURNING id`,
        [tripId]
      )
    ).id;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(() => {
    counter += 1;
  });

  it("creates a departure and rejects nonsense dates, capacities and deadlines", async () => {
    const id = await saveDeparture();
    const row = await one<{ status: string; max_capacity: number }>(`SELECT status, max_capacity FROM public.departures WHERE id = $1`, [id]);
    expect(row).toEqual({ status: "open", max_capacity: 6 });

    await expect(saveDeparture({ start: day(40), end: day(39) })).rejects.toThrow(/BAD_DATES/);
    await expect(saveDeparture({ max: 7 })).rejects.toThrow(/BAD_CAPACITY/);
    await expect(saveDeparture({ max: 4, min: 5 })).rejects.toThrow(/BAD_MIN/);
    await expect(saveDeparture({ cutoff: at(41) })).rejects.toThrow(/BAD_CUTOFF/);
    await expect(saveDeparture({ cutoff: at(37), pref: at(38) })).rejects.toThrow(/BAD_PREF_DEADLINE/);
    await expect(saveDeparture({ code: "bad code!" })).rejects.toThrow(/BAD_CODE/);
    await expect(saveDeparture({ role: "support" })).rejects.toThrow(/NOT_ALLOWED/);
  });

  it("codes are stored in capitals and must be unique", async () => {
    const c = `dup-${counter}`;
    const id = await saveDeparture({ code: c });
    expect((await one<{ departure_code: string }>(`SELECT departure_code FROM public.departures WHERE id = $1`, [id])).departure_code).toBe(c.toUpperCase());
    await expect(saveDeparture({ code: c })).rejects.toThrow(/duplicate key|unique/i);
  });

  it("seats per car can never go below seats already taken", async () => {
    const id = await saveDeparture();
    await hold(id, 3);
    await expect(saveDeparture({ id, max: 2, min: 1 })).rejects.toThrow(/CAPACITY_BELOW_TAKEN/);
    await saveDeparture({ id, max: 3, min: 1 });
    expect((await one<{ seats_remaining: number }>(`SELECT seats_remaining FROM public.get_departure_availability(NULL) WHERE departure_id = $1`, [id])).seats_remaining).toBe(0);
  });

  it("shrinking the car moves high seat numbers down instead of losing them", async () => {
    const id = await saveDeparture();
    const a = await hold(id, 2); // seats 1,2
    const b = await hold(id, 2); // seats 3,4
    // free seats 1 and 2 by cancelling booking a
    await db.query(`UPDATE public.seat_allocations SET allocation_status = 'released' WHERE booking_id = $1`, [a]);
    await db.query(`UPDATE public.bookings SET status = 'cancelled' WHERE id = $1`, [a]);
    await saveDeparture({ id, max: 2, min: 1 });
    const seats = await db.query<{ seat_number: number }>(
      `SELECT seat_number FROM public.seat_allocations WHERE booking_id = $1 AND allocation_status = 'held' ORDER BY 1`,
      [b]
    );
    expect(seats.rows.map((r) => r.seat_number)).toEqual([1, 2]);
    expect(await seatsInUse(id)).toBe(2);
  });

  it("expired unpaid holds don't block shrinking", async () => {
    const id = await saveDeparture();
    const a = await hold(id, 4);
    await db.query(`UPDATE public.bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`, [a]);
    await db.query(`UPDATE public.seat_allocations SET hold_expires_at = now() - interval '1 minute' WHERE booking_id = $1`, [a]);
    await saveDeparture({ id, max: 2, min: 1 });
    expect((await one<{ status: string }>(`SELECT status FROM public.bookings WHERE id = $1`, [a])).status).toBe("expired");
  });

  it("cancelling a date frees unpaid holds, counts paid bookings, and blocks new holds; reopening allows them", async () => {
    const id = await saveDeparture();
    const unpaid = await hold(id, 2);
    const paid = await hold(id, 1);
    await db.query(`UPDATE public.bookings SET amount_paid_paise = 100000, amount_due_paise = 0, status = 'confirmed' WHERE id = $1`, [paid]);
    await db.query(`UPDATE public.seat_allocations SET allocation_status = 'confirmed', hold_expires_at = NULL WHERE booking_id = $1`, [paid]);

    await expect(
      one(`SELECT * FROM public.admin_set_departure_status($1, 'cancelled', $2, 'owner', '')`, [id, STAFF_USER_ID])
    ).rejects.toThrow(/NOTE_REQUIRED/);
    const r = await one<{ status: string; released_unpaid_holds: number; paid_bookings_to_handle: number }>(
      `SELECT * FROM public.admin_set_departure_status($1, 'cancelled', $2, 'owner', 'Heavy rain alert on ghats')`,
      [id, STAFF_USER_ID]
    );
    expect(r).toEqual({ status: "cancelled", released_unpaid_holds: 1, paid_bookings_to_handle: 1 });
    expect((await one<{ status: string }>(`SELECT status FROM public.bookings WHERE id = $1`, [unpaid])).status).toBe("cancelled");
    expect((await one<{ status: string }>(`SELECT status FROM public.bookings WHERE id = $1`, [paid])).status).toBe("confirmed");
    await expect(hold(id, 1)).rejects.toThrow(/not open for booking/);

    await one(`SELECT * FROM public.admin_set_departure_status($1, 'open', $2, 'owner', 'Weather cleared')`, [id, STAFF_USER_ID]);
    await expect(hold(id, 1)).resolves.toBeTruthy();
  });

  it("a date with bookings cannot be deleted; an unused one can", async () => {
    const used = await saveDeparture();
    await hold(used, 1);
    await expect(one(`SELECT public.admin_delete_departure($1, $2, 'owner')`, [used, STAFF_USER_ID])).rejects.toThrow(/HAS_BOOKINGS/);
    const unused = await saveDeparture();
    await one(`SELECT public.admin_delete_departure($1, $2, 'owner')`, [unused, STAFF_USER_ID]);
    expect((await db.query(`SELECT 1 FROM public.departures WHERE id = $1`, [unused])).rows).toHaveLength(0);
  });

  it("a date with bookings cannot move to another trip", async () => {
    const id = await saveDeparture();
    await hold(id, 1);
    const other = (
      await one<{ id: string }>(
        `INSERT INTO public.trips (slug, title, destination, region, tagline, summary, duration_days, duration_nights,
           difficulty, vibe, base_price_paise, hero_image_url) VALUES ($1, 'Other', 'X','Y','t','s',2,1,'Easy','v',1,'/y.jpg') RETURNING id`,
        [`other-${counter}`]
      )
    ).id;
    await expect(
      one(`SELECT public.admin_save_departure($1,$2,$3,$4,$5,6,3,'open_batch',$6,$7,NULL,true,$8,'owner')`, [
        id, other, code(), day(40), day(42), at(37), at(36), STAFF_USER_ID,
      ])
    ).rejects.toThrow(/HAS_BOOKINGS/);
  });

  it("a trip with bookings cannot be deleted; a pickup point used by a live booking cannot be deleted", async () => {
    await expect(one(`SELECT public.admin_delete_trip($1, $2, 'owner')`, [tripId, STAFF_USER_ID])).rejects.toThrow(/HAS_BOOKINGS/);
    await expect(one(`SELECT public.admin_delete_pickup($1, $2, 'owner')`, [pickupId, STAFF_USER_ID])).rejects.toThrow(/IN_USE/);

    const spare = (
      await one<{ id: string }>(`INSERT INTO public.pickup_points (trip_id, name, area, pickup_time_label) VALUES ($1,'Spare','W','7 AM') RETURNING id`, [tripId])
    ).id;
    await one(`SELECT public.admin_delete_pickup($1, $2, 'owner')`, [spare, STAFF_USER_ID]);

    const empty = (
      await one<{ id: string }>(
        `INSERT INTO public.trips (slug, title, destination, region, tagline, summary, duration_days, duration_nights,
           difficulty, vibe, base_price_paise, hero_image_url) VALUES ($1,'Empty','X','Y','t','s',2,1,'Easy','v',1,'/y.jpg') RETURNING id`,
        [`empty-${counter}`]
      )
    ).id;
    await one(`SELECT public.admin_delete_trip($1, $2, 'owner')`, [empty, STAFF_USER_ID]);
    expect((await db.query(`SELECT 1 FROM public.trips WHERE id = $1`, [empty])).rows).toHaveLength(0);
  });

  it("trip slugs must be web-safe", async () => {
    await expect(
      db.query(
        `INSERT INTO public.trips (slug, title, destination, region, tagline, summary, duration_days, duration_nights,
           difficulty, vibe, base_price_paise, hero_image_url) VALUES ('Bad Slug!','x','X','Y','t','s',2,1,'Easy','v',1,'/y.jpg')`
      )
    ).rejects.toThrow(/trips_slug_format/);
  });

  it("every admin change is in the audit log", async () => {
    const before = (await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM public.audit_logs WHERE action LIKE 'departure_%'`)).n;
    const id = await saveDeparture();
    await saveDeparture({ id, max: 5, min: 2 });
    const after = (await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM public.audit_logs WHERE action LIKE 'departure_%'`)).n;
    expect(after - before).toBe(2);
  });
});

describe("itinerary replace is all-or-nothing", () => {
  let idb: PGlite;
  let tid: string;
  beforeAll(async () => {
    idb = await createMigratedDb();
    tid = (
      await idb.query<{ id: string }>(
        `INSERT INTO public.trips (slug, title, destination, region, tagline, summary, duration_days, duration_nights,
           difficulty, vibe, base_price_paise, hero_image_url) VALUES ('itin','I','X','Y','t','s',2,1,'Easy','v',1,'/y.jpg') RETURNING id`
      )
    ).rows[0].id;
  }, 60_000);
  afterAll(async () => {
    await idb?.close();
  });

  it("numbers days in order, and a bad day leaves the old itinerary untouched", async () => {
    const good = JSON.stringify([{ title: "Drive to the hills" }, { title: "Estate walk", mealsIncluded: "Breakfast" }]);
    await idb.query(`SELECT public.admin_replace_itinerary($1, $2::jsonb, NULL, 'ops')`, [tid, good]);
    let rows = (await idb.query<{ day_number: number; title: string }>(`SELECT day_number, title FROM public.itinerary_days WHERE trip_id = $1 ORDER BY 1`, [tid])).rows;
    expect(rows).toEqual([
      { day_number: 1, title: "Drive to the hills" },
      { day_number: 2, title: "Estate walk" },
    ]);

    const bad = JSON.stringify([{ title: "New day 1" }, { title: "" }]);
    await expect(
      idb.transaction(async (tx) => {
        await tx.query(`SELECT public.admin_replace_itinerary($1, $2::jsonb, NULL, 'ops')`, [tid, bad]);
      })
    ).rejects.toThrow(/BAD_ITINERARY/);
    rows = (await idb.query<{ day_number: number; title: string }>(`SELECT day_number, title FROM public.itinerary_days WHERE trip_id = $1 ORDER BY 1`, [tid])).rows;
    expect(rows.map((r) => r.title)).toEqual(["Drive to the hills", "Estate walk"]);
  });
});
