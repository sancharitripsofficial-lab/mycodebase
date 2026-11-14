import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The watcher only needs window.addEventListener / removeEventListener; a bare EventTarget stands in.
let win: EventTarget;
const scroll = () => win.dispatchEvent(new Event("scroll"));

async function load() {
  vi.resetModules();
  return import("@/lib/scroll-idle");
}

beforeEach(() => {
  vi.useFakeTimers();
  win = new EventTarget();
  vi.stubGlobal("window", win);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("scroll watcher (heavy decoration waits while the page moves)", () => {
  it("reports one start and one stop for a whole fling, not one per scroll event", async () => {
    const m = await load();
    const seen: boolean[] = [];
    m.onScrollActivity((s) => seen.push(s));
    for (let i = 0; i < 20; i++) {
      scroll();
      vi.advanceTimersByTime(16); // a 60 fps fling: events far closer than the rest time
    }
    expect(m.isScrolling()).toBe(true);
    expect(seen).toEqual([true]);
    vi.advanceTimersByTime(m.SCROLL_IDLE_MS + 1);
    expect(m.isScrolling()).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it("whenScrollIdle resolves at once on a still page, and only after the page rests otherwise", async () => {
    const m = await load();
    let resolved = false;
    await m.whenScrollIdle(); // still page: immediate
    scroll();
    void m.whenScrollIdle().then(() => (resolved = true));
    vi.advanceTimersByTime(m.SCROLL_IDLE_MS - 20);
    scroll(); // still moving: the wait restarts
    vi.advanceTimersByTime(m.SCROLL_IDLE_MS - 20);
    await Promise.resolve();
    expect(resolved).toBe(false);
    vi.advanceTimersByTime(40);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("stops listening when nobody needs it, and a failing listener never blocks the others", async () => {
    const m = await load();
    const remove = vi.spyOn(win, "removeEventListener");
    const good: boolean[] = [];
    const offBad = m.onScrollActivity(() => {
      throw new Error("boom");
    });
    const offGood = m.onScrollActivity((s) => good.push(s));
    scroll();
    expect(good).toEqual([true]);
    offBad();
    offGood();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true });
    expect(m.isScrolling()).toBe(false);
  });
});
