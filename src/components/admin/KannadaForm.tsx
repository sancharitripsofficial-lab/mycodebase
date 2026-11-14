"use client";

import { Button } from "@astryxdesign/core/Button";
import { Languages, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Notice } from "@/components/admin/kit";
import { translateText } from "@/lib/i18n/dom-translator";
import { collectSiteTexts, type SiteText } from "@/lib/i18n/site-texts";

type SaveFn = (action: string, data: unknown) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;

const PAGE = 30;
const normalise = (s: string) => s.replace(/\s+/g, " ").trim();

interface Row extends SiteText {
  builtIn: string | null;
  /** Kannada a pattern gives automatically (dates, seat counts), shown as a hint. */
  automatic: string | null;
}

/**
 * Admin → Text & policies → Kannada. The website's ಕನ್ನಡ | EN switch uses the built-in Kannada
 * shipped with the site plus what the owner saves here (which wins). New trips, offers and text
 * changes appear here as "Needs Kannada" until someone fills them in.
 */
export function KannadaForm({
  settings,
  trips,
  saved,
  save,
  canEdit,
}: {
  settings: Record<string, unknown>;
  trips: Parameters<typeof collectSiteTexts>[0]["trips"];
  saved: Record<string, string>;
  save: SaveFn;
  canEdit: boolean;
}) {
  const [builtIn, setBuiltIn] = useState<Record<string, string> | null>(null);
  const [promotions, setPromotions] = useState<Parameters<typeof collectSiteTexts>[0]["promotions"]>([]);
  const [edits, setEdits] = useState<Record<string, string>>(saved);
  const [filter, setFilter] = useState<"missing" | "data" | "all">("missing");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void import("@/lib/i18n/kn.json").then((m) => alive && setBuiltIn((m.default ?? m) as Record<string, string>));
    void fetch("/api/admin/promotions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { promotions: [] }))
      .then((j: { promotions?: Parameters<typeof collectSiteTexts>[0]["promotions"] }) => alive && setPromotions(j.promotions ?? []))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const dataTexts = useMemo(() => collectSiteTexts({ settings, trips, promotions }), [settings, trips, promotions]);

  const rows: Row[] = useMemo(() => {
    if (!builtIn) return [];
    const dict = new Map(Object.entries(builtIn));
    const fromData = new Set(dataTexts.map((t) => t.en));
    const all: SiteText[] = [...dataTexts];
    if (filter === "all") {
      for (const en of Object.keys(builtIn)) if (!fromData.has(en)) all.push({ en, where: "Website wording" });
    }
    return all.map((t) => {
      const b = builtIn[t.en] ?? null;
      return { ...t, builtIn: b, automatic: b ? null : translateText(t.en, dict) };
    });
  }, [builtIn, dataTexts, filter]);

  const hasKannada = (r: Row) => Boolean((edits[r.en] ?? "").trim() || r.builtIn || r.automatic);
  const missingCount = rows.filter((r) => !hasKannada(r)).length;
  const query = normalise(q).toLowerCase();
  const visible = rows.filter(
    (r) =>
      (filter !== "missing" || !hasKannada(r)) &&
      (!query || r.en.toLowerCase().includes(query) || (edits[r.en] ?? r.builtIn ?? "").toLowerCase().includes(query) || r.where.toLowerCase().includes(query)),
  );

  async function onSave() {
    setNotice(null);
    // Keep only real choices: a box equal to the built-in Kannada needs no saving.
    const value: Record<string, string> = {};
    for (const [en, kn] of Object.entries(edits)) {
      const v = kn.trim();
      if (v && v !== (builtIn?.[en] ?? "")) value[en] = v;
    }
    setBusy(true);
    const r = await save("settings.save", { key: "translations_kn", value });
    setBusy(false);
    setNotice(r.ok ? { kind: "ok", text: `${r.message} Kannada visitors see it within a minute.` } : { kind: "error", text: r.error });
  }

  if (!builtIn) return <p className="py-6 text-sm text-stone-600">Loading Kannada…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-[#b5e2e2] bg-lagoon-100/40 p-4 text-sm text-ink-900">
        <Languages className="mt-0.5 h-5 w-5 shrink-0 text-forest-800" aria-hidden="true" />
        <p>
          Visitors switch the whole website with <strong>ಕನ್ನಡ | EN</strong> at the top. Today&apos;s pages already have Kannada built in.
          When you add or change a trip, offer or any text, its Kannada shows here as <strong>Needs Kannada</strong>; until it is filled in,
          that text stays in English for Kannada visitors. You can also correct any built-in wording.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["missing", `Needs Kannada (${missingCount})`],
            ["data", `Your trips & text (${dataTexts.length})`],
            ["all", "Everything"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setFilter(key);
              setShown(PAGE);
            }}
            className={`min-h-10 rounded-full border px-3.5 text-sm font-semibold ${filter === key ? "border-forest-900 bg-forest-900 text-white" : "border-stone-300 bg-white text-forest-900 hover:bg-lagoon-100"}`}
          >
            {label}
          </button>
        ))}
        <label className="relative ml-auto w-full min-w-0 sm:w-64">
          <span className="sr-only">Search texts</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search English or Kannada"
            className="min-h-10 w-full rounded-full border border-stone-300 bg-white pr-3 pl-9 text-sm"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600">
          {filter === "missing" && !query ? "Every text from your trips and pages has Kannada. 🎉" : "Nothing matches."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.slice(0, shown).map((r) => {
            const value = edits[r.en] ?? r.builtIn ?? "";
            const state = (edits[r.en] ?? "").trim() && edits[r.en] !== r.builtIn ? "Your wording" : r.builtIn ? "Built-in" : r.automatic ? "Automatic" : "Needs Kannada";
            return (
              <li key={r.en} className="min-w-0 rounded-2xl border border-stone-200 bg-white p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-[0.7rem] font-semibold tracking-wide text-stone-600 uppercase">{r.where}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.68rem] font-bold ${
                      state === "Needs Kannada" ? "bg-[#fff1f3] text-[#a3263a]" : state === "Your wording" ? "bg-[#e2f4e8] text-[#12603e]" : "bg-lagoon-100 text-forest-900"
                    }`}
                  >
                    {state}
                  </span>
                </div>
                <p className="mt-1.5 text-sm break-words text-ink-900">{r.en}</p>
                <label className="mt-2 block">
                  <span className="sr-only">Kannada for: {r.en}</span>
                  <textarea
                    lang="kn"
                    rows={Math.min(6, Math.max(1, Math.ceil(r.en.length / 60)))}
                    value={value}
                    disabled={!canEdit}
                    placeholder={r.automatic ?? "ಕನ್ನಡದಲ್ಲಿ ಬರೆಯಿರಿ…"}
                    onChange={(e) => setEdits((x) => ({ ...x, [r.en]: e.target.value }))}
                    className="w-full resize-y rounded-xl border border-stone-300 bg-cream-50 px-3 py-2 text-[0.95rem] leading-relaxed"
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {visible.length > shown && (
        <Button label={`Show ${Math.min(PAGE, visible.length - shown)} more (${visible.length - shown} left)`} variant="secondary" onClick={() => setShown((n) => n + PAGE)} />
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
          <Button label={busy ? "Saving…" : "Save Kannada"} variant="primary" isDisabled={busy} onClick={() => void onSave()} />
          {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        </div>
      )}
    </div>
  );
}
