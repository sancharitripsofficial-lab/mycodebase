"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TripCard } from "@/components/TripCard";
import type { HomeCategory } from "@/lib/home-content";
import type { TripWithDetails } from "@/lib/types";

export function TripsCatalogClient({ trips, categories = [] }: { trips: TripWithDetails[]; categories?: HomeCategory[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [region, setRegion] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [onlyPrivateEligible, setOnlyPrivateEligible] = useState(false);
  const [onlyWomenBatch, setOnlyWomenBatch] = useState(false);

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

  const regions = useMemo(
    () => ["all", ...Array.from(new Set(trips.map((t) => t.trip.region)))],
    [trips]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cat = liveCategories.find((c) => c.id === category);
    return trips.filter((item) => {
      if (cat && !cat.tripSlugs.includes(item.trip.slug)) return false;
      if (region !== "all" && item.trip.region !== region) return false;
      if (difficulty !== "all" && item.trip.difficulty !== difficulty) return false;
      if (
        onlyPrivateEligible &&
        !item.departures.some((d) => d.seatsTaken === 0 && d.status !== "cancelled")
      ) {
        return false;
      }
      if (
        onlyWomenBatch &&
        !item.departures.some((d) => d.departureType === "women_only" && d.status !== "cancelled")
      ) {
        return false;
      }
      if (q) {
        const hay = `${item.trip.title} ${item.trip.destination} ${item.trip.vibe} ${item.trip.region}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [trips, query, region, difficulty, onlyPrivateEligible, onlyWomenBatch, category, liveCategories]);

  return (
    <div className="space-y-6">
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
        <div className="grid gap-3 md:grid-cols-4">
          <label className="relative md:col-span-2">
            <span className="sr-only">Search destination or vibe</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-600"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Chikmagalur, Coorg, Gokarna, Hampi..."
              className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pl-9 pr-3 text-sm text-ink-900"
            />
          </label>

          <label className="block">
            <span className="sr-only">Filter by region</span>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-ink-900"
            >
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r === "all" ? "All Karnataka Regions" : r}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="sr-only">Filter by pace / difficulty</span>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-ink-900"
            >
              <option value="all">Any Pace / Difficulty</option>
              <option value="Easy">Easy</option>
              <option value="Moderate">Moderate</option>
              <option value="Active">Active</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-xs font-medium text-forest-900">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={onlyPrivateEligible}
              onChange={(e) => setOnlyPrivateEligible(e.target.checked)}
              className="h-4 w-4 accent-forest-900"
            />
            Private 6-seat vehicle available (all 6 seats open)
          </label>

          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={onlyWomenBatch}
              onChange={(e) => setOnlyWomenBatch(e.target.checked)}
              className="h-4 w-4 accent-forest-900"
            />
            Explicitly scheduled women-only departures
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="sec-kolam rounded-2xl border border-dashed border-stone-300 p-10 text-center">
          <p className="font-display text-lg font-semibold text-forest-900">
            No matching departures found
          </p>
          <p className="mt-1 text-sm text-stone-600">
            Try clearing one of the filters or viewing all Karnataka road trips.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("all");
              setRegion("all");
              setDifficulty("all");
              setOnlyPrivateEligible(false);
              setOnlyWomenBatch(false);
            }}
            className="mt-4 rounded-full bg-forest-900 px-4 py-2 text-xs font-semibold text-cream-50"
          >
            Reset Filters
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
  );
}

