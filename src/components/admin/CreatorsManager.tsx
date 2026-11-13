"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ExternalLink, MessageCircle, Phone, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTimeField, Notice, Panel, rupees } from "@/components/admin/kit";
import { waLink } from "@/lib/admin/whatsapp";
import type { Coupon, CreatorApplication, DiscountType, InfluencerTier } from "@/lib/data/creators";
import type { StaffRole, Trip } from "@/lib/types";

type Tab = "applications" | "ranges" | "coupons";
interface Data {
  tiers: InfluencerTier[];
  applications: CreatorApplication[];
  coupons: Coupon[];
  ready: boolean;
}

const fmtN = (n: number) => n.toLocaleString("en-IN");

function reward(t: { discountType: DiscountType; discountValue: number; maxDiscountPaise: number | null }): string {
  if (t.discountType === "percent") return `${t.discountValue}% off${t.maxDiscountPaise ? ` (max ${rupees(t.maxDiscountPaise)})` : ""}`;
  if (t.discountType === "flat") return `${rupees(t.discountValue)} off`;
  return `${t.discountValue} free seat${t.discountValue === 1 ? "" : "s"}`;
}

function tierFor(tiers: InfluencerTier[], followers: number): InfluencerTier | null {
  return (
    tiers
      .filter((t) => t.isActive && t.minFollowers <= followers && (t.maxFollowers === null || followers <= t.maxFollowers))
      .sort((a, b) => b.minFollowers - a.minFollowers)[0] ?? null
  );
}

function suggestCode(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "CREATOR";
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase().replace(/[^A-Z0-9]/g, "7");
  return `SAN-${base}-${rand}`;
}

