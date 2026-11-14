/**
 * One shared, passive scroll watcher for the whole page.
 *
 * While a visitor is scrolling (finger on the glass or a fling still gliding), heavy decorative
 * work (the living trip photos, starting new WebGL layers) waits, so the phone spends every
 * frame on the scroll itself. Work resumes a moment after the page comes to rest.
 *
 * Costs one passive listener in total (added on first use, removed when nobody listens).
 */

type Listener = (scrolling: boolean) => void;

/** How long the page must be still before work resumes. */
export const SCROLL_IDLE_MS = 160;

const listeners = new Set<Listener>();
let scrolling = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let attached = false;

function emit(value: boolean) {
  for (const l of [...listeners]) {
    try {
      l(value);
    } catch {
      /* one listener failing never stops the others */
    }
  }
}

function onScroll() {
  if (!scrolling) {
    scrolling = true;
    emit(true);
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    scrolling = false;
    emit(false);
  }, SCROLL_IDLE_MS);
}

function attach() {
  if (attached || typeof window === "undefined") return;
  attached = true;
  // Capture phase: also hears scrolling inside sideways rows and other scrollable boxes.
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
}

function detach() {
  if (!attached || typeof window === "undefined") return;
  attached = false;
  window.removeEventListener("scroll", onScroll, { capture: true });
  if (timer) clearTimeout(timer);
  timer = null;
  scrolling = false;
}

/** True while the page is moving (and for a moment after it stops). */
export function isScrolling(): boolean {
  return scrolling;
}

/** Hear when scrolling starts (true) and when the page comes to rest (false). Returns an unsubscribe. */
export function onScrollActivity(listener: Listener): () => void {
  attach();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) detach();
  };
}

/** Resolves at once if the page is still, otherwise as soon as scrolling stops. */
export function whenScrollIdle(): Promise<void> {
  attach();
  if (!scrolling) return Promise.resolve();
  return new Promise((resolve) => {
    const off = onScrollActivity((s) => {
      if (!s) {
        off();
        resolve();
      }
    });
  });
}
