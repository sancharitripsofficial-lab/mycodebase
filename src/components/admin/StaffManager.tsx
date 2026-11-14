"use client";

import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Check, Copy, KeyRound, RefreshCw, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Notice, Panel } from "@/components/admin/kit";
import { PasswordField } from "@/components/admin/PasswordField";
import type { StaffRole } from "@/lib/types";

interface StaffMember {
  userId: string;
  email: string;
  role: StaffRole;
  addedAt: string | null;
  addedByEmail: string | null;
  lastSignInAt: string | null;
  notes: string;
}

const ROLES: { value: StaffRole; label: string; can: string }[] = [
  { value: "ops", label: "Operations", can: "Bookings, payment checks, trips, dates, text, media, offers and coupons. Cannot change UPI or staff." },
  { value: "support", label: "Support", can: "Sees everything to help customers. Cannot change anything." },
  { value: "owner", label: "Owner", can: "Everything, including UPI payment settings and staff access." },
];
const roleLabel = (r: StaffRole) => ROLES.find((x) => x.value === r)?.label ?? r;

const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const when = (iso: string | null) => (iso ? WHEN.format(new Date(iso)) : "Never");

/** A strong starting password: 14 characters, letters and numbers, no look-alikes (0/O, 1/l/I). */
export function generatePassword(): string {
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const letters = lower + upper;
  const digits = "23456789";
  const all = letters + digits;
  const pick = (set: string) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return set[buf[0] % set.length];
  };
  const chars = [pick(lower), pick(upper), pick(digits), pick(digits)];
  while (chars.length < 14) chars.push(pick(all));
  // shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1800);
        });
      }}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 text-sm font-semibold text-forest-900 hover:bg-lagoon-100"
    >
      {done ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {done ? "Copied" : label}
    </button>
  );
}

async function post(body: unknown): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/admin/staff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || "Could not save." };
    return { ok: true, message: json.message || "Saved." };
  } catch {
    return { ok: false, error: "Network problem — nothing was saved." };
  }
}

