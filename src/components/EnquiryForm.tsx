"use client";

import { CalendarHeart, CheckCircle2, MessageCircleQuestion, Route, Users } from "lucide-react";
import { useState } from "react";

type Kind = "private_date" | "group" | "custom_trip" | "general";

const KINDS: { value: Kind; label: string; hint: string; icon: typeof Users }[] = [
  { value: "private_date", label: "Private car, my date", hint: "Your group, your date, the whole car", icon: CalendarHeart },
  { value: "group", label: "Bigger group", hint: "Office, college or family of 7+", icon: Users },
  { value: "custom_trip", label: "Custom trip", hint: "A place or plan we don't list yet", icon: Route },
  { value: "general", label: "Question", hint: "Anything else", icon: MessageCircleQuestion },
];

/**
 * "Ask us" form for what the calendar can't book: private dates, bigger groups, custom routes.
 * Lands in the admin Enquiries inbox; staff reply on WhatsApp.
 */
export function EnquiryForm({
  tripId = null,
  tripTitle,
  defaultKind = "private_date",
  compact = false,
}: {
  tripId?: string | null;
  tripTitle?: string;
  defaultKind?: Kind;
  compact?: boolean;
}) {
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [preferredDates, setPreferredDates] = useState("");
  const [groupSize, setGroupSize] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const size = groupSize.trim() ? Number(groupSize) : null;
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          fullName,
          phone,
          email,
          tripId,
          preferredDates,
          groupSize: size !== null && Number.isFinite(size) ? Math.round(size) : null,
          message,
          website,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not send. Please WhatsApp us instead.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="card-soft flex items-start gap-3 p-5">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-forest-700" aria-hidden="true" />
        <div>
          <p className="font-display text-lg font-semibold text-forest-900">Got it — thank you, {fullName.split(/\s+/)[0]}!</p>
          <p className="mt-1 text-sm text-stone-600">
            We&apos;ll WhatsApp you on {phone} with dates and a price, usually within a few hours (9 AM – 8 PM).
          </p>
        </div>
      </div>
    );
  }

  const input = "mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-forest-700 focus:outline-none focus:ring-2 focus:ring-lagoon-500/30";

  return (
    <form onSubmit={submit} className="card-soft space-y-4 p-5 sm:p-6">
      <div>
        <p className="eyebrow text-copper-700">Can&apos;t find your date?</p>
        <h2 className="font-display text-2xl font-semibold text-forest-900">
          {tripTitle ? `Ask us about ${tripTitle}` : "Ask us for a private or custom trip"}
        </h2>
        {!compact && (
          <p className="mt-1 text-sm text-stone-600">Tell us what you have in mind. A real person replies on WhatsApp — no payment needed to ask.</p>
        )}
      </div>

      <fieldset>
        <legend className="sr-only">What do you need?</legend>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => {
            const active = k.value === kind;
            return (
              <button
                key={k.value}
                type="button"
                aria-pressed={active}
                onClick={() => setKind(k.value)}
                className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition ${
                  active ? "border-forest-900 bg-white ring-1 ring-forest-900" : "border-stone-200 bg-white/70 hover:border-stone-300"
                }`}
              >
                <k.icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-copper-600" : "text-forest-700"}`} aria-hidden="true" />
                <span>
                  <span className="block text-xs font-semibold text-ink-900">{k.label}</span>
                  <span className="block text-[11px] leading-snug text-stone-600">{k.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink-900">
          Your name
          <input required minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} autoComplete="name" />
        </label>
        <label className="block text-xs font-medium text-ink-900">
          WhatsApp number
          <input
            required
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={input}
            placeholder="98xxxxxxxx"
            autoComplete="tel-national"
          />
        </label>
        <label className="block text-xs font-medium text-ink-900">
          Dates you like
          <input value={preferredDates} maxLength={120} onChange={(e) => setPreferredDates(e.target.value)} className={input} placeholder="e.g. 20–22 Dec, any weekend in Jan" />
        </label>
        <label className="block text-xs font-medium text-ink-900">
          How many people
          <input type="number" min={1} max={60} value={groupSize} onChange={(e) => setGroupSize(e.target.value)} className={input} />
        </label>
      </div>
      <label className="block text-xs font-medium text-ink-900">
        Anything else (optional)
        <textarea rows={3} maxLength={1500} value={message} onChange={(e) => setMessage(e.target.value)} className={input} placeholder="Elders travelling, food needs, places you want to see…" />
      </label>
      <label className="block text-xs font-medium text-ink-900">
        Email (optional)
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} autoComplete="email" />
      </label>
      {/* Hidden from people; bots that fill every field get refused. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-[#fdecec] px-3 py-2 text-sm text-[#9b1c1c]">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-sunset w-full justify-center disabled:opacity-60">
        {busy ? "Sending…" : "Send — we'll WhatsApp you"}
      </button>
      <p className="text-[11px] text-stone-600">We use your number only to reply to this request.</p>
    </form>
  );
}
