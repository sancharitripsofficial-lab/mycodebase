"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Copy, Eye, MousePointerClick, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DateTimeField, Notice, Panel } from "@/components/admin/kit";
import { PromoBanner } from "@/components/promo/PromoBanner";
import { PromoMedia } from "@/components/promo/PromoMedia";
import { getCached, setCached } from "@/lib/admin/memo-cache";
import type { AdminPromotion, PromoMediaType, PromoPlacement, PromoTheme, Promotion } from "@/lib/data/promotions";
import type { PublicDepartureAvailability, StaffRole, Trip } from "@/lib/types";
import { isBookable } from "@/lib/departure-rules";

const PLACEMENTS: { key: PromoPlacement; label: string; hint: string }[] = [
  { key: "home_banner", label: "Home page banner", hint: "Big banner under the opening video" },
  { key: "top_bar", label: "Top bar on every page", hint: "Thin rotating line above the menu" },
  { key: "trips_banner", label: "All trips page", hint: "Banner above the trip list" },
  { key: "trip_page", label: "Trip pages", hint: "On every trip page, or one trip you pick" },
  { key: "popup", label: "Pop-up", hint: "Once per visitor, after a few seconds" },
];

const STATUS = {
  live: { label: "Live", variant: "success" },
  scheduled: { label: "Scheduled", variant: "info" },
  ended: { label: "Ended", variant: "neutral" },
  off: { label: "Off", variant: "neutral" },
} as const;

type Draft = Omit<Promotion, "id"> & { id: string | null; isActive: boolean };

function blank(): Draft {
  return {
    id: null,
    title: "",
    message: "",
    badge: "",
    mediaType: "image",
    mediaUrl: "",
    posterUrl: "",
    ctaLabel: "See dates",
    ctaUrl: "/trips",
    placements: ["home_banner"],
    tripId: null,
    theme: "sunset",
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    isActive: true,
  };
}

function statusOf(p: AdminPromotion): keyof typeof STATUS {
  const now = Date.now();
  if (!p.isActive) return "off";
  if (p.endsAt && Date.parse(p.endsAt) <= now) return "ended";
  if (p.startsAt && Date.parse(p.startsAt) > now) return "scheduled";
  return "live";
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
}

/** Admin → Offers & ads: what the website advertises, where, and when. */
type OfferDeparture = Pick<PublicDepartureAvailability, "departureId" | "tripId" | "startDate" | "endDate" | "seatsRemaining" | "status" | "bookingCutoffAt">;

