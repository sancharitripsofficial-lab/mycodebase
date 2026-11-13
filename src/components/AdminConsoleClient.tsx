"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FileText,
  Images,
  IndianRupee,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Lock,
  LogOut,
  Map,
  Menu,
  RefreshCw,
  Route,
  ScrollText,
  Settings2,
  Star,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookingMoney } from "@/components/admin/BookingMoney";
import { DeparturesManager } from "@/components/admin/DeparturesManager";
import { EnquiriesSection } from "@/components/admin/EnquiriesSection";
import { Notice, Panel, useAdminContent } from "@/components/admin/kit";
import { MediaLibrary } from "@/components/admin/MediaLibrary";
import { PasswordField } from "@/components/admin/PasswordField";
import { ReviewsManager } from "@/components/admin/ReviewsManager";
import { SiteContentManager } from "@/components/admin/SiteContentManager";
import { TripSheets } from "@/components/admin/TripSheets";
import { TripsManager } from "@/components/admin/TripsManager";
import { AdminPaymentsPanel } from "@/components/AdminPaymentsPanel";
import { AdminUpiSettings } from "@/components/AdminUpiSettings";
import { formatINR } from "@/lib/currency";
import type { DepartureCrew, Enquiry } from "@/lib/data/owner-ops";
import { addDaysISO, localISODate } from "@/lib/dates";
import type {
  AdminBookingRow,
  AdminPaymentRow,
  AuditLogEntry,
  ComfortResolutionStatus,
  PublicDepartureAvailability,
  StaffRole,
  Trip,
  WaitlistEntry,
} from "@/lib/types";

interface OpsData {
  bookings: AdminBookingRow[];
  departures: (PublicDepartureAvailability & { tripTitle: string })[];
  waitlist: (WaitlistEntry & { departureCode: string })[];
  auditLogs: AuditLogEntry[];
  trips: Trip[];
  isDemoFallback: boolean;
  /** Public website address for links sent to customers (works even on a separate admin host). */
  publicSiteUrl?: string;
}

interface Actor {
  email: string;
  staffRole: StaffRole;
  isDemoAdmin: boolean;
}

interface AdminConsoleProps {
  initialActor: Actor | null;
  supabaseConfigured: boolean;
  initialData: OpsData | null;
}

type SectionKey =
  | "overview"
  | "payments"
  | "enquiries"
  | "bookings"
  | "sheets"
  | "dates"
  | "waitlist"
  | "trips"
  | "website"
  | "reviews"
  | "media"
  | "upi"
  | "audit";

const NAV: { group: string; items: { key: SectionKey; label: string; icon: typeof LayoutDashboard; ownerOps?: boolean }[] }[] = [
  {
    group: "Today",
    items: [
      { key: "overview", label: "Overview", icon: LayoutDashboard },
      { key: "payments", label: "Payments", icon: IndianRupee },
      { key: "enquiries", label: "Enquiries", icon: Inbox },
    ],
  },
  {
    group: "Operations",
    items: [
      { key: "bookings", label: "Bookings", icon: ClipboardList },
      { key: "sheets", label: "Trip sheets", icon: Route },
      { key: "dates", label: "Dates & seats", icon: CalendarDays },
      { key: "waitlist", label: "Waitlist", icon: Users },
    ],
  },
  {
    group: "Website",
    items: [
      { key: "trips", label: "Trips", icon: Map },
      { key: "website", label: "Text & policies", icon: FileText },
      { key: "reviews", label: "Reviews", icon: Star },
      { key: "media", label: "Media library", icon: Images },
    ],
  },
  {
    group: "Settings",
    items: [
      { key: "upi", label: "UPI payments", icon: Settings2, ownerOps: true },
      { key: "audit", label: "Audit log", icon: ScrollText },
    ],
  },
];

