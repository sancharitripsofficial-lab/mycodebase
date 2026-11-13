"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { MessageCircle, Phone, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Notice, Panel } from "@/components/admin/kit";
import { waLink } from "@/lib/admin/whatsapp";
import type { Enquiry, EnquiryStatus } from "@/lib/data/owner-ops";
import type { StaffRole, Trip } from "@/lib/types";

const KIND: Record<Enquiry["kind"], string> = {
  private_date: "Private car on my own date",
  custom_trip: "Custom trip",
  group: "Group / company trip",
  general: "Question",
};

const STATUS: Record<EnquiryStatus, { label: string; variant: "info" | "warning" | "success" | "neutral" }> = {
  new: { label: "New", variant: "warning" },
  contacted: { label: "Contacted", variant: "info" },
  converted: { label: "Booked", variant: "success" },
  closed: { label: "Closed", variant: "neutral" },
};

type Filter = "open" | "converted" | "closed" | "all";
const FILTERS: { key: Filter; label: string; test: (e: Enquiry) => boolean }[] = [
  { key: "open", label: "To answer", test: (e) => e.status === "new" || e.status === "contacted" },
  { key: "converted", label: "Booked", test: (e) => e.status === "converted" },
  { key: "closed", label: "Closed", test: (e) => e.status === "closed" },
  { key: "all", label: "All", test: () => true },
];

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

async function postOwnerOps(body: Record<string, unknown>): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/admin/owner-ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: String(json.error || "That did not work. Please try again.") };
    return { ok: true, json };
  } catch {
    return { ok: false, error: "Network problem — nothing was changed." };
  }
}

