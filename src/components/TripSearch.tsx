"use client";

import { ArrowLeft, Car, MapPin, Route, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { requestPlanFor } from "@/lib/places/plan-prefill";
import {
  categoryOrderByRank,
  groupByCategory,
  highlightParts,
  normalize,
  placeTripMatches,
  searchPlaces,
  tripMatchesQuery,
  unambiguousPlaceHit,
  type PlaceHit,
} from "@/lib/places/search";
import type { KarnatakaDistrict, KarnatakaPlace, PlaceCategory } from "@/lib/places/types";
import type { TripWithDetails } from "@/lib/types";

/**
 * Smart search for the trips page: one box that suggests trips and Karnataka places while you
 * type (typos and old names like "Coorg" or "Chikmagalur" work), grouped by category, with a
 * "Trip available" badge where a published trip goes. WAI-ARIA combobox + listbox.
 *
 * The place list (~250 places) is a separate chunk, loaded on the first focus or keystroke, so
 * the trips page's first load does not grow.
 */

interface PlaceData {
  places: readonly KarnatakaPlace[];
  districts: readonly KarnatakaDistrict[];
  labels: Record<PlaceCategory, string>;
  order: readonly PlaceCategory[];
}

let placeDataPromise: Promise<PlaceData> | null = null;
let placeDataLoaded: PlaceData | null = null;

function loadPlaceData(): Promise<PlaceData> {
  if (!placeDataPromise) {
    placeDataPromise = import("@/lib/places/karnataka-places")
      .then((m) => {
        placeDataLoaded = {
          places: m.KARNATAKA_PLACES,
          districts: m.KARNATAKA_DISTRICTS,
          labels: m.CATEGORY_LABELS,
          order: m.CATEGORY_ORDER,
        };
        return placeDataLoaded;
      })
      .catch((err: unknown) => {
        placeDataPromise = null; // try again on the next focus
        throw err;
      });
  }
  return placeDataPromise;
}

/** What the trip grid should show. */
export type TripSearchFilter =
  | { kind: "none" }
  | { kind: "text"; text: string; tripIds: string[] }
  | { kind: "place"; place: KarnatakaPlace; tripIds: string[] };

type Option =
  | { kind: "category"; key: string; category: PlaceCategory; label: string }
  | { kind: "place"; key: string; place: KarnatakaPlace; hit: PlaceHit | null }
  | { kind: "trip"; key: string; item: TripWithDetails }
  | { kind: "back"; key: string };

/** How an option was chosen: Enter, a mouse (or screen reader) click, or a finger. */
type ChooseHow = "key" | "pointer" | "touch";

interface Section {
  key: string;
  /** Small overline above the section ("Places"). */
  kicker?: string;
  heading?: string;
  layout: "chips" | "rows";
  options: Option[];
}

const MAX_TRIPS = 4;
const MAX_PLACES = 24;
const POPULAR_COUNT = 6;
/** Popup height limits (px): 28rem at most, never so short it is useless. */
const POPUP_MAX = 448;
const POPUP_MIN = 160;

export function TripSearch({
  trips,
  onFilterChange,
  className = "",
  autoFocus = false,
}: {
  trips: TripWithDetails[];
  onFilterChange: (filter: TripSearchFilter) => void;
  className?: string;
  /** Focus the box when it mounts (after "Clear place" etc., so keyboard users stay here). */
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  /** Pointer type of the last press on an option ("" for a click with no press: screen readers, keyboards). */
  const pointerTypeRef = useRef("");

  const [text, setText] = useState("");
  const [query, setQuery] = useState(""); // `text` after the 80 ms pause
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [browse, setBrowse] = useState<PlaceCategory | null>(null);
  /** What a screen reader hears after a category chip or "All categories" swaps the list. */
  const [browseMessage, setBrowseMessage] = useState("");
  const [selected, setSelected] = useState<KarnatakaPlace | null>(null);
  const [data, setData] = useState<PlaceData | null>(() => placeDataLoaded);
  const [loadFailed, setLoadFailed] = useState(false);
  /** Popup height that fits above the on-screen keyboard (null: the CSS limit). */
  const [popupMaxH, setPopupMaxH] = useState<number | null>(null);

  const published = useMemo(() => trips.filter((t) => t.trip.isPublished), [trips]);

  /** Load the place list. After a failure only `retry` (a new focus) tries again. */
  const ensureData = useCallback(
    (retry: boolean) => {
      if (data) return;
      if (loadFailed && !retry) return;
      setLoadFailed(false);
      loadPlaceData().then(
        (d) => {
          setData(d);
          setLoadFailed(false);
        },
        () => setLoadFailed(true),
      );
    },
    [data, loadFailed],
  );

  // Debounce typing.
  useEffect(() => {
    if (!text.trim()) return;
    const id = window.setTimeout(() => setQuery(text), 80);
    return () => window.clearTimeout(id);
  }, [text]);

  /** Published trips that go to a place (worked out once per place). */
  const tripsForPlace = useMemo(() => {
    const cache = new Map<string, TripWithDetails[]>();
    return (p: KarnatakaPlace): TripWithDetails[] => {
      let v = cache.get(p.id);
      if (!v) {
        v = data ? placeTripMatches(p, published, data.districts, data.places) : [];
        cache.set(p.id, v);
      }
      return v;
    };
  }, [data, published]);

  const q = query.trim();
  const hits = useMemo(() => (data && q ? searchPlaces(q, data.places, data.districts, MAX_PLACES) : []), [data, q]);

  /** Trips for the typed text: their own words (itinerary too) or the place the text clearly means. */
  const textTrips = useMemo(() => {
    if (!q) return [];
    const top = unambiguousPlaceHit(hits);
    const viaPlace = new Set((top ? tripsForPlace(top.place) : []).map((t) => t.trip.id));
    return published.filter((t) => viaPlace.has(t.trip.id) || tripMatchesQuery(t, q));
  }, [q, hits, published, tripsForPlace]);

  // Tell the page what to show in the grid.
  const onFilterRef = useRef(onFilterChange);
  useEffect(() => {
    onFilterRef.current = onFilterChange;
  });
  useEffect(() => {
    if (selected) {
      onFilterRef.current({ kind: "place", place: selected, tripIds: tripsForPlace(selected).map((t) => t.trip.id) });
    } else if (q) {
      onFilterRef.current({ kind: "text", text: q, tripIds: textTrips.map((t) => t.trip.id) });
    } else {
      onFilterRef.current({ kind: "none" });
    }
  }, [selected, q, textTrips, tripsForPlace]);

  // Back after "Clear place" / "Show all trips": keep keyboard focus here, not on <body>.
  // The page remounts the box to clear it, so this runs once per clear.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const typing = text.trim() !== "";

  const sections = useMemo<Section[]>(() => {
    if (!typing) {
      if (!data) return [];
      if (browse) {
        const inCategory = data.places
          .filter((p) => p.categories.includes(browse))
          .sort((a, b) => Number(a.categories[0] !== browse) - Number(b.categories[0] !== browse));
        return [
          { key: "back", layout: "rows", options: [{ kind: "back", key: "back" }] },
          {
            key: `cat-${browse}`,
            heading: data.labels[browse] ?? browse,
            layout: "rows",
            options: inCategory.map((p) => ({ kind: "place", key: `p-${p.id}`, place: p, hit: null })),
          },
        ];
      }
      const categories = data.order.filter((c) => data.places.some((p) => p.categories.includes(c)));
      return [
        {
          key: "categories",
          heading: "Browse by category",
          layout: "chips",
          options: categories.map((c) => ({ kind: "category", key: `c-${c}`, category: c, label: data.labels[c] ?? c })),
        },
        {
          key: "popular",
          heading: "Popular places",
          layout: "rows",
          options: popularPlaces(data.places, tripsForPlace).map((p) => ({ kind: "place", key: `p-${p.id}`, place: p, hit: null })),
        },
      ];
    }
    const out: Section[] = [];
    if (textTrips.length > 0) {
      out.push({
        key: "trips",
        heading: "Trips",
        layout: "rows",
        options: textTrips.slice(0, MAX_TRIPS).map((item) => ({ kind: "trip", key: `t-${item.trip.id}`, item })),
      });
    }
    if (data) {
      groupByCategory(hits, categoryOrderByRank(hits)).forEach((g, i) => {
        out.push({
          key: `g-${g.category}`,
          kicker: i === 0 ? "Places" : undefined,
          heading: data.labels[g.category] ?? g.category,
          layout: "rows",
          options: g.items.map((h) => ({ kind: "place", key: `p-${h.place.id}`, place: h.place, hit: h })),
        });
      });
    }
    return out;
  }, [typing, data, browse, textTrips, hits, tripsForPlace]);

  const flat = useMemo(() => sections.flatMap((s) => s.options), [sections]);
  const activeIndex = active >= 0 && active < flat.length ? active : -1;

  const showLoading = !data && !loadFailed;
  const loadError = !data && loadFailed;
  const noMatches = typing && q !== "" && flat.length === 0 && data !== null;
  const emptyCategory = !typing && browse !== null && flat.length <= 1;
  const popupHasContent = flat.length > 0 || showLoading || noMatches || loadError;
  const popupOpen = open && popupHasContent;
  const announce = !popupOpen
    ? ""
    : loadError && flat.length === 0
      ? LOAD_FAILED_TEXT
      : typing
        ? flat.length > 0
          ? `${flat.length} ${flat.length === 1 ? "suggestion" : "suggestions"}`
          : noMatches
            ? NO_MATCH_TEXT
            : ""
        : browseMessage;

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(`${baseId}-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, baseId]);

  // Phones: fit the popup above the on-screen keyboard (dvh does not shrink for it).
  useEffect(() => {
    if (!popupOpen) return;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const fit = () => {
      const el = popupRef.current;
      if (!el) return;
      const room = vv.height + vv.offsetTop - el.getBoundingClientRect().top - 8;
      setPopupMaxH(Math.round(Math.max(POPUP_MIN, Math.min(POPUP_MAX, room))));
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    window.addEventListener("scroll", fit, { passive: true });
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      window.removeEventListener("scroll", fit);
    };
  }, [popupOpen]);

  // While the list is open, the floating chat and WhatsApp buttons step aside (see globals.css).
  useEffect(() => {
    if (!popupOpen) return;
    const root = document.documentElement;
    root.setAttribute("data-search-open", "");
    return () => root.removeAttribute("data-search-open");
  }, [popupOpen]);

  const openPopup = (retry = false) => {
    ensureData(retry);
    setOpen(true);
  };

  const onFocus = () => {
    openPopup(true);
    // Phones: lift the box to the top so the suggestions fit above the keyboard.
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.setTimeout(() => wrapRef.current?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" }), 300);
    }
  };

  const onInput = (value: string) => {
    setText(value);
    // The first letter in an empty box searches at once, so the popup never blinks shut while
    // the pause runs; later letters wait for the pause.
    if (!value.trim()) setQuery("");
    else if (!query.trim()) setQuery(value);
    setSelected(null);
    setBrowse(null);
    setBrowseMessage("");
    setActive(-1);
    openPopup();
  };

  const clear = (refocus: boolean) => {
    setText("");
    setQuery("");
    setSelected(null);
    setBrowse(null);
    setBrowseMessage("");
    setActive(-1);
    if (refocus) {
      inputRef.current?.focus();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const choosePlace = (place: KarnatakaPlace, dropKeyboard: boolean) => {
    setSelected(place);
    setText(place.name);
    setQuery(place.name);
    setBrowse(null);
    setBrowseMessage("");
    setActive(-1);
    setOpen(false);
    if (dropKeyboard) inputRef.current?.blur(); // phones: drop the keyboard so the trips show
  };

  const choose = (opt: Option, how: ChooseHow) => {
    switch (opt.kind) {
      case "category": {
        const count = data ? data.places.filter((p) => p.categories.includes(opt.category)).length : 0;
        setBrowse(opt.category);
        setBrowseMessage(`${opt.label}: ${count} ${count === 1 ? "place" : "places"}`);
        // Keyboard: go straight to the first place (index 0 is "All categories").
        setActive(how === "key" && count > 0 ? 1 : -1);
        popupRef.current?.scrollTo({ top: 0 });
        return;
      }
      case "back":
        setBrowse(null);
        setBrowseMessage("All categories");
        setActive(how === "key" ? 0 : -1);
        popupRef.current?.scrollTo({ top: 0 });
        return;
      case "trip":
        setOpen(false);
        router.push(`/trips/${opt.item.trip.slug}`);
        return;
      case "place":
        choosePlace(opt.place, how === "touch");
        return;
    }
  };

  const isCoarsePointer = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const n = flat.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) return openPopup();
        if (n) setActive(activeIndex < 0 || activeIndex >= n - 1 ? 0 : activeIndex + 1);
        return;
      case "ArrowUp":
        e.preventDefault();
        if (!open) return openPopup();
        if (n) setActive(activeIndex <= 0 ? n - 1 : activeIndex - 1);
        return;
      case "Home":
      case "End":
        // Editable combobox: Home/End move the caret; they only leave the highlighted option.
        if (activeIndex >= 0) setActive(-1);
        return;
      case "Enter": {
        if (open && activeIndex >= 0) {
          e.preventDefault();
          choose(flat[activeIndex], "key");
          return;
        }
        if (!typing) return;
        e.preventDefault();
        // Act on what is in the box now, not on hits from before the typing pause ended.
        let top: PlaceHit | undefined = hits[0];
        if (normalize(text) !== normalize(query)) {
          setQuery(text);
          top = data ? searchPlaces(text.trim(), data.places, data.districts, MAX_PLACES)[0] : undefined;
        }
        // The exact name of a place: choose it. Otherwise keep the typed words as the filter.
        if (top && (top.field === "name" || top.field === "alias") && top.score >= 900) {
          choosePlace(top.place, isCoarsePointer());
          return;
        }
        setOpen(false);
        if (isCoarsePointer()) inputRef.current?.blur();
        return;
      }
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
        } else if (text) {
          e.preventDefault();
          clear(false);
        }
        return;
      case "Tab":
        setOpen(false);
        return;
    }
  };

  let index = -1;
  const renderOption = (opt: Option): ReactNode => {
    index += 1;
    const i = index;
    const isActive = i === activeIndex;
    const common = {
      id: optionId(i),
      role: "option" as const,
      "aria-selected": isActive,
      onPointerDown: (e: ReactPointerEvent) => {
        pointerTypeRef.current = e.pointerType;
      },
      onClick: () => {
        const type = pointerTypeRef.current;
        pointerTypeRef.current = "";
        // Only a finger (or pen) drops the keyboard; mouse and screen-reader clicks keep focus here.
        choose(opt, type === "touch" || type === "pen" ? "touch" : "pointer");
      },
      onMouseMove: () => {
        if (!isActive) setActive(i);
      },
    };
    if (opt.kind === "category") {
      return (
        <div
          key={opt.key}
          {...common}
          className={`inline-flex min-h-11 cursor-pointer select-none items-center rounded-full border px-4 text-sm font-semibold transition ${
            isActive
              ? "border-forest-900 bg-forest-900 text-white ring-2 ring-forest-900 ring-offset-2 ring-offset-cream-50"
              : "border-stone-300 bg-white text-forest-900 hover:border-forest-700"
          }`}
        >
          {opt.label}
        </div>
      );
    }
    // Active: tint plus a dark bar on the left (the tint alone is too faint); hover: lighter, no bar.
    const row = `flex min-h-[52px] cursor-pointer select-none items-center gap-3 px-4 py-2 transition ${
      isActive ? "bg-lagoon-100 shadow-[inset_3px_0_0_#0d5f6b]" : "hover:bg-cream-100"
    }`;
    if (opt.kind === "back") {
      return (
        <div key={opt.key} {...common} className={`${row} text-sm font-semibold text-forest-900`}>
          <ArrowLeft className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
          <span>All categories</span>
        </div>
      );
    }
    if (opt.kind === "trip") {
      const t = opt.item.trip;
      return (
        <div key={opt.key} {...common} className={row}>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-peach-100 text-copper-700">
            <Route className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 break-words text-[15px] font-medium text-ink-900 sm:text-sm">
              <Highlighted text={t.title} query={q} active={isActive} />
            </span>
            <span className="block truncate text-xs text-stone-600">{t.destination}</span>
          </span>
        </div>
      );
    }
    const p = opt.place;
    const hasTrip = tripsForPlace(p).length > 0;
    const alias = opt.hit && opt.hit.field === "alias" && !highlightParts(p.name, q).some((x) => x.match) ? opt.hit.matched : null;
    const aliasIsLatin = alias !== null && !/[ಀ-೿]/.test(alias);
    return (
      <div key={opt.key} {...common} className={row}>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lagoon-100 text-forest-700">
          <MapPin className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          {/* Place names have no Kannada yet: marked English so screen readers use an English voice. */}
          <span lang="en" translate="no" className="line-clamp-2 break-words text-[15px] font-medium text-ink-900 sm:text-sm">
            <Highlighted text={p.name} query={q} active={isActive} />
          </span>
          <span className="flex min-w-0 items-center gap-2 text-xs text-stone-600">
            <span className="min-w-0 truncate">
              <span lang="en" translate="no">
                {p.district}
              </span>
              {alias && (
                <>
                  {" · "}
                  <span lang={aliasIsLatin ? "en" : "kn"} translate="no">
                    <Highlighted text={alias} query={q} active={isActive} />
                  </span>
                </>
              )}
            </span>
            {/* Phones: the badge sits on this line so the name keeps the full width. */}
            {hasTrip && <TripBadge className="inline-flex sm:hidden" />}
          </span>
        </span>
        {hasTrip && <TripBadge className="hidden sm:inline-flex" />}
      </div>
    );
  };

  return (
    // z-30: under the sticky header (z-40) when the page scrolls with the list open.
    <div ref={wrapRef} className={`relative z-30 scroll-mt-24 ${className}`}>
      <label htmlFor={inputId} className="sr-only">
        Search trips and places
      </label>
      <Search className="pointer-events-none absolute left-3.5 top-6 h-5 w-5 -translate-y-1/2 text-forest-700" aria-hidden="true" />
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={popupOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={popupOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        value={text}
        onChange={(e) => onInput(e.target.value)}
        onFocus={onFocus}
        onClick={() => openPopup()}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search Chikmagalur, Coorg or any Karnataka place..."
        className="h-12 w-full rounded-xl border border-stone-300 bg-white pl-11 pr-12 text-base text-ink-900 placeholder:text-stone-600 focus:border-forest-700 focus:outline-none focus:ring-2 focus:ring-lagoon-500/30 sm:text-sm"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => clear(true)}
          className="absolute right-0.5 top-0.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-stone-600 hover:text-forest-900"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      <div
        ref={popupRef}
        // Keep focus in the box while tapping or scrolling the suggestions.
        onMouseDown={(e) => e.preventDefault()}
        style={popupOpen && popupMaxH !== null ? { maxHeight: popupMaxH } : undefined}
        className={
          popupOpen
            ? "absolute inset-x-0 top-full z-40 mt-2 max-h-[28rem] overflow-y-auto overscroll-contain rounded-2xl border border-stone-200 bg-cream-50 py-1 shadow-[var(--shadow-lift)] supports-[height:100dvh]:max-h-[min(28rem,60dvh)]"
            : "hidden"
        }
      >
        <div id={listId} role="listbox" aria-label="Search suggestions">
          {sections.map((s) => (
            <div
              key={s.key}
              role="group"
              aria-labelledby={s.heading ? `${baseId}-h-${s.key}` : undefined}
              className="border-b border-stone-200/70 py-1 last:border-b-0"
            >
              {s.kicker && (
                <div role="presentation" className="eyebrow px-4 pt-2">
                  {s.kicker}
                </div>
              )}
              {s.heading && (
                <div id={`${baseId}-h-${s.key}`} role="presentation" className="px-4 pb-1 pt-2 font-display text-sm font-semibold text-forest-900">
                  {s.heading}
                </div>
              )}
              <div role="presentation" className={s.layout === "chips" ? "flex flex-wrap gap-2 px-4 pb-2 pt-1" : ""}>
                {s.options.map(renderOption)}
              </div>
            </div>
          ))}
        </div>
        {showLoading && (typing || flat.length === 0) && <p className="px-4 py-3 text-sm text-stone-600">Loading places…</p>}
        {loadError && <p className="px-4 py-3 text-sm text-stone-600">{LOAD_FAILED_TEXT}</p>}
        {noMatches && <p className="px-4 py-5 text-sm text-stone-600">{NO_MATCH_TEXT}</p>}
        {emptyCategory && <p className="px-4 py-3 text-sm text-stone-600">No places in this category yet.</p>}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

const NO_MATCH_TEXT = "No place or trip matches that yet. Check the spelling or try a nearby town.";
const LOAD_FAILED_TEXT = "Couldn't load places. Check your connection and try again.";

function TripBadge({ className }: { className: string }) {
  return (
    <span
      className={`${className} shrink-0 items-center gap-1 rounded-full bg-forest-900/10 px-2 py-0.5 text-[11px] font-semibold text-forest-900`}
    >
      <Car className="h-3 w-3" aria-hidden="true" />
      <span>Trip available</span>
    </span>
  );
}

/** Places for the empty box: one per district among places a trip goes to, then the rest of the list. */
function popularPlaces(places: readonly KarnatakaPlace[], tripsFor: (p: KarnatakaPlace) => TripWithDetails[]): KarnatakaPlace[] {
  const out: KarnatakaPlace[] = [];
  const districts = new Set<string>();
  const withTrips = places.filter((p) => tripsFor(p).length > 0);
  for (const p of withTrips) {
    if (out.length >= POPULAR_COUNT) break;
    if (districts.has(p.district)) continue;
    districts.add(p.district);
    out.push(p);
  }
  for (const p of [...withTrips, ...places]) {
    if (out.length >= POPULAR_COUNT) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

function Highlighted({ text, query, active = false }: { text: string; query: string; active?: boolean }) {
  // On the active row's tint the usual copper is under 4.5:1, so it gets a darker shade there.
  const matchClass = active ? "font-bold text-[#a33c08]" : "font-bold text-copper-700";
  return (
    <>
      {highlightParts(text, query).map((part, i) =>
        part.match ? (
          <b key={i} className={matchClass}>
            {part.text}
          </b>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** "Trips that go to Abbey Falls (Kodagu)" with a clear button, above the trip grid. */
export function PlaceFilterBanner({ place, onClear }: { place: KarnatakaPlace; onClear: () => void }) {
  // Not a live region: the page announces the result in its own always-present one.
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-forest-700/20 bg-lagoon-100/70 py-1 pl-4 pr-1">
      <MapPin className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
      <p className="min-w-0 flex-1 py-2 text-sm font-semibold text-forest-900">{`Trips that go to ${place.name} (${place.district})`}</p>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear place"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-forest-900 hover:bg-white/70"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Shown instead of the grid when no published trip goes to the chosen place. */
export function NoTripForPlace({
  place,
  onClear,
  planHref = "#ask",
}: {
  place: KarnatakaPlace;
  onClear: () => void;
  /** Where the enquiry form is: "#ask" on the trips page, or e.g. "/?place=…#plan". */
  planHref?: string;
}) {
  return (
    <div className="card-soft px-5 py-8 text-center sm:px-8">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-peach-100 text-copper-700">
        <MapPin className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="mt-3 font-display text-xl font-semibold text-forest-900">{`No trip to ${place.name} yet`}</p>
      {/* The blurb is English only: marked so, and hidden on the Kannada site. */}
      {place.blurb && (
        <p lang="en" translate="no" className="mx-auto mt-1 max-w-md text-sm text-stone-600 [html[data-lang=kn]_&]:hidden">
          {place.blurb}
        </p>
      )}
      <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">{"Tell us your dates and group size, and we'll plan a car trip there."}</p>
      <div className="mt-5 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
        <a
          href={planHref}
          onClick={() => requestPlanFor(`${place.name}, ${place.district}`)}
          className="btn-sunset min-h-11 px-5 py-2.5 text-sm"
        >
          {`Ask us to plan ${place.name}`}
        </a>
        <button
          type="button"
          onClick={onClear}
          className="min-h-11 rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-forest-900 hover:border-forest-700"
        >
          Show all trips
        </button>
      </div>
    </div>
  );
}
