"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Check, Copy, Film, ImagePlus, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Notice, Panel } from "@/components/admin/kit";

interface MediaItem {
  path: string;
  url: string;
  name: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string | null;
  usedBy: string[];
}

/**
 * Upload photos / short videos and copy their links. With `onPick`, it works as a picker
 * inside the trip editor (click a file to use it).
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
  const [items, setItems] = useState<MediaItem[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/media", { cache: "no-store" });
    const json = await res.json();
    setReady(Boolean(json.ready));
    setItems(json.items ?? []);
    if (json.error) setNotice({ kind: "error", text: json.error });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setNotice(null);
    let done = 0;
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/media", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ kind: "error", text: `${file.name}: ${json.error}` });
        break;
      }
      done += 1;
    }
    if (done > 0) setNotice({ kind: "ok", text: `Uploaded ${done} file${done === 1 ? "" : "s"}.` });
    if (fileRef.current) fileRef.current.value = "";
    await load();
    setBusy(false);
  }

  async function remove(item: MediaItem) {
    if (!window.confirm(`Delete ${item.name}? This cannot be undone.`)) return;
    const res = await fetch("/api/admin/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: item.path }),
    });
    const json = await res.json();
    setNotice(res.ok ? { kind: "ok", text: "Deleted." } : { kind: "error", text: json.error });
    await load();
  }

  const body = (
    <div className="space-y-4">
      {ready === false && (
        <Notice kind="error">Media storage isn&apos;t available (database not connected). You can still paste https links.</Notice>
      )}
      {canEdit && ready && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white/70 p-4">
          <ImagePlus className="h-6 w-6 text-forest-700" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm text-stone-600">
            Photos (JPG, PNG, WebP up to 8 MB) or short videos (MP4/WebM up to 20 MB). Wide photos 1600–2400 px look best.
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
            label={busy ? "Uploading…" : "Upload files"}
            isLoading={busy}
            icon={<Upload className="h-4 w-4" />}
            onClick={() => fileRef.current?.click()}
          />
        </div>
      )}
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      {items.length === 0 ? (
        <p className="text-sm text-stone-600">{ready ? "No uploads yet." : ""}</p>
      ) : (
        <ul className={`grid gap-3 ${compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
          {items.map((item) => {
            const isVideo = item.contentType.startsWith("video/") || /\.(mp4|webm)$/i.test(item.name);
            return (
              <li key={item.path} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <div className="relative aspect-[4/3] bg-cream-100">
                  {isVideo ? (
                    <div className="flex h-full items-center justify-center text-forest-700">
                      <Film className="h-8 w-8" aria-hidden="true" />
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of uploaded file
                    <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                  {item.usedBy.length > 0 && (
                    <span className="absolute top-2 left-2">
                      <Badge variant="teal" label={`In use (${item.usedBy.length})`} />
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-2.5">
                  <p className="truncate text-xs font-medium text-ink-900" title={item.name}>
                    {item.name}
                  </p>
                  <p className="text-[11px] text-stone-600">{(item.sizeBytes / 1048576).toFixed(1)} MB</p>
                  <div className="flex flex-wrap gap-1.5">
                    {onPick && (
                      <Button size="sm" variant="primary" label={pickLabel} onClick={() => onPick(item.url, item)} />
                    )}
                    <Button
                      size="sm"
                      label={copied === item.path ? "Copied" : "Copy link"}
                      icon={copied === item.path ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      onClick={() => {
                        void navigator.clipboard.writeText(item.url);
                        setCopied(item.path);
                        window.setTimeout(() => setCopied(null), 1500);
                      }}
                    />
                    {canEdit && !onPick && (
                      <Button
                        size="sm"
                        variant="ghost"
                        label="Delete"
                        isIconOnly
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        tooltip={item.usedBy.length ? `Used by ${item.usedBy.join(", ")}` : "Delete"}
                        isDisabled={item.usedBy.length > 0}
                        onClick={() => void remove(item)}
                      />
                    )}
                  </div>
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
      description="Upload trip photos and short videos here, then use them in a trip (main photo, gallery or videos). Files used by a trip can't be deleted."
    >
      {body}
    </Panel>
  );
}
