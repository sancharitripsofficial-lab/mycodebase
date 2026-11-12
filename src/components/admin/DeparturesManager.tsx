"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { DateTimeField, MoneyField, Notice, Panel, rupees, useAdminContent } from "@/components/admin/kit";
import type { AdminDepartureRow } from "@/lib/data/admin-content";
import { addDaysISO, istInstant, localISODate, tripEndDate } from "@/lib/dates";
import type { DepartureType } from "@/lib/types";

type Editor = ReturnType<typeof useAdminContent>;

const TYPE_LABEL: Record<DepartureType, string> = {
  open_batch: "Open batch",
  women_only: "Women only",
  private_charter: "Private charter",
};

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "info" | "warning" | "error" | "neutral" }> = {
  open: { label: "Open", variant: "success" },
  filling_fast: { label: "Filling fast", variant: "info" },
  last_seats: { label: "Last seats", variant: "warning" },
  sold_out: { label: "Full", variant: "neutral" },
  cancelled: { label: "Cancelled", variant: "error" },
  completed: { label: "Completed", variant: "neutral" },
};

interface DepForm {
  id?: string;
  tripId: string;
  departureCode: string;
  startDate: string;
  endDate: string;
  maxCapacity: number;
  minOccupancy: number;
  departureType: DepartureType;
  bookingCutoffAt: string;
  preferenceDeadlineAt: string;
  priceOverridePaise: number | null;
  isPublished: boolean;
}

/** Default deadlines: bookings close 2 days before at 6 PM, comfort requests 3 days before. */
export function defaultsFor(startDate: string, durationDays: number) {
  return {
    endDate: tripEndDate(startDate, durationDays),
    bookingCutoffAt: istInstant(addDaysISO(startDate, -2), "18:00"),
    preferenceDeadlineAt: istInstant(addDaysISO(startDate, -3), "18:00"),
  };
}

export function suggestCode(slug: string, startDate: string): string {
  const letters = slug.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() || "TRP";
  const [, m, d] = startDate.split("-").map(Number);
  const mon = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][m - 1] ?? "XXX";
  return `SAN-${letters}-${mon}${String(d).padStart(2, "0")}`;
}

