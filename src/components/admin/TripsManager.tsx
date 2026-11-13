"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LinesField, MoneyField, Notice, Panel, rupees, useAdminContent } from "@/components/admin/kit";
import { MediaLibrary } from "@/components/admin/MediaLibrary";
import { slugify } from "@/lib/admin/content-schemas";
import type { AdminTripBundle } from "@/lib/data/admin-content";
import type { PickupPoint, Trip } from "@/lib/types";

type Editor = ReturnType<typeof useAdminContent>;
type TripForm = Omit<Trip, "id"> & { id?: string };
type Section = "details" | "prices" | "media" | "included" | "itinerary" | "pickups";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "prices", label: "Prices" },
  { key: "media", label: "Photos & videos" },
  { key: "included", label: "What's included" },
  { key: "itinerary", label: "Day by day" },
  { key: "pickups", label: "Pickup points" },
];

function blankTrip(sortOrder: number): TripForm {
  return {
    slug: "",
    title: "",
    destination: "",
    region: "Western Ghats",
    tagline: "",
    summary: "",
    durationDays: 3,
    durationNights: 2,
    difficulty: "Easy",
    vibe: "",
    basePricePaise: 1_000_000,
    privateGroupPricePaise: null,
    privateDiscountPercent: 10,
    depositPercent: null,
    balanceDueDaysBefore: 7,
    pickupCity: "Bengaluru",
    heroImageUrl: "/media/hero-western-ghats.jpg",
    galleryUrls: [],
    videoLinks: [],
    inclusions: [],
    exclusions: [],
    accommodationNotes: "",
    packingList: [],
    safetyNotes: "",
    accessibilityNotes: "",
    isSampleDemo: false,
    isPublished: false,
    sortOrder,
  };
}

