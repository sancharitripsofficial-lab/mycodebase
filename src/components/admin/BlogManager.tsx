"use client";

import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ExternalLink, Eye, EyeOff, Film, ImageIcon, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { Notice, Panel, useAdminContent } from "@/components/admin/kit";
import { BlogVideo } from "@/components/blog/BlogVideo";
import { blogIdFrom, isSafeMediaLink, mergeBlogPosts, type BlogPost } from "@/lib/blog";
import { localISODate } from "@/lib/dates";
import { uploadMedia } from "@/lib/admin/upload-media";
import { BlogStoryEditor } from "@/components/admin/BlogStoryEditor";
import { BLOG_BODY_MAX } from "@/lib/blog";

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

/** Admin → Website → Blog & videos: photo stories and video stories shown on /blog. */
export function BlogManager({ editor, canEdit }: { editor: Editor; canEdit: boolean }) {
  const content = editor.content;
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [draft, setDraft] = useState<BlogPost | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<"video" | "poster" | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  /** A photo post (main photo + story) or a video post (video, optional cover photo). */
  const [kind, setKind] = useState<"photo" | "video">("photo");
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
    setProgress(0);
    setNotice(null);
    try {
      // Straight to storage (big phone photos are resized first): no server size limit.
      const { url } = await uploadMedia(file, setProgress);
      setDraft((d) => (d ? { ...d, [target === "video" ? "videoUrl" : "posterUrl"]: url } : d));
      setNotice({
        kind: "ok",
        text: target === "video" ? "Video uploaded. Save the post to publish it." : "Photo uploaded. Save the post to publish it.",
      });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploading(null);
      setProgress(null);
    }
  }

  async function onSaveDraft() {
    if (!draft) return;
    const title = draft.title.trim();
    if (title.length < 3) return setNotice({ kind: "error", text: "Give the post a title (3+ characters)." });
    if (kind === "photo" && !draft.posterUrl) return setNotice({ kind: "error", text: "Upload the main photo for this post." });
    if (kind === "video" && !draft.videoUrl) return setNotice({ kind: "error", text: "Upload the video for this post (or switch to a photo post)." });
    if (draft.videoUrl && !isSafeMediaLink(draft.videoUrl)) return setNotice({ kind: "error", text: "The video link must come from the Media library (or be an https:// link)." });
    if (draft.posterUrl && !isSafeMediaLink(draft.posterUrl)) return setNotice({ kind: "error", text: "The cover photo link must come from the Media library (or be an https:// link)." });
    // The address stays the same once a post exists, so shared links keep working.
    let id = draft.id || blogIdFrom(title);
    const taken = new Set(list.filter((_, i) => i !== editingIndex).map((p) => p.id));
    for (let n = 2; taken.has(id); n++) id = `${blogIdFrom(title)}-${n}`;
    // A photo post never keeps an old video link.
    const post: BlogPost = { ...draft, id, title, videoUrl: kind === "photo" ? "" : draft.videoUrl };
    const next = editingIndex === null ? [post, ...list] : list.map((p, i) => (i === editingIndex ? post : p));
    if (await saveList(next, editingIndex === null ? `“${title}” added.` : `“${title}” saved.`)) {
      setDraft(null);
      setEditingIndex(null);
    }
  }

  return (
    <Panel
      title="Blog & videos"
      description="Trip stories with a photo or a video, shown on the website's Blog page (newest date first). Uploads go straight to the Media library; big phone photos are resized automatically."
    >
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {draft ? (
        <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="font-display text-lg font-semibold text-forest-900">{editingIndex === null ? "New post" : "Edit post"}</h3>
          <div role="radiogroup" aria-label="Type of post" className="grid grid-cols-2 gap-2 sm:max-w-md">
            {([
              { key: "photo", label: "Photo post", hint: "Main photo + story", Icon: ImageIcon },
              { key: "video", label: "Video post", hint: "Video + optional cover", Icon: Film },
            ] as const).map(({ key, label, hint, Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={kind === key}
                onClick={() => setKind(key)}
                className={`flex min-h-14 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition ${
                  kind === key ? "border-forest-900 bg-forest-900 text-white shadow" : "border-stone-300 bg-white text-forest-900 hover:bg-lagoon-100"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="leading-tight">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className={`block text-[11px] ${kind === key ? "text-white/80" : "text-stone-600"}`}>{hint}</span>
                </span>
              </button>
            ))}
          </div>
          {uploading && progress !== null && (
            <div className="space-y-1" aria-live="polite">
              <p className="text-xs font-semibold text-forest-900">
                Uploading the {uploading === "video" ? "video" : "photo"}… {progress}%
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-forest-800 transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <TextInput label="Title" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v.slice(0, 120) })} placeholder="e.g. Monsoon weekend in Coorg" />
          <TextArea label="Short text (shown on the list)" rows={2} value={draft.excerpt} onChange={(v) => setDraft({ ...draft, excerpt: v.slice(0, 300) })} />

          {kind === "video" && (
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
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink-900">
              {kind === "photo"
                ? "Main photo (shown on the blog list and at the top of the post)"
                : "Cover photo (optional: shown on the blog list and before the video plays)"}
            </p>
            <label
              className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${
                kind === "photo" ? "bg-forest-900 text-white hover:bg-forest-800" : "border border-stone-300 bg-white text-forest-900 hover:bg-lagoon-100"
              }`}
            >
              <Upload className="h-4 w-4" aria-hidden="true" /> {uploading === "poster" ? "Uploading…" : draft.posterUrl ? "Replace photo" : "Upload photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
                className="sr-only"
                disabled={uploading !== null || !canEdit}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void upload(f, "poster");
                }}
              />
            </label>
            <TextInput label={kind === "photo" ? "Main photo link" : "Cover photo link"} value={draft.posterUrl} onChange={(v) => setDraft({ ...draft, posterUrl: v.trim() })} />
            {draft.posterUrl && isSafeMediaLink(draft.posterUrl) && (kind === "photo" || !draft.videoUrl) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.posterUrl} alt="Cover photo preview" className="aspect-[16/9] w-full max-w-xl rounded-2xl border border-stone-200 object-cover" />
            )}
          </div>

          <BlogStoryEditor
            value={draft.body}
            onChange={(body) => setDraft((d) => (d ? { ...d, body } : d))}
            canEdit={canEdit}
            maxLength={BLOG_BODY_MAX}
            onNotice={setNotice}
          />
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
            label="Add a post"
            variant="primary"
            icon={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={() => {
              setDraft(empty());
              setKind("photo");
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
                    {p.videoUrl ? "Video post" : "Photo post"} · {p.publishedOn} · {p.published ? "Shown" : "Hidden"}
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
                      setKind(p.videoUrl ? "video" : "photo");
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
