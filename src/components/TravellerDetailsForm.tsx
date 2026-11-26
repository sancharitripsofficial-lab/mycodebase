"use client";

import { AlertCircle, CheckCircle2, Copy, MapPin } from "lucide-react";
import { useState } from "react";
import { AGE_RANGES } from "@/lib/age";
import { editableTravelerName } from "@/lib/traveler-details";
import type { BookingTraveler, CoTravelerPreference, PickupPoint, RoomPreference } from "@/lib/types";

interface Row {
  id: string;
  fullName: string;
  /** Kept as typed text; sent as a number. */
  age: string;
  emergencyContact: string;
  dietaryNotes: string;
  roomPreference: RoomPreference;
  /** Not asked here (seats are chosen on the car map); the saved value is sent back unchanged. */
  seatRowRequest: BookingTraveler["seatRowRequest"];
}

const FIELD =
  "mt-1.5 block min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-base text-ink-900 placeholder:text-stone-600/70 focus:border-forest-800 sm:text-sm";

const COMFORT_OPTIONS: { value: CoTravelerPreference; title: string; desc: string }[] = [
  { value: "open_mixed", title: "Happy with a mixed group", desc: "The usual shared trip." },
  { value: "prefer_same_gender", title: "Prefer same-gender co-travellers", desc: "Our team checks if it is possible and tells you either way." },
  { value: "request_women_only", title: "Ask for a women-only trip", desc: "Women-only dates are scheduled by our team; we will tell you what is possible." },
];

const MIN_AGE = AGE_RANGES.adult.min;
const MAX_AGE = AGE_RANGES.senior.max;

/**
 * Step 2 of booking: who is travelling. Shown in My Booking once the seats are reserved.
 * One card per seat; the first is already in the name of the person who booked.
 */
