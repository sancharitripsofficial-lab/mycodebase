"use client";

import { Button } from "@astryxdesign/core/Button";
import { ExternalLink, Film, ImageIcon, Images, RotateCcw, Sparkles, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { MediaLibrary } from "@/components/admin/MediaLibrary";
import { Notice, Panel, useAdminContent } from "@/components/admin/kit";
import { uploadMedia } from "@/lib/admin/upload-media";
import {
  BANNER_PAGE_INFO,
  BANNER_PAGES,
  BUILT_IN_MEDIA,
  builtInBannerStill,
  readyBannerPicture,
  isVideoLink,
  mergeSiteMedia,
  type BannerMedia,
  type BannerPage,
  type SiteMedia,
} from "@/lib/site-media";

type Editor = ReturnType<typeof useAdminContent>;
type NoticeState = { kind: "ok" | "error"; text: string } | null;

const PICTURE_TYPES = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif";
const VIDEO_TYPES = "video/mp4,video/webm";

/** One replaceable picture or video: preview, Upload / Pick from Media library / Use built-in. */
function MediaSlot({
  label,
  hint,
  kind,
  value,
  builtIn,
  emptyNote,
  canEdit,
  onChange,
  onNotice,
  preset,
}: {
  label: string;
  hint?: string;
  kind: "video" | "image";
  value: string;
  /** What the website shows when nothing is set ("" = nothing extra). */
  builtIn: string;
  emptyNote: string;
  canEdit: boolean;
  onChange: (url: string) => void;
  onNotice: (n: NoticeState) => void;
  /** A ready-made file the owner can pick with one tap. */
  preset?: { label: string; url: string };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const shown = value || builtIn;
  const shownIsVideo = shown ? isVideoLink(shown) : kind === "video";

  async function onFile(file: File) {
    const isVid = file.type.startsWith("video/");
    if (kind === "video" && !isVid) return onNotice({ kind: "error", text: `${label}: choose a video (.mp4 or .webm). iPhone .MOV videos need to be saved as MP4 first.` });
    if (kind === "image" && isVid) return onNotice({ kind: "error", text: `${label}: choose a picture (JPG, PNG or WebP), not a video.` });
    setProgress(0);
    onNotice(null);
    try {
      const { url } = await uploadMedia(file, setProgress);
      onChange(url);
      onNotice({ kind: "ok", text: `${label}: uploaded. Press “Save pictures & videos” to put it on the website.` });
    } catch (err) {
      onNotice({ kind: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-forest-900">
            {kind === "video" ? <Film className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {label}
          </p>
          {hint && <p className="mt-0.5 text-xs leading-snug text-stone-600">{hint}</p>}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${value ? "bg-lagoon-100 text-forest-900" : "bg-stone-100 text-stone-600"}`}
        >
          {value ? "Your file" : "Built-in"}
        </span>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-[#e8f1ee]">
        {shown ? (
          shownIsVideo ? (
            <video src={shown} muted loop playsInline controls preload="metadata" className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          )
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-xs text-stone-600">{emptyNote}</div>
        )}
      </div>
      {progress !== null && (
        <div className="space-y-1" aria-live="polite">
          <p className="text-xs font-semibold text-forest-900">Uploading… {progress}%</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-forest-800 transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {canEdit && (
        <div className="mt-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            label={value ? "Replace" : "Upload"}
            icon={<Upload className="h-4 w-4" />}
            isDisabled={progress !== null}
            onClick={() => fileRef.current?.click()}
          />
          <Button size="sm" label={picking ? "Close library" : "Media library"} icon={<Images className="h-4 w-4" />} onClick={() => setPicking((p) => !p)} />
          {preset && value !== preset.url && (
            <Button
              size="sm"
              label={preset.label}
              icon={<Sparkles className="h-4 w-4" />}
              onClick={() => {
                onChange(preset.url);
                onNotice({ kind: "ok", text: `${label}: ready-made picture chosen. Press “Save pictures & videos” to put it on the website.` });
              }}
            />
          )}
          {value && <Button size="sm" variant="ghost" label="Use built-in" icon={<RotateCcw className="h-4 w-4" />} onClick={() => onChange("")} />}
          <input
            ref={fileRef}
            type="file"
            accept={kind === "video" ? VIDEO_TYPES : PICTURE_TYPES}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onFile(f);
            }}
          />
        </div>
      )}
      {picking && (
        <div className="rounded-xl border border-stone-200 p-2">
          <MediaLibrary
            canEdit={canEdit}
            compact
            pickLabel={kind === "video" ? "Use this video" : "Use this picture"}
            onPick={(url) => {
              if ((kind === "video") !== isVideoLink(url)) {
                onNotice({ kind: "error", text: kind === "video" ? `${label}: pick a video.` : `${label}: pick a picture, not a video.` });
                return;
              }
              onChange(url);
              setPicking(false);
              onNotice({ kind: "ok", text: `${label}: chosen. Press “Save pictures & videos” to put it on the website.` });
            }}
          />
        </div>
      )}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-[#f7fbf9] p-4">
      <div>
        <h3 className="font-display text-lg font-semibold text-forest-900">{title}</h3>
        <p className="text-sm leading-relaxed text-stone-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** Admin → Site pictures & videos: home background video, page banners and section photos. */
export function SiteMediaManager({ editor, canEdit }: { editor: Editor; canEdit: boolean }) {
  const content = editor.content;
  const [media, setMedia] = useState<SiteMedia | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  if (!content) return <p className="text-sm text-stone-600">Loading…</p>;
  const m = media ?? mergeSiteMedia((content.settings as { siteMedia?: unknown }).siteMedia);

  const set = (patch: Partial<SiteMedia>) => {
    setMedia({ ...m, ...patch });
    setDirty(true);
  };
  const setBanner = (page: BannerPage, patch: Partial<BannerMedia>) => set({ banners: { ...m.banners, [page]: { ...m.banners[page], ...patch } } });

  async function save() {
    setBusy(true);
    setNotice(null);
    const r = await editor.save("settings.save", { key: "site_media", value: m });
    setBusy(false);
    if (r.ok) {
      setDirty(false);
      setNotice({ kind: "ok", text: "Saved. The website shows the new pictures and videos within a minute." });
    } else {
      setNotice({ kind: "error", text: r.error });
    }
  }

  const slot = { canEdit, onNotice: setNotice };

  return (
    <Panel
      title="Site pictures & videos"
      description="Replace the home page background video, the picture at the top of each page and the section photos with your own. Uploads go to the Media library; big phone photos are resized automatically. “Use built-in” brings back the original. Nothing changes on the website until you press Save."
    >
      <div className="space-y-5">
        <Section
          title="Home page background"
          description="The film behind “Leave as strangers. Return as a story.” Best: a short silent loop of 10–20 seconds, under 20 MB, MP4. Computers: landscape (1920×1080). Phones: portrait (1080×1920). Add a still picture from the same video: it shows while the video loads and on slow phones."
        >
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Home background type">
            {(["video", "photo"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={m.heroMode === mode}
                disabled={!canEdit}
                onClick={() => set({ heroMode: mode })}
                className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition disabled:opacity-50 ${
                  m.heroMode === mode ? "border-forest-800 bg-forest-800 text-white" : "border-stone-300 bg-white text-forest-900 hover:bg-lagoon-100"
                }`}
              >
                {mode === "video" ? "Play a video" : "Show a still picture only"}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {m.heroMode === "video" && (
              <>
                <MediaSlot
                  {...slot}
                  label="Video for computers"
                  hint="Landscape. Also plays on phones when no phone video is set."
                  kind="video"
                  value={m.heroVideo}
                  builtIn={BUILT_IN_MEDIA.heroVideo}
                  emptyNote=""
                  onChange={(v) => set({ heroVideo: v })}
                />
                <MediaSlot
                  {...slot}
                  label="Video for phones (optional)"
                  hint="Portrait. Leave empty to use the computer video."
                  kind="video"
                  value={m.heroMobileVideo}
                  builtIn={m.heroVideo ? "" : BUILT_IN_MEDIA.heroMobileVideo}
                  emptyNote="Phones play the computer video."
                  onChange={(v) => set({ heroMobileVideo: v })}
                />
              </>
            )}
            <MediaSlot
              {...slot}
              label={m.heroMode === "video" ? "Still picture for computers" : "Picture"}
              hint={m.heroMode === "video" ? "Shown while the video loads." : "Shown with a slow zoom. Empty = the built-in destination photos."}
              kind="image"
              value={m.heroPoster}
              builtIn={BUILT_IN_MEDIA.heroPoster}
              emptyNote=""
              onChange={(v) => set({ heroPoster: v })}
            />
            {m.heroMode === "video" && (
              <MediaSlot
                {...slot}
                label="Still picture for phones (optional)"
                hint="Portrait. Leave empty to use the computer picture."
                kind="image"
                value={m.heroMobilePoster}
                builtIn={m.heroPoster ? "" : BUILT_IN_MEDIA.heroMobilePoster}
                emptyNote="Phones use the computer picture."
                onChange={(v) => set({ heroMobilePoster: v })}
              />
            )}
          </div>
        </Section>

        <Section
          title="Page banners"
          description="The picture at the top of each page, behind the page title. Built-in = the moving 3D scene of the place (it stays unless you choose a picture). Your picture replaces it on that page only; “Sanchari picture” is a ready-made one. Add a short silent video to play over the picture. Keep the main subject on the right: the title sits on the left."
        >
          <div className="space-y-4">
            {BANNER_PAGES.map((page) => {
              const info = BANNER_PAGE_INFO[page];
              const b = m.banners[page];
              return (
                <div key={page} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-forest-900">{info.label}</p>
                    <a
                      href={info.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-copper-700 hover:underline"
                    >
                      Open page <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <MediaSlot
                      {...slot}
                      label="Picture"
                      hint="Wide, at least 1920 px."
                      kind="image"
                      value={b.image}
                      builtIn={builtInBannerStill(page)}
                      emptyNote=""
                      onChange={(v) => setBanner(page, { image: v })}
                      preset={{ label: "Sanchari picture", url: readyBannerPicture(page) }}
                    />
                    <MediaSlot
                      {...slot}
                      label="Phone picture (optional)"
                      hint="Tall. Empty = the wide picture."
                      kind="image"
                      value={b.mobileImage}
                      builtIn=""
                      emptyNote={b.image ? "Phones use the wide picture." : "Phones show the 3D scene."}
                      onChange={(v) => setBanner(page, { mobileImage: v })}
                    />
                    <MediaSlot
                      {...slot}
                      label="Video (optional)"
                      hint="Silent loop over the picture."
                      kind="video"
                      value={b.video}
                      builtIn=""
                      emptyNote="No video."
                      onChange={(v) => setBanner(page, { video: v })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Section photos" description="Photos inside the pages.">
          <div className="grid gap-3 md:grid-cols-2">
            <MediaSlot
              {...slot}
              label="Home page: Safety, respect & privacy"
              hint="Landscape (3:2)."
              kind="image"
              value={m.safetyPhoto}
              builtIn={BUILT_IN_MEDIA.safetyPhoto}
              emptyNote=""
              onChange={(v) => set({ safetyPhoto: v })}
            />
            <MediaSlot
              {...slot}
              label="About page photo"
              hint="Landscape (3:2)."
              kind="image"
              value={m.aboutPhoto}
              builtIn={BUILT_IN_MEDIA.aboutPhoto}
              emptyNote=""
              onChange={(v) => set({ aboutPhoto: v })}
            />
          </div>
        </Section>
      </div>

      {canEdit && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-white/95 py-3">
          <Button variant="primary" label={dirty ? "Save pictures & videos" : "Saved"} isDisabled={!dirty} isLoading={busy} onClick={() => void save()} />
          {dirty && <span className="text-xs font-semibold text-copper-700">Not saved yet</span>}
          {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        </div>
      )}
      {!canEdit && notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
    </Panel>
  );
}
