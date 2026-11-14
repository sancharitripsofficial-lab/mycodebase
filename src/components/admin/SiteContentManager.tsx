"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AssistantForm } from "@/components/admin/AssistantForm";
import { HomePageForm } from "@/components/admin/HomePageForm";
import { KannadaForm } from "@/components/admin/KannadaForm";
import { Notice, Panel, useAdminContent } from "@/components/admin/kit";
import type { SiteSettings } from "@/lib/types";

type Editor = ReturnType<typeof useAdminContent>;
type Tab = "home" | "assistant" | "kannada" | "brand" | "social" | "policy" | "faqs" | "legal";

const TABS: { key: Tab; label: string }[] = [
  { key: "home", label: "Home page" },
  { key: "assistant", label: "Chat guide" },
  { key: "kannada", label: "Kannada (ಕನ್ನಡ)" },
  { key: "brand", label: "Brand & contact" },
  { key: "social", label: "Social & WhatsApp" },
  { key: "policy", label: "Booking rules" },
  { key: "faqs", label: "FAQs" },
  { key: "legal", label: "Legal pages" },
];

/** Website words, contact details, booking rules, FAQs and legal text. */
export function SiteContentManager({ editor }: { editor: Editor }) {
  const { content } = editor;
  const [tab, setTab] = useState<Tab>("home");
  if (!content) return <p className="text-sm text-stone-600">Loading…</p>;
  const canEdit = content.editable && (content.actorRole === "owner" || content.actorRole === "ops");

  return (
    <Panel title="Website text & policies" description="Home page sections and categories, the chat guide and its customer care number, brand words, booking rules, FAQs and legal text. Changes show on the website on the next page load. Every save is kept in the audit log.">
      {!content.editable && <Banner status="warning" title="Preview mode is read-only" collapsible={false} />}
      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200" aria-label="Website sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === t.key ? "border-copper-600 text-forest-900" : "border-transparent text-stone-600 hover:text-forest-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "home" && (
        <HomePageForm key="h" initial={content.settings.homePage} trips={content.trips.map((t) => t.trip)} save={editor.save} canEdit={canEdit} />
      )}
      {tab === "assistant" && (
        <AssistantForm
          key="a"
          initial={content.settings.assistant}
          aiReady={Boolean(content.assistantAiReady)}
          whatsappNumber={content.settings.socialLinks?.whatsappNumber ?? ""}
          save={editor.save}
          canEdit={canEdit}
        />
      )}
      {tab === "kannada" && (
        <KannadaForm
          key="k"
          settings={content.settings as unknown as Record<string, unknown>}
          trips={content.trips as unknown as Parameters<typeof KannadaForm>[0]["trips"]}
          saved={content.settings.translationsKn ?? {}}
          save={editor.save}
          canEdit={canEdit}
        />
      )}
      {tab === "brand" && <BrandForm key="b" initial={content.settings.brandIdentity} editor={editor} canEdit={canEdit} />}
      {tab === "social" && <SocialForm key="s" initial={content.settings.socialLinks} editor={editor} canEdit={canEdit} />}
      {tab === "policy" && <PolicyForm key="p" initial={content.settings.bookingPolicy} editor={editor} canEdit={canEdit} />}
      {tab === "faqs" && <FaqForm key="f" initial={content.settings.faqs} editor={editor} canEdit={canEdit} />}
      {tab === "legal" && <LegalForm key="l" initial={content.settings.legalDrafts} editor={editor} canEdit={canEdit} />}
    </Panel>
  );
}

function SaveBar({ editor, keyName, value, canEdit }: { editor: Editor; keyName: string; value: unknown; canEdit: boolean }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  if (!canEdit) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
      <Button
        variant="primary"
        label="Save"
        isLoading={busy}
        onClick={async () => {
          setBusy(true);
          const r = await editor.save("settings.save", { key: keyName, value });
          setBusy(false);
          setNotice(r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });
        }}
      />
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
    </div>
  );
}