/** Trips list → full editor for one trip. */
export function TripsManager({ editor }: { editor: Editor }) {
  const { content } = editor;
  const [openId, setOpenId] = useState<string | "new" | null>(null);
  const canEdit = Boolean(content?.editable && (content.actorRole === "owner" || content.actorRole === "ops"));

  if (!content) return <p className="text-sm text-stone-600">Loading trips…</p>;

  if (openId) {
    const bundle = openId === "new" ? null : content.trips.find((t) => t.trip.id === openId) ?? null;
    return (
      <TripEditor
        key={openId}
        bundle={bundle}
        sortOrder={(content.trips.at(-1)?.trip.sortOrder ?? 0) + 1}
        editor={editor}
        canEdit={canEdit}
        onClose={() => setOpenId(null)}
        onCreated={(id) => setOpenId(id)}
      />
    );
  }

  return (
    <Panel
      title="Trips"
      description="Everything customers see on a trip page. Changing a price never changes bookings already made."
      actions={canEdit && <Button variant="primary" label="New trip" icon={<Plus className="h-4 w-4" />} onClick={() => setOpenId("new")} />}
    >
      {!content.editable && (
        <Banner status="warning" title="Preview mode is read-only" description="Connect the database to edit trips." collapsible={false} />
      )}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {content.trips.map(({ trip, departures, itinerary, pickupPoints }) => (
          <li key={trip.id} className="min-w-0">
            <button
              type="button"
              onClick={() => setOpenId(trip.id)}
              className="card-lift flex w-full min-w-0 gap-3 rounded-2xl border border-stone-200 bg-white p-3 text-left sm:gap-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
              <img src={trip.heroImageUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover sm:w-24" />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={trip.isPublished ? "success" : "neutral"} label={trip.isPublished ? "Live" : "Hidden"} />
                  {trip.isSampleDemo && <Badge variant="orange" label="Sample" />}
                </span>
                <span className="line-clamp-2 block font-display text-base leading-snug font-semibold break-words text-forest-900">{trip.title}</span>
                <span className="block text-xs text-stone-600">
                  {rupees(trip.basePricePaise)} / seat • {trip.durationDays}D/{trip.durationNights}N • {departures.length} date
                  {departures.length === 1 ? "" : "s"} • {itinerary.length} days planned • {pickupPoints.length} pickups
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TripEditor({
  bundle,
  sortOrder,
  editor,
  canEdit,
  onClose,
  onCreated,
}: {
  bundle: AdminTripBundle | null;
  sortOrder: number;
  editor: Editor;
  canEdit: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState<TripForm>(() => (bundle ? { ...bundle.trip } : blankTrip(sortOrder)));
  const [section, setSection] = useState<Section>("details");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [slugTouched, setSlugTouched] = useState(Boolean(bundle));
  const isNew = !bundle;
  const set = <K extends keyof TripForm>(key: K, value: TripForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function saveTrip() {
    setBusy(true);
    setNotice(null);
    const payload = { ...form, slug: form.slug || slugify(form.title) };
    const r = await editor.save("trip.save", payload);
    setBusy(false);
    if (!r.ok) return setNotice({ kind: "error", text: r.error });
    setNotice({ kind: "ok", text: r.message });
    if (isNew && r.id) onCreated(r.id);
  }

  async function deleteTrip() {
    if (!bundle) return;
    if (!window.confirm(`Delete “${bundle.trip.title}” with all its dates, days and pickups? Trips that have bookings can only be hidden.`)) return;
    const r = await editor.save("trip.delete", { id: bundle.trip.id });
    if (!r.ok) return setNotice({ kind: "error", text: r.error });
    onClose();
  }

  const tripSections = isNew ? SECTIONS.filter((s) => !["itinerary", "pickups"].includes(s.key)) : SECTIONS;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-900 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All trips
        </button>
        <div className="flex flex-wrap gap-2">
          {bundle && (
            <a
              href={`/trips/${bundle.trip.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-forest-900 hover:bg-lagoon-100"
            >
              View on website <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
          {bundle && canEdit && <Button variant="destructive" label="Delete trip" onClick={() => void deleteTrip()} />}
        </div>
      </div>

      <div className="card-soft p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">{isNew ? "New trip" : "Edit trip"}</p>
            <h2 className="font-display text-2xl font-semibold text-forest-900">{form.title || "Untitled trip"}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Switch label="Show on website" value={form.isPublished} onChange={(v) => set("isPublished", v)} isDisabled={!canEdit} />
            <Switch label="Mark as sample" value={form.isSampleDemo} onChange={(v) => set("isSampleDemo", v)} isDisabled={!canEdit} />
          </div>
        </div>

        <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-stone-200" aria-label="Trip sections">
          {tripSections.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition ${
                section === s.key ? "border-copper-600 text-forest-900" : "border-transparent text-stone-600 hover:text-forest-900"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="mt-5 space-y-4">
          {section === "details" && (
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput
                label="Trip title"
                value={form.title}
                isRequired
                isDisabled={!canEdit}
                onChange={(v) => {
                  set("title", v);
                  if (!slugTouched) set("slug", slugify(v));
                }}
              />
              <TextInput
                label="Web address"
                description={`sanchari…/trips/${form.slug || slugify(form.title) || "…"}`}
                value={form.slug}
                isDisabled={!canEdit}
                onChange={(v) => {
                  setSlugTouched(true);
                  set("slug", slugify(v));
                }}
              />
              <TextInput label="Destination" placeholder="Chikmagalur, Karnataka" value={form.destination} isDisabled={!canEdit} onChange={(v) => set("destination", v)} />
              <TextInput label="Region" placeholder="Western Ghats" value={form.region} isDisabled={!canEdit} onChange={(v) => set("region", v)} />
              <div className="md:col-span-2">
                <TextInput label="Tagline (one line on cards)" value={form.tagline} isDisabled={!canEdit} onChange={(v) => set("tagline", v)} />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Summary" rows={4} maxLength={2000} value={form.summary} isDisabled={!canEdit} onChange={(v) => set("summary", v)} />
              </div>
              <NumberInput label="Days" value={form.durationDays} isDisabled={!canEdit} onChange={(v) => set("durationDays", Math.round(v))} />
              <NumberInput label="Nights" value={form.durationNights} isDisabled={!canEdit} onChange={(v) => set("durationNights", Math.round(v))} />
              <Selector
                label="Difficulty"
                value={form.difficulty}
                isDisabled={!canEdit}
                options={["Easy", "Moderate", "Active"]}
                onChange={(v) => set("difficulty", v as Trip["difficulty"])}
              />
              <TextInput label="Vibe" placeholder="Slow hills & coffee culture" value={form.vibe} isDisabled={!canEdit} onChange={(v) => set("vibe", v)} />
              <TextInput label="Pickup city" value={form.pickupCity} isDisabled={!canEdit} onChange={(v) => set("pickupCity", v)} />
              <NumberInput
                label="Order on website"
                description="Lower numbers show first."
                value={form.sortOrder}
                isDisabled={!canEdit}
                onChange={(v) => set("sortOrder", Math.max(0, Math.round(v)))}
              />
            </div>
          )}

          {section === "prices" && (
            <div className="grid gap-4 md:grid-cols-2">
              <MoneyField label="Price per seat (₹)" paise={form.basePricePaise} isDisabled={!canEdit} onChange={(p) => set("basePricePaise", p ?? 0)} />
              <MoneyField
                label="Whole car price (₹)"
                description={`Private 6-seat booking. Leave empty to use the discount below (6 × ${rupees(form.basePricePaise)} = ${rupees(form.basePricePaise * 6)}).`}
                paise={form.privateGroupPricePaise}
                isOptional
                isDisabled={!canEdit}
                onChange={(p) => set("privateGroupPricePaise", p)}
              />
              <NumberInput
                label="Whole car discount (%)"
                description="Used only when no whole car price is set."
                value={form.privateDiscountPercent}
                isDisabled={!canEdit}
                onChange={(v) => set("privateDiscountPercent", Math.round(v))}
              />
              <NumberInput
                label="Deposit (%)"
                description="Let customers pay part now. Leave empty to require full payment."
                value={form.depositPercent}
                isOptional
                isDisabled={!canEdit}
                onChange={(v) => set("depositPercent", Number.isFinite(v) && v > 0 ? Math.round(v) : null)}
              />
              <NumberInput
                label="Balance due (days before trip)"
                value={form.balanceDueDaysBefore}
                isDisabled={!canEdit}
                onChange={(v) => set("balanceDueDaysBefore", Math.round(v))}
              />
              <p className="self-end rounded-xl bg-cream-100 px-3 py-2 text-xs text-stone-600 md:col-span-2">
                Customers see: {rupees(form.basePricePaise)} per seat
                {form.depositPercent ? ` • ${form.depositPercent}% deposit = ${rupees(Math.round((form.basePricePaise * form.depositPercent) / 100))} per seat now` : ""}
                {" • whole car "}
                {rupees(form.privateGroupPricePaise ?? Math.round(form.basePricePaise * 6 * (1 - form.privateDiscountPercent / 100)))}
              </p>
            </div>
          )}

          {section === "media" && <MediaSection form={form} set={set} canEdit={canEdit} />}

          {section === "included" && (
            <div className="grid gap-4 md:grid-cols-2">
              <LinesField label="Included" items={form.inclusions} rows={6} isDisabled={!canEdit} onChange={(v) => set("inclusions", v)} />
              <LinesField label="Not included" items={form.exclusions} rows={6} isDisabled={!canEdit} onChange={(v) => set("exclusions", v)} />
              <LinesField label="Packing list" items={form.packingList} rows={5} isDisabled={!canEdit} onChange={(v) => set("packingList", v)} />
              <TextArea label="Stay / rooms" rows={5} value={form.accommodationNotes} isDisabled={!canEdit} onChange={(v) => set("accommodationNotes", v)} />
              <TextArea label="Safety notes" rows={4} value={form.safetyNotes} isDisabled={!canEdit} onChange={(v) => set("safetyNotes", v)} />
              <TextArea label="Accessibility notes" rows={4} value={form.accessibilityNotes} isDisabled={!canEdit} onChange={(v) => set("accessibilityNotes", v)} />
            </div>
          )}

          {section === "itinerary" && bundle && <ItineraryEditor bundle={bundle} editor={editor} canEdit={canEdit} />}
          {section === "pickups" && bundle && <PickupsEditor bundle={bundle} editor={editor} canEdit={canEdit} />}
        </div>

        {!["itinerary", "pickups"].includes(section) && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
            {canEdit && (
              <Button variant="primary" size="lg" label={isNew ? "Create trip" : "Save trip"} isLoading={busy} onClick={() => void saveTrip()} />
            )}
            {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
          </div>
        )}
        {["itinerary", "pickups"].includes(section) && notice && <div className="mt-4"><Notice kind={notice.kind}>{notice.text}</Notice></div>}
      </div>
    </div>
  );
}

function MediaSection({
  form,
  set,
  canEdit,
}: {
  form: TripForm;
  set: <K extends keyof TripForm>(key: K, value: TripForm[K]) => void;
  canEdit: boolean;
}) {
  const [picker, setPicker] = useState<"hero" | "gallery" | "video" | null>(null);
  const [newGallery, setNewGallery] = useState("");
  const [newVideo, setNewVideo] = useState({ label: "", url: "" });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element -- preview of chosen photo */}
        <img src={form.heroImageUrl} alt="Main photo preview" className="aspect-[4/3] w-full rounded-2xl border border-stone-200 object-cover" />
        <div className="space-y-3">
          <TextInput
            label="Main photo"
            description="Shown on trip cards and at the top of the trip page. Paste a link or pick an upload."
            value={form.heroImageUrl}
            isDisabled={!canEdit}
            onChange={(v) => set("heroImageUrl", v.trim())}
          />
          {canEdit && <Button label="Choose from media library" onClick={() => setPicker(picker === "hero" ? null : "hero")} />}
        </div>
      </div>
      {picker === "hero" && (
        <PickerBox onClose={() => setPicker(null)}>
          <MediaLibrary canEdit compact pickLabel="Use as main photo" onPick={(url) => { set("heroImageUrl", url); setPicker(null); }} />
        </PickerBox>
      )}

      <div className="space-y-3">
        <h3 className="font-semibold text-ink-900">Gallery ({form.galleryUrls.length}/12)</h3>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {form.galleryUrls.map((url, i) => (
            <li key={`${url}-${i}`} className="relative overflow-hidden rounded-xl border border-stone-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- gallery thumbnail */}
              <img src={url} alt="" className="aspect-[4/3] w-full object-cover" />
              {canEdit && (
                <span className="absolute top-1.5 right-1.5 flex gap-1">
                  <IconBtn label="Move earlier" disabled={i === 0} onClick={() => set("galleryUrls", move(form.galleryUrls, i, -1))}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label="Remove" onClick={() => set("galleryUrls", form.galleryUrls.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></IconBtn>
                </span>
              )}
            </li>
          ))}
        </ul>
        {canEdit && form.galleryUrls.length < 12 && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <TextInput label="Add a photo link" placeholder="https://… or /media/…" value={newGallery} onChange={setNewGallery} />
            </div>
            <Button label="Add" onClick={() => { if (newGallery.trim()) { set("galleryUrls", [...form.galleryUrls, newGallery.trim()]); setNewGallery(""); } }} />
            <Button label="Pick uploads" onClick={() => setPicker(picker === "gallery" ? null : "gallery")} />
          </div>
        )}
      </div>
      {picker === "gallery" && (
        <PickerBox onClose={() => setPicker(null)}>
          <MediaLibrary canEdit compact pickLabel="Add to gallery" onPick={(url) => { if (!form.galleryUrls.includes(url) && form.galleryUrls.length < 12) set("galleryUrls", [...form.galleryUrls, url]); }} />
        </PickerBox>
      )}

      <div className="space-y-3">
        <h3 className="font-semibold text-ink-900">Videos & reels ({form.videoLinks.length}/8)</h3>
        <p className="text-xs text-stone-600">YouTube links play on the trip page; Instagram reels open in Instagram; uploaded MP4s play directly.</p>
        <ul className="space-y-2">
          {form.videoLinks.map((v, i) => (
            <li key={`${v.url}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
              <strong className="text-ink-900">{v.label}</strong>
              <a href={v.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-forest-800 underline">{v.url}</a>
              {canEdit && (
                <IconBtn label="Remove video" onClick={() => set("videoLinks", form.videoLinks.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
              )}
            </li>
          ))}
        </ul>
        {canEdit && form.videoLinks.length < 8 && (
          <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto_auto] sm:items-end">
            <TextInput label="Label" placeholder="Batch of Nov 2026" value={newVideo.label} onChange={(label) => setNewVideo((x) => ({ ...x, label }))} />
            <TextInput label="Link" placeholder="https://www.instagram.com/reel/… or YouTube" value={newVideo.url} onChange={(url) => setNewVideo((x) => ({ ...x, url: url.trim() }))} />
            <Button
              label="Add video"
              onClick={() => {
                if (!newVideo.url) return;
                set("videoLinks", [...form.videoLinks, { label: newVideo.label.trim() || "Watch", url: newVideo.url }]);
                setNewVideo({ label: "", url: "" });
              }}
            />
            <Button label="Pick upload" onClick={() => setPicker(picker === "video" ? null : "video")} />
          </div>
        )}
      </div>
      {picker === "video" && (
        <PickerBox onClose={() => setPicker(null)}>
          <MediaLibrary canEdit compact pickLabel="Use video" onPick={(url, item) => { set("videoLinks", [...form.videoLinks, { label: item.name.replace(/^\d{8}-/, "").replace(/-[a-f0-9]{6}\.\w+$/, "") || "Watch", url }]); setPicker(null); }} />
        </PickerBox>
      )}
    </div>
  );
}

function PickerBox({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="rounded-2xl border border-forest-800/30 bg-cream-100/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-forest-900">Media library</p>
        <Button size="sm" variant="ghost" label="Close" onClick={onClose} />
      </div>
      {children}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full bg-white/90 p-1.5 text-forest-900 shadow-sm hover:bg-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const next = list.slice();
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

interface DayForm {
  title: string;
  description: string;
  driveTimeEstimate: string;
  travelBufferNotes: string;
  mealsIncluded: string;
}

function ItineraryEditor({ bundle, editor, canEdit }: { bundle: AdminTripBundle; editor: Editor; canEdit: boolean }) {
  const initial = useMemo<DayForm[]>(
    () =>
      bundle.itinerary.map((d) => ({
        title: d.title,
        description: d.description,
        driveTimeEstimate: d.driveTimeEstimate,
        travelBufferNotes: d.travelBufferNotes,
        mealsIncluded: d.mealsIncluded,
      })),
    [bundle.itinerary]
  );
  const [days, setDays] = useState<DayForm[]>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  useEffect(() => setDays(initial), [initial]);

  const update = (i: number, patch: Partial<DayForm>) => setDays((all) => all.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  async function save() {
    setBusy(true);
    const r = await editor.save("itinerary.save", { tripId: bundle.trip.id, days });
    setBusy(false);
    setNotice(r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });
  }

  return (
    <div className="space-y-4">
      {days.length !== bundle.trip.durationDays && (
        <Banner
          status="warning"
          title={`This trip is ${bundle.trip.durationDays} days but has ${days.length} day${days.length === 1 ? "" : "s"} planned.`}
          collapsible={false}
        />
      )}
      <ol className="space-y-3">
        {days.map((d, i) => (
          <li key={i} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full bg-lagoon-100 px-3 py-1 text-xs font-bold text-forest-900">Day {i + 1}</span>
              {canEdit && (
                <span className="flex gap-1">
                  <IconBtn label="Move up" disabled={i === 0} onClick={() => setDays(move(days, i, -1))}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label="Move down" disabled={i === days.length - 1} onClick={() => setDays(move(days, i, 1))}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label="Remove day" onClick={() => setDays(days.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                </span>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <TextInput label="Title" value={d.title} isDisabled={!canEdit} onChange={(title) => update(i, { title })} />
              </div>
              <div className="md:col-span-2">
                <TextArea label="What happens" rows={3} value={d.description} isDisabled={!canEdit} onChange={(description) => update(i, { description })} />
              </div>
              <TextInput label="Drive time" placeholder="5.5 – 6.5 hrs (with breaks)" value={d.driveTimeEstimate} isDisabled={!canEdit} onChange={(driveTimeEstimate) => update(i, { driveTimeEstimate })} />
              <TextInput label="Meals included" placeholder="Breakfast & dinner" value={d.mealsIncluded} isDisabled={!canEdit} onChange={(mealsIncluded) => update(i, { mealsIncluded })} />
              <div className="md:col-span-2">
                <TextInput label="Buffer / notes" value={d.travelBufferNotes} isDisabled={!canEdit} onChange={(travelBufferNotes) => update(i, { travelBufferNotes })} />
              </div>
            </div>
          </li>
        ))}
      </ol>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            label="Add day"
            icon={<Plus className="h-4 w-4" />}
            isDisabled={days.length >= 14}
            onClick={() => setDays([...days, { title: "", description: "", driveTimeEstimate: "", travelBufferNotes: "", mealsIncluded: "" }])}
          />
          <Button variant="primary" label="Save day-by-day plan" isLoading={busy} onClick={() => void save()} />
          {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        </div>
      )}
    </div>
  );
}

function PickupsEditor({ bundle, editor, canEdit }: { bundle: AdminTripBundle; editor: Editor; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3">
      {bundle.pickupPoints.map((p) => (
        <PickupRow key={p.id} tripId={bundle.trip.id} pickup={p} editor={editor} canEdit={canEdit} />
      ))}
      {bundle.pickupPoints.length === 0 && !adding && <p className="text-sm text-stone-600">No pickup points yet.</p>}
      {adding && <PickupRow tripId={bundle.trip.id} pickup={null} editor={editor} canEdit={canEdit} onDone={() => setAdding(false)} />}
      {canEdit && !adding && <Button label="Add pickup point" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)} />}
    </div>
  );
}

function PickupRow({
  tripId,
  pickup,
  editor,
  canEdit,
  onDone,
}: {
  tripId: string;
  pickup: PickupPoint | null;
  editor: Editor;
  canEdit: boolean;
  onDone?: () => void;
}) {
  const [f, setF] = useState({
    name: pickup?.name ?? "",
    area: pickup?.area ?? "",
    pickupTimeLabel: pickup?.pickupTimeLabel ?? "",
    mapsUrl: pickup?.mapsUrl ?? "",
    isConfirmed: pickup?.isConfirmed ?? false,
    sortOrder: pickup?.sortOrder ?? 1,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    const r = await editor.save("pickup.save", { ...(pickup ? { id: pickup.id } : {}), tripId, ...f });
    setBusy(false);
    setNotice(r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });
    if (r.ok) onDone?.();
  }

  async function remove() {
    if (!pickup || !window.confirm(`Delete pickup “${pickup.name}”?`)) return;
    const r = await editor.save("pickup.delete", { id: pickup.id });
    setNotice(r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <TextInput label="Name" placeholder="Indiranagar 100ft Road" value={f.name} isDisabled={!canEdit} onChange={(name) => setF({ ...f, name })} />
        <TextInput label="Area" placeholder="East Bengaluru" value={f.area} isDisabled={!canEdit} onChange={(area) => setF({ ...f, area })} />
        <TextInput label="Pickup time" placeholder="05:45 AM" value={f.pickupTimeLabel} isDisabled={!canEdit} onChange={(pickupTimeLabel) => setF({ ...f, pickupTimeLabel })} />
        <div className="md:col-span-2">
          <TextInput label="Google Maps link" placeholder="https://maps.app.goo.gl/…" value={f.mapsUrl} isOptional isDisabled={!canEdit} onChange={(mapsUrl) => setF({ ...f, mapsUrl: mapsUrl.trim() })} />
        </div>
        <NumberInput label="Order" value={f.sortOrder} isDisabled={!canEdit} onChange={(v) => setF({ ...f, sortOrder: Math.max(0, Math.round(v)) })} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Switch label="Confirmed (time is final)" value={f.isConfirmed} isDisabled={!canEdit} onChange={(isConfirmed) => setF({ ...f, isConfirmed })} />
        {canEdit && <Button variant="primary" size="sm" label={pickup ? "Save" : "Add"} isLoading={busy} onClick={() => void save()} />}
        {canEdit && pickup && <Button size="sm" variant="ghost" label="Delete" onClick={() => void remove()} />}
        {canEdit && !pickup && <Button size="sm" variant="ghost" label="Cancel" onClick={() => onDone?.()} />}
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      </div>
    </div>
  );
}
