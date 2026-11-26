"use client";

import { Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TripCard } from "@/components/TripCard";
import { NoTripForPlace, PlaceFilterBanner, TripSearch, type TripSearchFilter } from "@/components/TripSearch";
import type { HomeCategory } from "@/lib/home-content";
import type { KarnatakaDistrict, KarnatakaPlace } from "@/lib/places/types";
import { readTripQuery, tripIdsForQuery, withoutTripQuery } from "@/lib/trip-query";
import type { TripWithDetails } from "@/lib/types";
import { isBookable } from "@/lib/departure-rules";
import { tripPriceInfo } from "@/lib/trip-price";

/** Budget per person, by the trip's "From" price (the same price its card shows). */
const BUDGETS = [
  { value: "all", label: "Any budget", min: 0, max: Infinity },
  { value: "under-3000", label: "Up to ₹3,000", min: 0, max: 300_000 },
  { value: "3000-5000", label: "₹3,000 to ₹5,000", min: 300_001, max: 500_000 },
  { value: "over-5000", label: "Above ₹5,000", min: 500_001, max: Infinity },
] as const;

const DURATIONS = [
  { value: "all", label: "Any length" },
  { value: "1", label: "1 day" },
  { value: "2", label: "2 days" },
  { value: "3", label: "3 days or more" },
] as const;

const placeOf = (destination: string) => destination.split(",")[0].trim();
const SELECT = "h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-ink-900 sm:text-sm";