function BrandForm({ initial, editor, canEdit }: { initial: SiteSettings["brandIdentity"]; editor: Editor; canEdit: boolean }) {
  const [f, setF] = useState(initial);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput label="Brand name" value={f.brandName} isDisabled={!canEdit} onChange={(v) => set("brandName", v)} />
        <TextInput label="Base city" value={f.baseCity} isDisabled={!canEdit} onChange={(v) => set("baseCity", v)} />
        <div className="md:col-span-2">
          <TextInput
            label="Homepage headline"
            description='Use a full stop to split it: "Leave as strangers. Return as a story." → the second part glows orange.'
            value={f.headline}
            isDisabled={!canEdit}
            onChange={(v) => set("headline", v)}
          />
        </div>
        <div className="md:col-span-2">
          <TextArea label="Homepage sub-headline" rows={2} value={f.subheadline} isDisabled={!canEdit} onChange={(v) => set("subheadline", v)} />
        </div>
        <TextInput label="Support email" value={f.supportEmail} isDisabled={!canEdit} onChange={(v) => set("supportEmail", v)} />
        <TextInput label="WhatsApp (as shown)" placeholder="+91 98765 43210" value={f.whatsappDisplay} isDisabled={!canEdit} onChange={(v) => set("whatsappDisplay", v)} />
        <TextInput label="Support hours" placeholder="Mon–Sun, 9 AM – 7 PM" value={f.supportHours} isDisabled={!canEdit} onChange={(v) => set("supportHours", v)} />
        <TextInput label="Legal business name" value={f.legalEntityName} isDisabled={!canEdit} onChange={(v) => set("legalEntityName", v)} />
        <div className="md:col-span-2">
          <TextArea label="Registered address" rows={2} value={f.registeredAddress} isDisabled={!canEdit} onChange={(v) => set("registeredAddress", v)} />
        </div>
      </div>
      <Switch
        label="Some text is still a draft"
        description="Shows a small 'sample copy' note on the homepage until you switch it off."
        value={f.isCopyDraft}
        isDisabled={!canEdit}
        onChange={(v) => set("isCopyDraft", v)}
      />
      <SaveBar editor={editor} keyName="brand_identity" value={f} canEdit={canEdit} />
    </div>
  );
}

function SocialForm({ initial, editor, canEdit }: { initial: SiteSettings["socialLinks"]; editor: Editor; canEdit: boolean }) {
  const [f, setF] = useState(initial);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput label="Instagram page" placeholder="https://www.instagram.com/sanchari…" value={f.instagramUrl} isDisabled={!canEdit} onChange={(v) => setF({ ...f, instagramUrl: v.trim() })} />
        <TextInput label="YouTube channel" placeholder="https://www.youtube.com/@…" value={f.youtubeUrl} isDisabled={!canEdit} onChange={(v) => setF({ ...f, youtubeUrl: v.trim() })} />
        <TextInput label="Facebook page" placeholder="https://www.facebook.com/…" value={f.facebookUrl} isDisabled={!canEdit} onChange={(v) => setF({ ...f, facebookUrl: v.trim() })} />
        <TextInput
          label="WhatsApp chat number"
          description="91 + 10-digit mobile. Turns on the green 'Ask on WhatsApp' button on every page."
          placeholder="919876543210"
          value={f.whatsappNumber}
          isDisabled={!canEdit}
          onChange={(v) => setF({ ...f, whatsappNumber: v.replace(/\D/g, "") })}
        />
        <div className="md:col-span-2">
          <TextInput
            label="WhatsApp channel link"
            description="In WhatsApp: Updates → your channel → Share → Copy link. Turns on 'Follow on WhatsApp' buttons in the footer, trip pages and My Booking."
            placeholder="https://whatsapp.com/channel/…"
            value={f.whatsappChannelUrl ?? ""}
            isDisabled={!canEdit}
            onChange={(v) => setF({ ...f, whatsappChannelUrl: v.trim() })}
          />
        </div>
      </div>
      <SaveBar editor={editor} keyName="social_links" value={f} canEdit={canEdit} />
    </div>
  );
}

function PolicyForm({ initial, editor, canEdit }: { initial: SiteSettings["bookingPolicy"]; editor: Editor; canEdit: boolean }) {
  const [f, setF] = useState(initial);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="space-y-4">
      <Banner
        status="info"
        title="New rules apply to new bookings"
        description="Each booking keeps the cancellation rules it was made under."
        collapsible={false}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <NumberInput label="Seat hold while paying (minutes)" description="5–60" value={f.holdMinutes} isDisabled={!canEdit} onChange={(v) => set("holdMinutes", Math.round(v))} />
        <NumberInput label="GST / tax rate (%)" value={f.taxRatePercent} isDisabled={!canEdit} onChange={(v) => set("taxRatePercent", v)} />
        <TextInput label="Tax note shown at checkout" value={f.gstIncludedOrNote} isDisabled={!canEdit} onChange={(v) => set("gstIncludedOrNote", v)} />
        <div className="self-end pb-1">
          <Switch label="Allow deposit on all trips" value={f.allowDepositCheckout} isDisabled={!canEdit} onChange={(v) => set("allowDepositCheckout", v)} />
        </div>
        <NumberInput label="Default deposit (%)" value={f.depositPercent} isDisabled={!canEdit} onChange={(v) => set("depositPercent", Math.round(v))} />
        <NumberInput label="Balance due (days before)" value={f.balanceDueDaysBefore} isDisabled={!canEdit} onChange={(v) => set("balanceDueDaysBefore", Math.round(v))} />
        <NumberInput
          label="Comfort decision (hours before)"
          value={f.preferenceDecisionHoursBefore}
          isDisabled={!canEdit}
          onChange={(v) => set("preferenceDecisionHoursBefore", Math.round(v))}
        />
        <TextInput label="Policy version" description="Change it when the rules change." value={f.policyVersion} isDisabled={!canEdit} onChange={(v) => set("policyVersion", v)} />
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold text-ink-900">Cancellation & refund slabs</h3>
        {f.cancellationSlabs.map((slab, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
            <TextInput
              label="When"
              value={slab.label}
              isDisabled={!canEdit}
              onChange={(v) => set("cancellationSlabs", f.cancellationSlabs.map((s, j) => (j === i ? { ...s, label: v } : s)))}
            />
            <TextInput
              label="Refund"
              value={slab.refundNote}
              isDisabled={!canEdit}
              onChange={(v) => set("cancellationSlabs", f.cancellationSlabs.map((s, j) => (j === i ? { ...s, refundNote: v } : s)))}
            />
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                label="Remove"
                isIconOnly
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => set("cancellationSlabs", f.cancellationSlabs.filter((_, j) => j !== i))}
              />
            )}
          </div>
        ))}
        {canEdit && f.cancellationSlabs.length < 8 && (
          <Button
            size="sm"
            label="Add slab"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => set("cancellationSlabs", [...f.cancellationSlabs, { label: "", refundNote: "" }])}
          />
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextArea label="Room sharing policy" rows={4} value={f.roomPolicySummary} isDisabled={!canEdit} onChange={(v) => set("roomPolicySummary", v)} />
        <TextArea label="Vehicle & luggage policy" rows={4} value={f.vehiclePolicySummary} isDisabled={!canEdit} onChange={(v) => set("vehiclePolicySummary", v)} />
      </div>
      <SaveBar editor={editor} keyName="booking_policy" value={{ ...f, maxGroupSize: 6 }} canEdit={canEdit} />
    </div>
  );
}