/** Requests from the website's "Ask us" form. Reply on WhatsApp, mark what happened, delete what you no longer need. */
export function EnquiriesSection({
  enquiries,
  trips,
  role,
  onChanged,
}: {
  enquiries: Enquiry[];
  trips: Trip[];
  role: StaffRole;
  onChanged: (message: string) => Promise<void>;
}) {
  const canEdit = role === "owner" || role === "ops";
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, enquiries.filter(f.test).length])) as Record<Filter, number>, [enquiries]);
  const tripTitle = (id: string | null) => (id ? trips.find((t) => t.id === id)?.title ?? null : null);

  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return enquiries.filter((e) => {
      if (!f.test(e)) return false;
      if (!q) return true;
      const hay = `${e.fullName} ${e.email ?? ""} ${e.message ?? ""} ${KIND[e.kind]} ${tripTitle(e.tripId) ?? ""}`.toLowerCase();
      return hay.includes(q) || (digits.length >= 3 && e.phone.replace(/\D/g, "").includes(digits));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiries, filter, query, trips]);

  const visiblePicked = shown.filter((e) => picked.has(e.id));
  const allShownPicked = shown.length > 0 && visiblePicked.length === shown.length;

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function deleteIds(ids: string[], what: string) {
    setBusy(true);
    setError(null);
    const r = await postOwnerOps({ kind: "delete_enquiries", ids });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    setPicked((cur) => {
      const next = new Set(cur);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setConfirmBulk(false);
    const n = Number(r.json.deleted ?? ids.length);
    await onChanged(`${what}: ${n} enquir${n === 1 ? "y" : "ies"} deleted.`);
    return true;
  }

  return (
    <Panel
      title="Enquiries"
      description="Private dates, custom trips and group requests from the website. Reply on WhatsApp the same day — most bookings come from a quick reply."
    >
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show enquiries">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setFilter(f.key);
              setConfirmBulk(false);
            }}
            aria-pressed={filter === f.key}
            className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
              filter === f.key ? "bg-forest-900 text-white" : "border border-stone-200 bg-white text-stone-600 hover:bg-lagoon-100"
            }`}
          >
            {f.label} <span className={filter === f.key ? "text-white/80" : "text-stone-500"}>({counts[f.key]})</span>
          </button>
        ))}
      </div>

      <label className="relative block">
        <span className="sr-only">Search enquiries</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-600" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, email or message"
          className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pr-3 pl-9 text-sm text-ink-900"
        />
      </label>

      {canEdit && shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-cream-100 px-3 py-2 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-ink-900">
            <input
              type="checkbox"
              className="h-4 w-4 accent-forest-900"
              checked={allShownPicked}
              onChange={() =>
                setPicked((cur) => {
                  const next = new Set(cur);
                  if (allShownPicked) shown.forEach((e) => next.delete(e.id));
                  else shown.forEach((e) => next.add(e.id));
                  return next;
                })
              }
            />
            Select all shown ({shown.length})
          </label>
          {visiblePicked.length > 0 && !confirmBulk && (
            <button
              type="button"
              onClick={() => setConfirmBulk(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete selected ({visiblePicked.length})
            </button>
          )}
          {confirmBulk && (
            <span className="flex flex-wrap items-center gap-2" role="alert">
              <span className="text-xs font-semibold text-red-700">
                Delete {visiblePicked.length} enquir{visiblePicked.length === 1 ? "y" : "ies"} for good? Names, phones and messages are removed.
              </span>
              <Button size="sm" variant="destructive" label="Yes, delete" isLoading={busy} onClick={() => void deleteIds(visiblePicked.map((e) => e.id), "Deleted")} />
              <Button size="sm" variant="ghost" label="Cancel" onClick={() => setConfirmBulk(false)} />
            </span>
          )}
        </div>
      )}
      {error && <Notice kind="error">{error}</Notice>}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-600">
          {query ? "No enquiry matches that search." : filter === "open" ? "Nothing waiting — all answered." : "No enquiries here."}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((e) => (
            <EnquiryCard
              key={e.id}
              e={e}
              tripTitle={tripTitle(e.tripId)}
              canEdit={canEdit}
              picked={picked.has(e.id)}
              onPick={() => toggle(e.id)}
              onDelete={() => deleteIds([e.id], `Enquiry from ${e.fullName}`)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function EnquiryCard({
  e,
  tripTitle,
  canEdit,
  picked,
  onPick,
  onDelete,
  onChanged,
}: {
  e: Enquiry;
  tripTitle: string | null;
  canEdit: boolean;
  picked: boolean;
  onPick: () => void;
  onDelete: () => Promise<boolean>;
  onChanged: (message: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<EnquiryStatus>(e.status);
  const [note, setNote] = useState(e.staffNote);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = status !== e.status || note.trim() !== e.staffNote.trim();
  const reply = waLink(
    e.phone,
    `Hi ${e.fullName.split(/\s+/)[0]}, this is Sanchari Micro Trips — thanks for your ${KIND[e.kind].toLowerCase()} request${
      tripTitle ? ` for ${tripTitle}` : ""
    }. `
  );

  async function save() {
    setBusy(true);
    setError(null);
    const r = await postOwnerOps({ kind: "update_enquiry", id: e.id, status, staffNote: note });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await onChanged(`Enquiry from ${e.fullName} saved as ${STATUS[status].label.toLowerCase()}.`);
  }

  return (
    <li className={`min-w-0 space-y-3 rounded-2xl border bg-white p-4 text-sm ${picked ? "border-forest-700 ring-1 ring-forest-700" : "border-stone-200"}`}>
      <div className="flex items-start gap-3">
        {canEdit && (
          <input
            type="checkbox"
            checked={picked}
            onChange={onPick}
            aria-label={`Select enquiry from ${e.fullName}`}
            className="mt-1 h-4 w-4 shrink-0 accent-forest-900"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 font-semibold break-words text-ink-900">
              {e.fullName} <span className="font-normal text-stone-600">• {KIND[e.kind]}</span>
            </p>
            <Badge variant={STATUS[e.status].variant} label={STATUS[e.status].label} />
          </div>
          <p className="mt-0.5 text-xs break-words text-stone-600">
            Sent{" "}
            {new Date(e.createdAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
              timeZone: "Asia/Kolkata",
            })}
            {tripTitle ? ` • ${tripTitle}` : ""}
            {e.groupSize ? ` • ${people(e.groupSize)}` : ""}
            {e.preferredDates ? ` • Dates: ${e.preferredDates}` : ""}
          </p>
        </div>
      </div>
      {e.message && <p className="rounded-xl bg-cream-100 px-3 py-2 break-words whitespace-pre-line text-ink-900">{e.message}</p>}
      <p className="flex flex-wrap items-center gap-3 text-xs">
        <a href={`tel:${e.phone}`} className="inline-flex min-h-9 items-center gap-1 font-semibold text-forest-800 hover:underline">
          <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {e.phone}
        </a>
        {reply && (
          <a
            href={reply}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#25D366]/15 px-3 py-1.5 font-semibold text-[#0f6b3a] hover:bg-[#25D366]/25"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Reply on WhatsApp
          </a>
        )}
        {e.email && (
          <a href={`mailto:${e.email}`} className="min-w-0 break-all text-stone-600 hover:underline">
            {e.email}
          </a>
        )}
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      {canEdit && (
        <div className="grid items-end gap-3 sm:grid-cols-[200px_minmax(0,1fr)_auto]">
          <Selector
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as EnquiryStatus)}
            options={(Object.keys(STATUS) as EnquiryStatus[]).map((k) => ({ value: k, label: STATUS[k].label }))}
          />
          <TextInput label="Staff note" value={note} onChange={setNote} placeholder="Quoted ₹62,000 for 6, waiting for reply" />
          <Button size="sm" variant="primary" label={dirty ? "Save" : "Saved"} isDisabled={!dirty} isLoading={busy} onClick={() => void save()} />
        </div>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 pt-2">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
            </button>
          ) : (
            <span className="flex flex-wrap items-center justify-end gap-2" role="alert">
              <span className="text-xs font-semibold text-red-700">Delete this enquiry for good?</span>
              <Button
                size="sm"
                variant="destructive"
                label="Yes, delete"
                isLoading={deleting}
                onClick={async () => {
                  setDeleting(true);
                  const ok = await onDelete();
                  setDeleting(false);
                  if (!ok) setConfirmDelete(false);
                }}
              />
              <Button size="sm" variant="ghost" label="Cancel" onClick={() => setConfirmDelete(false)} />
            </span>
          )}
        </div>
      )}
    </li>
  );
}
