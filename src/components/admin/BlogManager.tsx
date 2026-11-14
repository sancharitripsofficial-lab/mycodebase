"use client";

import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ExternalLink, Eye, EyeOff, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { Notice, Panel, useAdminContent } from "@/components/admin/kit";
import { BlogVideo } from "@/components/blog/BlogVideo";
import { blogIdFrom, isSafeMediaLink, mergeBlogPosts, type BlogPost } from "@/lib/blog";
import { localISODate } from "@/lib/dates";

type Editor = ReturnType<typeof useAdminContent>;

const empty = (): BlogPost => ({
  id: "",
  title: "",
  excerpt: "",
  body: "",
  videoUrl: "",
  posterUrl: "",
  tripSlug: null,
  publishedOn: localISODate(),
  published: true,
});

/** Admin → Website → Blog & videos: video stories shown on /blog. */
export function BlogManager({ editor, canEdit }: { editor: Editor; canEdit: boolean }) {
  const content = editor.content;
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [draft, setDraft] = useState<BlogPost | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<"video" | "poster" | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  if (!content) return <p className="text-sm text-stone-600">Loading…</p>;
  const list = posts ?? mergeBlogPosts((content.settings as { blogPosts?: unknown }).blogPosts);
  const trips = content.trips.map((t) => t.trip);

  async function saveList(next: BlogPost[], okText: string) {
    setBusy(true);
    setNotice(null);
    const r = await editor.save("settings.save", { key: "blog_posts", value: next });
    setBusy(false);
    if (r.ok) {
      setPosts(next);
      setNotice({ kind: "ok", text: `${okText} The blog shows it within a minute.` });
      return true;
    }
    setNotice({ kind: "error", text: r.error });
    return false;
  }

  async function upload(file: File, target: "video" | "poster") {
    if (!draft) return;
    setUploading(target);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/media", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Upload failed.");
      setDraft((d) => (d ? { ...d, [target === "video" ? "videoUrl" : "posterUrl"]: String(json.url) } : d));
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploading(null);
    }
  }

  async function onSaveDraft() {
    if (!draft) return;
    const title = draft.title.trim();
    if (title.length < 3) return setNotice({ kind: "error", text: "Give the post a title (3+ characters)." });
    if (!draft.videoUrl || !isSafeMediaLink(draft.videoUrl)) return setNotice({ kind: "error", text: "Upload the video (or paste its link from the Media library)." });
    if (draft.posterUrl && !isSafeMediaLink(draft.posterUrl)) return setNotice({ kind: "error", text: "The cover picture link must come from the Media library (or be an https:// link)." });
    // The address stays the same once a post exists, so shared links keep working.
    let id = draft.id || blogIdFrom(title);
    const taken = new Set(list.filter((_, i) => i !== editingIndex).map((p) => p.id));
    for (let n = 2; taken.has(id); n++) id = `${blogIdFrom(title)}-${n}`;
    const post: BlogPost = { ...draft, id, title };
    const next = editingIndex === null ? [post, ...list] : list.map((p, i) => (i === editingIndex ? post : p));
    if (await saveList(next, editingIndex === null ? `“${title}” added.` : `“${title}” saved.`)) {
      setDraft(null);
      setEditingIndex(null);
    }
  }

  return (
    <Panel
      title="Blog & videos"
      description="Trip stories with a video, shown on the website's Blog page (newest date first). Upload the video here; it is kept in the Media library."
    >
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {draft ? (
        <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="font-display text-lg font-semibold text-forest-900">{editingIndex === null ? "New video post" : "Edit post"}</h3>
          <TextInput label="Title" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v.slice(0, 120) })} placeholder="e.g. Monsoon weekend in Coorg" />
          <TextArea label="Short text (shown on the list)" rows={2} value={draft.excerpt} onChange={(v) => setDraft({ ...draft, excerpt: v.slice(0, 300) })} />

          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink-900">Video (MP4 or WebM, up to 20 MB)</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-forest-900 px-4 text-sm font-semibold text-white hover:bg-forest-800">
                <Upload className="h-4 w-4" aria-hidden="true" /> {uploading === "video" ? "Uploading…" : draft.videoUrl ? "Replace video" : "Upload video"}
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  className="sr-only"
                  disabled={uploading !== null || !canEdit}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void upload(f, "video");
                  }}
                />
              </label>
              <span className="text-xs text-stone-600">or paste a link from Media library:</span>
            </div>
            <TextInput label="Video link" value={draft.videoUrl} onChange={(v) => setDraft({ ...draft, videoUrl: v.trim() })} />
            {draft.videoUrl && isSafeMediaLink(draft.videoUrl) && <BlogVideo src={draft.videoUrl} poster={draft.posterUrl} title={draft.title || "Video preview"} className="max-w-xl" />}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink-900">Cover picture (optional, shown before play)</p>
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-forest-900 hover:bg-lagoon-100">
              <Upload className="h-4 w-4" aria-hidden="true" /> {uploading === "poster" ? "Uploading…" : "Upload picture"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="sr-only"
                disabled={uploading !== null || !canEdit}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void upload(f, "poster");
                }}
              />
            </label>
            <TextInput label="Cover picture link" value={draft.posterUrl} onChange={(v) => setDraft({ ...draft, posterUrl: v.trim() })} />
          </div>

          <TextArea label="Story (optional, blank line = new paragraph)" rows={6} value={draft.body} onChange={(v) => setDraft({ ...draft, body: v.slice(0, 6000) })} />
          <div className="grid gap-3 md:grid-cols-2">
            <Selector
              label="Which trip is this story about?"
              value={draft.tripSlug ?? "none"}
              onChange={(v) => setDraft({ ...draft, tripSlug: v === "none" ? null : v })}
              options={[{ value: "none", label: "No single trip" }, ...trips.map((t) => ({ value: t.slug, label: t.title }))]}
            />
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink-900">Date</span>
              <input
                type="date"
                value={draft.publishedOn}
                onChange={(e) => setDraft({ ...draft, publishedOn: e.target.value })}
                className="min-h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm"
              />
            </label>
          </div>
          <Switch label="Show on the website" value={draft.published} onChange={(v) => setDraft({ ...draft, published: v })} />
          <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-3">
            <Button label={busy ? "Saving…" : "Save post"} variant="primary" isDisabled={busy || uploading !== null || !canEdit} onClick={() => void onSaveDraft()} />
            <Button
              label="Cancel"
              variant="secondary"
              onClick={() => {
                setDraft(null);
                setEditingIndex(null);
              }}
            />
          </div>
        </div>
      ) : (
        canEdit && (
          <Button
            label="Add a video post"
            variant="primary"
            icon={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={() => {
              setDraft(empty());
              setEditingIndex(null);
              setNotice(null);
            }}
          />
        )
      )}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600">No posts yet. The Blog page says new stories are coming soon.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((p, i) => (
            <li key={p.id} className="min-w-0 space-y-2 rounded-2xl border border-stone-200 bg-white p-3.5">
              <div className="flex gap-3">
                <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-[#0f2b2b]">
                  {p.posterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words text-ink-900">{p.title}</p>
                  <p className="text-xs text-stone-600">
                    {p.publishedOn} · {p.published ? "Shown" : "Hidden"}
                    {p.tripSlug ? ` · ${trips.find((t) => t.slug === p.tripSlug)?.title ?? p.tripSlug}` : ""}
                  </p>
                  <a href={`/blog/${p.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-forest-800 hover:underline">
                    Open <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ ...p });
                      setEditingIndex(i);
                      setNotice(null);
                    }}
                    className="inline-flex min-h-10 items-center gap-1 rounded-full border border-stone-300 px-3 text-sm font-semibold text-forest-900 hover:bg-lagoon-100"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveList(list.map((x, j) => (j === i ? { ...x, published: !x.published } : x)), p.published ? `“${p.title}” hidden.` : `“${p.title}” shown.`)}
                    className="inline-flex min-h-10 items-center gap-1 rounded-full border border-stone-300 px-3 text-sm font-semibold text-forest-900 hover:bg-lagoon-100"
                  >
                    {p.published ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />} {p.published ? "Hide" : "Show"}
                  </button>
                  {confirmDelete === i ? (
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveList(list.filter((_, j) => j !== i), `“${p.title}” deleted (the video stays in Media library).`).then(() => setConfirmDelete(null))}
                        className="min-h-10 rounded-full bg-[#a3263a] px-3 text-sm font-semibold text-white"
                      >
                        Yes, delete
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className="min-h-10 rounded-full px-3 text-sm font-semibold text-stone-600">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(i)} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-[#f3c0c9] px-3 text-sm font-semibold text-[#a3263a] hover:bg-[#fff1f3]">
                      <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                    </button>
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
