"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Check, Copy, ExternalLink, ImagePlus, Search, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Notice, Panel } from "@/components/admin/kit";
import { getCached, setCached } from "@/lib/admin/memo-cache";

interface MediaItem {
  path: string;
  url: string;
  name: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string | null;
  usedBy: string[];
}

type Filter = "all" | "photos" | "videos" | "unused";

const isVideo = (item: MediaItem) => item.contentType.startsWith("video/") || /\.(mp4|webm)$/i.test(item.name);

/** "20261113-doctor-photo-a1b2c3.png" → "doctor photo.png" (the readable part of the stored name). */
function friendlyName(stored: string): string {
  const m = stored.match(/^\d{8}-(.+)-[0-9a-f]{6}\.([a-z0-9]+)$/i);
  if (!m) return stored;
  return `${m[1].replace(/-/g, " ")}.${m[2].toLowerCase()}`;
}

function sizeLabel(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function dateLabel(item: MediaItem): string {
  const iso = item.createdAt ?? (/^(\d{4})(\d{2})(\d{2})-/.exec(item.name) ? `${item.name.slice(0, 4)}-${item.name.slice(4, 6)}-${item.name.slice(6, 8)}` : null);
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** Copies text; falls back to a hidden text box where the Clipboard API is not allowed. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Upload photos / short videos, see where each is used, copy links and delete unused files.
 * With `onPick`, it works as a picker inside other editors (tap a file to use it).
 */
export function MediaLibrary({
  canEdit,
  onPick,
  pickLabel = "Use this",
  compact = false,
}: {
  canEdit: boolean;
  onPick?: (url: string, item: MediaItem) => void;
  pickLabel?: string;
  compact?: boolean;
}) {
  const cached = getCached<{ ready?: boolean; items?: MediaItem[] }>("media");
  const [items, setItems] = useState<MediaItem[]>(cached?.items ?? []);
  const [ready, setReady] = useState<boolean | null>(cached ? Boolean(cached.ready) : null);
  const [loading, setLoading] = useState(!cached);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | { paths: string[] }>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/media", { cache: "no-store" });
      const json = await res.json();
      setReady(Boolean(json.ready));
      setItems(json.items ?? []);
      if (res.ok) setCached("media", json);
      if (json.error) setNotice({ kind: "error", text: json.error });
    } catch {
      setNotice({ kind: "error", text: "Could not load the media library. Check the connection and press Refresh." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      all: items.length,
      photos: items.filter((i) => !isVideo(i)).length,
      videos: items.filter(isVideo).length,
      unused: items.filter((i) => i.usedBy.length === 0).length,
    }),
    [items]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "photos" && isVideo(i)) return false;
      if (filter === "videos" && !isVideo(i)) return false;
      if (filter === "unused" && i.usedBy.length > 0) return false;
      if (q && !`${friendlyName(i.name)} ${i.name} ${i.usedBy.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filter, query]);

  const deletable = shown.filter((i) => i.usedBy.length === 0);
  const pickedShown = deletable.filter((i) => picked.has(i.path));

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setBusy(true);
    setNotice(null);
    let done = 0;
    const failed: string[] = [];
    for (const [n, file] of list.entries()) {
      setProgress(`Uploading ${n + 1} of ${list.length}: ${file.name}`);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/admin/media", { method: "POST", body: form });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) failed.push(`${file.name}: ${json.error ?? "upload failed"}`);
        else done += 1;
      } catch {
        failed.push(`${file.name}: network problem`);
      }
    }
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
    await load();
    setBusy(false);
    if (failed.length) setNotice({ kind: "error", text: `${done} uploaded. Not uploaded — ${failed.join(" • ")}` });
    else setNotice({ kind: "ok", text: `Uploaded ${done} file${done === 1 ? "" : "s"}.` });
  }

  async function removePaths(paths: string[]) {
    setBusy(true);
    setNotice(null);
    let done = 0;
    const failed: string[] = [];
    for (const path of paths) {
      try {
        const res = await fetch("/api/admin/media", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) failed.push(`${friendlyName(path.replace(/^uploads\//, ""))}: ${json.error ?? "not deleted"}`);
        else done += 1;
      } catch {
        failed.push(`${friendlyName(path.replace(/^uploads\//, ""))}: network problem`);
      }
    }
    setPicked(new Set());
    setConfirm(null);
    await load();
    setBusy(false);
    setNotice(
      failed.length
        ? { kind: "error", text: `${done} deleted. Not deleted — ${failed.join(" • ")}` }
        : { kind: "ok", text: `Deleted ${done} file${done === 1 ? "" : "s"}.` }
    );
  }

  const filterButtons: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "photos", label: "Photos" },
    { key: "videos", label: "Videos" },
    { key: "unused", label: "Not used" },
  ];

  const body = (
    <div className="space-y-4">
      {ready === false && (
        <Notice kind="error">Media storage isn&apos;t available (database not connected). You can still paste https links.</Notice>
      )}

      {canEdit && ready && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ImagePlus className="hidden h-7 w-7 shrink-0 text-forest-700 sm:block" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-1 text-sm text-stone-600">
              <p className="font-semibold text-ink-900">Add photos or short videos</p>
              <p>Photos: JPG, PNG, WebP or AVIF up to 8 MB (wide photos 1600–2400 px look best). Videos: MP4 or WebM up to 20 MB.</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
              className="hidden"
              onChange={(e) => void upload(e.target.files)}
            />
            <Button
              variant="primary"
              label={busy && progress ? "Uploading…" : "Upload files"}
              isLoading={busy && Boolean(progress)}
              isDisabled={busy}
              icon={<Upload className="h-4 w-4" />}
              onClick={() => fileRef.current?.click()}
            />
          </div>
          {progress && <p className="mt-2 text-xs font-medium text-forest-800">{progress}</p>}
        </div>
      )}

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show files">
            {filterButtons.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFilter(f.key);
                  setConfirm(null);
                }}
                aria-pressed={filter === f.key}
                className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  filter === f.key ? "bg-forest-900 text-white" : "border border-stone-200 bg-white text-stone-600 hover:bg-lagoon-100"
                }`}
              >
                {f.label} <span className={filter === f.key ? "text-white/80" : "text-stone-500"}>({counts[f.key]})</span>
              </button>
            ))}
          </div>
          <label className="relative block">
            <span className="sr-only">Search files</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-600" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by file name or where it's used"
              className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pr-3 pl-9 text-sm text-ink-900"
            />
          </label>
          {canEdit && !onPick && deletable.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-cream-100 px-3 py-2 text-sm">
              <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-ink-900">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-forest-900"
                  checked={pickedShown.length === deletable.length}
                  onChange={() =>
                    setPicked(pickedShown.length === deletable.length ? new Set() : new Set(deletable.map((i) => i.path)))
                  }
                />
                Select all unused shown ({deletable.length})
              </label>
              {pickedShown.length > 0 && !confirm && (
                <button
                  type="button"
                  onClick={() => setConfirm({ paths: pickedShown.map((i) => i.path) })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete selected ({pickedShown.length})
                </button>
              )}
            </div>
          )}
          {confirm && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2" role="alert">
              <span className="text-sm font-semibold text-red-800">
                Delete {confirm.paths.length} file{confirm.paths.length === 1 ? "" : "s"} for good? Links to {confirm.paths.length === 1 ? "it" : "them"} will stop working.
              </span>
              <Button size="sm" variant="destructive" label="Yes, delete" isLoading={busy} onClick={() => void removePaths(confirm.paths)} />
              <Button size="sm" variant="ghost" label="Cancel" onClick={() => setConfirm(null)} />
            </div>
          )}
        </div>
      )}

      {loading && items.length === 0 ? (
        <p className="text-sm text-stone-600">Loading files…</p>
      ) : items.length === 0 ? (
        ready ? (
          <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-600">
            No uploads yet. Use Upload files above.
          </p>
        ) : null
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-600">No file matches.</p>
      ) : (
        <ul className={`grid grid-cols-2 gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-3 lg:grid-cols-4"}`}>
          {shown.map((item) => {
            const video = isVideo(item);
            const inUse = item.usedBy.length > 0;
            const selected = picked.has(item.path);
            const display = friendlyName(item.name);
            return (
              <li
                key={item.path}
                className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white ${selected ? "border-forest-700 ring-1 ring-forest-700" : "border-stone-200"}`}
              >
                <div className="relative aspect-[4/3] bg-cream-100">
                  {video ? (
                    <video src={`${item.url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-hidden="true" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of an uploaded file
                    <img src={item.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute top-2 left-2 flex flex-wrap gap-1">
                    <Badge variant={video ? "orange" : "neutral"} label={video ? "Video" : "Photo"} />
                    {inUse && <Badge variant="teal" label="In use" />}
                  </span>
                  {canEdit && !onPick && !inUse && (
                    <label className="absolute top-1.5 right-1.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/90 shadow-sm">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setPicked((cur) => {
                            const next = new Set(cur);
                            if (next.has(item.path)) next.delete(item.path);
                            else next.add(item.path);
                            return next;
                          })
                        }
                        aria-label={`Select ${display}`}
                        className="h-4 w-4 accent-forest-900"
                      />
                    </label>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                  <p className="line-clamp-2 text-xs font-semibold break-all text-ink-900" title={item.name}>
                    {display}
                  </p>
                  <p className="text-[11px] text-stone-600">
                    {[sizeLabel(item.sizeBytes), dateLabel(item)].filter(Boolean).join(" • ")}
                  </p>
                  {inUse && (
                    <p className="text-[11px] leading-snug text-forest-800">
                      <span className="font-semibold">Used by:</span> {item.usedBy.join(", ")}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    {onPick && <Button size="sm" variant="primary" label={pickLabel} onClick={() => onPick(item.url, item)} />}
                    <Button
                      size="sm"
                      label={copied === item.path ? "Copied" : "Copy link"}
                      icon={copied === item.path ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      onClick={async () => {
                        const ok = await copyText(item.url);
                        if (ok) {
                          setCopied(item.path);
                          window.setTimeout(() => setCopied(null), 1500);
                        } else setNotice({ kind: "error", text: `Copy not allowed here — open the file and copy the address: ${item.url}` });
                      }}
                    />
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${display}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-forest-900 hover:bg-lagoon-100"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                    {canEdit && !onPick && !inUse && (
                      <button
                        type="button"
                        onClick={() => setConfirm({ paths: [item.path] })}
                        aria-label={`Delete ${display}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {canEdit && !onPick && inUse && (
                    <p className="text-[10px] text-stone-500">Remove it from those places to delete it.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  if (compact) return body;
  return (
    <Panel
      title="Media library"
      description="Upload photos and short videos once, then use them in trips, offers and the chat guide. Files that are in use are protected from deletion."
    >
      {body}
    </Panel>
  );
}