export function DeparturesManager({ editor, onSeatOverride }: { editor: Editor; onSeatOverride: (body: Record<string, unknown>, ok: string) => Promise<void> }) {
  const { content } = editor;
  const [tripFilter, setTripFilter] = useState("all");
  const [showPast, setShowPast] = useState(false);
  const [editing, setEditing] = useState<DepForm | null>(null);
  const canEdit = Boolean(content?.editable && (content.actorRole === "owner" || content.actorRole === "ops"));

  const rows = useMemo(() => {
    if (!content) return [];
    const today = localISODate();
    return content.trips
      .flatMap((b) => b.departures.map((d) => ({ ...d, tripTitle: b.trip.title, tripSlug: b.trip.slug, durationDays: b.trip.durationDays, basePricePaise: b.trip.basePricePaise })))
      .filter((d) => tripFilter === "all" || d.tripId === tripFilter)
      .filter((d) => showPast || d.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [content, tripFilter, showPast]);

  if (!content) return <p className="text-sm text-stone-600">Loading dates…</p>;

  function newForm(): DepForm {
    const trip = content!.trips.find((t) => t.trip.id === tripFilter)?.trip ?? content!.trips[0]?.trip;
    const start = addDaysISO(localISODate(), 21);
    return {
      tripId: trip?.id ?? "",
      departureCode: trip ? suggestCode(trip.slug, start) : "",
      startDate: start,
      maxCapacity: 6,
      minOccupancy: 3,
      departureType: "open_batch",
      priceOverridePaise: null,
      isPublished: true,
      ...defaultsFor(start, trip?.durationDays ?? 3),
    };
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Dates & seats"
        description="Each date is one car with up to 6 seats. Seats per car can't go below seats already taken; dates with bookings can be cancelled but not deleted."
        actions={canEdit && <Button variant="primary" label="Add date" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(newForm())} />}
      >
        {!content.editable && <Banner status="warning" title="Preview mode is read-only" collapsible={false} />}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Selector
              label="Trip"
              value={tripFilter}
              onChange={setTripFilter}
              options={[{ value: "all", label: "All trips" }, ...content.trips.map((t) => ({ value: t.trip.id, label: t.trip.title }))]}
            />
          </div>
          <Switch label="Show past dates" value={showPast} onChange={setShowPast} />
        </div>

        {editing && (
          <DepartureForm
            key={editing.id ?? "new"}
            initial={editing}
            trips={content.trips.map((t) => t.trip)}
            editor={editor}
            onClose={() => setEditing(null)}
            row={editing.id ? rows.find((r) => r.departureId === editing.id) ?? null : null}
          />
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-stone-600">No dates yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-cream-100 text-xs uppercase tracking-wider text-stone-600">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Trip</th>
                  <th className="px-3 py-2.5">Seats</th>
                  <th className="px-3 py-2.5">Bookings</th>
                  <th className="px-3 py-2.5">Price</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {rows.map((d) => (
                  <DepartureRowView
                    key={d.departureId}
                    d={d}
                    canEdit={canEdit}
                    editor={editor}
                    onEdit={() =>
                      setEditing({
                        id: d.departureId,
                        tripId: d.tripId,
                        departureCode: d.departureCode,
                        startDate: d.startDate,
                        endDate: d.endDate,
                        maxCapacity: d.maxCapacity,
                        minOccupancy: d.minOccupancy,
                        departureType: d.departureType,
                        bookingCutoffAt: d.bookingCutoffAt,
                        preferenceDeadlineAt: d.preferenceDeadlineAt,
                        priceOverridePaise: d.priceOverridePaise,
                        isPublished: d.isPublished,
                      })
                    }
                    onSeatOverride={onSeatOverride}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function DepartureRowView({
  d,
  canEdit,
  editor,
  onEdit,
  onSeatOverride,
}: {
  d: AdminDepartureRow & { tripTitle: string; basePricePaise: number };
  canEdit: boolean;
  editor: Editor;
  onEdit: () => void;
  onSeatOverride: (body: Record<string, unknown>, ok: string) => Promise<void>;
}) {
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const badge = STATUS_BADGE[d.status] ?? STATUS_BADGE.open;
  const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  async function setStatus(status: "cancelled" | "open" | "completed") {
    const prompts = {
      cancelled: `Cancel ${d.departureCode}? Unpaid holds end now; ${d.paidBookingCount} paid booking(s) will need a refund or another date.\n\nReason (shown in the audit log):`,
      open: `Reopen ${d.departureCode} for booking? Reason:`,
      completed: `Mark ${d.departureCode} as completed? Reason:`,
    };
    const reason = window.prompt(prompts[status]);
    if (reason === null) return;
    const r = await editor.save("departure.status", { id: d.departureId, status, reason });
    setNotice(r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });
  }

  async function remove() {
    if (!window.confirm(`Delete ${d.departureCode}? (Only possible because nobody has booked it.)`)) return;
    const r = await editor.save("departure.delete", { id: d.departureId });
    setNotice(r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });
  }

  async function seat(action: "block_seat" | "release_block") {
    const reason = window.prompt(
      action === "block_seat"
        ? "Block 1 seat (e.g. for a guide or an offline booking). Reason, at least 8 characters:"
        : "Release 1 blocked seat. Reason, at least 8 characters:"
    );
    if (!reason) return;
    await onSeatOverride(
      { kind: "seat_override", payload: { departureId: d.departureId, action, seatsDelta: 1, reason } },
      action === "block_seat" ? `${d.departureCode}: 1 seat blocked.` : `${d.departureCode}: 1 seat released.`
    );
    await editor.reload();
  }

  return (
    <>
      <tr className="align-top">
        <td className="px-3 py-3">
          <p className="font-semibold text-ink-900">
            {fmt(d.startDate)} – {fmt(d.endDate)}
          </p>
          <p className="font-mono text-xs text-stone-600">{d.departureCode}</p>
          {!d.isPublished && <Badge variant="neutral" label="Hidden" />}
        </td>
        <td className="px-3 py-3">
          <p className="text-ink-900">{d.tripTitle}</p>
          <p className="text-xs text-stone-600">{TYPE_LABEL[d.departureType]}</p>
        </td>
        <td className="px-3 py-3">
          <p className="font-semibold text-ink-900">
            {d.seatsTaken} / {d.maxCapacity}
          </p>
          <p className="text-xs text-stone-600">min {d.minOccupancy} to run</p>
        </td>
        <td className="px-3 py-3">
          <p className="text-ink-900">{d.bookingCount}</p>
          <p className="text-xs text-stone-600">{d.paidBookingCount} paid</p>
        </td>
        <td className="px-3 py-3">{rupees(d.priceOverridePaise ?? d.basePricePaise)}{d.priceOverridePaise !== null && <p className="text-xs text-copper-700">special price</p>}</td>
        <td className="px-3 py-3">
          <Badge variant={badge.variant} label={badge.label} />
        </td>
        <td className="px-3 py-3">
          {canEdit && (
            <div className="flex flex-wrap justify-end gap-1.5">
              <Button size="sm" label="Edit" onClick={onEdit} />
              {d.status !== "cancelled" && d.status !== "completed" && (
                <>
                  <Button size="sm" variant="ghost" label="Block seat" onClick={() => void seat("block_seat")} />
                  <Button size="sm" variant="ghost" label="Release seat" onClick={() => void seat("release_block")} />
                  <Button size="sm" variant="destructive" label="Cancel date" onClick={() => void setStatus("cancelled")} />
                </>
              )}
              {d.status === "cancelled" && <Button size="sm" label="Reopen" onClick={() => void setStatus("open")} />}
              {d.status !== "completed" && d.status !== "cancelled" && d.endDate < localISODate() && (
                <Button size="sm" label="Mark completed" onClick={() => void setStatus("completed")} />
              )}
              {d.bookingCount === 0 && <Button size="sm" variant="ghost" label="Delete" onClick={() => void remove()} />}
            </div>
          )}
        </td>
      </tr>
      {notice && (
        <tr>
          <td colSpan={7} className="px-3 pb-3">
            <Notice kind={notice.kind}>{notice.text}</Notice>
          </td>
        </tr>
      )}
    </>
  );
}

function DepartureForm({
  initial,
  trips,
  editor,
  onClose,
  row,
}: {
  initial: DepForm;
  trips: { id: string; title: string; slug: string; durationDays: number; basePricePaise: number }[];
  editor: Editor;
  onClose: () => void;
  row: AdminDepartureRow | null;
}) {
  const [f, setF] = useState<DepForm>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const trip = trips.find((t) => t.id === f.tripId);
  const set = <K extends keyof DepForm>(k: K, v: DepForm[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true);
    const r = await editor.save("departure.save", f);
    setBusy(false);
    if (!r.ok) return setNotice({ kind: "error", text: r.error });
    setNotice({ kind: "ok", text: r.message });
    onClose();
  }

  return (
    <div className="rounded-2xl border border-forest-800/30 bg-cream-100/70 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-forest-900">{f.id ? `Edit ${initial.departureCode}` : "Add a date"}</h3>
        <Button size="sm" variant="ghost" label="Close" onClick={onClose} />
      </div>
      {row && row.seatsTaken > 0 && (
        <div className="mb-4">
          <Banner
            status="info"
            title={`${row.seatsTaken} seat(s) already taken or held on this date`}
            description="Seats per car can't go below that. Bookings keep the price they were made at."
            collapsible={false}
          />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Selector
          label="Trip"
          value={f.tripId}
          isDisabled={Boolean(row && row.bookingCount > 0)}
          options={trips.map((t) => ({ value: t.id, label: t.title }))}
          onChange={(tripId) => {
            const t = trips.find((x) => x.id === tripId);
            setF((x) => ({
              ...x,
              tripId,
              ...(x.id ? {} : { departureCode: t ? suggestCode(t.slug, x.startDate) : x.departureCode, ...defaultsFor(x.startDate, t?.durationDays ?? 3) }),
            }));
          }}
        />
        <TextInput label="Code" description="Shown to customers and on receipts." value={f.departureCode} onChange={(v) => set("departureCode", v.toUpperCase())} />
        <Selector
          label="Type"
          value={f.departureType}
          options={(Object.keys(TYPE_LABEL) as DepartureType[]).map((k) => ({ value: k, label: TYPE_LABEL[k] }))}
          onChange={(v) => set("departureType", v as DepartureType)}
        />
        <label className="block text-sm">
          <span className="font-semibold text-ink-900">Start date</span>
          <input
            type="date"
            value={f.startDate}
            onChange={(e) => {
              const startDate = e.target.value;
              setF((x) => ({
                ...x,
                startDate,
                ...(x.id ? {} : { ...defaultsFor(startDate, trip?.durationDays ?? 3), departureCode: trip ? suggestCode(trip.slug, startDate) : x.departureCode }),
              }));
            }}
            className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-ink-900">Return date</span>
          <input
            type="date"
            value={f.endDate}
            min={f.startDate}
            onChange={(e) => set("endDate", e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <MoneyField
          label="Special price per seat (₹)"
          description={trip ? `Empty = trip price ${rupees(trip.basePricePaise)}` : undefined}
          paise={f.priceOverridePaise}
          isOptional
          onChange={(p) => set("priceOverridePaise", p)}
        />
        <NumberInput label="Seats in the car" value={f.maxCapacity} onChange={(v) => set("maxCapacity", Math.round(v))} />
        <NumberInput label="Minimum to run" value={f.minOccupancy} onChange={(v) => set("minOccupancy", Math.round(v))} />
        <div className="self-end pb-1">
          <Switch label="Show on website" value={f.isPublished} onChange={(v) => set("isPublished", v)} />
        </div>
        <DateTimeField label="Bookings close" description="Must be before the start date." value={f.bookingCutoffAt} onChange={(v) => set("bookingCutoffAt", v)} />
        <DateTimeField
          label="Comfort-request deadline"
          description="Same-gender / women-only requests decided by then."
          value={f.preferenceDeadlineAt}
          onChange={(v) => set("preferenceDeadlineAt", v)}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" label={f.id ? "Save date" : "Add date"} isLoading={busy} onClick={() => void save()} />
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      </div>
    </div>
  );
}
