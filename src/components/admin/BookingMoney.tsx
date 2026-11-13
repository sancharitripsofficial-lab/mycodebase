"use client";

import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { TextInput } from "@astryxdesign/core/TextInput";
import { MessageCircle, ReceiptIndianRupee, Undo2 } from "lucide-react";
import { useState } from "react";
import { MoneyField, Notice, rupees } from "@/components/admin/kit";
import { balanceReminderText, myBookingUrl, waLink } from "@/lib/admin/whatsapp";
import type { AdminBookingRow } from "@/lib/types";

type Mode = null | "pay" | "refund";

const OPEN_FOR_PAYMENT = ["pending_payment", "deposit_paid"];

/**
 * Money tools on one booking: record cash / bank / manual-UPI money, record a refund, and
 * send a WhatsApp balance reminder with the customer's own My Booking link.
 * The database decides what is allowed (amount limits, duplicate references, statuses).
 */
export function BookingMoney({
  row,
  canMutate,
  upiId,
  siteUrl,
  onDone,
}: {
  row: AdminBookingRow;
  canMutate: boolean;
  upiId: string | null;
  siteUrl: string;
  onDone: (message: string) => Promise<void>;
}) {
  const b = row.booking;
  const refunded = b.amountRefundedPaise ?? 0;
  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "upi_manual">("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [closeBooking, setCloseBooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bookingUrl = myBookingUrl(siteUrl, b.bookingReference, b.customerEmail, row.lookupToken);
  const reminder =
    b.amountDuePaise > 0 && ["deposit_paid", "pending_payment"].includes(b.status)
      ? waLink(
          b.customerPhone,
          balanceReminderText({
            customerName: b.customerName,
            tripTitle: row.tripTitle,
            departureCode: row.departureCode,
            startDate: row.departureStartDate,
            amountDuePaise: b.amountDuePaise,
            balanceDueAt: b.balanceDueAt,
            upiId,
            bookingUrl,
          })
        )
      : null;

  function open(next: Mode) {
    setError(null);
    setMode(next === mode ? null : next);
    setReference("");
    setNote(next === "pay" ? "Paid at office" : "");
    setCloseBooking(false);
    setAmount(next === "pay" ? b.amountDuePaise || null : next === "refund" ? b.amountPaidPaise - refunded || null : null);
  }

  async function submit() {
    if (!amount || amount <= 0) {
      setError("Enter the amount.");
      return;
    }
    if (mode === "refund") {
      const ok = window.confirm(
        `Record a refund of ${rupees(amount)} for ${b.bookingReference}?` +
          (closeBooking ? "\n\nThe booking will be closed and its seats freed." : "") +
          "\n\nOnly do this after the money has left your account."
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/owner-ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "pay"
            ? { kind: "record_payment", bookingId: b.id, amountRupees: amount / 100, method, reference, note }
            : { kind: "record_refund", bookingId: b.id, amountRupees: amount / 100, reference, note, closeBooking }
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "That did not work.");
        return;
      }
      const status = String(json.result?.bookingStatus ?? "").replace(/_/g, " ");
      setMode(null);
      await onDone(
        mode === "pay"
          ? `${b.bookingReference}: ${rupees(amount)} recorded — booking is now ${status}.`
          : `${b.bookingReference}: refund of ${rupees(amount)} recorded — booking is ${status}.`
      );
    } catch {
      setError("Network problem — nothing was saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-600">
        Paid <strong className="text-forest-900">{rupees(b.amountPaidPaise)}</strong> of {rupees(b.totalPaise)}
        {b.amountDuePaise > 0 && (
          <>
            {" "}• <strong className="text-copper-700">due {rupees(b.amountDuePaise)}</strong>
            {b.balanceDueAt ? ` by ${new Date(b.balanceDueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
          </>
        )}
        {refunded > 0 && <> • refunded {rupees(refunded)}</>}
        {row.seatNumbers.length > 0 && <> • seat{row.seatNumbers.length === 1 ? "" : "s"} {row.seatNumbers.join(", ")}</>}
      </p>
      <div className="flex flex-wrap gap-2">
        {canMutate && OPEN_FOR_PAYMENT.includes(b.status) && b.amountDuePaise > 0 && (
          <Button size="sm" label="Record payment" icon={<ReceiptIndianRupee className="h-4 w-4" />} onClick={() => open("pay")} />
        )}
        {canMutate && b.amountPaidPaise - refunded > 0 && (
          <Button size="sm" label="Record refund" icon={<Undo2 className="h-4 w-4" />} onClick={() => open("refund")} />
        )}
        {reminder && (
          <a
            href={reminder}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366]/15 px-3 py-1.5 text-xs font-semibold text-[#0f6b3a] hover:bg-[#25D366]/25"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Remind on WhatsApp
          </a>
        )}
      </div>

      {mode && (
        <div className="space-y-3 rounded-2xl border border-lagoon-500/30 bg-lagoon-100/40 p-3">
          <p className="text-sm font-semibold text-forest-900">
            {mode === "pay" ? "Money received outside the website" : "Money you sent back to the customer"}
          </p>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="grid gap-3 sm:grid-cols-2">
            <MoneyField
              label={mode === "pay" ? "Amount received (₹)" : "Amount refunded (₹)"}
              description={
                mode === "pay" ? `Still due: ${rupees(b.amountDuePaise)}` : `Can refund up to ${rupees(b.amountPaidPaise - refunded)}`
              }
              paise={amount}
              onChange={setAmount}
            />
            {mode === "pay" && (
              <Selector
                label="How it was paid"
                value={method}
                onChange={(v) => setMethod(v as typeof method)}
                options={[
                  { value: "cash", label: "Cash" },
                  { value: "bank_transfer", label: "Bank transfer (NEFT/IMPS)" },
                  { value: "upi_manual", label: "UPI sent to us directly" },
                ]}
              />
            )}
            <TextInput
              label={mode === "pay" ? "Receipt no. / UTR" : "Refund UTR / reference"}
              description="Each reference can be used only once."
              value={reference}
              onChange={setReference}
            />
            <TextInput
              label="Why (for the audit log)"
              value={note}
              onChange={setNote}
              placeholder={mode === "refund" ? "Cancelled 10 days before, 80% slab" : "Paid at office"}
            />
          </div>
          {mode === "refund" && (
            <Switch label="Also cancel this booking and free its seats" value={closeBooking} onChange={setCloseBooking} />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={mode === "refund" ? "destructive" : "primary"}
              size="sm"
              label={mode === "pay" ? "Save payment" : "Save refund"}
              isLoading={busy}
              onClick={() => void submit()}
            />
            <Button size="sm" label="Close" onClick={() => setMode(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