export function AdminConsoleClient({ initialActor, supabaseConfigured, initialData }: AdminConsoleProps) {
  const [actor, setActor] = useState<Actor | null>(initialActor);
  const [data, setData] = useState<OpsData | null>(initialData);

  const refreshOps = useCallback(async () => {
    const res = await fetch("/api/admin/operations", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setData({
        bookings: json.bookings,
        departures: json.departures,
        waitlist: json.waitlist,
        auditLogs: json.auditLogs,
        trips: json.trips,
        isDemoFallback: json.isDemoFallback,
        publicSiteUrl: json.publicSiteUrl,
      });
    }
  }, []);

  if (!actor || !data) {
    return (
      <SignIn
        supabaseConfigured={supabaseConfigured}
        onSignedIn={async (a) => {
          setActor(a);
          await refreshOps();
        }}
      />
    );
  }

  return (
    <Workspace
      actor={actor}
      data={data}
      refreshOps={refreshOps}
      onSignOut={async () => {
        await fetch("/api/admin/auth", { method: "DELETE" });
        setActor(null);
        setData(null);
      }}
    />
  );
}

function SignIn({ supabaseConfigured, onSignedIn }: { supabaseConfigured: boolean; onSignedIn: (a: Actor) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [demoRole, setDemoRole] = useState<StaffRole>("owner");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(body: Record<string, unknown>, a: (role: StaffRole) => Actor) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Sign in failed.");
        return;
      }
      await onSignedIn(a(json.role as StaffRole));
    } catch {
      setError("Network problem while signing in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card-soft w-full max-w-md overflow-hidden">
        <div className="bg-ocean flex items-center gap-3 px-6 py-5 text-white">
          <Image src="/brand/sanchari-mark.png" alt="" width={44} height={44} className="h-11 w-11 rounded-xl bg-white/95 p-1" />
          <div>
            <p className="font-display text-xl font-semibold">Sanchari Admin</p>
            <p className="text-xs text-white/80">Staff only • every action is recorded</p>
          </div>
        </div>
        <div className="space-y-4 p-6">
          {error && <Notice kind="error">{error}</Notice>}
          {supabaseConfigured ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit({ mode: "supabase", email, password }, (role) => ({ email, staffRole: role, isDemoAdmin: false }));
              }}
            >
              <TextInput label="Email" type="email" autoComplete="username" value={email} onChange={setEmail} isRequired />
              <PasswordField label="Password" value={password} onChange={setPassword} isRequired />
              <Button type="submit" variant="primary" size="lg" width="100%" label="Sign in" isLoading={busy} />
              <p className="text-xs text-stone-600">
                <Lock className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                Access is given by the owner in the database (staff roles), not by sign-up.
              </p>
            </form>
          ) : (
            <div className="space-y-4">
              <Notice kind="ok">Preview mode (no database): pick a role to look around. Edits to website content need the database.</Notice>
              <label className="block text-sm font-semibold text-ink-900">
                Role
                <select
                  value={demoRole}
                  onChange={(e) => setDemoRole(e.target.value as StaffRole)}
                  className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="owner">Owner</option>
                  <option value="ops">Operations</option>
                  <option value="support">Support (read-only)</option>
                </select>
              </label>
              <Button
                variant="primary"
                size="lg"
                width="100%"
                label={`Enter preview as ${demoRole}`}
                isLoading={busy}
                onClick={() =>
                  void submit({ mode: "demo", role: demoRole }, (role) => ({
                    email: "demo-operator@sanchari.local",
                    staffRole: role,
                    isDemoAdmin: true,
                  }))
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Workspace({
  actor,
  data,
  refreshOps,
  onSignOut,
}: {
  actor: Actor;
  data: OpsData;
  refreshOps: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [section, setSection] = useState<SectionKey>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const editor = useAdminContent();
  const canMutate = actor.staffRole === "owner" || actor.staffRole === "ops";
  const [crew, setCrew] = useState<DepartureCrew[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [upiId, setUpiId] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState<string>("");

  useEffect(() => {
    setSiteUrl(data.publicSiteUrl || window.location.origin);
  }, [data.publicSiteUrl]);

  const refreshPayments = useCallback(async () => {
    const res = await fetch("/api/admin/payments", { cache: "no-store" });
    if (res.ok) setPayments((await res.json()).payments as AdminPaymentRow[]);
  }, []);

  const refreshOwner = useCallback(async () => {
    const res = await fetch("/api/admin/owner-ops", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setCrew(json.crew as DepartureCrew[]);
      setEnquiries(json.enquiries as Enquiry[]);
    }
  }, []);

  useEffect(() => {
    void refreshPayments();
    void refreshOwner();
    if (actor.staffRole === "owner" || actor.staffRole === "ops") {
      void fetch("/api/admin/payment-settings", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setUpiId(j?.settings?.isEnabled && j.settings.upiId ? String(j.settings.upiId) : null))
        .catch(() => setUpiId(null));
    }
  }, [refreshPayments, refreshOwner, actor.staffRole]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshOps(), refreshPayments(), refreshOwner(), editor.reload()]);
  }, [refreshOps, refreshPayments, refreshOwner, editor]);

  // New-payment and new-enquiry alerts: check every 30 s while the tab is open, show a count in
  // the browser tab title and a message when something new arrives.
  const waitingCount = payments.filter((p) => p.payment.status === "submitted").length;
  const newEnquiries = enquiries.filter((e) => e.status === "new").length;
  const [lastSeen, setLastSeen] = useState<{ pay: number; enq: number } | null>(null);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refreshPayments();
      void refreshOwner();
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refreshPayments, refreshOwner]);
  useEffect(() => {
    if (lastSeen && (waitingCount > lastSeen.pay || newEnquiries > lastSeen.enq)) {
      const parts = [];
      if (waitingCount > lastSeen.pay) parts.push(`${waitingCount - lastSeen.pay} new UPI payment${waitingCount - lastSeen.pay === 1 ? "" : "s"} to check`);
      if (newEnquiries > lastSeen.enq) parts.push(`${newEnquiries - lastSeen.enq} new enquir${newEnquiries - lastSeen.enq === 1 ? "y" : "ies"}`);
      setNotice({ kind: "ok", text: `New: ${parts.join(" and ")}.` });
      void refreshOps();
    }
    setLastSeen({ pay: waitingCount, enq: newEnquiries });
    const total = waitingCount + newEnquiries;
    document.title = total > 0 ? `(${total}) Sanchari Admin` : "Sanchari Admin";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingCount, newEnquiries]);

  const runOps = useCallback(
    async (body: Record<string, unknown>, ok: string) => {
      setNotice(null);
      const res = await fetch("/api/admin/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      setNotice(res.ok ? { kind: "ok", text: ok } : { kind: "error", text: json.error || "Action failed." });
      await refreshOps();
    },
    [refreshOps]
  );

  const waitingPayments = payments.filter((p) => p.payment.status === "submitted").length;
  const cancelRequests = data.bookings.filter((b) => b.booking.status === "cancel_requested").length;
  const badges: Partial<Record<SectionKey, number>> = {
    payments: waitingPayments,
    bookings: cancelRequests,
    enquiries: newEnquiries,
  };
  const current = NAV.flatMap((g) => g.items).find((i) => i.key === section);

  const nav = (
    <nav aria-label="Admin sections" className="space-y-5">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">{g.group}</p>
          <ul className="space-y-0.5">
            {g.items
              .filter((i) => !i.ownerOps || canMutate)
              .map((i) => {
                const active = i.key === section;
                const count = badges[i.key] ?? 0;
                return (
                  <li key={i.key}>
                    <button
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        setSection(i.key);
                        setMenuOpen(false);
                        setNotice(null);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                        active ? "bg-white text-forest-900 shadow-sm" : "text-white/85 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <i.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1">{i.label}</span>
                      {count > 0 && (
                        <span className="rounded-full bg-copper-600 px-2 py-0.5 text-[11px] font-bold text-white">{count}</span>
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside
        className={`bg-ocean fixed inset-y-0 left-0 z-50 print:hidden w-[264px] overflow-y-auto px-3 py-5 text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <Image src="/brand/sanchari-mark.png" alt="" width={40} height={40} className="h-10 w-10 rounded-xl bg-white/95 p-1" />
          <div className="leading-tight">
            <p className="font-display text-lg font-semibold">Sanchari</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">Admin</p>
          </div>
          <button type="button" className="ml-auto rounded-lg p-1.5 hover:bg-white/10 lg:hidden" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {nav}
        <div className="mt-8 space-y-2 border-t border-white/15 px-2 pt-4 text-xs text-white/75">
          <p className="truncate" title={actor.email}>
            {actor.email}
          </p>
          <p>
            Role: <strong className="text-white">{actor.staffRole}</strong>
            {actor.isDemoAdmin ? " (preview)" : ""}
          </p>
          <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-white hover:underline">
            Open website <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <button type="button" onClick={() => void onSignOut()} className="flex items-center gap-1.5 text-white hover:underline">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>
      {menuOpen && <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 bg-[#0b5683]/40 lg:hidden" onClick={() => setMenuOpen(false)} />}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 print:hidden border-b border-stone-200/80 bg-white/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <button type="button" className="rounded-xl border border-stone-200 bg-white p-2 lg:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Menu className="h-5 w-5 text-forest-900" />
          </button>
          <h1 className="font-display text-xl font-semibold text-forest-900">{current?.label}</h1>
          <div className="ml-auto flex items-center gap-2">
            {canMutate && section === "bookings" && (
              <a href="/api/admin/export" className="hidden rounded-full px-3 py-2 text-xs font-semibold text-forest-900 hover:bg-lagoon-100 sm:inline-flex">
                Export roster CSV
              </a>
            )}
            <Button size="sm" label="Refresh" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void refreshAll()} />
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:py-8">
          {data.isDemoFallback && (
            <Notice kind="ok">Preview mode: showing built-in sample data. Connect the database to manage real bookings and content.</Notice>
          )}
          {notice && (
            <div className="print:hidden">
              <Notice kind={notice.kind}>{notice.text}</Notice>
            </div>
          )}

          {section === "overview" && (
            <Overview
              data={data}
              payments={payments}
              newEnquiries={newEnquiries}
              contentTrips={editor.content?.trips ?? null}
              go={setSection}
            />
          )}
          {section === "payments" && (
            <AdminPaymentsPanel
              rows={payments}
              role={actor.staffRole}
              onChanged={async (message) => {
                setNotice({ kind: "ok", text: message });
                await refreshAll();
              }}
            />
          )}
          {section === "enquiries" && (
            <EnquiriesSection
              enquiries={enquiries}
              trips={data.trips}
              role={actor.staffRole}
              onChanged={async (message) => {
                setNotice({ kind: "ok", text: message });
                await refreshOwner();
              }}
            />
          )}
          {section === "bookings" && (
            <BookingsSection
              data={data}
              role={actor.staffRole}
              runOps={runOps}
              upiId={upiId}
              siteUrl={siteUrl}
              onMoney={async (message) => {
                setNotice({ kind: "ok", text: message });
                await Promise.all([refreshOps(), refreshPayments()]);
              }}
            />
          )}
          {section === "sheets" && (
            <TripSheets
              bookings={data.bookings}
              departures={data.departures}
              crew={crew}
              role={actor.staffRole}
              siteUrl={siteUrl}
              onCrewSaved={async (message) => {
                setNotice({ kind: "ok", text: message });
                await refreshOwner();
              }}
            />
          )}
          {section === "dates" && <DeparturesManager editor={editor} onSeatOverride={runOps} />}
          {section === "waitlist" && <WaitlistSection data={data} />}
          {section === "trips" && <TripsManager editor={editor} />}
          {section === "website" && <SiteContentManager editor={editor} />}
          {section === "reviews" && <ReviewsManager editor={editor} />}
          {section === "media" && <MediaLibrary canEdit={canMutate && Boolean(editor.content?.editable)} />}
          {section === "upi" && canMutate && (
            <AdminUpiSettings
              role={actor.staffRole}
              onSaved={async (message) => {
                setNotice({ kind: "ok", text: message });
                await refreshAll();
              }}
            />
          )}
          {section === "audit" && <AuditSection logs={data.auditLogs} />}
          {editor.loadError && <Notice kind="error">{editor.loadError}</Notice>}
        </main>
      </div>
    </div>
  );
}

function Overview({
  data,
  payments,
  newEnquiries,
  contentTrips,
  go,
}: {
  data: OpsData;
  payments: AdminPaymentRow[];
  newEnquiries: number;
  contentTrips: ReturnType<typeof useAdminContent>["content"] extends infer C ? (C extends { trips: infer T } ? T | null : null) : null;
  go: (s: SectionKey) => void;
}) {
  const waiting = payments.filter((p) => p.payment.status === "submitted");
  const today = localISODate();
  const in14 = addDaysISO(today, 14);
  const collected = data.bookings.reduce((s, b) => s + b.booking.amountPaidPaise, 0);
  const balanceDue = data.bookings
    .filter((b) => b.booking.status === "deposit_paid")
    .reduce((s, b) => s + b.booking.amountDuePaise, 0);
  const soon = (contentTrips ?? [])
    .flatMap((t) => t.departures.map((d) => ({ ...d, tripTitle: t.trip.title })))
    .filter((d) => d.startDate >= today && d.startDate <= in14 && d.status !== "cancelled")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const comfort = data.bookings.filter((b) => b.comfortPreference?.resolutionStatus === "pending_review").length;
  const cancels = data.bookings.filter((b) => b.booking.status === "cancel_requested").length;
  const unverified = data.bookings.filter(
    (b) => ["confirmed", "deposit_paid"].includes(b.booking.status) && b.booking.verificationStatus !== "checked"
  ).length;

  const dueSoon = data.bookings.filter(
    (b) => b.booking.status === "deposit_paid" && b.booking.amountDuePaise > 0 && b.departureStartDate <= in14
  ).length;
  const tasks = [
    { n: waiting.length, text: "UPI payments to check", go: "payments" as const },
    { n: newEnquiries, text: "new enquiries to answer", go: "enquiries" as const },
    { n: dueSoon, text: "balances due for trips in the next 14 days", go: "bookings" as const },
    { n: cancels, text: "cancellation / reschedule requests", go: "bookings" as const },
    { n: comfort, text: "comfort requests to decide", go: "bookings" as const },
    { n: unverified, text: "paid bookings with ID not checked", go: "bookings" as const },
    { n: data.waitlist.filter((w) => w.status === "waiting").length, text: "people on the waitlist", go: "waitlist" as const },
  ].filter((t) => t.n > 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Money received", value: formatINR(collected), tone: "text-forest-900" },
          { label: "Waiting for your check", value: formatINR(waiting.reduce((s, p) => s + p.payment.amountPaise, 0)), tone: "text-copper-700" },
          { label: "Balances still due", value: formatINR(balanceDue), tone: "text-forest-700" },
          { label: "Seats booked (upcoming)", value: String(data.departures.reduce((s, d) => s + d.seatsTaken, 0)), tone: "text-forest-900" },
        ].map((k) => (
          <div key={k.label} className="card-soft p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-600">{k.label}</p>
            <p className={`mt-1 font-display text-2xl font-semibold ${k.tone}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <Panel title="Needs your attention" description="Most urgent first.">
        {tasks.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-forest-700">
            <ListChecks className="h-4 w-4" aria-hidden="true" /> All clear.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {tasks.map((t) => (
              <li key={t.text}>
                <button type="button" onClick={() => go(t.go)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-cream-100">
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-copper-600 px-2 text-xs font-bold text-white">{t.n}</span>
                  <span className="text-ink-900">{t.text}</span>
                  <span className="ml-auto text-xs font-semibold text-forest-800">Open →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Next 14 days" description="Dates below their minimum may need a push on WhatsApp/Instagram or a decision to run or move." actions={<Button size="sm" label="All dates" onClick={() => go("dates")} />}>
        {soon.length === 0 ? (
          <p className="text-sm text-stone-600">No trips in the next 14 days.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {soon.map((d) => {
              const below = d.seatsTaken < d.minOccupancy;
              return (
                <li key={d.departureId} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink-900">{d.tripTitle}</p>
                      <p className="text-xs text-stone-600">
                        {d.departureCode} • {new Date(`${d.startDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <Badge variant={below ? "warning" : "success"} label={below ? `Below minimum (${d.minOccupancy})` : "On track"} />
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                    <div className="h-full rounded-full bg-gradient-to-r from-forest-800 to-lagoon-500" style={{ width: `${(d.seatsTaken / d.maxCapacity) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-stone-600">
                    {d.seatsTaken} of {d.maxCapacity} seats • {d.paidBookingCount} paid booking{d.paidBookingCount === 1 ? "" : "s"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function BookingsSection({
  data,
  role,
  runOps,
  upiId,
  siteUrl,
  onMoney,
}: {
  data: OpsData;
  role: StaffRole;
  runOps: (body: Record<string, unknown>, ok: string) => Promise<void>;
  upiId: string | null;
  siteUrl: string;
  onMoney: (message: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const canMutate = role === "owner" || role === "ops";
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.bookings.filter((row) => {
      if (status === "balance_due") {
        if (!(row.booking.status === "deposit_paid" && row.booking.amountDuePaise > 0)) return false;
      } else if (status !== "all" && row.booking.status !== status) return false;
      if (!s) return true;
      return `${row.booking.bookingReference} ${row.booking.customerName} ${row.booking.customerEmail} ${row.booking.customerPhone} ${row.departureCode} ${row.tripTitle}`
        .toLowerCase()
        .includes(s);
    });
  }, [data.bookings, q, status]);

  return (
    <Panel
      title="Bookings"
      description="Search by reference, name, phone, email or date code. UPI references are checked under Payments; cash and bank transfers are recorded here."
    >
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[240px] flex-1">
          <TextInput label="Search" isLabelHidden placeholder="Search bookings…" value={q} onChange={setQ} type="search" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm" aria-label="Filter by status">
          {["all", "balance_due", "pending_payment", "deposit_paid", "confirmed", "cancel_requested", "cancelled", "expired", "refunded"].map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s === "balance_due" ? "Balance still due" : s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-600">No bookings match.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.booking.id} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p>
                    <span className="font-mono font-bold text-forest-900">{row.booking.bookingReference}</span> •{" "}
                    <strong>{row.booking.customerName}</strong> <span className="text-stone-600">{row.booking.customerPhone}</span>
                  </p>
                  <p className="text-xs text-stone-600">
                    {row.tripTitle} ({row.departureCode}, {row.departureStartDate}) • {row.booking.seatsRequested} seat
                    {row.booking.seatsRequested === 1 ? "" : "s"} • total {formatINR(row.booking.totalPaise)} • paid{" "}
                    {formatINR(row.booking.amountPaidPaise)}
                    {row.pickupName ? ` • pickup ${row.pickupName}` : ""}
                  </p>
                </div>
                <Badge
                  variant={
                    row.booking.status === "confirmed"
                      ? "success"
                      : row.booking.status === "cancel_requested"
                        ? "warning"
                        : ["cancelled", "expired", "refunded"].includes(row.booking.status)
                          ? "neutral"
                          : "info"
                  }
                  label={row.booking.status.replace(/_/g, " ")}
                />
              </div>
              {row.travelers.length > 0 && (
                <p className="text-xs text-stone-600">
                  Travellers: {row.travelers.map((t) => `${t.fullName}${t.verificationChecked ? " ✓" : ""}`).join(", ")}
                </p>
              )}
              <BookingMoney row={row} canMutate={canMutate} upiId={upiId} siteUrl={siteUrl} onDone={onMoney} />
              {role !== "support" && row.comfortPreference && row.comfortPreference.coTravelerPreference !== "open_mixed" && (
                <p className="rounded-xl bg-peach-100 px-3 py-2 text-xs text-ink-900">
                  Private comfort request: <strong>{row.comfortPreference.coTravelerPreference.replace(/_/g, " ")}</strong> (
                  {row.comfortPreference.resolutionStatus.replace(/_/g, " ")})
                  {row.comfortPreference.preferenceNotes ? ` — “${row.comfortPreference.preferenceNotes}”` : ""}
                </p>
              )}
              {row.booking.rescheduleRequestedNote && (
                <p className="rounded-xl bg-lagoon-100 px-3 py-2 text-xs text-forest-900">Reschedule request: {row.booking.rescheduleRequestedNote}</p>
              )}
              {canMutate && (
                <div className="flex flex-wrap items-center gap-2">
                  {row.booking.verificationStatus !== "checked" && (
                    <Button
                      size="sm"
                      label="ID checked"
                      onClick={() =>
                        void runOps(
                          { kind: "booking_action", payload: { bookingId: row.booking.id, action: "mark_verified", reason: "Traveller ID checked by operations" } },
                          `${row.booking.bookingReference}: ID marked checked.`
                        )
                      }
                    />
                  )}
                  {row.comfortPreference && row.comfortPreference.coTravelerPreference !== "open_mixed" && (
                    <select
                      aria-label="Comfort request decision"
                      defaultValue={row.comfortPreference.resolutionStatus}
                      onChange={(e) =>
                        void runOps(
                          {
                            kind: "booking_action",
                            payload: {
                              bookingId: row.booking.id,
                              action: "resolve_comfort",
                              comfortResolution: e.target.value as ComfortResolutionStatus,
                              reason: `Comfort request set to ${e.target.value}`,
                            },
                          },
                          `${row.booking.bookingReference}: comfort request updated.`
                        )
                      }
                      className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs"
                    >
                      <option value="pending_review">Comfort: pending</option>
                      <option value="accommodated">Comfort: arranged</option>
                      <option value="not_feasible_notified">Comfort: not possible, told customer</option>
                      <option value="customer_rescheduled">Comfort: moved date</option>
                      <option value="customer_refunded">Comfort: refunded</option>
                    </select>
                  )}
                  {!["cancelled", "refunded", "expired"].includes(row.booking.status) && (
                    <Button
                      size="sm"
                      variant="destructive"
                      label="Cancel & free seats"
                      onClick={() => {
                        const reason = window.prompt(`Cancel ${row.booking.bookingReference}? Reason (at least 5 characters):`);
                        if (!reason) return;
                        void runOps(
                          { kind: "booking_action", payload: { bookingId: row.booking.id, action: "cancel_booking", reason } },
                          `${row.booking.bookingReference} cancelled; seats freed.${row.booking.amountPaidPaise > 0 ? " Remember to refund the customer." : ""}`
                        );
                      }}
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function WaitlistSection({ data }: { data: OpsData }) {
  return (
    <Panel title="Waitlist" description="People who asked to be told when a seat opens. Contact them on WhatsApp when a seat frees up.">
      {data.waitlist.length === 0 ? (
        <p className="text-sm text-stone-600">Nobody on the waitlist.</p>
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white text-sm">
          {data.waitlist.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span>
                <strong>{w.fullName}</strong> <span className="text-stone-600">• {w.phone} • {w.email}</span>
                <span className="block text-xs text-stone-600">
                  {w.seatsNeeded} seat{w.seatsNeeded === 1 ? "" : "s"} for {w.departureCode}
                  {w.whatsappOptIn ? " • OK to WhatsApp" : ""}
                </span>
              </span>
              <Badge variant={w.status === "waiting" ? "info" : "neutral"} label={w.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AuditSection({ logs }: { logs: AuditLogEntry[] }) {
  return (
    <Panel title="Audit log" description="Every change to money, seats, trips and settings, newest first.">
      {logs.length === 0 ? (
        <p className="text-sm text-stone-600">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white text-sm">
          {logs.map((log) => (
            <li key={log.id} className="px-4 py-2.5">
              <p className="font-semibold text-forest-900">
                {log.action.replace(/_/g, " ")} <span className="font-normal text-stone-600">• {log.entityType}</span>
              </p>
              <p className="text-xs text-stone-600">
                {log.actorRole ?? "system"} • {log.reason ?? "—"} • {new Date(log.createdAt).toLocaleString("en-IN")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
