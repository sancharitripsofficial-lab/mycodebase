"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Check, Copy, IndianRupee } from "lucide-react";
import { useMemo, useState } from "react";
import { formatINR } from "@/lib/currency";
import type { AdminPaymentRow, PaymentRecord, StaffRole, UpiReviewDecision } from "@/lib/types";

const STATUS_BADGE: Record<PaymentRecord["status"], { label: string; variant: "info" | "success" | "warning" | "error" | "neutral" }> = {
  created: { label: "Started", variant: "neutral" },
  authorized: { label: "Authorised", variant: "info" },
  submitted: { label: "Waiting for check", variant: "info" },
  captured: { label: "Received", variant: "success" },
  rejected: { label: "Not received", variant: "error" },
  failed: { label: "Failed", variant: "error" },
  refunded: { label: "Refunded", variant: "warning" },
};

function ago(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ${mins % 60} min ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** Staff check each UPI payment in their bank / UPI app, then confirm or reject it here. */
export function AdminPaymentsPanel({
  rows,
  role,
  onChanged,
}: {
  rows: AdminPaymentRow[];
  role: StaffRole;
  onChanged: (message: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<"waiting" | "all">("waiting");
  const canAct = role === "owner" || role === "ops";
  const waiting = rows.filter((r) => r.payment.status === "submitted");
  const shown = useMemo(() => (filter === "waiting" ? waiting : rows), [filter, rows, waiting]);
  const receivedToday = rows
    .filter((r) => r.payment.status === "captured" && r.payment.reviewedAt && new Date(r.payment.reviewedAt).toDateString() === new Date().toDateString())
    .reduce((sum, r) => sum + r.payment.amountPaise, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-soft p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-600">Waiting for your check</p>
          <p className="mt-1 font-display text-3xl font-semibold text-forest-900">{waiting.length}</p>
        </div>
        <div className="card-soft p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-600">Amount waiting</p>
          <p className="mt-1 font-display text-3xl font-semibold text-copper-700">
            {formatINR(waiting.reduce((s, r) => s + r.payment.amountPaise, 0))}
          </p>
        </div>
        <div className="card-soft p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-600">Confirmed today</p>
          <p className="mt-1 font-display text-3xl font-semibold text-forest-700">{formatINR(receivedToday)}</p>
        </div>
      </div>

      <Banner
        status="info"
        title="Confirm only after you see the money"
        description="Open your bank or UPI app, find a credit of the exact amount with the same 12-digit UPI reference (UTR), then press Money received. Seats stay held while a payment waits here."
        collapsible={false}
      />

      <div className="flex gap-2">
        {(["waiting", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              filter === f ? "bg-forest-900 text-white" : "bg-white text-stone-600 hover:bg-lagoon-100"
            }`}
          >
            {f === "waiting" ? `Waiting (${waiting.length})` : `All payments (${rows.length})`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white/70 p-8 text-center text-sm text-stone-600">
          {filter === "waiting" ? "Nothing to check right now." : "No payments yet."}
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((row) => (
            <PaymentCard key={row.payment.id} row={row} canAct={canAct} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PaymentCard({
  row,
  canAct,
  onChanged,
}: {
  row: AdminPaymentRow;
  canAct: boolean;
  onChanged: (message: string) => Promise<void>;
}) {
  const p = row.payment;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<UpiReviewDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const badge = STATUS_BADGE[p.status];
  const isWaiting = p.status === "submitted";

  async function decide(decision: UpiReviewDecision) {
    setError(null);
    if (decision === "confirm") {
      const ok = window.confirm(
        `Confirm ONLY if your bank/UPI app shows ${formatINR(p.amountPaise)} received with UPI reference ${p.utr}.\n\nMark as received?`
      );
      if (!ok) return;
    } else if (note.trim().length < 5) {
      setError("Write what you found (at least 5 characters) — the customer sees this note when you reject.");
      return;
    }
    setBusy(decision);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: p.id, decision, note: note.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not save.");
        return;
      }
      const messages: Record<UpiReviewDecision, string> = {
        confirm: `${row.bookingReference}: ${formatINR(p.amountPaise)} received — booking is now ${String(json.bookingStatus).replace(/_/g, " ")}.`,
        reject_retry: `${row.bookingReference}: marked not received. The customer can send the reference again.`,
        reject_cancel: `${row.bookingReference}: marked not received and the booking was cancelled; seats are free.`,
        refund_late: `${row.bookingReference}: marked refunded.`,
      };
      await onChanged(messages[decision]);
    } catch {
      setError("Network problem — nothing was changed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="card-soft overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <div className="space-y-0.5">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono font-bold text-forest-900">{row.bookingReference}</span>
            <span className="text-stone-600">•</span>
            <strong className="text-ink-900">{row.customerName}</strong>
            <span className="text-stone-600">{row.customerPhone}</span>
          </p>
          <p className="text-xs text-stone-600">
            {row.tripTitle} • {row.departureCode} ({row.departureStartDate}) • {row.seatsRequested} seat
            {row.seatsRequested === 1 ? "" : "s"} • booking {row.bookingStatus.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.lateAfterHold && !p.seatsLost && <Badge variant="orange" label="Paid after hold — seats kept" />}
          {p.seatsLost && <Badge variant="red" label="Paid late — seats gone, refund" />}
          <Badge variant={badge.variant} label={badge.label} />
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-stone-600">Amount</dt>
            <dd className="flex items-center font-display text-xl font-semibold text-forest-900">
              <IndianRupee className="h-4 w-4" aria-hidden="true" />
              {(p.amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: p.amountPaise % 100 ? 2 : 0 })}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-stone-600">
              {p.method && p.method !== "upi" && p.method !== "gateway" ? "Recorded by staff" : "UPI reference (UTR)"}
            </dt>
            <dd className="flex items-center gap-1.5 font-mono text-base font-semibold text-ink-900">
              {p.method && p.method !== "upi" && p.method !== "gateway"
                ? `${{ cash: "Cash", bank_transfer: "Bank transfer", upi_manual: "UPI (manual)" }[p.method]} • ${p.staffReference ?? "—"}`
                : p.utr ?? "—"}
              {p.utr && (
                <button
                  type="button"
                  aria-label="Copy UPI reference"
                  onClick={() => {
                    void navigator.clipboard.writeText(p.utr ?? "");
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                  className="rounded-md p-1 text-stone-600 hover:bg-lagoon-100"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-stone-600">Paid to</dt>
            <dd className="font-mono text-xs text-ink-900">{p.paidToUpiId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-stone-600">
              {p.paymentType === "deposit" ? "Deposit" : p.paymentType === "balance" ? "Balance" : "Full"} • sent
            </dt>
            <dd className="text-xs text-ink-900">{ago(p.submittedAt)}</dd>
          </div>
        </dl>
      </div>

      {p.reviewNote && !isWaiting && (
        <p className="border-t border-stone-200 bg-cream-100/60 px-4 py-2 text-xs text-stone-600">
          Note: {p.reviewNote} {p.reviewedAt ? `• ${new Date(p.reviewedAt).toLocaleString("en-IN")}` : ""}
        </p>
      )}

      {isWaiting && canAct && (
        <div className="space-y-3 border-t border-stone-200 bg-cream-100/50 px-4 py-4">
          {!p.seatsLost && (
            <Button
              variant="primary"
              label={`Money received — confirm ${formatINR(p.amountPaise)}`}
              isLoading={busy === "confirm"}
              isDisabled={busy !== null}
              onClick={() => void decide("confirm")}
            />
          )}
          <TextInput
            label="If not received: what did you find?"
            description="Needed to reject or refund. The customer sees this note."
            placeholder="e.g. No credit with this UTR in IDFC statement"
            value={note}
            onChange={setNote}
            size="sm"
          />
          <div className="flex flex-wrap gap-2">
            {!p.seatsLost && (
              <Button
                label="Not received — let customer retry"
                isLoading={busy === "reject_retry"}
                isDisabled={busy !== null}
                onClick={() => void decide("reject_retry")}
              />
            )}
            {row.bookingPaidPaise === 0 && (
              <Button
                variant="destructive"
                label="Not received — cancel booking"
                isLoading={busy === "reject_cancel"}
                isDisabled={busy !== null}
                onClick={() => void decide("reject_cancel")}
              />
            )}
            {p.seatsLost && (
              <Button
                label="Money returned — mark refunded"
                isLoading={busy === "refund_late"}
                isDisabled={busy !== null}
                onClick={() => void decide("refund_late")}
              />
            )}
          </div>
          {error && (
            <p role="alert" className="rounded-xl bg-[#fdecec] px-3 py-2 text-sm text-[#9b1c1c]">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
