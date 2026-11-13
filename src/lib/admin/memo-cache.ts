"use client";

/**
 * Tiny in-browser memory for admin screens. A section shows what it loaded last time the moment
 * it opens, then refreshes quietly, so moving between sections never flashes "Loading…".
 * Memory only (cleared on reload / sign-out), nothing is written to storage.
 */
const store = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setCached(key: string, value: unknown): void {
  store.set(key, value);
}

export function clearCached(): void {
  store.clear();
}

/** Admin data the sections below the fold need; fetched once the console is idle. */
const WARM: Array<{ key: string; url: string; pick: (json: Record<string, unknown>) => unknown }> = [
  { key: "promotions", url: "/api/admin/promotions", pick: (j) => j.promotions },
  { key: "creators", url: "/api/admin/creators", pick: (j) => j },
  { key: "media", url: "/api/admin/media", pick: (j) => j },
];

export function warmAdminCache(): () => void {
  let cancelled = false;
  const run = () => {
    for (const w of WARM) {
      if (store.has(w.key)) continue;
      void fetch(w.url, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((json: Record<string, unknown> | null) => {
          if (!cancelled && json && !store.has(w.key)) store.set(w.key, w.pick(json));
        })
        .catch(() => undefined);
    }
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  const id = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 1500);
  return () => {
    cancelled = true;
    if (!w.requestIdleCallback) window.clearTimeout(id);
  };
}
