"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Copy, MessageCircle, Phone, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Notice, Panel, rupees } from "@/components/admin/kit";
import { ErtigaSeatMap } from "@/components/booking/ErtigaSeatMap";
import { myBookingUrl, tripDetailsText, waLink } from "@/lib/admin/whatsapp";
import type { DepartureCrew } from "@/lib/data/owner-ops";
import { localISODate } from "@/lib/dates";
import type { AdminBookingRow, PublicDepartureAvailability, StaffRole } from "@/lib/types";

type Dep = PublicDepartureAvailability & { tripTitle: string };

const ACTIVE = ["pending_payment", "deposit_paid", "confirmed", "cancel_requested"];

function emptyCrew(departureId: string): DepartureCrew {
  return {
    departureId,
    driverName: "",
    driverPhone: "",
    vehicleNumber: "",
    whatsappGroupUrl: "",
    reportingNote: "",
    operatorNotes: "",
    updatedAt: null,
  };
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** One printable sheet per date: who is travelling, where they sit, who to call, who drives. */
export function TripSheets({
  bookings,
  departures,
  crew,
  role,
  siteUrl,
  onCrewSaved,
}: {
  bookings: AdminBookingRow[];
  departures: Dep[];
  crew: DepartureCrew[];
  role: StaffRole;
  siteUrl: string;
  onCrewSaved: (message: string) => Promise<void>;
}) {
  const canEdit = role === "owner" || role === "ops";
  const today = localISODate();
  const [showPast, setShowPast] = useState(false);

  const list = useMemo(
    () =>
      departures
        .filter((d) => (showPast ? true : d.endDate >= today))
        .sort((a, b) => (showPast ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate))),
    [departures, showPast, today]
  );

  const firstWithPeople =
    list.find((d) => bookings.some((b) => b.booking.departureId === d.departureId && ACTIVE.includes(b.booking.status))) ??
    list[0];
  const [depId, setDepId] = useState<string>(firstWithPeople?.departureId ?? "");
  useEffect(() => {
    if (!list.some((d) => d.departureId === depId)) setDepId(firstWithPeople?.departureId ?? "");
  }, [list, depId, firstWithPeople]);

  const dep = list.find((d) => d.departureId === depId) ?? null;
  const rows = useMemo(
    () =>
      bookings
        .filter((r) => r.booking.departureId === depId && ACTIVE.includes(r.booking.status))
        .filter((r) => r.booking.status !== "pending_payment" || r.seatNumbers.length > 0)
        .sort((a, b) => (a.seatNumbers[0] ?? 99) - (b.seatNumbers[0] ?? 99)),
    [bookings, depId]
  );

  const savedCrew = crew.find((c) => c.departureId === depId) ?? emptyCrew(depId);
  const [form, setForm] = useState<DepartureCrew>(savedCrew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mapTaken, setMapTaken] = useState<number[] | null>(null);
  useEffect(() => {
    setForm(crew.find((c) => c.departureId === depId) ?? emptyCrew(depId));
    setError(null);
  }, [crew, depId]);
  // Every seat in use on the car, including seats staff blocked without a booking.
  useEffect(() => {
    if (!depId) return;
    let cancelled = false;
    setMapTaken(null);
    fetch(`/api/departures/${depId}/seats`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { taken?: number[] } | null) => {
        if (!cancelled && j && Array.isArray(j.taken)) setMapTaken(j.taken);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [depId, bookings]);

  if (!dep) {
    return (
      <Panel title="Trip sheets" description="Add a date under Dates & seats first.">
        <p className="text-sm text-stone-600">No dates yet.</p>
      </Panel>
    );
  }

  const bookedSeats = rows.flatMap((r) => r.seatNumbers);
  const takenSeats = Array.from(new Set([...bookedSeats, ...(mapTaken ?? [])])).sort((a, b) => a - b);
  const blockedSeats = takenSeats.filter((s) => !bookedSeats.includes(s));
  const paidRows = rows.filter((r) => ["confirmed", "deposit_paid"].includes(r.booking.status));
  const travellerCount = rows.reduce((s, r) => s + Math.max(r.travelers.length, r.booking.seatsRequested), 0);
  const collected = rows.reduce((s, r) => s + r.booking.amountPaidPaise - (r.booking.amountRefundedPaise ?? 0), 0);
  const due = rows.filter((r) => r.booking.status === "deposit_paid").reduce((s, r) => s + r.booking.amountDuePaise, 0);
  const set = <K extends keyof DepartureCrew>(k: K, v: DepartureCrew[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function saveCrew() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/owner-ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "save_crew", ...form, departureId: depId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not save.");
        return;
      }
      await onCrewSaved(`${dep?.departureCode}: driver, vehicle and group link saved.`);
    } catch {
      setError("Network problem — nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  const phones = Array.from(new Set(rows.map((r) => r.booking.customerPhone))).join(", ");

  return (
    <div className="space-y-5">
      <Panel
        title="Trip sheet"
        description="Everything for one date on one page. Print it or keep it open on the phone on the trip day."
        actions={<Button size="sm" label="Print" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()} />}
      >
        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div className="min-w-[260px] flex-1">
            <Selector
              label="Date"
              value={depId}
              onChange={setDepId}
              options={list.map((d) => ({
                value: d.departureId,
                label: `${d.startDate} • ${d.tripTitle} • ${d.departureCode} (${d.seatsTaken}/${d.maxCapacity})`,
              }))}
            />
          </div>
          <Switch label="Show past dates" value={showPast} onChange={setShowPast} />
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-2xl font-semibold text-forest-900">{dep.tripTitle}</p>
              <p className="text-sm text-stone-600">
                {dep.departureCode} • {fmtDate(dep.startDate)} → {fmtDate(dep.endDate)}
              </p>
            </div>
            <Badge
              variant={dep.status === "cancelled" ? "neutral" : dep.seatsTaken >= dep.minOccupancy ? "success" : "warning"}
              label={dep.status === "cancelled" ? "Cancelled" : dep.seatsTaken >= dep.minOccupancy ? "Running" : `Below minimum (${dep.minOccupancy})`}
            />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Seats", `${takenSeats.length} of ${dep.maxCapacity}${blockedSeats.length ? ` (${blockedSeats.length} blocked)` : ""}`],
              ["Travellers", String(travellerCount)],
              ["Collected", rupees(collected)],
              ["Balance due", rupees(due)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-lagoon-100/50 px-3 py-2">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-stone-600">{k}</dt>
                <dd className="font-display text-lg font-semibold text-forest-900">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title="Travellers"
          description={`${paidRows.length} paid booking${paidRows.length === 1 ? "" : "s"}${rows.length > paidRows.length ? `, ${rows.length - paidRows.length} waiting for payment` : ""}.`}
          actions={
            rows.length > 0 ? (
              <Button
                size="sm"
                label={copied ? "Copied" : "Copy phone numbers"}
                icon={<Copy className="h-4 w-4" />}
                onClick={() => {
                  void navigator.clipboard.writeText(phones);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
              />
            ) : undefined
          }
        >
          {rows.length === 0 ? (
            <p className="text-sm text-stone-600">Nobody has booked this date yet.</p>
          ) : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-y-1.5 text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-stone-600">
                    <th className="px-2">Seat</th>
                    <th className="px-2">Traveller</th>
                    <th className="px-2">Emergency contact</th>
                    <th className="px-2">Booking</th>
                    <th className="px-2">Money</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const b = r.booking;
                    const people = r.travelers.length > 0 ? r.travelers : [];
                    const wa = waLink(
                      b.customerPhone,
                      tripDetailsText({
                        customerName: b.customerName,
                        tripTitle: r.tripTitle,
                        departureCode: r.departureCode,
                        startDate: r.departureStartDate,
                        seatNumbers: r.seatNumbers,
                        pickupName: r.pickupName,
                        driverName: savedCrew.driverName,
                        driverPhone: savedCrew.driverPhone,
                        vehicleNumber: savedCrew.vehicleNumber,
                        whatsappGroupUrl: savedCrew.whatsappGroupUrl,
                        reportingNote: savedCrew.reportingNote,
                        bookingUrl: myBookingUrl(siteUrl, b.bookingReference, b.customerEmail, r.lookupToken),
                      })
                    );
                    return (
                      <tr key={b.id} className="align-top">
                        <td className="rounded-l-xl bg-white px-2 py-2.5 font-display text-lg font-semibold text-forest-900">
                          {r.seatNumbers.length ? r.seatNumbers.join(", ") : "—"}
                        </td>
                        <td className="bg-white px-2 py-2.5">
                          {(people.length ? people : [{ id: "lead", fullName: b.customerName, ageGroup: "adult", dietaryNotes: "", verificationChecked: false }]).map(
                            (t) => (
                              <p key={t.id} className="leading-snug">
                                <strong className="text-ink-900">{t.fullName}</strong>
                                <span className="text-xs text-stone-600">
                                  {t.ageGroup === "senior" ? " • senior" : ""}
                                  {t.dietaryNotes ? ` • food: ${t.dietaryNotes}` : ""}
                                  {t.verificationChecked ? " • ID ✓" : ""}
                                </span>
                              </p>
                            )
                          )}
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <a href={`tel:${b.customerPhone}`} className="inline-flex items-center gap-1 font-semibold text-forest-800 hover:underline">
                              <Phone className="h-3 w-3" aria-hidden="true" /> {b.customerPhone}
                            </a>
                            {wa && (
                              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#0f6b3a] hover:underline print:hidden">
                                <MessageCircle className="h-3 w-3" aria-hidden="true" /> Send trip details
                              </a>
                            )}
                          </p>
                        </td>
                        <td className="bg-white px-2 py-2.5 text-xs text-ink-900">
                          {Array.from(new Set(people.map((t) => t.emergencyContact).filter(Boolean))).join(", ") || "—"}
                        </td>
                        <td className="bg-white px-2 py-2.5 text-xs">
                          <p className="font-mono font-bold text-forest-900">{b.bookingReference}</p>
                          <p className="text-stone-600">{r.pickupName ?? "Pickup not chosen"}</p>
                          {role !== "support" && r.comfortPreference && r.comfortPreference.coTravelerPreference !== "open_mixed" && (
                            <p className="mt-0.5 text-copper-700">Comfort: {r.comfortPreference.coTravelerPreference.replace(/_/g, " ")}</p>
                          )}
                        </td>
                        <td className="rounded-r-xl bg-white px-2 py-2.5 text-xs">
                          {b.status === "confirmed" ? (
                            <span className="font-semibold text-forest-800">Paid in full</span>
                          ) : b.status === "deposit_paid" ? (
                            <span className="font-semibold text-copper-700">Due {rupees(b.amountDuePaise)}</span>
                          ) : b.status === "cancel_requested" ? (
                            <span className="font-semibold text-copper-700">Asked to cancel</span>
                          ) : (
                            <span className="text-stone-600">Not paid yet (seat held)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel
            title="Seats"
            description={
              blockedSeats.length
                ? `Numbers match the car map customers see. Seat ${blockedSeats.join(", ")} ${blockedSeats.length === 1 ? "is" : "are"} blocked without a booking (Dates & seats).`
                : "Numbers match the car map customers see."
            }
          >
            <ErtigaSeatMap mode="view" takenSeats={takenSeats} selectedSeats={[]} maxCapacity={dep.maxCapacity} showLegend={false} />
          </Panel>

          <Panel
            title="Driver & vehicle"
            description="Booked travellers see the driver, vehicle, reporting note and group link in My Booking from 3 days before the trip."
          >
            {error && <Notice kind="error">{error}</Notice>}
            <div className="space-y-3">
              <TextInput label="Driver name" value={form.driverName} isDisabled={!canEdit} onChange={(v) => set("driverName", v)} />
              <TextInput label="Driver mobile" type="tel" value={form.driverPhone} isDisabled={!canEdit} onChange={(v) => set("driverPhone", v)} placeholder="98xxxxxxxx" />
              <TextInput label="Vehicle number" value={form.vehicleNumber} isDisabled={!canEdit} onChange={(v) => set("vehicleNumber", v.toUpperCase())} placeholder="KA 01 AB 1234" />
              <TextInput
                label="Trip WhatsApp group link"
                value={form.whatsappGroupUrl}
                isDisabled={!canEdit}
                onChange={(v) => set("whatsappGroupUrl", v.trim())}
                placeholder="https://chat.whatsapp.com/…"
              />
              <TextArea
                label="Reporting note for travellers"
                description="e.g. Reach Silk Board pickup by 5:45 AM, look for the white Ertiga."
                rows={2}
                value={form.reportingNote}
                isDisabled={!canEdit}
                onChange={(v) => set("reportingNote", v)}
              />
              <TextArea
                label="Staff-only notes"
                description="Never shown to customers."
                rows={2}
                value={form.operatorNotes}
                isDisabled={!canEdit}
                onChange={(v) => set("operatorNotes", v)}
              />
              {canEdit && <Button variant="primary" size="sm" label="Save driver & vehicle" isLoading={busy} onClick={() => void saveCrew()} />}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
