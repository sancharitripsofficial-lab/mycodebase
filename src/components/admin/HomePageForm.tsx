"use client";

import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Notice } from "@/components/admin/kit";
import { HomeIcon } from "@/components/home/icons";
import {
  ICON_KEYS,
  THEME_KEYS,
  THEME_LABELS,
  TILE_COLOURS,
  TILE_LABELS,
  type HomeCard,
  type HomeCategory,
  type HomePageContent,
  type IconKey,
  type SectionText,
  type ThemeKey,
  type TileColour,
} from "@/lib/home-content";
import type { Trip } from "@/lib/types";

type SaveFn = (action: string, data: unknown) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;

const ICON_LABELS: Record<IconKey, string> = {
  user: "One person",
  users: "Group of people",
  group: "Friends / team",
  heart: "Heart / care",
  shield: "Shield / safety",
  car: "Car",
  map: "Map",
  mountain: "Mountain",
  coffee: "Coffee",
  waves: "Waves / sea",
  landmark: "Temple / heritage",
  sun: "Sun",
  calendar: "Calendar",
  star: "Star",
  camera: "Camera",
  utensils: "Food",
};

function move<T>(list: T[], i: number, d: number): T[] {
  const next = list.slice();
  const t = i + d;
  if (t < 0 || t >= next.length) return next;
  [next[i], next[t]] = [next[t], next[i]];
  return next;
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-cream-50 p-4">
      <div>
        <h3 className="font-semibold text-ink-900">{title}</h3>
        {hint && <p className="text-xs text-stone-600">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function SectionEditor({ label, value, onChange, canEdit, bodyLabel = "Line under the title (optional)", note }: {
  label: string;
  value: SectionText;
  onChange: (v: SectionText) => void;
  canEdit: boolean;
  bodyLabel?: string;
  /** Set for text that is not a home page section (no show/hide switch, this note instead). */
  note?: string;
}) {
  return (
    <div className="space-y-3">
      {note ? (
        <p className="text-xs text-stone-600">{note}</p>
      ) : (
        <Switch label={`Show “${label}” on the home page`} value={value.show} isDisabled={!canEdit} onChange={(v) => onChange({ ...value, show: v })} />
      )}
      <div className="grid gap-3 md:grid-cols-[0.6fr_1.4fr]">
        <TextInput label="Small heading" value={value.eyebrow} isDisabled={!canEdit} onChange={(v) => onChange({ ...value, eyebrow: v })} />
        <TextInput label="Title" value={value.title} isDisabled={!canEdit} onChange={(v) => onChange({ ...value, title: v })} />
      </div>
      <TextArea label={bodyLabel} rows={2} value={value.body} isDisabled={!canEdit} onChange={(v) => onChange({ ...value, body: v })} />
    </div>
  );
}

function CardsEditor({ cards, onChange, canEdit, max, linkHint }: {
  cards: HomeCard[];
  onChange: (v: HomeCard[]) => void;
  canEdit: boolean;
  max: number;
  linkHint: string;
}) {
  const set = (i: number, patch: Partial<HomeCard>) => onChange(cards.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-3">
      {cards.map((c, i) => (
        <div key={i} className={`tile tile-${c.colour} space-y-3 p-3`}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-bold text-stone-600">
              <span className="tile-num flex h-7 w-7 items-center justify-center rounded-lg bg-white/80">
                <HomeIcon name={c.icon} className="h-4 w-4" />
              </span>
              Card {i + 1}
            </span>
            {canEdit && (
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" label="Move up" isIconOnly icon={<ArrowUp className="h-4 w-4" />} isDisabled={i === 0} onClick={() => onChange(move(cards, i, -1))} />
                <Button size="sm" variant="ghost" label="Move down" isIconOnly icon={<ArrowDown className="h-4 w-4" />} isDisabled={i === cards.length - 1} onClick={() => onChange(move(cards, i, 1))} />
                <Button size="sm" variant="ghost" label="Remove" isIconOnly icon={<Trash2 className="h-4 w-4" />} onClick={() => onChange(cards.filter((_, j) => j !== i))} />
              </span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput label="Title" value={c.title} isDisabled={!canEdit} onChange={(v) => set(i, { title: v })} />
            <TextInput label="Link (optional)" description={linkHint} value={c.href} isDisabled={!canEdit} onChange={(v) => set(i, { href: v.trim() })} />
          </div>
          <TextArea label="Description" rows={2} value={c.body} isDisabled={!canEdit} onChange={(v) => set(i, { body: v })} />
          <div className="grid gap-3 md:grid-cols-2">
            <Selector
              label="Colour"
              value={c.colour}
              onChange={(v) => set(i, { colour: v as TileColour })}
              options={TILE_COLOURS.map((k) => ({ value: k, label: TILE_LABELS[k] }))}
            />
            <Selector
              label="Icon"
              value={c.icon}
              onChange={(v) => set(i, { icon: v as IconKey })}
              options={ICON_KEYS.map((k) => ({ value: k, label: ICON_LABELS[k] }))}
            />
          </div>
        </div>
      ))}
      {canEdit && cards.length < max && (
        <Button
          size="sm"
          label="Add card"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => onChange([...cards, { title: "", body: "", colour: TILE_COLOURS[cards.length % TILE_COLOURS.length], icon: "star", href: "" }])}
        />
      )}
    </div>
  );
}

function CategoriesEditor({ categories, onChange, trips, canEdit }: {
  categories: HomeCategory[];
  onChange: (v: HomeCategory[]) => void;
  trips: Trip[];
  canEdit: boolean;
}) {
  const set = (i: number, patch: Partial<HomeCategory>) => onChange(categories.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const assigned = new Set(categories.flatMap((c) => c.tripSlugs));
  const unassigned = trips.filter((t) => !assigned.has(t.slug));
  return (
    <div className="space-y-3">
      {unassigned.length > 0 && (
        <Notice kind="error">
          Not in any category yet: {unassigned.map((t) => t.title).join(", ")}. They still show on the home page under “More trips”.
        </Notice>
      )}
      {categories.map((c, i) => (
        <div key={i} className={`card-theme theme-${c.theme} space-y-3 p-3 pt-4`}>
          <div className="flex items-center justify-between gap-2">
            <span className="th-text text-sm font-bold">{c.name || `Category ${i + 1}`}</span>
            {canEdit && (
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" label="Move up" isIconOnly icon={<ArrowUp className="h-4 w-4" />} isDisabled={i === 0} onClick={() => onChange(move(categories, i, -1))} />
                <Button size="sm" variant="ghost" label="Move down" isIconOnly icon={<ArrowDown className="h-4 w-4" />} isDisabled={i === categories.length - 1} onClick={() => onChange(move(categories, i, 1))} />
                <Button size="sm" variant="ghost" label="Remove" isIconOnly icon={<Trash2 className="h-4 w-4" />} onClick={() => onChange(categories.filter((_, j) => j !== i))} />
              </span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_1fr]">
            <TextInput label="Name" placeholder="Hills & rainforest" value={c.name} isDisabled={!canEdit} onChange={(v) => set(i, { name: v })} />
            <TextInput
              label="Short name for links"
              description="small letters and dashes, e.g. hills"
              value={c.id}
              isDisabled={!canEdit}
              onChange={(v) => set(i, { id: v.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40) })}
            />
            <Selector
              label="Colour & pattern"
              value={c.theme}
              onChange={(v) => set(i, { theme: v as ThemeKey })}
              options={THEME_KEYS.map((k) => ({ value: k, label: THEME_LABELS[k] }))}
            />
          </div>
          <TextArea label="Description shown on the card" rows={2} value={c.description} isDisabled={!canEdit} onChange={(v) => set(i, { description: v })} />
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold text-stone-600">Trips in this category</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {trips.map((t) => {
                const on = c.tripSlugs.includes(t.slug);
                return (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/80 px-2.5 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!canEdit}
                      onChange={(e) =>
                        set(i, { tripSlugs: e.target.checked ? [...c.tripSlugs, t.slug] : c.tripSlugs.filter((s) => s !== t.slug) })
                      }
                      className="h-4 w-4 accent-forest-900"
                    />
                    <span className="min-w-0 truncate">
                      {t.title}
                      {!t.isPublished && <span className="ml-1 text-xs text-stone-600">(hidden)</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      ))}
      {canEdit && categories.length < 12 && (
        <Button
          size="sm"
          label="Add category"
          icon={<Plus className="h-4 w-4" />}
          onClick={() =>
            onChange([
              ...categories,
              { id: `category-${categories.length + 1}`, name: "", description: "", theme: "brand", tripSlugs: [] },
            ])
          }
        />
      )}
    </div>
  );
}

/**
 * Everything on the home page that isn't live data: words, categories, cards and the comparison
 * table. Saved as one setting; the website shows it on the next page load.
 */
export function HomePageForm({ initial, trips, save, canEdit }: { initial: HomePageContent; trips: Trip[]; save: SaveFn; canEdit: boolean }) {
  const [f, setF] = useState<HomePageContent>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const set = <K extends keyof HomePageContent>(k: K, v: HomePageContent[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="space-y-4">
      <Group title="Top of the page" hint="The big headline and the line under it are in Brand & contact.">
        <div className="grid gap-3 md:grid-cols-2">
          <TextInput label="Kannada line (orange, above the headline)" value={f.kannadaLine} isDisabled={!canEdit} onChange={(v) => set("kannadaLine", v)} />
          <TextInput label="Small label at the top" value={f.heroChip} isDisabled={!canEdit} onChange={(v) => set("heroChip", v)} />
        </div>
      </Group>

      <Group title="Trip categories" hint="Each category gets its own colourful card with a photo, description, trips, starting price, next date and live weather. The Trips page shows them as filter buttons.">
        <SectionEditor label="Categories" value={f.categoriesSection} onChange={(v) => set("categoriesSection", v)} canEdit={canEdit} />
        <CategoriesEditor categories={f.categories} onChange={(v) => set("categories", v)} trips={trips} canEdit={canEdit} />
      </Group>

      <Group title="Who is it for (cards under the categories)">
        <CardsEditor cards={f.travellerCards} onChange={(v) => set("travellerCards", v)} canEdit={canEdit} max={8} linkHint="/trips, /trips?mode=private, /trips?mode=women or #plan" />
      </Group>

      <Group title="Upcoming departures">
        <SectionEditor label="Upcoming departures" value={f.departuresSection} onChange={(v) => set("departuresSection", v)} canEdit={canEdit} />
      </Group>

      <Group title="Comparison table">
        <SectionEditor label="Comparison" value={f.compareSection} onChange={(v) => set("compareSection", { ...f.compareSection, ...v })} canEdit={canEdit} />
        <div className="grid gap-3 md:grid-cols-2">
          <TextInput label="Our column" value={f.compareSection.usLabel} isDisabled={!canEdit} onChange={(v) => set("compareSection", { ...f.compareSection, usLabel: v })} />
          <TextInput label="Other column" value={f.compareSection.themLabel} isDisabled={!canEdit} onChange={(v) => set("compareSection", { ...f.compareSection, themLabel: v })} />
        </div>
        {f.compareRows.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 md:grid-cols-[0.8fr_1.2fr_1fr_auto] md:items-end">
            <TextInput label="Row" value={r.label} isDisabled={!canEdit} onChange={(v) => set("compareRows", f.compareRows.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
            <TextInput label="Us" value={r.us} isDisabled={!canEdit} onChange={(v) => set("compareRows", f.compareRows.map((x, j) => (j === i ? { ...x, us: v } : x)))} />
            <TextInput label="Them" value={r.them} isDisabled={!canEdit} onChange={(v) => set("compareRows", f.compareRows.map((x, j) => (j === i ? { ...x, them: v } : x)))} />
            {canEdit && (
              <Button size="sm" variant="ghost" label="Remove" isIconOnly icon={<Trash2 className="h-4 w-4" />} onClick={() => set("compareRows", f.compareRows.filter((_, j) => j !== i))} />
            )}
          </div>
        ))}
        {canEdit && f.compareRows.length < 10 && (
          <Button size="sm" label="Add row" icon={<Plus className="h-4 w-4" />} onClick={() => set("compareRows", [...f.compareRows, { label: "", us: "", them: "" }])} />
        )}
      </Group>

      <Group title="How it works">
        <SectionEditor label="How it works" value={f.howSection} onChange={(v) => set("howSection", v)} canEdit={canEdit} />
        <CardsEditor cards={f.howCards} onChange={(v) => set("howCards", v)} canEdit={canEdit} max={8} linkHint="Optional: /safety, /policies, /trips…" />
      </Group>

      <Group title="Other sections">
        <SectionEditor label="Trip cards" value={f.routesSection} onChange={(v) => set("routesSection", v)} canEdit={canEdit} />
        <SectionEditor label="Safety" value={f.safetySection} onChange={(v) => set("safetySection", v)} canEdit={canEdit} bodyLabel="Paragraph" />
        <SectionEditor label="Reviews" value={f.reviewsSection} onChange={(v) => set("reviewsSection", v)} canEdit={canEdit} />
        <SectionEditor label="Plan my trip" value={f.planSection} onChange={(v) => set("planSection", v)} canEdit={canEdit} bodyLabel="Paragraph" />
        <SectionEditor
          label="FAQs page"
          value={f.faqSection}
          onChange={(v) => set("faqSection", v)}
          canEdit={canEdit}
          note="Top of the FAQs page (menu → FAQs, below Policies). The questions and answers themselves are in Website text → FAQs."
        />
      </Group>

      {canEdit && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-white/95 py-3">
          <Button
            variant="primary"
            label="Save home page"
            isLoading={busy}
            onClick={async () => {
              setBusy(true);
              const r = await save("settings.save", { key: "home_page", value: f });
              setBusy(false);
              setNotice(r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });
            }}
          />
          {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        </div>
      )}
    </div>
  );
}