export function TripsCatalogClient({ trips, categories = [] }: { trips: TripWithDetails[]; categories?: HomeCategory[] }) {
  // Smart search (places + free text). Changing the key clears the box.
  const [search, setSearch] = useState<TripSearchFilter>({ kind: "none" });
  const [searchKey, setSearchKey] = useState(0);
  const [category, setCategory] = useState("all");
  const [destination, setDestination] = useState("all");
  const [budget, setBudget] = useState<(typeof BUDGETS)[number]["value"]>("all");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]["value"]>("all");
  const [difficulty, setDifficulty] = useState("all");
  const [onlyPrivateEligible, setOnlyPrivateEligible] = useState(false);
  const [onlyWomenBatch, setOnlyWomenBatch] = useState(false);
  // /trips?q=… (links and Google's site search): the text filters the trips like the search box.
  const [urlQuery, setUrlQuery] = useState<string | null>(null);
  const [urlPlaceData, setUrlPlaceData] = useState<{ places: readonly KarnatakaPlace[]; districts: readonly KarnatakaDistrict[] } | null>(null);

  // Read in the browser so the page stays cached and its canonical stays /trips.
  useEffect(() => {
    const q = readTripQuery(window.location.search);
    if (!q) return;
    setUrlQuery(q);
    // Place names ("Abbey Falls") need the place list: the same chunk the search box loads.
    import("@/lib/places/karnataka-places")
      .then((m) => setUrlPlaceData({ places: m.KARNATAKA_PLACES, districts: m.KARNATAKA_DISTRICTS }))
      .catch(() => {
        /* the trips' own words still match */
      });
  }, []);

  /** Forget ?q= (also in the address bar, other filters stay). */
  const dropUrlQuery = useCallback(() => {
    setUrlQuery(null);
    if (new URLSearchParams(window.location.search).has("q")) {
      const { pathname, search, hash } = window.location;
      window.history.replaceState(window.history.state, "", `${pathname}${withoutTripQuery(search)}${hash}`);
    }
  }, []);

  // Typing in the box (or picking a place) replaces the ?q= text.
  const onSearchChange = useCallback(
    (filter: TripSearchFilter) => {
      setSearch(filter);
      if (filter.kind !== "none") dropUrlQuery();
    },
    [dropUrlQuery]
  );

  // "Book the whole car" links land here with ?mode=private (read in the browser so the page stays cached).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    if (mode === "private") setOnlyPrivateEligible(true);
    if (mode === "women") setOnlyWomenBatch(true);
    const cat = params.get("category");
    if (cat && categories.some((c) => c.id === cat)) setCategory(cat);
  }, [categories]);

  // Only categories that have at least one published trip get a chip.
  const liveCategories = useMemo(
    () => categories.filter((c) => trips.some((t) => c.tripSlugs.includes(t.trip.slug))),
    [categories, trips]
  );

  const destinations = useMemo(() => Array.from(new Set(trips.map((t) => placeOf(t.trip.destination)))).sort((a, b) => a.localeCompare(b)), [trips]);
  // Only the choices that match at least one trip are offered, so no single filter empties the page.
  const budgets = useMemo(
    () =>
      BUDGETS.filter(
        (b) =>
          b.value === "all" ||
          trips.some((t) => {
            const from = tripPriceInfo(t.trip, t.departures).fromPaise;
            return from >= b.min && from <= b.max;
          })
      ),
    [trips]
  );
  const durations = useMemo(
    () => DURATIONS.filter((d) => d.value === "all" || trips.some((t) => (d.value === "3" ? t.trip.durationDays >= 3 : t.trip.durationDays === Number(d.value)))),
    [trips]
  );
  const difficulties = useMemo(() => (["Easy", "Moderate", "Active"] as const).filter((d) => trips.some((t) => t.trip.difficulty === d)), [trips]);

  // The button that cleared the search (in the place banner, the no-trip card or the empty box)
  // goes away, so focus moves on purpose: back to the search box on a mouse/keyboard device, or
  // to the results on a phone (focusing the box there would pop up the keyboard).
  const [focusSearchBox, setFocusSearchBox] = useState(false);
  const [focusResultsTick, setFocusResultsTick] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  const clearSearch = () => {
    const finePointer = Boolean(window.matchMedia?.("(pointer: fine)").matches);
    setFocusSearchBox(finePointer);
    if (!finePointer) setFocusResultsTick((n) => n + 1);
    setSearchKey((k) => k + 1);
    setSearch({ kind: "none" });
    dropUrlQuery();
  };

  useEffect(() => {
    if (focusResultsTick > 0) resultsRef.current?.focus();
  }, [focusResultsTick]);

  const urlQueryIds = useMemo(
    () => (urlQuery ? new Set(tripIdsForQuery(urlQuery, trips, urlPlaceData)) : null),
    [urlQuery, trips, urlPlaceData]
  );
  const searchIds = useMemo(() => (search.kind === "none" ? urlQueryIds : new Set(search.tripIds)), [search, urlQueryIds]);
  const showUrlQuery = search.kind === "none" && urlQuery !== null;

  const filtered = useMemo(() => {
    const cat = liveCategories.find((c) => c.id === category);
    return trips.filter((item) => {
      if (cat && !cat.tripSlugs.includes(item.trip.slug)) return false;
      if (destination !== "all" && placeOf(item.trip.destination) !== destination) return false;
      if (difficulty !== "all" && item.trip.difficulty !== difficulty) return false;
      if (duration !== "all" && (duration === "3" ? item.trip.durationDays < 3 : item.trip.durationDays !== Number(duration))) return false;
      if (budget !== "all") {
        const range = BUDGETS.find((b) => b.value === budget);
        const from = tripPriceInfo(item.trip, item.departures).fromPaise;
        if (range && (from < range.min || from > range.max)) return false;
      }
      if (
        onlyPrivateEligible &&
        !item.departures.some((d) => d.seatsTaken === 0 && isBookable(d))
      ) {
        return false;
      }
      if (
        onlyWomenBatch &&
        !item.departures.some((d) => d.departureType === "women_only" && isBookable(d))
      ) {
        return false;
      }
      // Search: trips that go to the chosen place, or whose text (itinerary too) matches.
      if (searchIds && !searchIds.has(item.trip.id)) return false;
      return true;
    });
  }, [trips, searchIds, destination, budget, duration, difficulty, onlyPrivateEligible, onlyWomenBatch, category, liveCategories]);

  const filtersOn = destination !== "all" || budget !== "all" || duration !== "all" || difficulty !== "all" || onlyPrivateEligible || onlyWomenBatch || category !== "all";
  const resetFilters = () => {
    setCategory("all");
    setDestination("all");
    setBudget("all");
    setDuration("all");
    setDifficulty("all");
    setOnlyPrivateEligible(false);
    setOnlyWomenBatch(false);
  };

  // "2 trips go to Abbey Falls" / "No trip to Hampi yet" (Kannada in patterns.ts).
  const placeResult =
    search.kind !== "place"
      ? ""
      : search.tripIds.length === 0
        ? `No trip to ${search.place.name} yet`
        : `${filtered.length} ${filtered.length === 1 ? "trip goes" : "trips go"} to ${search.place.name}`;

  return (
    <div id="all-trips" className="scroll-mt-24 space-y-6">
      {liveCategories.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Trip categories">
          <button
            type="button"
            onClick={() => setCategory("all")}
            aria-pressed={category === "all"}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              category === "all" ? "border-forest-900 bg-forest-900 text-white" : "border-stone-300 bg-white text-forest-900 hover:border-forest-700"
            }`}
          >
            All trips
          </button>
          {liveCategories.map((c) => {
            const on = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(on ? "all" : c.id)}
                aria-pressed={on}
                title={c.description}
                className={`theme-${c.theme} shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  on ? "border-transparent bg-[var(--th)] text-white" : "th-chip hover:brightness-95"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="sec-route rounded-2xl border border-stone-200 p-4 shadow-[var(--shadow-soft)] sm:p-5">
        <TripSearch key={searchKey} trips={trips} onFilterChange={onSearchChange} autoFocus={focusSearchBox} />

        <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-600">Destination</span>
            <select value={destination} onChange={(e) => setDestination(e.target.value)} className={SELECT}>
              <option value="all">Anywhere</option>
              {destinations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-600">Budget per person</span>
            <select value={budget} onChange={(e) => setBudget(e.target.value as typeof budget)} className={SELECT}>
              {budgets.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-600">Duration</span>
            <select value={duration} onChange={(e) => setDuration(e.target.value as typeof duration)} className={SELECT}>
              {durations.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-600">Difficulty</span>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={SELECT}>
              <option value="all">Any difficulty</option>
              {difficulties.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-medium text-forest-900">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5">
            <input type="checkbox" checked={onlyPrivateEligible} onChange={(e) => setOnlyPrivateEligible(e.target.checked)} className="h-5 w-5 accent-forest-900" />
            Whole car can be booked
          </label>

          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5">
            <input type="checkbox" checked={onlyWomenBatch} onChange={(e) => setOnlyWomenBatch(e.target.checked)} className="h-5 w-5 accent-forest-900" />
            Women-only dates
          </label>

          {filtersOn && (
            <button type="button" onClick={resetFilters} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 text-xs font-semibold text-forest-900">
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* One live region that is always on the page, so the place result is announced reliably. */}
      <p className="sr-only" aria-live="polite">
        {placeResult}
      </p>

      {search.kind === "place" && search.tripIds.length > 0 && (
        <PlaceFilterBanner place={search.place} onClear={clearSearch} />
      )}

      {showUrlQuery && (
        <div className="flex items-center gap-3 rounded-2xl border border-forest-700/20 bg-lagoon-100/70 py-1 pl-4 pr-1">
          <Search className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
          <p className="min-w-0 flex-1 py-2 text-sm font-semibold text-forest-900">
            <span>Showing trips for</span> <span data-no-translate>“{urlQuery}”</span>
          </p>
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Show all trips"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-forest-900 hover:bg-white/70"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {filtered.length > 0 && !(search.kind === "place" && search.tripIds.length === 0) && (
        <p className="text-sm font-semibold text-stone-600" aria-live="polite">
          {filtered.length === trips.length ? `All ${trips.length} trips` : `${filtered.length} of ${trips.length} trips`}
        </p>
      )}

      <div ref={resultsRef} tabIndex={-1} role="region" aria-label="Trip results" className="scroll-mt-24 rounded-2xl outline-none">
      {search.kind === "place" && search.tripIds.length === 0 ? (
        <NoTripForPlace place={search.place} onClear={clearSearch} planHref="#ask" />
      ) : filtered.length === 0 ? (
        <div className="sec-kolam rounded-2xl border border-dashed border-stone-300 p-10 text-center">
          <p className="font-display text-lg font-semibold text-forest-900">No trip matches these filters</p>
          <p className="mt-1 text-sm text-stone-600">Clear a filter, or ask us below for the trip you have in mind.</p>
          <button
            type="button"
            onClick={() => {
              clearSearch();
              resetFilters();
            }}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-forest-900 px-5 text-sm font-semibold text-cream-50"
          >
            Show all trips
          </button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <TripCard key={item.trip.id} item={item} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

