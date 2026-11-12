"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { TripCard } from "@/components/TripCard";
import type { TripWithDetails } from "@/lib/types";

export function TripsCatalogClient({
  trips,
  initialMode,
}: {
  trips: TripWithDetails[];
  initialMode?: string;
}) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [onlyPrivateEligible, setOnlyPrivateEligible] = useState(initialMode === "private");
  const [onlyWomenBatch, setOnlyWomenBatch] = useState(false);

  const regions = useMemo(
    () => ["all", ...Array.from(new Set(trips.map((t) => t.trip.region)))],
    [trips]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trips.filter((item) => {
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
  }, [trips, query, region, difficulty, onlyPrivateEligible, onlyWomenBatch]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-cream-50 p-4 sm:p-5">
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
        <div className="rounded-2xl border border-dashed border-stone-300 bg-cream-50 p-10 text-center">
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

