"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { MessageCircle, Phone } from "lucide-react";
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

/** Requests from the website's "Ask us" form. Reply on WhatsApp, then mark what happened. */
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
  const [filter, setFilter] = useState<"open" | "all">("open");
  const shown = useMemo(
    () => enquiries.filter((e) => (filter === "all" ? true : e.status === "new" || e.status === "contacted")),
    [enquiries, filter]
  );
  const tripTitle = (id: string | null) => (id ? trips.find((t) => t.id === id)?.title ?? null : null);

  return (
    <Panel
      title="Enquiries"
      description="Private dates, custom trips and group requests from the website. Reply on WhatsApp the same day — most bookings come from a quick reply."
    >
      <div className="flex gap-1.5">
        {(["open", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              filter === f ? "bg-forest-900 text-white" : "bg-white text-stone-600 hover:bg-lagoon-100"
            }`}
          >
            {f === "open" ? "To answer" : "All"}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-stone-600">{filter === "open" ? "Nothing waiting." : "No enquiries yet."}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((e) => (
            <EnquiryCard key={e.id} e={e} tripTitle={tripTitle(e.tripId)} canEdit={role === "owner" || role === "ops"} onChanged={onChanged} />
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
  onChanged,
}: {
  e: Enquiry;
  tripTitle: string | null;
  canEdit: boolean;
  onChanged: (message: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<EnquiryStatus>(e.status);
  const [note, setNote] = useState(e.staffNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reply = waLink(
    e.phone,
    `Hi ${e.fullName.split(/\s+/)[0]}, this is Sanchari Micro Trips — thanks for your ${KIND[e.kind].toLowerCase()} request${
      tripTitle ? ` for ${tripTitle}` : ""
    }. `
  );

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/owner-ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "update_enquiry", id: e.id, status, staffNote: note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not save.");
        return;
      }
      await onChanged(`Enquiry from ${e.fullName} marked ${STATUS[status].label.toLowerCase()}.`);
    } catch {
      setError("Network problem — nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink-900">
            {e.fullName} <span className="font-normal text-stone-600">• {KIND[e.kind]}</span>
          </p>
          <p className="text-xs text-stone-600">
            {new Date(e.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            {tripTitle ? ` • ${tripTitle}` : ""}
            {e.groupSize ? ` • ${e.groupSize} people` : ""}
            {e.preferredDates ? ` • ${e.preferredDates}` : ""}
          </p>
        </div>
        <Badge variant={STATUS[e.status].variant} label={STATUS[e.status].label} />
      </div>
      {e.message && <p className="whitespace-pre-line rounded-xl bg-cream-100 px-3 py-2 text-ink-900">{e.message}</p>}
      <p className="flex flex-wrap items-center gap-3 text-xs">
        <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 font-semibold text-forest-800 hover:underline">
          <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {e.phone}
        </a>
        {reply && (
          <a
            href={reply}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366]/15 px-3 py-1.5 font-semibold text-[#0f6b3a] hover:bg-[#25D366]/25"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Reply on WhatsApp
          </a>
        )}
        {e.email && <span className="text-stone-600">{e.email}</span>}
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      {canEdit && (
        <div className="grid items-end gap-3 sm:grid-cols-[200px_1fr_auto]">
          <Selector
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as EnquiryStatus)}
            options={(Object.keys(STATUS) as EnquiryStatus[]).map((k) => ({ value: k, label: STATUS[k].label }))}
          />
          <TextInput label="Staff note" value={note} onChange={setNote} placeholder="Quoted ₹62,000 for 6, waiting for reply" />
          <Button size="sm" variant="primary" label="Save" isLoading={busy} onClick={() => void save()} />
        </div>
      )}
    </li>
  );
}
