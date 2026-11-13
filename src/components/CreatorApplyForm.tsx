"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "facebook", label: "Facebook" },
  { value: "x", label: "X (Twitter)" },
  { value: "other", label: "Other" },
] as const;

export function CreatorApplyForm() {
  const [f, setF] = useState({
    fullName: "",
    phone: "",
    email: "",
    platform: "instagram",
    profileUrl: "",
    followers: "",
    message: "",
    consent: false,
    website: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/creators/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: f.fullName,
          phone: f.phone,
          email: f.email,
          platform: f.platform,
          profileUrl: f.profileUrl.trim(),
          followersClaimed: Number(f.followers.replace(/[^\d]/g, "")),
          message: f.message,
          consent: f.consent,
          website: f.website,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not send. Please try again.");
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
      <div role="status" className="card-soft flex items-start gap-3 p-6">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-forest-700" aria-hidden="true" />
        <div>
          <p className="font-display text-xl font-semibold text-forest-900">Application received — thank you!</p>
          <p className="mt-1 text-sm text-stone-600">
            We check your profile and message you on WhatsApp ({f.phone}) with your personal code, usually within 2 working days.
          </p>
        </div>
      </div>
    );
  }

  const input =
    "mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-forest-700 focus:outline-none focus:ring-2 focus:ring-lagoon-500/30";

  return (
    <form onSubmit={submit} className="card-soft space-y-4 p-5 sm:p-7">
      <h2 className="font-display text-2xl font-semibold text-forest-900">Apply as a creator</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink-900">
          Your name
          <input required minLength={2} maxLength={120} value={f.fullName} onChange={(e) => set("fullName", e.target.value)} className={input} autoComplete="name" />
        </label>
        <label className="block text-xs font-medium text-ink-900">
          WhatsApp number
          <input required type="tel" inputMode="numeric" value={f.phone} onChange={(e) => set("phone", e.target.value)} className={input} placeholder="98xxxxxxxx" autoComplete="tel-national" />
        </label>
        <label className="block text-xs font-medium text-ink-900 sm:col-span-2">
          Email (your code will only work with this email or the number above)
          <input required type="email" value={f.email} onChange={(e) => set("email", e.target.value)} className={input} autoComplete="email" />
        </label>
        <label className="block text-xs font-medium text-ink-900">
          Main platform
          <select value={f.platform} onChange={(e) => set("platform", e.target.value)} className={input}>
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-ink-900">
          Followers / subscribers
          <input required inputMode="numeric" value={f.followers} onChange={(e) => set("followers", e.target.value.replace(/[^\d,]/g, ""))} className={input} placeholder="e.g. 45,000" />
        </label>
        <label className="block text-xs font-medium text-ink-900 sm:col-span-2">
          Profile link
          <input required type="url" value={f.profileUrl} onChange={(e) => set("profileUrl", e.target.value)} className={input} placeholder="https://www.instagram.com/yourname" />
        </label>
        <label className="block text-xs font-medium text-ink-900 sm:col-span-2">
          What would you create with us? (optional)
          <textarea rows={3} maxLength={1500} value={f.message} onChange={(e) => set("message", e.target.value)} className={input} placeholder="Reels of the Coorg drive, a vlog of Hampi at sunrise…" />
        </label>
      </div>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} />
      </div>
      <label className="flex items-start gap-2 text-xs text-ink-900">
        <input type="checkbox" required checked={f.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 h-4 w-4 accent-forest-900" />
        <span>Sanchari may check my public profile and contact me on WhatsApp about this programme.</span>
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-[#fdecec] px-3 py-2 text-sm text-[#9b1c1c]">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-sunset w-full justify-center disabled:opacity-60">
        {busy ? "Sending…" : "Send application"}
      </button>
    </form>
  );
}
