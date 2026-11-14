/**
 * Exact traveller age (owner request 14 Nov): adults 18-59, seniors 60+.
 * Checked in the server rules and on the real migrations (PGlite).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { travelerInputSchema } from "@/lib/validation";
import { createMigratedDb, STAFF_USER_ID } from "./helpers/payment-backends";

const base = { fullName: "Asha Rao", emergencyContact: "+919800000000" };

describe("age rules (server)", () => {
  it("accepts an exact age inside the chosen group", () => {
    expect(travelerInputSchema.parse({ ...base, ageGroup: "adult", ageYears: 18 }).ageYears).toBe(18);
    expect(travelerInputSchema.parse({ ...base, ageGroup: "adult", ageYears: "59" }).ageYears).toBe(59);
    expect(travelerInputSchema.parse({ ...base, ageGroup: "senior", ageYears: 60 }).ageYears).toBe(60);
  });

  it("refuses an age outside the group, with a clear message", () => {
    const tooOld = travelerInputSchema.safeParse({ ...base, ageGroup: "adult", ageYears: 60 });
    expect(tooOld.success).toBe(false);
    expect(tooOld.error?.issues[0].message).toMatch(/18 to 59/);
    expect(travelerInputSchema.safeParse({ ...base, ageGroup: "adult", ageYears: 17 }).success).toBe(false);
    expect(travelerInputSchema.safeParse({ ...base, ageGroup: "senior", ageYears: 45 }).success).toBe(false);
    expect(travelerInputSchema.safeParse({ ...base, ageGroup: "adult", ageYears: 25.5 }).success).toBe(false);
    expect(travelerInputSchema.safeParse({ ...base, ageGroup: "adult", ageYears: "abc" }).success).toBe(false);
  });

  it("still accepts bookings without an age (pages opened before the field existed)", () => {
    expect(travelerInputSchema.parse({ ...base, ageGroup: "adult" }).ageYears).toBeUndefined();
    expect(travelerInputSchema.parse({ ...base, ageGroup: "adult", ageYears: "" }).ageYears).toBeUndefined();
  });
});

describe("age in the database (real migrations)", () => {
  let db: PGlite;
  let dep: string;

  beforeAll(async () => {
    db = await createMigratedDb();
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner@test.local')`, [STAFF_USER_ID]);
    const trip = (
      await db.query<{ id: string }>(
        `INSERT INTO public.trips (slug, title, destination, region, tagline, summary, duration_days, duration_nights,
           difficulty, vibe, base_price_paise, hero_image_url, is_published)
         VALUES ('age-test','Age','X','Y','t','s',3,2,'Easy','v',100000,'/x.jpg',true) RETURNING id`
      )
    ).rows[0].id;
    const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
    dep = (
      await db.query<{ id: string }>(
        `SELECT public.admin_save_departure(NULL,$1,'AGE-1',$2,$3,6,1,'open_batch',$4,$5,NULL,true,$6,'owner') AS id`,
        [trip, at(40).slice(0, 10), at(42).slice(0, 10), at(37), at(36), STAFF_USER_ID]
      )
    ).rows[0].id;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  const hold = (travelers: object[]) =>
    db.query<{ booking_id: string }>(
      `SELECT * FROM public.reserve_departure_seats($1,$2,NULL,'A','a@example.com','+919800000001','batch_seats',$3,NULL,
         100000,$4,0,0,$4,$4,NULL,15,'{}'::jsonb,'{}'::jsonb,'upi',$5::jsonb,'open_mixed','',false,'v1',NULL)`,
      [`SAN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, dep, travelers.length, 100_000 * travelers.length, JSON.stringify(travelers)]
    );

  it("saves the exact age with each traveller (and none when not given)", async () => {
    const { booking_id } = (
      await hold([
        { fullName: "A", emergencyContact: "+919800000000", ageGroup: "adult", ageYears: 34 },
        { fullName: "B", emergencyContact: "+919800000000", ageGroup: "senior", ageYears: 67 },
        { fullName: "C", emergencyContact: "+919800000000", ageGroup: "adult" },
      ])
    ).rows[0];
    const rows = (
      await db.query<{ full_name: string; age_group: string; age_years: number | null }>(
        `SELECT full_name, age_group, age_years FROM public.booking_travelers WHERE booking_id = $1 ORDER BY full_name`,
        [booking_id]
      )
    ).rows;
    expect(rows).toEqual([
      { full_name: "A", age_group: "adult", age_years: 34 },
      { full_name: "B", age_group: "senior", age_years: 67 },
      { full_name: "C", age_group: "adult", age_years: null },
    ]);
  });

  it("refuses an age that does not fit the age group, and keeps the seats free", async () => {
    const before = (await db.query(`SELECT 1 FROM public.bookings`)).rows.length;
    await expect(hold([{ fullName: "D", emergencyContact: "+919800000000", ageGroup: "adult", ageYears: 64 }])).rejects.toThrow(
      /age_years_check/
    );
    expect((await db.query(`SELECT 1 FROM public.bookings`)).rows.length).toBe(before);
  });
});