function FaqForm({ initial, editor, canEdit }: { initial: SiteSettings["faqs"]; editor: Editor; canEdit: boolean }) {
  const [items, setItems] = useState(initial);
  const move = (i: number, d: number) =>
    setItems((all) => {
      const next = all.slice();
      const t = i + d;
      if (t < 0 || t >= next.length) return next;
      [next[i], next[t]] = [next[t], next[i]];
      return next;
    });
  return (
    <div className="space-y-3">
      {items.map((q, i) => (
        <div key={q.id} className="space-y-2 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-600">Question {i + 1}</span>
            {canEdit && (
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" label="Move up" isIconOnly icon={<ArrowUp className="h-4 w-4" />} isDisabled={i === 0} onClick={() => move(i, -1)} />
                <Button size="sm" variant="ghost" label="Move down" isIconOnly icon={<ArrowDown className="h-4 w-4" />} isDisabled={i === items.length - 1} onClick={() => move(i, 1)} />
                <Button size="sm" variant="ghost" label="Remove" isIconOnly icon={<Trash2 className="h-4 w-4" />} onClick={() => setItems(items.filter((_, j) => j !== i))} />
              </span>
            )}
          </div>
          <TextInput label="Question" value={q.question} isDisabled={!canEdit} onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, question: v } : x)))} />
          <TextArea label="Answer" rows={3} value={q.answer} isDisabled={!canEdit} onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, answer: v } : x)))} />
        </div>
      ))}
      {canEdit && items.length < 30 && (
        <Button
          label="Add question"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setItems([...items, { id: `faq-${Date.now().toString(36)}`, question: "", answer: "" }])}
        />
      )}
      <SaveBar editor={editor} keyName="faqs" value={items} canEdit={canEdit} />
    </div>
  );
}

function LegalForm({ initial, editor, canEdit }: { initial: SiteSettings["legalDrafts"]; editor: Editor; canEdit: boolean }) {
  const [f, setF] = useState(initial);
  return (
    <div className="space-y-4">
      <Banner
        status="warning"
        title="Have a lawyer review these before going live"
        description="Payment and trip rules here are what customers agree to."
        collapsible={false}
      />
      <TextArea label="Terms" rows={6} value={f.termsSummary} isDisabled={!canEdit} onChange={(v) => setF({ ...f, termsSummary: v })} />
      <TextArea label="Privacy notice" rows={6} value={f.privacySummary} isDisabled={!canEdit} onChange={(v) => setF({ ...f, privacySummary: v })} />
      <TextArea label="Refunds" rows={5} value={f.refundSummary} isDisabled={!canEdit} onChange={(v) => setF({ ...f, refundSummary: v })} />
      <TextArea label="Safety" rows={5} value={f.safetySummary} isDisabled={!canEdit} onChange={(v) => setF({ ...f, safetySummary: v })} />
      <Switch
        label="Still waiting for owner / lawyer review"
        description="Shows a 'draft' label on the policies page while on."
        value={f.ownerReviewRequired}
        isDisabled={!canEdit}
        onChange={(v) => setF({ ...f, ownerReviewRequired: v })}
      />
      <SaveBar editor={editor} keyName="legal_drafts" value={f} canEdit={canEdit} />
    </div>
  );
}
