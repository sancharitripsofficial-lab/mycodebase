"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Stamp,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { BlogBody } from "@/components/blog/BlogBody";
import { uploadMedia } from "@/lib/admin/upload-media";

type Props = {
  value: string;
  onChange: (next: string) => void;
  canEdit: boolean;
  maxLength: number;
  onNotice: (n: { kind: "ok" | "error"; text: string } | null) => void;
};

/**
 * The blog story box with formatting buttons (headings, paragraphs, points, quotes, alignment,
 * photos and logos inside the story) and a live preview of how the website will show it.
 */
export function BlogStoryEditor({ value, onChange, canEdit, maxLength, onNotice }: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pendingImage, setPendingImage] = useState<"photo" | "logo" | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  /** Replace the selection (or insert at the cursor) and keep the cursor sensible. */
  function apply(fn: (before: string, selected: string, after: string) => { text: string; selectFrom: number; selectTo: number }) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { text, selectFrom, selectTo } = fn(value.slice(0, start), value.slice(start, end), value.slice(end));
    onChange(text.slice(0, maxLength));
    requestAnimationFrame(() => {
      if (!ref.current) return;
      ref.current.focus();
      ref.current.setSelectionRange(selectFrom, selectTo);
    });
  }

  const wrap = (mark: string, placeholder: string) =>
    apply((b, s, a) => {
      const inner = s || placeholder;
      return { text: `${b}${mark}${inner}${mark}${a}`, selectFrom: b.length + mark.length, selectTo: b.length + mark.length + inner.length };
    });

  /** Put a mark at the start of every selected line ("## ", "- ", "1. ", "> "). */
  const prefixLines = (kind: "h2" | "h3" | "ul" | "ol" | "quote") =>
    apply((b, s, a) => {
      const lineStart = b.lastIndexOf("\n") + 1;
      const head = b.slice(0, lineStart);
      const firstPart = b.slice(lineStart);
      const nl = a.indexOf("\n");
      const lastPart = nl === -1 ? a : a.slice(0, nl);
      const tail = nl === -1 ? "" : a.slice(nl);
      const lines = `${firstPart}${s}${lastPart}`.split("\n");
      const strip = (l: string) => l.replace(/^(#{1,3}\s+|[-*•]\s+|\d{1,3}[.)]\s+|>\s?)/, "");
      const marked = lines
        .map((l, i) => {
          const text = strip(l) || (kind === "h2" ? "Heading" : kind === "h3" ? "Small heading" : kind === "quote" ? "Quote" : "Point");
          if (kind === "h2") return `## ${text}`;
          if (kind === "h3") return `### ${text}`;
          if (kind === "ul") return `- ${text}`;
          if (kind === "ol") return `${i + 1}. ${text}`;
          return `> ${text}`;
        })
        .join("\n");
      const text = `${head}${marked}${tail}`;
      return { text, selectFrom: head.length, selectTo: head.length + marked.length };
    });

  /** Wrap the selected lines in :::center / :::right (Left removes the wrap). */
  const align = (dir: "left" | "center" | "right") =>
    apply((b, s, a) => {
      const lineStart = b.lastIndexOf("\n") + 1;
      const head = b.slice(0, lineStart);
      const nl = a.indexOf("\n");
      const block = `${b.slice(lineStart)}${s}${nl === -1 ? a : a.slice(0, nl)}`;
      let tail = nl === -1 ? "" : a.slice(nl);
      let before = head;
      // Already wrapped? Remove the old wrap first.
      const openMatch = /(^|\n):::\s*(left|center|centre|right)\s*\n$/i.exec(before);
      if (openMatch && /^\n:::\s*(\n|$)/.test(tail)) {
        before = before.slice(0, openMatch.index + openMatch[1].length);
        tail = tail.replace(/^\n:::\s*/, "");
      }
      if (dir === "left") return { text: `${before}${block}${tail}`, selectFrom: before.length, selectTo: before.length + block.length };
      const opened = `:::${dir}\n`;
      const text = `${before}${opened}${block}\n:::${tail}`;
      return { text, selectFrom: before.length + opened.length, selectTo: before.length + opened.length + block.length };
    });

  const insertBlock = (snippet: string) =>
    apply((b, s, a) => {
      const pre = b && !b.endsWith("\n\n") ? (b.endsWith("\n") ? "\n" : "\n\n") : "";
      const post = a && !a.startsWith("\n") ? "\n\n" : "";
      const text = `${b}${pre}${snippet}${post}${s}${a}`;
      const at = b.length + pre.length + snippet.length;
      return { text, selectFrom: at, selectTo: at };
    });

  const addLink = () =>
    apply((b, s, a) => {
      const label = s || "link text";
      const snippet = `[${label}](https://)`;
      const urlAt = b.length + label.length + 3;
      return { text: `${b}${snippet}${a}`, selectFrom: urlAt, selectTo: urlAt + 8 };
    });

  async function onPicked(file: File) {
    const kind = pendingImage ?? "photo";
    setPendingImage(null);
    onNotice(null);
    setUploading(0);
    try {
      const { url } = await uploadMedia(file, setUploading);
      const name = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 60);
      insertBlock(kind === "logo" ? `![Logo: ${name || "logo"}](${url})` : `![${name || "Photo"}](${url})`);
      onNotice({ kind: "ok", text: kind === "logo" ? "Logo added to the story (shown small and centred)." : "Photo added to the story. Change the words in [ ] to set its caption." });
    } catch (err) {
      onNotice({ kind: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploading(null);
    }
  }

  const Btn = ({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={!canEdit || uploading !== null}
      onMouseDown={(e) => e.preventDefault() /* keep the text selection */}
      onClick={onClick}
      className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-forest-900 transition hover:bg-lagoon-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
  const Sep = () => <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-stone-200" />;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">Story</p>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="min-h-9 rounded-full border border-stone-300 px-3 text-xs font-semibold text-forest-900 hover:bg-lagoon-100"
        >
          {showPreview ? "Hide preview" : "Show preview"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-300 bg-white focus-within:border-forest-800">
        <div role="toolbar" aria-label="Story formatting" className="flex flex-wrap items-center gap-0.5 border-b border-stone-200 bg-[#f7fbf9] p-1.5">
          <Btn label="Heading" onClick={() => prefixLines("h2")}><Heading2 className="h-5 w-5" /></Btn>
          <Btn label="Small heading" onClick={() => prefixLines("h3")}><Heading3 className="h-5 w-5" /></Btn>
          <Btn label="New paragraph" onClick={() => insertBlock("")}><Pilcrow className="h-5 w-5" /></Btn>
          <Sep />
          <Btn label="Bold" onClick={() => wrap("**", "bold text")}><Bold className="h-5 w-5" /></Btn>
          <Btn label="Italic" onClick={() => wrap("*", "italic text")}><Italic className="h-5 w-5" /></Btn>
          <Btn label="Link" onClick={addLink}><Link2 className="h-5 w-5" /></Btn>
          <Sep />
          <Btn label="Bullet points" onClick={() => prefixLines("ul")}><List className="h-5 w-5" /></Btn>
          <Btn label="Numbered points" onClick={() => prefixLines("ol")}><ListOrdered className="h-5 w-5" /></Btn>
          <Btn label="Quote" onClick={() => prefixLines("quote")}><Quote className="h-5 w-5" /></Btn>
          <Btn label="Divider line" onClick={() => insertBlock("---")}><Minus className="h-5 w-5" /></Btn>
          <Sep />
          <Btn label="Align left" onClick={() => align("left")}><AlignLeft className="h-5 w-5" /></Btn>
          <Btn label="Align centre" onClick={() => align("center")}><AlignCenter className="h-5 w-5" /></Btn>
          <Btn label="Align right" onClick={() => align("right")}><AlignRight className="h-5 w-5" /></Btn>
          <Sep />
          <Btn label="Add a photo" onClick={() => { setPendingImage("photo"); fileRef.current?.click(); }}>
            <ImagePlus className="h-5 w-5" />
          </Btn>
          <Btn label="Add a logo" onClick={() => { setPendingImage("logo"); fileRef.current?.click(); }}>
            <Stamp className="h-5 w-5" />
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onPicked(f);
            }}
          />
        </div>
        <textarea
          ref={ref}
          value={value}
          rows={12}
          disabled={!canEdit}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"Write the story here. Use the buttons above for headings, points, photos and alignment.\n\nLeave an empty line between paragraphs."}
          className="block w-full resize-y border-0 bg-white px-3.5 py-3 font-mono text-[0.92rem] leading-relaxed text-ink-900 outline-none"
        />
      </div>
      <p className="flex flex-wrap justify-between gap-2 text-[11px] text-stone-600">
        <span>Select text, then press a button. An empty line starts a new paragraph.</span>
        <span>
          {value.length.toLocaleString("en-IN")} / {maxLength.toLocaleString("en-IN")}
        </span>
      </p>
      {uploading !== null && (
        <div className="space-y-1" aria-live="polite">
          <p className="text-xs font-semibold text-forest-900">Uploading… {uploading}%</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-forest-800 transition-[width] duration-300" style={{ width: `${uploading}%` }} />
          </div>
        </div>
      )}

      {showPreview && value.trim() && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-[#fbfdfc] p-4">
          <p className="mb-3 text-[11px] font-bold tracking-wider text-stone-600 uppercase">Preview: how the website shows it</p>
          <BlogBody text={value} />
        </div>
      )}
    </div>
  );
}
