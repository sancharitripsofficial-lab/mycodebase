"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Phones only: a slim "From ₹X per seat · Pick your seat" bar at the bottom while the visitor reads
 * the trip page. It appears after the top of the page, hides while the booking box itself is on
 * screen, and leaves room on the right for the chat guide's bubble.
 */
export function StickyBookBar({ priceLabel, nextDateLabel }: { priceLabel: string; nextDateLabel: string | null }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const book = document.getElementById("book");
    let bookVisible = false;
    const update = () => setShow(window.scrollY > 520 && !bookVisible);
    const io = book
      ? new IntersectionObserver(([e]) => {
          bookVisible = Boolean(e?.isIntersecting);
          update();
        })
      : null;
    if (book && io) io.observe(book);
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      io?.disconnect();
      window.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div
      aria-hidden={!show}
      className={`fixed bottom-3 left-3 right-[5.5rem] z-[55] transition-all duration-300 lg:hidden ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      }`}
    >
      <a
        href="#book"
        tabIndex={show ? 0 : -1}
        className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-forest-900/95 px-4 py-2.5 text-white shadow-[0_18px_40px_-14px_rgb(13_95_107/0.75)] ring-1 ring-white/15"
      >
        <span className="min-w-0 leading-tight">
          <span className="block text-[11px] font-semibold tracking-wide text-white/75 uppercase">
            {nextDateLabel ? `Next: ${nextDateLabel}` : "Small group · max 6"}
          </span>
          <span className="block truncate text-base font-bold">{priceLabel}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-copper-700 px-3 py-2 text-sm font-semibold">
          Pick your seat <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </a>
    </div>
  );
}
