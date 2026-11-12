"use client";

import { NumberInput } from "@astryxdesign/core/NumberInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { useCallback, useEffect, useState } from "react";
import type { AdminContentSnapshot } from "@/lib/data/admin-content";

/** White card with a title, used for every admin section. */
export function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card-soft space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-forest-900">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-sm text-stone-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Rupees in the form, paise on the wire (₹11,500 ↔ 1150000). */
export function MoneyField({
  label,
  description,
  paise,
  onChange,
  isOptional,
  isDisabled,
}: {
  label: string;
  description?: string;
  paise: number | null;
  onChange: (paise: number | null) => void;
  isOptional?: boolean;
  isDisabled?: boolean;
}) {
  return (
    <NumberInput
      label={label}
      description={description}
      value={paise === null ? null : paise / 100}
      onChange={(rupees) => onChange(Number.isFinite(rupees) ? Math.round(rupees * 100) : null)}
      isOptional={isOptional}
      isDisabled={isDisabled}
      placeholder={isOptional ? "Leave empty if not used" : undefined}
    />
  );
}

/** A list edited as "one item per line". */
export function LinesField({
  label,
  description,
  items,
  onChange,
  rows = 4,
  isDisabled,
}: {
  label: string;
  description?: string;
  items: string[];
  onChange: (items: string[]) => void;
  rows?: number;
  isDisabled?: boolean;
}) {
  const [text, setText] = useState(items.join("\n"));
  useEffect(() => setText(items.join("\n")), [items]);
  return (
    <TextArea
      label={label}
      description={description ?? "One item per line."}
      value={text}
      rows={rows}
      isDisabled={isDisabled}
      onChange={(v) => {
        setText(v);
        onChange(
          v
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
        );
      }}
    />
  );
}

/** Local date-time input (owner's own clock, IST) ↔ ISO string. */
export function DateTimeField({
  label,
  description,
  value,
  onChange,
  isDisabled,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (iso: string) => void;
  isDisabled?: boolean;
}) {
  const local = value ? toLocalInput(value) : "";
  return (
    <label className="block text-sm">
      <span className="font-semibold text-ink-900">{label}</span>
      {description && <span className="mt-0.5 block text-xs text-stone-600">{description}</span>}
      <input
        type="datetime-local"
        value={local}
        disabled={isDisabled}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : "")}
        className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink-900 focus:border-forest-800"
      />
    </label>
  );
}

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Notice({ kind, children }: { kind: "ok" | "error"; children: React.ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-xl px-3 py-2 text-sm ${
        kind === "error" ? "bg-[#fdecec] text-[#9b1c1c]" : "bg-lagoon-100 text-forest-900"
      }`}
    >
      {children}
    </p>
  );
}

/** Loads /api/admin/content and exposes `save(action, data)` that refreshes on success. */
export function useAdminContent() {
  const [content, setContent] = useState<(AdminContentSnapshot & { actorRole: string }) | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/content", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setLoadError(json.error || "Could not load content.");
      return;
    }
    setLoadError(null);
    setContent(json);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (action: string, data: unknown): Promise<{ ok: true; message: string; id?: string } | { ok: false; error: string }> => {
      try {
        const res = await fetch("/api/admin/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, data }),
        });
        const json = await res.json();
        if (!res.ok) return { ok: false, error: json.error || "Could not save." };
        await reload();
        return { ok: true, message: json.message, id: json.id };
      } catch {
        return { ok: false, error: "Network problem — nothing was saved." };
      }
    },
    [reload]
  );

  return { content, loadError, reload, save };
}

export function rupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: paise % 100 ? 2 : 0 }).format(
    paise / 100
  );
}
