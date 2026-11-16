/**
 * Offers & ads (promotions) on the real migrations: what staff can save, what visitors can
 * see, and how views/clicks are counted.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMigratedDb } from "./helpers/payment-backends";

let db: PGlite;

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

async function insert(fields: Record<string, unknown>): Promise<string> {
  const row = {
    title: "Monsoon offer",
    message: "₹1,000 off Coorg this month",
    placements: ["home_banner"],
    ...fields,
  };
  const keys = Object.keys(row);
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.promotions (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
    Object.values(row)
  );
  return r.rows[0].id;
}

async function asAnon<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("SET ROLE anon");
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("RESET ROLE");
  }
}

beforeAll(async () => {
  db = await createMigratedDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("offers & ads rules (real migrations)", () => {
  it("saves a photo, a video and a YouTube offer with a button", async () => {
    await insert({ media_type: "image", media_url: "/media/dest-coorg.jpg", cta_label: "See dates", cta_url: "/trips/coorg-rainforest-slow-drive" });
    await insert({ media_type: "video", media_url: "https://abc.supabase.co/storage/v1/object/public/media/library/a.mp4", poster_url: "/media/dest-hampi.jpg" });
    await insert({ media_type: "youtube", media_url: "https://youtu.be/dQw4w9WgXcQ", placements: ["popup", "top_bar"] });
  });

  it("a video offer may carry a wide copy for banners; visitors can read it; nothing else may", async () => {
    const id = await insert({
      media_type: "video",
      media_url: "https://abc.supabase.co/storage/v1/object/public/media/uploads/tall.mp4",
      wide_media_url: "https://abc.supabase.co/storage/v1/object/public/media/uploads/wide.mp4",
      is_active: true,
    });
    const rows = await asAnon<{ wide_media_url: string }>("SELECT wide_media_url FROM public.promotions WHERE id = $1", [id]);
    expect(rows[0]?.wide_media_url).toMatch(/wide\.mp4$/);
    for (const bad of [
      { media_type: "image", media_url: "/media/dest-coorg.jpg", wide_media_url: "/media/wide.mp4" },
      { media_type: "video", media_url: "/media/a.mp4", wide_media_url: "javascript:alert(1)" },
    ]) {
      await expect(insert(bad)).rejects.toThrow();
    }
  });

  it("refuses nonsense: bad links, unknown places, wrong dates, half a button, empty title", async () => {
    const bad: Record<string, unknown>[] = [
      { media_type: "image", media_url: "javascript:alert(1)" },
      { media_type: "image", media_url: "" },
      { media_type: "none", media_url: "/media/x.jpg" },
      { cta_label: "Go", cta_url: "http://insecure.example" },
      { cta_label: "Go", cta_url: "" },
      { cta_label: "", cta_url: "/trips" },
      { placements: ["sidebar"] },
      { placements: [] },
      { starts_at: at(5), ends_at: at(1) },
      { title: "  " },
      { theme: "black" },
    ];
    for (const fields of bad) {
      await expect(insert(fields), JSON.stringify(fields)).rejects.toThrow();
    }
  });

  it("visitors see only offers that are on and inside their dates, and never the counters", async () => {
    await db.exec("DELETE FROM public.promotions");
    const live = await insert({ title: "Live now" });
    await insert({ title: "Switched off", is_active: false });
    await insert({ title: "Starts tomorrow", starts_at: at(24) });
    await insert({ title: "Ended", starts_at: at(-48), ends_at: at(-1) });
    const rows = await asAnon<{ id: string; title: string }>(
      "SELECT id, title FROM public.promotions ORDER BY title"
    );
    expect(rows.map((r) => r.title)).toEqual(["Live now"]);
    expect(rows[0].id).toBe(live);
    await expect(asAnon("SELECT view_count FROM public.promotions")).rejects.toThrow();
    await expect(asAnon("SELECT created_by FROM public.promotions")).rejects.toThrow();
  });

  it("counts views and clicks only for live offers, only through the server", async () => {
    await db.exec("DELETE FROM public.promotions");
    const live = await insert({ title: "Live" });
    const off = await insert({ title: "Off", is_active: false });
    const track = async (id: string, kind: string) =>
      (await db.query<{ ok: boolean }>("SELECT public.promotion_track($1, $2) AS ok", [id, kind])).rows[0].ok;
    expect(await track(live, "view")).toBe(true);
    expect(await track(live, "view")).toBe(true);
    expect(await track(live, "click")).toBe(true);
    expect(await track(off, "click")).toBe(false);
    await expect(track(live, "like")).rejects.toThrow(/BAD_KIND/);
    const r = (await db.query<{ view_count: number; click_count: number }>(
      "SELECT view_count, click_count FROM public.promotions WHERE id = $1",
      [live]
    )).rows[0];
    expect(Number(r.view_count)).toBe(2);
    expect(Number(r.click_count)).toBe(1);
    await expect(asAnon("SELECT public.promotion_track($1, 'view')", [live])).rejects.toThrow();
    await expect(asAnon("UPDATE public.promotions SET title = 'hacked'")).rejects.toThrow();
  });

  it("the pop-up pick (site setting offer_popup): visitors can read it, only the server can change it", async () => {
    // Supabase gives its visitor roles table rights by default and lets the row rules (RLS) decide;
    // this test database has no such default, so grant it here the way Supabase does.
    await db.exec("GRANT ALL ON public.site_settings TO anon, authenticated");
    const id = await insert({ title: "Picked offer" });
    const pick = { promotionId: id, since: "2026-11-16T12:00:00.000Z" };
    // The server saves it exactly like this (upsert on the key).
    const save = (value: unknown) =>
      db.query("INSERT INTO public.site_settings (key, value) VALUES ('offer_popup', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [
        JSON.stringify(value),
      ]);
    await save(pick);
    const read = async () => (await asAnon<{ value: { promotionId: string | null; since: string } }>("SELECT value FROM public.site_settings WHERE key = 'offer_popup'"))[0]?.value;
    expect(await read()).toEqual(pick);

    // A visitor can never change, remove or add it (refused outright, or it changes nothing).
    await asAnon("UPDATE public.site_settings SET value = '{\"promotionId\":null}'::jsonb WHERE key = 'offer_popup'").catch(() => undefined);
    await asAnon("DELETE FROM public.site_settings WHERE key = 'offer_popup'").catch(() => undefined);
    await expect(asAnon("INSERT INTO public.site_settings (key, value) VALUES ('offer_popup_by_visitor', '{}'::jsonb)")).rejects.toThrow();
    expect(await read()).toEqual(pick);

    // Picking again (new time) and going back to automatic both overwrite the same row.
    await save({ promotionId: id, since: "2026-11-16T13:00:00.000Z" });
    expect((await read())?.since).toBe("2026-11-16T13:00:00.000Z");
    await save({ promotionId: null, since: "2026-11-16T14:00:00.000Z" });
    expect((await read())?.promotionId).toBeNull();
    expect((await db.query("SELECT count(*)::int AS n FROM public.site_settings WHERE key = 'offer_popup'")).rows[0]).toEqual({ n: 1 });
  });
});

describe("offer buttons always go somewhere", async () => {
  const { promoHref } = await import("@/components/promo/PromoBanner");
  it("never links to the page you are on: All trips lands on the trip list, a trip's offer on its dates", () => {
    expect(promoHref({ ctaUrl: "/trips", tripSlug: null })).toBe("/trips#all-trips");
    expect(promoHref({ ctaUrl: "/trips", tripSlug: "hampi-boulders-and-ruins" })).toBe("/trips/hampi-boulders-and-ruins#book");
    expect(promoHref({ ctaUrl: "/#upcoming-dates", tripSlug: null })).toBe("/#upcoming-dates");
    expect(promoHref({ ctaUrl: "/trips/coorg?date=d1#book", tripSlug: "coorg" })).toBe("/trips/coorg?date=d1#book");
    expect(promoHref({ ctaUrl: "https://wa.me/919800000000", tripSlug: null })).toBe("https://wa.me/919800000000");
  });
});