/** Admin → Settings → Staff & access (owner only). */
export function StaffManager() {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [you, setYou] = useState<string>("");
  const [ready, setReady] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Add form
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("ops");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [handover, setHandover] = useState<{ email: string; password: string } | null>(null);

  // Per-person actions
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/staff", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load staff.");
      setReady(json.ready !== false);
      setStaff(json.staff ?? []);
      setYou(json.you ?? "");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load staff.");
      setStaff([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(body: unknown, after?: () => void) {
    setBusy(true);
    setNotice(null);
    const r = await post(body);
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: "ok", text: r.message });
      after?.();
      await load();
    } else {
      setNotice({ kind: "error", text: r.error });
    }
  }

  async function onAdd() {
    const e = email.trim().toLowerCase();
    const pw = password;
    await run({ action: "add", email: e, role, password: pw, notes }, () => {
      setHandover({ email: e, password: pw });
      setEmail("");
      setPassword("");
      setNotes("");
    });
  }

  const owners = (staff ?? []).filter((m) => m.role === "owner").length;
  const roleInfo = ROLES.find((r) => r.value === role);
  const signInLink = typeof window !== "undefined" ? `${window.location.origin}/admin` : "/admin";

  return (
    <Panel
      title="Staff & access"
      description="Give a person their own login to this admin panel and choose what they can do. Removing access locks them out from their next click. Every change is kept in the audit log (passwords never are)."
    >
      {!ready && <Notice kind="error">Staff access works once the database is connected.</Notice>}
      {loadError && <Notice kind="error">{loadError}</Notice>}

      {/* ---------- Give access ---------- */}
      <section aria-labelledby="add-staff" className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
        <h3 id="add-staff" className="flex items-center gap-2 font-display text-lg font-semibold text-forest-900">
          <UserPlus className="h-5 w-5" aria-hidden="true" /> Give someone access
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <TextInput label="Their email" value={email} onChange={setEmail} placeholder="name@example.com" />
          <Selector label="Role" value={role} onChange={(v) => setRole(v as StaffRole)} options={ROLES.map((r) => ({ value: r.value, label: r.label }))} />
        </div>
        {roleInfo && <p className="text-xs text-stone-600">{roleInfo.label}: {roleInfo.can}</p>}
        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto]">
          <PasswordField label="Starting password (10+ characters, letters and numbers)" value={password} onChange={setPassword} autoComplete="new-password" />
          <Button label="Make a strong one" variant="secondary" onClick={() => setPassword(generatePassword())} />
        </div>
        <p className="text-xs text-stone-600">
          If this email already has a login (for example a customer), they keep their own password and only get the role.
        </p>
        <TextInput label="Note (optional)" value={notes} onChange={(v) => setNotes(v.slice(0, 200))} placeholder="e.g. Weekend trip coordinator" />
        <Button label={busy ? "Saving…" : "Give access"} variant="primary" isDisabled={busy || !ready || !email.trim()} onClick={() => void onAdd()} />

        {handover && (
          <div className="space-y-2 rounded-xl border border-[#b9e3c6] bg-[#f0faf3] p-3 text-sm text-ink-900">
            <p className="font-semibold">Send these to {handover.email} privately (not in a group chat):</p>
            <p className="break-all">Sign in: {signInLink}</p>
            <p className="break-all">Email: {handover.email}</p>
            {handover.password && <p className="break-all">Password: {handover.password}</p>}
            <div className="flex flex-wrap gap-2">
              <CopyButton
                text={`Sanchari admin\nSign in: ${signInLink}\nEmail: ${handover.email}${handover.password ? `\nPassword: ${handover.password}` : ""}\nPlease change the password under "My password" after you sign in.`}
                label="Copy login details"
              />
              <button type="button" onClick={() => setHandover(null)} className="min-h-10 rounded-full px-3 text-sm font-semibold text-stone-600 hover:bg-lagoon-100">
                Done, hide it
              </button>
            </div>
            <p className="text-xs text-stone-600">This password is shown only now. If it is lost, use “Set new password” below.</p>
          </div>
        )}
      </section>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {/* ---------- Who has access ---------- */}
      <section aria-labelledby="staff-list" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="staff-list" className="font-display text-lg font-semibold text-forest-900">
            Who has access {staff ? `(${staff.length})` : ""}
          </h3>
          <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-forest-900 hover:bg-lagoon-100">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
        </div>
        {staff === null ? (
          <p className="text-sm text-stone-600">Loading…</p>
        ) : staff.length === 0 ? (
          <p className="text-sm text-stone-600">No staff yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {staff.map((m) => {
              const isYou = m.userId === you;
              const lastOwner = m.role === "owner" && owners <= 1;
              return (
                <li key={m.userId} className="min-w-0 space-y-2.5 rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold break-all text-ink-900">
                        {m.email} {isYou && <span className="text-xs font-bold text-copper-700">(you)</span>}
                      </p>
                      <p className="text-xs text-stone-600">
                        Last sign-in: {when(m.lastSignInAt)} · Added {when(m.addedAt)}
                        {m.addedByEmail ? ` by ${m.addedByEmail}` : ""}
                      </p>
                      {m.notes && <p className="text-xs text-stone-600">{m.notes}</p>}
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-lagoon-100 px-2.5 py-0.5 text-xs font-bold text-forest-900">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {roleLabel(m.role)}
                    </span>
                  </div>

                  {isYou ? (
                    <p className="text-xs text-stone-600">Your own access can only be changed by another owner. Change your password under My password.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="max-w-xs">
                        <Selector
                          label="Change role"
                          value={m.role}
                          onChange={(v) => void run({ action: "role", userId: m.userId, role: v })}
                          options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
                          isDisabled={busy || lastOwner}
                        />
                      </div>
                      {resetFor === m.userId ? (
                        <div className="space-y-2 rounded-xl border border-stone-200 bg-cream-50 p-3">
                          <div className="grid items-end gap-2 md:grid-cols-[1fr_auto]">
                            <PasswordField label="New password" value={resetPassword} onChange={setResetPassword} autoComplete="new-password" />
                            <Button label="Make a strong one" variant="secondary" onClick={() => setResetPassword(generatePassword())} />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              label="Save new password"
                              variant="primary"
                              isDisabled={busy || !resetPassword}
                              onClick={() =>
                                void run({ action: "reset_password", userId: m.userId, password: resetPassword }, () => {
                                  setHandover({ email: m.email, password: resetPassword });
                                  setResetFor(null);
                                  setResetPassword("");
                                })
                              }
                            />
                            <Button label="Cancel" variant="secondary" onClick={() => setResetFor(null)} />
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setResetFor(m.userId);
                              setResetPassword("");
                            }}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 text-sm font-semibold text-forest-900 hover:bg-lagoon-100"
                          >
                            <KeyRound className="h-4 w-4" aria-hidden="true" /> Set new password
                          </button>
                          {confirmRemove === m.userId ? (
                            <span className="inline-flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-[#a3263a]">Remove {m.email}?</span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run({ action: "remove", userId: m.userId }, () => setConfirmRemove(null))}
                                className="min-h-10 rounded-full bg-[#a3263a] px-3 text-sm font-semibold text-white disabled:opacity-60"
                              >
                                Yes, remove access
                              </button>
                              <button type="button" onClick={() => setConfirmRemove(null)} className="min-h-10 rounded-full px-3 text-sm font-semibold text-stone-600 hover:bg-lagoon-100">
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={lastOwner}
                              title={lastOwner ? "There must always be at least one owner." : undefined}
                              onClick={() => setConfirmRemove(m.userId)}
                              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#f3c0c9] bg-white px-3 text-sm font-semibold text-[#a3263a] hover:bg-[#fff1f3] disabled:opacity-50"
                            >
                              <UserMinus className="h-4 w-4" aria-hidden="true" /> Remove access
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Panel>
  );
}

/** Admin → My password: every staff member can change the password they were given. */
export function MyPasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onSave() {
    setNotice(null);
    if (next !== again) {
      setNotice({ kind: "error", text: "The two new passwords are not the same." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not change the password.");
      setNotice({ kind: "ok", text: json.message || "Password changed." });
      setCurrent("");
      setNext("");
      setAgain("");
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not change the password." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="My password" description={`Signed in as ${email}. Use at least 10 characters with letters and numbers, and don't reuse a password from another site.`}>
      <div className="max-w-md space-y-3">
        <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
        <PasswordField label="New password again" value={again} onChange={setAgain} autoComplete="new-password" />
        <Button label={busy ? "Saving…" : "Change password"} variant="primary" isDisabled={busy || !current || !next || !again} onClick={() => void onSave()} />
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      </div>
    </Panel>
  );
}
