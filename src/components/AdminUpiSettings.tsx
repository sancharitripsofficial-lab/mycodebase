"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Switch } from "@astryxdesign/core/Switch";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useEffect, useState } from "react";
import { validatePayeeName, validateSupportPhone, validateUpiId } from "@/lib/payments/upi";
import type { StaffRole, UpiPaymentInstructions, UpiPaymentSettings } from "@/lib/types";

/** Owner sets the UPI ID that customers pay. Ops can see it; only the owner can change it. */
export function AdminUpiSettings({ role, onSaved }: { role: StaffRole; onSaved: (message: string) => Promise<void> }) {
  const isOwner = role === "owner";
  const [loaded, setLoaded] = useState<UpiPaymentSettings | null>(null);
  const [testQr, setTestQr] = useState<UpiPaymentInstructions | null>(null);
  const [upiId, setUpiId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/payment-settings", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not load UPI settings.");
        return;
      }
      const s = json.settings as UpiPaymentSettings;
      setLoaded(s);
      setUpiId(s.upiId);
      setPayeeName(s.payeeName);
      setSupportPhone(s.supportPhone);
      setIsEnabled(s.isEnabled);
      setTestQr(json.testQr ?? null);
    })();
  }, []);

  const upiCheck = upiId.trim() ? validateUpiId(upiId) : null;
  const nameCheck = payeeName.trim() ? validatePayeeName(payeeName) : null;
  const phoneCheck = validateSupportPhone(supportPhone);
  const changedAccount = loaded !== null && loaded.upiId !== "" && upiId.trim().toLowerCase() !== loaded.upiId;

  async function save() {
    setError(null);
    setTouched(true);
    if (isEnabled && (!upiCheck?.ok || !nameCheck?.ok)) {
      setError("Enter a valid UPI ID and payee name before switching payments on.");
      return;
    }
    if (upiCheck && !upiCheck.ok) return setError(upiCheck.message);
    if (nameCheck && !nameCheck.ok) return setError(nameCheck.message);
    if (!phoneCheck.ok) return setError(phoneCheck.message);
    if (
      changedAccount &&
      !window.confirm(
        `Change where customers' money goes from ${loaded?.upiId} to ${upiId.trim().toLowerCase()}?\n\nPayments already waiting were made to the old UPI ID — check those in the old account.`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/payment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled, upiId, payeeName, supportPhone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not save.");
        return;
      }
      const s = json.settings as UpiPaymentSettings;
      setLoaded(s);
      setUpiId(s.upiId);
      setPayeeName(s.payeeName);
      setSupportPhone(s.supportPhone);
      setIsEnabled(s.isEnabled);
      setTestQr(json.testQr ?? null);
      await onSaved(s.isEnabled ? `UPI payments are ON — customers now pay ${s.upiId}.` : "UPI settings saved (payments are OFF).");
    } catch {
      setError("Network problem — nothing was saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded && !error) {
    return <p className="text-sm text-stone-600">Loading UPI settings…</p>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="card-soft space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="font-display text-2xl font-semibold text-forest-900">Where customers pay</h2>
          <p className="mt-1 text-sm text-stone-600">
            Money goes straight from the customer&apos;s UPI app into the bank account linked to this UPI ID. No gateway, no
            fees. Your team confirms each payment under Payments.
          </p>
        </div>

        {!isOwner && (
          <Banner status="info" title="Only the owner can change the UPI account" collapsible={false} />
        )}

        <TextInput
          label="UPI ID"
          description="Copy it from your UPI app → Profile. A phone number alone is not enough — use the full ID, e.g. 9876543210@ybl."
          placeholder="yourname@okhdfcbank"
          value={upiId}
          onChange={(v) => setUpiId(v.trim())}
          isDisabled={!isOwner}
          isRequired
          status={
            upiCheck && !upiCheck.ok && (touched || upiId.length > 4)
              ? { type: "error", message: upiCheck.message }
              : upiCheck?.ok
                ? { type: "success" }
                : undefined
          }
          statusVariant="detached"
        />

        <TextInput
          label="Payee name"
          description="Shown to customers before they pay. Use the name your UPI app shows for this account."
          placeholder="Sanchari Micro Trips"
          value={payeeName}
          onChange={setPayeeName}
          isDisabled={!isOwner}
          isRequired
          status={nameCheck && !nameCheck.ok && touched ? { type: "error", message: nameCheck.message } : undefined}
          statusVariant="detached"
        />

        <TextInput
          label="Payment help phone"
          description="Optional. Shown to customers who have trouble paying."
          type="tel"
          placeholder="98765 43210"
          value={supportPhone}
          onChange={setSupportPhone}
          isDisabled={!isOwner}
          isOptional
          status={!phoneCheck.ok && touched ? { type: "error", message: phoneCheck.message } : undefined}
          statusVariant="detached"
        />

        <div className="rounded-2xl border border-stone-200 bg-cream-100/60 p-4">
          <Switch
            label="Take bookings with UPI payments"
            description="When off, customers cannot hold seats online (they're asked to WhatsApp you)."
            value={isEnabled}
            onChange={setIsEnabled}
            isDisabled={!isOwner}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-[#fdecec] px-3 py-2 text-sm text-[#9b1c1c]">
            {error}
          </p>
        )}

        {isOwner && <Button variant="primary" size="lg" label="Save UPI settings" isLoading={saving} onClick={() => void save()} />}

        {loaded?.updatedAt && (
          <p className="text-xs text-stone-600">
            Last changed {new Date(loaded.updatedAt).toLocaleString("en-IN")} • every change is kept in the audit log.
          </p>
        )}
      </div>

      <aside className="card-soft space-y-3 p-5">
        <h3 className="font-display text-lg font-semibold text-forest-900">₹1 test before going live</h3>
        {testQr ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- server-generated QR data URL */}
            <img src={testQr.qrDataUrl} alt="Test QR for ₹1" width={240} height={240} className="w-full rounded-xl border border-stone-200 bg-white p-2" />
            <p className="text-xs leading-relaxed text-stone-600">
              Scan this with a different phone and pay <strong>₹1</strong>. If it reaches your account with the name{" "}
              <strong>{testQr.payeeName}</strong>, customers&apos; money will too.
            </p>
          </>
        ) : (
          <p className="text-sm text-stone-600">Save a UPI ID and payee name to get a ₹1 test QR here.</p>
        )}
        <Banner
          status="warning"
          title="Use a business UPI if you can"
          description="Personal UPI IDs work, but banks may cap how much a personal account can receive per day. A free business UPI (PhonePe Business, Paytm for Business, BharatPe) avoids that."
        />
      </aside>
    </div>
  );
}