/** Admin → Creators & coupons: follower ranges, creator applications and every coupon code. */
export function CreatorsManager({ role, trips }: { role: StaffRole; trips: Trip[] }) {
  const canEdit = role === "owner" || role === "ops";
  const [tab, setTab] = useState<Tab>("applications");
  const [data, setData] = useState<Data | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/creators", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setData(json as Data);
    else setNotice({ kind: "error", text: json.error || "Could not load." });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(
    async (body: Record<string, unknown>, ok: string): Promise<Record<string, unknown> | null> => {
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch("/api/admin/creators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNotice({ kind: "error", text: json.error || "That did not work." });
          return null;
        }
        setNotice({ kind: "ok", text: ok });
        await load();
        return json as Record<string, unknown>;
      } catch {
        setNotice({ kind: "error", text: "Network problem — nothing was saved." });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const pending = data?.applications.filter((a) => a.status === "pending").length ?? 0;

  return (
    <Panel
      title="Creators & coupons"
      description="Set follower ranges and their rewards, approve creators after checking their real follower count, and run coupon codes. The database enforces every limit when seats are held."
    >
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["applications", `Applications${pending ? ` (${pending})` : ""}`],
            ["ranges", "Follower ranges"],
            ["coupons", "Coupons"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${tab === k ? "bg-forest-900 text-white" : "bg-white text-stone-600 hover:bg-lagoon-100"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      {!data ? (
        <p className="text-sm text-stone-600">Loading…</p>
      ) : !data.ready ? (
        <Notice kind="error">Coupons and creators need the live database (preview mode can't store them).</Notice>
      ) : tab === "applications" ? (
        <Applications data={data} canEdit={canEdit} busy={busy} send={send} />
      ) : tab === "ranges" ? (
        <Ranges tiers={data.tiers} canEdit={canEdit} busy={busy} send={send} />
      ) : (
        <Coupons coupons={data.coupons} trips={trips} canEdit={canEdit} busy={busy} send={send} />
      )}
    </Panel>
  );
}

type Send = (body: Record<string, unknown>, ok: string) => Promise<Record<string, unknown> | null>;

// ---------------------------------------------------------------------------- applications
function Applications({ data, canEdit, busy, send }: { data: Data; canEdit: boolean; busy: boolean; send: Send }) {
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const list = data.applications.filter((a) => filter === "all" || a.status === "pending");
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(["pending", "all"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? "bg-lagoon-100 text-forest-900" : "text-stone-600"}`}>
            {f === "pending" ? "To check" : "All"}
          </button>
        ))}
      </div>
      {data.tiers.filter((t) => t.isActive).length === 0 && (
        <Notice kind="error">Add at least one follower range first (Follower ranges tab) — approval picks the reward from it.</Notice>
      )}
      {list.length === 0 ? (
        <p className="text-sm text-stone-600">{filter === "pending" ? "No applications waiting." : "No applications yet. Share the Creators page: /creators"}</p>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => (
            <ApplicationCard key={a.id} a={a} tiers={data.tiers} canEdit={canEdit} busy={busy} send={send} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ApplicationCard({ a, tiers, canEdit, busy, send }: { a: CreatorApplication; tiers: InfluencerTier[]; canEdit: boolean; busy: boolean; send: Send }) {
  const [followers, setFollowers] = useState(String(a.followersClaimed));
  const [code, setCode] = useState(() => suggestCode(a.fullName));
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<{ code: string; tierLabel: string; reward: string; validUntil: string } | null>(null);
  const verified = Number(followers.replace(/[^\d]/g, "")) || 0;
  const match = useMemo(() => tierFor(tiers, verified), [tiers, verified]);
  const approvedTier = tiers.find((t) => t.id === a.tierId) ?? null;
  const shownCode = issued?.code ?? a.couponCode;
  const message = shownCode
    ? `Hi ${a.fullName.split(/\s+/)[0]}, welcome to Sanchari creators! Your personal code is ${shownCode}${
        issued ? ` (${issued.reward}, valid until ${new Date(issued.validUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })})` : approvedTier ? ` (${reward(approvedTier)})` : ""
      }. It works once, with this number or ${a.email}. Pick a date at ${window.location.origin}/trips and enter the code under "Coupon or creator code". Can't wait to see your story!`
    : "";
  const wa = shownCode ? waLink(a.phone, message) : null;

  return (
    <li className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink-900">
            {a.fullName} <span className="font-normal text-stone-600">• {a.platform} • says {fmtN(a.followersClaimed)} followers</span>
          </p>
          <p className="flex flex-wrap items-center gap-3 text-xs">
            <a href={a.profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-forest-800 underline">
              Open profile <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1 text-stone-600">
              <Phone className="h-3 w-3" aria-hidden="true" /> {a.phone}
            </a>
            <span className="text-stone-600">{a.email}</span>
            <span className="text-stone-500">{new Date(a.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
          </p>
        </div>
        <Badge variant={a.status === "approved" ? "success" : a.status === "rejected" ? "neutral" : "warning"} label={a.status} />
      </div>
      {a.message && <p className="rounded-xl bg-cream-100 px-3 py-2 text-ink-900">{a.message}</p>}

      {a.status === "pending" && canEdit && !issued && (
        <div className="space-y-3 rounded-xl border border-lagoon-500/30 bg-lagoon-100/40 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput label="Followers you checked" description="Open the profile and type the real number." value={followers} onChange={(v) => setFollowers(v.replace(/[^\d]/g, ""))} />
            <TextInput label="Code to issue" value={code} onChange={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24))} />
            <TextInput label="Note (optional)" value={note} onChange={setNote} placeholder="Real, active audience" />
          </div>
          <p className={`text-sm font-semibold ${match ? "text-forest-900" : "text-copper-700"}`}>
            {match ? `→ ${match.label}: ${reward(match)} (valid ${match.validDays} days, one booking)` : "→ No range covers this number — add a range or reject."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              label="Approve & issue code"
              isLoading={busy}
              isDisabled={!match}
              onClick={async () => {
                const r = await send({ action: "approve", applicationId: a.id, followersVerified: verified, code, note }, `${a.fullName} approved — code issued.`);
                if (r?.result) setIssued(r.result as unknown as { code: string; tierLabel: string; reward: string; validUntil: string });
              }}
            />
            <Button
              size="sm"
              variant="destructive"
              label="Reject"
              isDisabled={busy}
              onClick={() => {
                const why = window.prompt(`Reject ${a.fullName}? Reason (kept in the audit log, at least 5 characters):`);
                if (why) void send({ action: "reject", applicationId: a.id, note: why }, `${a.fullName} rejected.`);
              }}
            />
          </div>
        </div>
      )}

      {shownCode && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#EAFBF1] px-3 py-2">
          <span className="font-mono text-base font-bold tracking-wide text-forest-900">{shownCode}</span>
          <span className="text-xs text-stone-600">
            {approvedTier ? `${approvedTier.label} • ${reward(approvedTier)}` : issued ? `${issued.tierLabel} • ${issued.reward}` : ""}
            {a.followersVerified !== null ? ` • verified ${fmtN(a.followersVerified)} followers` : ""}
          </span>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-[#073B1F]">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Send code on WhatsApp
            </a>
          )}
        </div>
      )}
      {a.status === "rejected" && a.staffNote && <p className="text-xs text-stone-600">Reason: {a.staffNote}</p>}
    </li>
  );
}

// ---------------------------------------------------------------------------- ranges
type TierDraft = Omit<InfluencerTier, "id"> & { id: string | null };
const blankTier = (): TierDraft => ({ id: null, label: "", minFollowers: 10000, maxFollowers: 49999, discountType: "percent", discountValue: 20, maxDiscountPaise: null, validDays: 90, isActive: true });

function Ranges({ tiers, canEdit, busy, send }: { tiers: InfluencerTier[]; canEdit: boolean; busy: boolean; send: Send }) {
  const [draft, setDraft] = useState<TierDraft | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">
        Each range gives creators in it one reward. Ranges can&apos;t overlap (the database refuses it). These show on the public Creators page.
      </p>
      {tiers.length === 0 ? (
        <p className="text-sm text-stone-600">No ranges yet. Example: 10,000–49,999 → 20% off; 50,000–1,99,999 → ₹2,000 off; 2,00,000+ → 1 free seat.</p>
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {tiers.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-[90px] font-semibold text-ink-900">{t.label}</span>
              <span className="text-stone-600">
                {fmtN(t.minFollowers)}
                {t.maxFollowers === null ? "+" : `–${fmtN(t.maxFollowers)}`} followers
              </span>
              <span className="font-semibold text-forest-900">{reward(t)}</span>
              <span className="text-xs text-stone-500">{t.validDays} days</span>
              {!t.isActive && <Badge variant="neutral" label="Off" />}
              {canEdit && (
                <span className="ml-auto flex gap-2">
                  <Button size="sm" label="Edit" onClick={() => setDraft({ ...t })} />
                  <Button
                    size="sm"
                    variant="destructive"
                    label="Delete"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    isDisabled={busy}
                    onClick={() => {
                      if (window.confirm(`Delete the range "${t.label}"? Codes already issued keep working.`)) void send({ action: "delete_tier", id: t.id }, `Range "${t.label}" deleted.`);
                    }}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && !draft && <Button label="Add range" icon={<Plus className="h-4 w-4" />} onClick={() => setDraft(blankTier())} />}
      {draft && (
        <div className="space-y-3 rounded-2xl border border-lagoon-500/30 bg-lagoon-100/40 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput label="Name" value={draft.label} onChange={(v) => setDraft({ ...draft, label: v.slice(0, 40) })} placeholder="Rising / Pro / Star" />
            <TextInput label="From followers" value={String(draft.minFollowers)} onChange={(v) => setDraft({ ...draft, minFollowers: Number(v.replace(/\D/g, "")) || 0 })} />
            <TextInput
              label="Up to followers"
              description="Empty = no upper limit."
              value={draft.maxFollowers === null ? "" : String(draft.maxFollowers)}
              onChange={(v) => setDraft({ ...draft, maxFollowers: v.replace(/\D/g, "") === "" ? null : Number(v.replace(/\D/g, "")) })}
            />
            <Selector
              label="Reward"
              value={draft.discountType}
              onChange={(v) => setDraft({ ...draft, discountType: v as DiscountType, discountValue: v === "free_seats" ? 1 : v === "flat" ? 100000 : 20 })}
              options={[
                { value: "percent", label: "Percent off" },
                { value: "flat", label: "Rupees off" },
                { value: "free_seats", label: "Free seats" },
              ]}
            />
            <RewardValue type={draft.discountType} value={draft.discountValue} onChange={(v) => setDraft({ ...draft, discountValue: v })} />
            {draft.discountType === "percent" ? (
              <TextInput
                label="Max discount ₹ (optional)"
                value={draft.maxDiscountPaise === null ? "" : String(draft.maxDiscountPaise / 100)}
                onChange={(v) => setDraft({ ...draft, maxDiscountPaise: v.replace(/\D/g, "") === "" ? null : Number(v.replace(/\D/g, "")) * 100 })}
              />
            ) : (
              <span />
            )}
            <TextInput label="Code valid for (days)" value={String(draft.validDays)} onChange={(v) => setDraft({ ...draft, validDays: Math.min(365, Math.max(1, Number(v.replace(/\D/g, "")) || 1)) })} />
            <div className="flex items-end pb-2">
              <Switch label="Active" value={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              label="Save range"
              isLoading={busy}
              onClick={async () => {
                const r = await send({ action: "save_tier", tier: draft }, `Range "${draft.label}" saved.`);
                if (r) setDraft(null);
              }}
            />
            <Button size="sm" label="Cancel" onClick={() => setDraft(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function RewardValue({ type, value, onChange }: { type: DiscountType; value: number; onChange: (v: number) => void }) {
  if (type === "percent") return <TextInput label="Percent" value={String(value)} onChange={(v) => onChange(Math.min(100, Math.max(1, Number(v.replace(/\D/g, "")) || 1)))} />;
  if (type === "flat") return <TextInput label="Rupees off" value={String(value / 100)} onChange={(v) => onChange(Math.max(1, Number(v.replace(/\D/g, "")) || 1) * 100)} />;
  return <TextInput label="Free seats" value={String(value)} onChange={(v) => onChange(Math.min(6, Math.max(1, Number(v.replace(/\D/g, "")) || 1)))} />;
}

// ---------------------------------------------------------------------------- coupons
interface CouponDraft {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountPaise: number | null;
  minOrderPaise: number;
  maxRedemptions: number | null;
  perCustomerLimit: number;
  validFrom: string | null;
  validUntil: string | null;
  tripId: string | null;
  isActive: boolean;
  note: string;
}
const blankCoupon = (): CouponDraft => ({
  code: "",
  discountType: "percent",
  discountValue: 10,
  maxDiscountPaise: null,
  minOrderPaise: 0,
  maxRedemptions: 50,
  perCustomerLimit: 1,
  validFrom: null,
  validUntil: null,
  tripId: null,
  isActive: true,
  note: "",
});

function Coupons({ coupons, trips, canEdit, busy, send }: { coupons: Coupon[]; trips: Trip[]; canEdit: boolean; busy: boolean; send: Send }) {
  const [draft, setDraft] = useState<CouponDraft | null>(null);
  const now = Date.now();
  const toSave = (c: Coupon, patch: Partial<Coupon>) => ({
    id: c.id,
    code: c.code,
    discountType: c.discountType,
    discountValue: c.discountValue,
    maxDiscountPaise: c.maxDiscountPaise,
    minOrderPaise: c.minOrderPaise,
    maxRedemptions: c.maxRedemptions,
    perCustomerLimit: c.perCustomerLimit,
    validFrom: c.validFrom,
    validUntil: c.validUntil,
    tripId: c.tripId,
    isActive: c.isActive,
    note: c.note,
    ...patch,
  });
  return (
    <div className="space-y-3">
      {canEdit && !draft && <Button variant="primary" label="New coupon code" icon={<Plus className="h-4 w-4" />} onClick={() => setDraft(blankCoupon())} />}
      {draft && (
        <div className="space-y-3 rounded-2xl border border-lagoon-500/30 bg-lagoon-100/40 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput label="Code" value={draft.code} onChange={(v) => setDraft({ ...draft, code: v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24) })} placeholder="MONSOON10" />
            <Selector
              label="Discount"
              value={draft.discountType}
              onChange={(v) => setDraft({ ...draft, discountType: v as DiscountType, discountValue: v === "free_seats" ? 1 : v === "flat" ? 50000 : 10 })}
              options={[
                { value: "percent", label: "Percent off" },
                { value: "flat", label: "Rupees off" },
                { value: "free_seats", label: "Free seats" },
              ]}
            />
            <RewardValue type={draft.discountType} value={draft.discountValue} onChange={(v) => setDraft({ ...draft, discountValue: v })} />
            {draft.discountType === "percent" && (
              <TextInput
                label="Max discount ₹ (optional)"
                value={draft.maxDiscountPaise === null ? "" : String(draft.maxDiscountPaise / 100)}
                onChange={(v) => setDraft({ ...draft, maxDiscountPaise: v.replace(/\D/g, "") === "" ? null : Number(v.replace(/\D/g, "")) * 100 })}
              />
            )}
            <TextInput label="Minimum booking ₹" value={String(draft.minOrderPaise / 100)} onChange={(v) => setDraft({ ...draft, minOrderPaise: (Number(v.replace(/\D/g, "")) || 0) * 100 })} />
            <TextInput
              label="Total uses"
              description="Empty = unlimited."
              value={draft.maxRedemptions === null ? "" : String(draft.maxRedemptions)}
              onChange={(v) => setDraft({ ...draft, maxRedemptions: v.replace(/\D/g, "") === "" ? null : Math.max(1, Number(v.replace(/\D/g, ""))) })}
            />
            <TextInput label="Uses per person" value={String(draft.perCustomerLimit)} onChange={(v) => setDraft({ ...draft, perCustomerLimit: Math.min(10, Math.max(1, Number(v.replace(/\D/g, "")) || 1)) })} />
            <Selector
              label="Trips"
              value={draft.tripId ?? "all"}
              onChange={(v) => setDraft({ ...draft, tripId: v === "all" ? null : v })}
              options={[{ value: "all", label: "All trips" }, ...trips.map((t) => ({ value: t.id, label: t.title }))]}
            />
            <DateTimeField label="Starts (optional)" value={draft.validFrom ?? ""} onChange={(v) => setDraft({ ...draft, validFrom: v || null })} />
            <DateTimeField label="Ends (optional)" value={draft.validUntil ?? ""} onChange={(v) => setDraft({ ...draft, validUntil: v || null })} />
            <TextInput label="Note (staff only)" value={draft.note} onChange={(v) => setDraft({ ...draft, note: v.slice(0, 300) })} placeholder="Diwali campaign on Instagram" />
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              label="Create coupon"
              isLoading={busy}
              onClick={async () => {
                const r = await send({ action: "save_coupon", coupon: { ...draft, id: null } }, `Coupon ${draft.code} created.`);
                if (r) setDraft(null);
              }}
            />
            <Button size="sm" label="Cancel" onClick={() => setDraft(null)} />
          </div>
        </div>
      )}
      {coupons.length === 0 ? (
        <p className="text-sm text-stone-600">No coupons yet.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {coupons.map((c) => {
            const ended = c.validUntil !== null && Date.parse(c.validUntil) <= now;
            const usedUp = c.maxRedemptions !== null && c.usedCount + c.heldCount >= c.maxRedemptions;
            const state = !c.isActive ? "Off" : ended ? "Ended" : usedUp ? "Used up" : "Live";
            return (
              <li key={c.id} className="space-y-2 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-bold tracking-wide text-forest-900">{c.code}</span>
                  <Badge variant={c.kind === "creator" ? "info" : "neutral"} label={c.kind === "creator" ? "Creator" : "Public"} />
                  <Badge variant={state === "Live" ? "success" : "neutral"} label={state} />
                </div>
                <p className="font-semibold text-ink-900">{reward(c)}</p>
                <p className="text-xs text-stone-600">
                  Used {c.usedCount}
                  {c.heldCount ? ` (+${c.heldCount} waiting for payment)` : ""}
                  {c.maxRedemptions !== null ? ` of ${c.maxRedemptions}` : ""} • given {rupees(c.discountGivenPaise)}
                  {c.validUntil ? ` • until ${new Date(c.validUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  {c.minOrderPaise ? ` • min ${rupees(c.minOrderPaise)}` : ""}
                  {c.tripId ? ` • ${trips.find((t) => t.id === c.tripId)?.title ?? "one trip"}` : ""}
                </p>
                {(c.lockedEmail || c.lockedPhone) && <p className="text-xs text-stone-600">Only for {[c.lockedEmail, c.lockedPhone].filter(Boolean).join(" / ")}</p>}
                {c.note && <p className="text-xs text-stone-500">{c.note}</p>}
                {canEdit && (
                  <Button
                    size="sm"
                    label={c.isActive ? "Turn off" : "Turn on"}
                    isDisabled={busy}
                    onClick={() => void send({ action: "save_coupon", coupon: toSave(c, { isActive: !c.isActive }) }, `${c.code} turned ${c.isActive ? "off" : "on"}.`)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
