"use client";

import { BellRing, CheckCircle2 } from "lucide-react";
import { useId, useState } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * "Notify me" for a trip with no date open: name + WhatsApp number, saved in the team's Enquiries
 * inbox with the trip attached. Replaces a booking button that would lead to nothing to book.
 */
export function NotifyMe({
  tripId,
  tripTitle,
  tripSlug,
  label = "Notify me about new dates",
  className = "",
}: {
  tripId: string;
  tripTitle: string;
  tripSlug: string;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "general",
          fullName,
          phone,
          email: "",
          tripId,
          preferredDates: "",
          groupSize: null,
          message: `Notify me when new dates open for ${tripTitle}.`,
          website,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not save your request. Please try again.");
        return;
      }
      trackEvent("notify_me", { trip: tripSlug });
      setSent(true);
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p role="status" className={`flex items-start gap-2 rounded-2xl bg-[#dcf3e3] px-4 py-3 text-sm font-medium text-[#12603e] ${className}`}>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Done. We will WhatsApp you when a date opens for this trip.</span>
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-expanded="false" aria-controls={id} className={`btn-ocean min-h-12 w-full px-4 text-sm ${className}`}>
        <BellRing className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
    );
  }

  return (
    <form id={id} onSubmit={submit} className={`space-y-2.5 rounded-2xl border border-forest-700/25 bg-white p-3.5 ${className}`}>
      <p className="text-sm font-semibold text-forest-900">Tell me when dates open</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-ink-900">
          Your name
          <input
            required
            autoFocus
            type="text"
            autoComplete="name"
            minLength={2}
            maxLength={120}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 block min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base sm:text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-ink-900">
          WhatsApp number
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="10-digit mobile"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base sm:text-sm"
          />
        </label>
      </div>
      {/* Left empty by people; filled in by form-filling bots. */}
      <label className="hidden" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-ocean min-h-12 w-full px-4 text-sm">
        <BellRing className="h-4 w-4" aria-hidden="true" />
        {busy ? "Saving…" : "Notify me"}
      </button>
      <p className="text-[11px] leading-relaxed text-stone-600">We use your number only to tell you about this trip&apos;s dates.</p>
    </form>
  );
}
