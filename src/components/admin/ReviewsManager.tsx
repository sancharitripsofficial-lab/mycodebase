"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Plus, Star } from "lucide-react";
import { useState } from "react";
import { Notice, Panel, useAdminContent } from "@/components/admin/kit";
import type { VerifiedReview } from "@/lib/types";

type Editor = ReturnType<typeof useAdminContent>;

/** Real traveller reviews only: a review can be published only after you mark it verified. */
export function ReviewsManager({ editor }: { editor: Editor }) {
  const { content } = editor;
  const [adding, setAdding] = useState(false);
  if (!content) return <p className="text-sm text-stone-600">Loading…</p>;
  const canEdit = content.editable && (content.actorRole === "owner" || content.actorRole === "ops");
  const trips = content.trips.map((t) => ({ value: t.trip.id, label: t.trip.title }));

  return (
    <Panel
      title="Traveller reviews"
      description="Add reviews from real completed trips (WhatsApp, Google, Instagram). Only verified reviews can go on the website — never invented ones."
      actions={canEdit && !adding && <Button variant="primary" label="Add review" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)} />}
    >
      {adding && <ReviewForm review={null} trips={trips} editor={editor} canEdit={canEdit} onDone={() => setAdding(false)} />}
      {content.reviews.length === 0 && !adding ? (
        <p className="text-sm text-stone-600">No reviews yet. The homepage hides the reviews block until one is published.</p>
      ) : (
        <ul className="space-y-3">
          {content.reviews.map((r) => (
            <li key={r.id}>
              <ReviewForm review={r} trips={trips} editor={editor} canEdit={canEdit} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ReviewForm({
  review,
  trips,
  editor,
  canEdit,
  onDone,
}: {
  review: VerifiedReview | null;
  trips: { value: string; label: string }[];
  editor: Editor;
  canEdit: boolean;
  onDone?: () => void;
}) {
  const [f, setF] = useState({
    tripId: review?.tripId ?? "",
    authorName: review?.authorName ?? "",
    departureLabel: review?.departureLabel ?? "",
    rating: review?.rating ?? 5,
    quote: review?.quote ?? "",
    isVerifiedAuthentic: review?.isVerifiedAuthentic ?? false,
    isPublished: review?.isPublished ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    const r = await editor.save("review.save", {
      ...(review ? { id: review.id } : {}),
      ...f,
      tripId: f.tripId || null,
      departureLabel: f.departureLabel.trim() || null,
    });
    setBusy(false);
    setNotice(r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });
    if (r.ok) onDone?.();
  }

  async function remove() {
    if (!review || !window.confirm(`Delete the review by ${review.authorName}?`)) return;
    const r = await editor.save("review.delete", { id: review.id });
    setNotice(r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      {review && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex text-saffron-500" aria-label={`${review.rating} out of 5`}>
            {Array.from({ length: review.rating }, (_, i) => (
              <Star key={i} className="h-4 w-4 fill-current" aria-hidden="true" />
            ))}
          </span>
          <Badge variant={review.isPublished ? "success" : "neutral"} label={review.isPublished ? "On website" : "Hidden"} />
          {review.isVerifiedAuthentic && <Badge variant="teal" label="Verified" />}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <TextInput label="Traveller name" value={f.authorName} isDisabled={!canEdit} onChange={(v) => setF({ ...f, authorName: v })} />
        <TextInput label="Trip / batch label" placeholder="Coorg • Nov 2026" value={f.departureLabel} isOptional isDisabled={!canEdit} onChange={(v) => setF({ ...f, departureLabel: v })} />
        <NumberInput label="Stars (1–5)" value={f.rating} isDisabled={!canEdit} onChange={(v) => setF({ ...f, rating: Math.min(5, Math.max(1, Math.round(v))) })} />
        <div className="md:col-span-3">
          <TextArea label="What they said" rows={3} maxLength={800} value={f.quote} isDisabled={!canEdit} onChange={(v) => setF({ ...f, quote: v })} />
        </div>
        <Selector label="Trip" value={f.tripId} hasClear isDisabled={!canEdit} placeholder="Any / not specific" options={trips} onChange={(v) => setF({ ...f, tripId: v ?? "" })} />
        <div className="self-end pb-1">
          <Switch
            label="I verified this is real"
            value={f.isVerifiedAuthentic}
            isDisabled={!canEdit}
            onChange={(v) => setF({ ...f, isVerifiedAuthentic: v, isPublished: v ? f.isPublished : false })}
          />
        </div>
        <div className="self-end pb-1">
          <Switch label="Show on website" value={f.isPublished} isDisabled={!canEdit || !f.isVerifiedAuthentic} onChange={(v) => setF({ ...f, isPublished: v })} />
        </div>
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" label={review ? "Save" : "Add review"} isLoading={busy} onClick={() => void save()} />
          {review && <Button size="sm" variant="ghost" label="Delete" onClick={() => void remove()} />}
          {!review && <Button size="sm" variant="ghost" label="Cancel" onClick={() => onDone?.()} />}
          {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        </div>
      )}
    </div>
  );
}