export function PromotionsManager({ role, trips, departures = [] }: { role: StaffRole; trips: Trip[]; departures?: OfferDeparture[] }) {
  const canEdit = role === "owner" || role === "ops";
  const [rows, setRows] = useState<AdminPromotion[] | null>(() => getCached<AdminPromotion[]>("promotions") ?? null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/promotions", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setRows(json.promotions as AdminPromotion[]);
      setCached("promotions", json.promotions);
    } else setNotice({ kind: "error", text: json.error || "Could not load offers." });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (draft) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [draft?.id, draft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(body: Record<string, unknown>, ok: string): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: "error", text: json.error || "That did not work." });
        return false;
      }
      setNotice({ kind: "ok", text: ok });
      await load();
      return true;
    } catch {
      setNotice({ kind: "error", text: "Network problem — nothing was saved." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function toInput(p: Draft | AdminPromotion) {
    return {
      id: p.id,
      title: p.title,
      message: p.message,
      badge: p.badge,
      mediaType: p.mediaType,
      mediaUrl: p.mediaType === "none" ? "" : p.mediaUrl,
      posterUrl: p.mediaType === "video" ? p.posterUrl : "",
      ctaLabel: p.ctaLabel,
      ctaUrl: p.ctaUrl,
      placements: p.placements,
      tripId: p.tripId,
      theme: p.theme,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
    };
  }

  const live = (rows ?? []).filter((r) => statusOf(r) === "live").length;

  return (
    <div className="space-y-5">
      <Panel
        title="Offers & ads"
        description="Advertise offers on the website with a photo, a video or a YouTube clip and a button. Pick where each one shows and when it starts and ends — it appears and disappears by itself."
        actions={canEdit ? <Button variant="primary" label="New offer" icon={<Plus className="h-4 w-4" />} onClick={() => setDraft(blank())} /> : undefined}
      >
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        {rows === null ? (
          <p className="text-sm text-stone-600">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-stone-600">No offers yet. Make one with “New offer” — for example a festival discount, a new trip or a last-seats alert.</p>
        ) : (
          <>
            <p className="text-sm text-stone-600">
              {live} live now • {rows.length} in total. Views count once per visitor per session; clicks count the button.
            </p>
            <ul className="grid gap-3 md:grid-cols-2">
              {rows.map((p) => {
                const st = statusOf(p);
                const ctr = p.viewCount > 0 ? `${((p.clickCount / p.viewCount) * 100).toFixed(1)}%` : "—";
                return (
                  <li key={p.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                    <div className="relative aspect-[16/7] w-full">
                      <PromoMedia promo={p} sizes="(min-width: 768px) 40vw, 100vw" />
                      <span className="absolute top-2 left-2">
                        <Badge variant={STATUS[st].variant} label={STATUS[st].label} />
                      </span>
                    </div>
                    <div className="space-y-2 p-4 text-sm">
                      <p className="font-semibold text-ink-900">
                        {p.badge && <span className="mr-2 rounded-full bg-copper-600 px-2 py-0.5 text-[11px] font-bold text-white">{p.badge}</span>}
                        {p.title}
                      </p>
                      <p className="text-xs text-stone-600">
                        {p.placements.map((k) => PLACEMENTS.find((x) => x.key === k)?.label ?? k).join(" • ")}
                        {p.startsAt || p.endsAt ? ` • ${p.startsAt ? `from ${when(p.startsAt)}` : ""}${p.endsAt ? ` until ${when(p.endsAt)}` : ""}` : " • no end date"}
                      </p>
                      <p className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
                        <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" aria-hidden="true" /> {p.viewCount} views</span>
                        <span className="inline-flex items-center gap-1"><MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" /> {p.clickCount} clicks</span>
                        <span>{ctr} clicked</span>
                      </p>
                      {canEdit && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" label="Edit" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setDraft({ ...p })} />
                          <Button
                            size="sm"
                            label={p.isActive ? "Turn off" : "Turn on"}
                            isDisabled={busy}
                            onClick={() => void send({ action: "save", promotion: { ...toInput(p), isActive: !p.isActive } }, `“${p.title}” turned ${p.isActive ? "off" : "on"}.`)}
                          />
                          <Button
                            size="sm"
                            label="Copy"
                            icon={<Copy className="h-3.5 w-3.5" />}
                            onClick={() => setDraft({ ...p, id: null, title: `${p.title} (copy)`.slice(0, 80), isActive: false })}
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            label="Delete"
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            isDisabled={busy}
                            onClick={() => {
                              if (window.confirm(`Delete “${p.title}”? Its view and click counts are deleted too.`)) {
                                void send({ action: "delete", id: p.id }, `“${p.title}” deleted.`);
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>

      {draft && canEdit && (
        <div ref={editorRef} className="scroll-mt-20">
          <Editor
            draft={draft}
            setDraft={setDraft}
            trips={trips}
            departures={departures}
            busy={busy}
            onSave={async () => {
              const ok = await send(
                { action: "save", promotion: toInput(draft) },
                draft.id ? `“${draft.title}” saved — the website updates within a minute.` : `“${draft.title}” created — the website updates within a minute.`
              );
              if (ok) setDraft(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

const OFFER_DATE = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const offerDate = (iso: string) => OFFER_DATE.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));

/** Where an offer's button goes when it is for one trip: that trip's dates and booking form. */
const tripBookingLink = (slug: string) => `/trips/${slug}#book`;

function Editor({
  draft,
  setDraft,
  trips,
  departures,
  busy,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  trips: Trip[];
  departures: OfferDeparture[];
  busy: boolean;
  onSave: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState<"media" | "poster" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });

  const offerTrip = trips.find((t) => t.id === draft.tripId) ?? null;
  const tripDates = offerTrip
    ? departures
        .filter((d) => d.tripId === offerTrip.id && isBookable(d))
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
    : [];
  const linkOptions = [
    ...(offerTrip
      ? [
          { value: tripBookingLink(offerTrip.slug), label: `${offerTrip.title}: dates & booking (recommended)` },
          ...tripDates.map((d) => ({
            value: `/trips/${offerTrip.slug}?date=${d.departureId}#book`,
            label: `Only ${offerDate(d.startDate)} – ${offerDate(d.endDate)} (${d.seatsRemaining > 0 ? `${d.seatsRemaining} seats left` : "sold out"})`,
          })),
        ]
      : []),
    { value: "/trips", label: "All trips" },
    { value: "/trips?mode=private", label: "Private car page" },
    { value: "/trips#ask", label: "Ask us form" },
    ...trips.filter((t) => t.id !== offerTrip?.id).map((t) => ({ value: tripBookingLink(t.slug), label: `Trip: ${t.title} (dates & booking)` })),
    { value: "custom", label: "Other link…" },
  ];

  /** Choosing the offer's trip points a general button at that trip's dates (other links are kept). */
  const chooseTrip = (tripId: string | null) => {
    const trip = trips.find((t) => t.id === tripId) ?? null;
    const generic = !draft.ctaUrl || draft.ctaUrl === "/trips" || /^\/trips\/[^?#]+(?:[?#].*)?$/.test(draft.ctaUrl);
    setDraft({
      ...draft,
      tripId: trip?.id ?? null,
      ...(trip && generic ? { ctaUrl: tripBookingLink(trip.slug), ctaLabel: draft.ctaLabel || "See dates" } : {}),
      ...(!trip && /^\/trips\/[^?#]+/.test(draft.ctaUrl) ? { ctaUrl: "/trips" } : {}),
    });
  };
  const linkChoice = linkOptions.some((o) => o.value === draft.ctaUrl) ? draft.ctaUrl : "custom";

  async function upload(file: File, target: "media" | "poster") {
    setUploading(target);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/media", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(json.error || "Upload failed.");
        return;
      }
      if (target === "media") {
        setDraft({ ...draft, mediaUrl: String(json.url), mediaType: file.type.startsWith("video/") ? "video" : "image" });
      } else {
        setDraft({ ...draft, posterUrl: String(json.url) });
      }
    } catch {
      setUploadError("Network problem during upload.");
    } finally {
      setUploading(null);
    }
  }

  const previewPromo: Promotion = { ...draft, id: "preview" };

  return (
    <Panel title={draft.id ? "Edit offer" : "New offer"} description="The preview at the bottom shows exactly how it will look.">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Selector
            label="Which trip is this offer for?"
            value={draft.tripId ?? "none"}
            onChange={(v) => chooseTrip(v === "none" ? null : v)}
            options={[{ value: "none", label: "No single trip (offer for all trips)" }, ...trips.map((t) => ({ value: t.id, label: t.title }))]}
          />
          <p className="text-xs text-stone-600">
            {offerTrip
              ? `The button opens ${offerTrip.title}'s dates and booking form, and on trip pages this offer shows only on ${offerTrip.title}.`
              : "Pick the trip when the ad or video is about one tour, so “See dates” opens exactly that tour."}
          </p>
        </div>
        <TextInput label="Title" description="Short and clear, e.g. “Diwali weekend: ₹1,000 off Coorg”." value={draft.title} onChange={(v) => set("title", v)} />
        <TextInput label="Badge (optional)" description="Tiny label, e.g. “₹1,000 OFF”, “NEW”, “3 seats left”." value={draft.badge} onChange={(v) => set("badge", v.slice(0, 24))} />
        <div className="md:col-span-2">
          <TextArea label="Message (optional)" rows={2} value={draft.message} onChange={(v) => set("message", v.slice(0, 240))} />
        </div>

        <Selector
          label="Photo or video"
          value={draft.mediaType}
          onChange={(v) => set("mediaType", v as PromoMediaType)}
          options={[
            { value: "image", label: "Photo" },
            { value: "video", label: "Video (MP4 / WebM)" },
            { value: "youtube", label: "YouTube link" },
            { value: "none", label: "No media (colour only)" },
          ]}
        />
        <Selector
          label="Colour"
          value={draft.theme}
          onChange={(v) => set("theme", v as PromoTheme)}
          options={[
            { value: "sunset", label: "Sunset orange" },
            { value: "ocean", label: "Ocean blue" },
            { value: "teal", label: "Teal" },
          ]}
        />

        {draft.mediaType !== "none" && (
          <div className="space-y-2 md:col-span-2">
            <TextInput
              label={draft.mediaType === "youtube" ? "YouTube link" : "Photo/video link"}
              description={draft.mediaType === "youtube" ? "Paste a youtube.com or youtu.be link (Shorts work too)." : "Upload a file below, or paste an https:// link."}
              value={draft.mediaUrl}
              onChange={(v) => set("mediaUrl", v.trim())}
            />
            {draft.mediaType !== "youtube" && (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-lagoon-100">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {uploading === "media" ? "Uploading…" : "Upload photo or video"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
                  className="sr-only"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f, "media");
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            {draft.mediaType === "video" && (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <TextInput label="Cover picture (optional)" description="Shown before the video starts and on slow phones." value={draft.posterUrl} onChange={(v) => set("posterUrl", v.trim())} />
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-lagoon-100">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  {uploading === "poster" ? "Uploading…" : "Upload cover"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="sr-only"
                    disabled={uploading !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f, "poster");
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
            <p className="text-xs text-stone-600">Photos up to 8 MB, videos up to 20 MB. Keep videos short (10–20 s) so phones load them fast.</p>
            {uploadError && <Notice kind="error">{uploadError}</Notice>}
          </div>
        )}

        <TextInput label="Button text (optional)" value={draft.ctaLabel} onChange={(v) => set("ctaLabel", v.slice(0, 30))} placeholder="See dates" />
        <div className="space-y-2">
          <Selector
            label="Button opens"
            value={linkChoice}
            onChange={(v) => set("ctaUrl", v === "custom" ? "" : v)}
            options={linkOptions}
          />
          {linkChoice === "custom" && (
            <TextInput label="Link" description="A page on this site (starts with /) or an https:// link." value={draft.ctaUrl} onChange={(v) => set("ctaUrl", v.trim())} />
          )}
        </div>

        <fieldset className="space-y-2 md:col-span-2">
          <legend className="text-sm font-semibold text-ink-900">Where to show it</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PLACEMENTS.map((pl) => {
              const on = draft.placements.includes(pl.key);
              return (
                <label key={pl.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${on ? "border-forest-800 bg-lagoon-100/50" : "border-stone-200 bg-white"}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      set("placements", on ? draft.placements.filter((k) => k !== pl.key) : [...draft.placements, pl.key])
                    }
                    className="mt-1 h-4 w-4 accent-forest-900"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink-900">{pl.label}</span>
                    <span className="block text-xs text-stone-600">{pl.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {draft.placements.includes("trip_page") && (
            <p className="text-xs text-stone-600">
              Trip pages: {offerTrip ? `only ${offerTrip.title}` : "every trip page"} (set by “Which trip is this offer for?” above).
            </p>
          )}
        </fieldset>

        <DateTimeField label="Starts (optional)" description="Empty = from now." value={draft.startsAt ?? ""} onChange={(v) => set("startsAt", v || null)} />
        <DateTimeField label="Ends (optional)" description="Empty = until you turn it off." value={draft.endsAt ?? ""} onChange={(v) => set("endsAt", v || null)} />

        <TextInput
          label="Order"
          description="Lower numbers show first when several offers share a place."
          value={String(draft.sortOrder)}
          onChange={(v) => set("sortOrder", Math.max(-1000, Math.min(1000, Math.round(Number(v.replace(/[^\d-]/g, "")) || 0))))}
        />
        <div className="flex items-end pb-2">
          <Switch label="Show on the website" value={draft.isActive} onChange={(v) => set("isActive", v)} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink-900">Preview</p>
        {/* Clicks in the preview never leave the admin. */}
        <div onClickCapture={(e) => (e.target as HTMLElement).closest("a") && e.preventDefault()}>
          <PromoBanner promotions={[previewPromo]} preview />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" label={draft.id ? "Save offer" : "Create offer"} isLoading={busy} onClick={() => void onSave()} />
        <Button label="Cancel" onClick={() => setDraft(null)} />
      </div>
    </Panel>
  );
}