export function TravellerDetailsForm({
  bookingReference,
  email,
  travelers,
  leadPhone,
  pickupOptions,
  pickupPointId,
  comfort,
  onSaved,
  onCancel,
}: {
  bookingReference: string;
  email: string;
  travelers: BookingTraveler[];
  /** The number of the person who booked: the step-1 stand-in for every emergency contact. */
  leadPhone: string;
  pickupOptions: PickupPoint[];
  pickupPointId: string | null;
  /** Null when the co-traveller request cannot be changed here (whole car, women-only date, already answered). */
  comfort: { preference: CoTravelerPreference } | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const samePhone = (a: string, b: string) => a.replace(/\D/g, "").slice(-10) === b.replace(/\D/g, "").slice(-10);
  const [rows, setRows] = useState<Row[]>(() =>
    travelers.map((t) => ({
      id: t.id,
      fullName: editableTravelerName(t.fullName),
      age: typeof t.ageYears === "number" ? String(t.ageYears) : "",
      // Step 1 stood in the booker's own number: an emergency contact should be someone else.
      emergencyContact: typeof t.ageYears === "number" || !samePhone(t.emergencyContact, leadPhone) ? t.emergencyContact : "",
      dietaryNotes: t.dietaryNotes ?? "",
      roomPreference: t.roomPreference,
      seatRowRequest: t.seatRowRequest,
    }))
  );
  const [pickup, setPickup] = useState<string>(pickupPointId ?? "");
  const [preference, setPreference] = useState<CoTravelerPreference>(comfort?.preference ?? "open_mixed");
  const [preferenceNotes, setPreferenceNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; index: number | null } | null>(null);

  const update = (index: number, patch: Partial<Row>) => {
    setError(null);
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    for (let i = 0; i < rows.length; i++) {
      const age = Number(rows[i].age);
      if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
        setError({ text: `Traveller ${i + 1}: enter an age from ${MIN_AGE} to ${MAX_AGE}. Trips are for adults.`, index: i });
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/bookings/travelers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingReference,
          email,
          pickupPointId: pickup || null,
          travelers: rows.map((r) => {
            const age = Number(r.age);
            return {
              id: r.id,
              fullName: r.fullName,
              // The age decides the group: 60 and above is a senior.
              ageGroup: age >= AGE_RANGES.senior.min ? "senior" : "adult",
              ageYears: age,
              emergencyContact: r.emergencyContact,
              dietaryNotes: r.dietaryNotes,
              seatRowRequest: r.seatRowRequest,
              roomPreference: r.roomPreference,
            };
          }),
          ...(comfort ? { coTravelerPreference: preference, preferenceNotes } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ text: json.error || "Could not save the traveller details. Please try again.", index: typeof json.travelerIndex === "number" ? json.travelerIndex : null });
        return;
      }
      onSaved();
    } catch {
      setError({ text: "Network problem. Your details are still here: please save again.", index: null });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-3">
        {rows.map((r, i) => (
          <fieldset
            key={r.id}
            className={`space-y-3 rounded-2xl border bg-white p-4 ${error?.index === i ? "border-red-400 ring-1 ring-red-300" : "border-stone-200"}`}
          >
            <legend className="px-1 font-display text-base font-semibold text-forest-900">
              Traveller {i + 1}
              {i === 0 && <span className="font-sans text-xs font-normal text-stone-600"> (the person who booked)</span>}
            </legend>
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <label className="block text-xs font-semibold text-ink-900">
                Full name, as on their ID
                <input required type="text" autoComplete={i === 0 ? "name" : "off"} minLength={2} maxLength={120} value={r.fullName} onChange={(e) => update(i, { fullName: e.target.value })} className={FIELD} />
              </label>
              <label className="block text-xs font-semibold text-ink-900">
                Age
                <input
                  required
                  type="number"
                  inputMode="numeric"
                  min={MIN_AGE}
                  max={MAX_AGE}
                  step={1}
                  placeholder={`${MIN_AGE}+`}
                  value={r.age}
                  onChange={(e) => update(i, { age: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })}
                  className={FIELD}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-ink-900">
                Emergency contact number
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  pattern="[0-9+\-\s\(\)]{8,20}"
                  title="A phone number of a family member or friend who is not on this trip"
                  placeholder="A family member or friend"
                  value={r.emergencyContact}
                  onChange={(e) => update(i, { emergencyContact: e.target.value })}
                  className={FIELD}
                />
              </label>
              <label className="block text-xs font-semibold text-ink-900">
                Room request
                <select value={r.roomPreference} onChange={(e) => update(i, { roomPreference: e.target.value as RoomPreference })} className={FIELD}>
                  <option value="shared_same_gender">Shared same-gender room</option>
                  <option value="private_room_request">Private room, if available</option>
                  <option value="couple_friends_room_request">Room with my partner or friends</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold text-ink-900">
              Food, health or access needs <span className="font-normal text-stone-600">(optional)</span>
              <input
                type="text"
                maxLength={240}
                placeholder="Vegetarian, allergies, motion sickness, help with steps…"
                value={r.dietaryNotes}
                onChange={(e) => update(i, { dietaryNotes: e.target.value })}
                className={FIELD}
              />
            </label>
            {i === 0 && rows.length > 1 && r.emergencyContact.replace(/\D/g, "").length >= 8 && (
              <button
                type="button"
                onClick={() => setRows((prev) => prev.map((row) => ({ ...row, emergencyContact: r.emergencyContact })))}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-stone-300 bg-cream-100 px-3 text-xs font-semibold text-forest-900"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Use this emergency contact for everyone
              </button>
            )}
          </fieldset>
        ))}
      </div>

      {pickupOptions.length > 0 && (
        <label className="block text-xs font-semibold text-ink-900">
          <span className="flex items-center gap-1.5 font-display text-base text-forest-900">
            <MapPin className="h-4 w-4 text-copper-700" aria-hidden="true" /> Pick-up point in Bengaluru
          </span>
          <select value={pickup} onChange={(e) => setPickup(e.target.value)} className={FIELD}>
            <option value="">I will decide later</option>
            {pickupOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.pickupTimeLabel ? `, ${p.pickupTimeLabel}` : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block font-normal text-stone-600">The exact pin and time are shared before the trip.</span>
        </label>
      )}

      {comfort && (
        <fieldset className="space-y-2 rounded-2xl border border-forest-700/20 bg-white p-4">
          <legend className="px-1 font-display text-base font-semibold text-forest-900">Who you travel with</legend>
          <p className="text-xs leading-relaxed text-stone-600">
            Private to our team: never shown on the site, the seat map or a group chat. A request is not a guarantee; if we cannot arrange it, we
            contact you with options.
          </p>
          {COMFORT_OPTIONS.map((opt) => (
            <label key={opt.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${preference === opt.value ? "border-forest-900 bg-[#f3fbf7]" : "border-stone-200"}`}>
              <input type="radio" name="coTravelerPreference" checked={preference === opt.value} onChange={() => setPreference(opt.value)} className="mt-0.5 h-5 w-5 shrink-0 accent-forest-900" />
              <span>
                <span className="block text-sm font-semibold text-ink-900">{opt.title}</span>
                <span className="block text-xs text-stone-600">{opt.desc}</span>
              </span>
            </label>
          ))}
          {preference !== "open_mixed" && (
            <label className="block text-xs font-semibold text-ink-900">
              Anything our team should know <span className="font-normal text-stone-600">(optional)</span>
              <input type="text" maxLength={300} value={preferenceNotes} onChange={(e) => setPreferenceNotes(e.target.value)} className={FIELD} />
            </label>
          )}
        </fieldset>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error.text}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="btn-sunset min-h-12 flex-1 px-6 text-sm sm:flex-none">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {saving ? "Saving…" : "Save traveller details"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-12 rounded-full border border-stone-300 px-5 text-sm font-semibold text-forest-900">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
