"use client";

import { ArrowRight, BellRing, Compass, MessageCircle, Ticket } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const BAR =
  "fixed inset-x-0 bottom-0 z-[50] border-t border-stone-200 bg-[#fffefc]/97 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-18px_rgb(13_95_107/0.45)] lg:hidden";
const TAB = "flex min-h-[3.9rem] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold";

/** A trip's own page: /trips/<slug> (it carries its own bar with the price and "Book"). */
const isTripPage = (pathname: string) => /^\/trips\/[^/]+\/?$/.test(pathname);

/**
 * Phones and tablets: Explore, WhatsApp and My Booking stay one thumb away at the bottom of every
 * store page. Trip pages show TripBookBar instead. The page keeps room for the bar (globals.css,
 * .store-shell) and the floating chat guide sits just above it.
 */
export function MobileBar({ whatsappUrl }: { whatsappUrl: string | null }) {
  const pathname = usePathname() ?? "";
  if (isTripPage(pathname)) return null;
  const on = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const tone = (active: boolean) => (active ? "text-copper-700" : "text-forest-900");

  return (
    <nav aria-label="Quick actions" data-mobile-bar-root="" className={BAR}>
      <ul className="mx-auto grid max-w-xl grid-cols-3">
        <li>
          <Link href="/trips" aria-current={on("/trips") ? "page" : undefined} className={`${TAB} ${tone(on("/trips"))}`}>
            <Compass className="h-5 w-5" aria-hidden="true" />
            Explore
          </Link>
        </li>
        <li>
          {whatsappUrl ? (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={`${TAB} text-[#128c4a]`}>
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              WhatsApp
            </a>
          ) : (
            <Link href="/contact" aria-current={on("/contact") ? "page" : undefined} className={`${TAB} ${tone(on("/contact"))}`}>
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              Ask us
            </Link>
          )}
        </li>
        <li>
          <Link href="/booking-lookup" aria-current={on("/booking-lookup") ? "page" : undefined} className={`${TAB} ${tone(on("/booking-lookup"))}`}>
            <Ticket className="h-5 w-5" aria-hidden="true" />
            My Booking
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/**
 * The bottom bar on a trip page: Explore, WhatsApp and one button that takes the visitor to the
 * booking box, with the price and the next date on it. While the booking box itself is on screen
 * the button is not repeated. A trip with no date open offers "Notify me" instead.
 */
export function TripBookBar({
  whatsappUrl,
  priceLabel,
  dateLabel,
  canBook,
}: {
  whatsappUrl: string | null;
  /** "From ₹4,999" */
  priceLabel: string;
  /** "4–5 Dec", or null when no date is open. */
  dateLabel: string | null;
  canBook: boolean;
}) {
  const [bookOnScreen, setBookOnScreen] = useState(false);

  useEffect(() => {
    const book = document.getElementById("book");
    if (!book) return;
    const io = new IntersectionObserver(([e]) => setBookOnScreen(Boolean(e?.isIntersecting)), { rootMargin: "0px 0px -35% 0px" });
    io.observe(book);
    return () => io.disconnect();
  }, []);

  return (
    <nav aria-label="Book this trip" data-mobile-bar-root="" className={BAR}>
      <div className="mx-auto flex max-w-xl items-stretch gap-1 px-2">
        <Link href="/trips" className={`${TAB} w-[3.6rem] shrink-0 text-forest-900`}>
          <Compass className="h-5 w-5" aria-hidden="true" />
          Explore
        </Link>
        {whatsappUrl && (
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={`${TAB} w-[4rem] shrink-0 text-[#128c4a]`}>
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            WhatsApp
          </a>
        )}
        <div className="flex min-w-0 flex-1 items-center py-1.5 pl-1">
          {canBook ? (
            <a
              href="#book"
              aria-hidden={bookOnScreen}
              tabIndex={bookOnScreen ? -1 : 0}
              className={`btn-sunset min-h-12 w-full justify-between gap-2 px-4 text-left transition-opacity ${bookOnScreen ? "pointer-events-none opacity-0" : "opacity-100"}`}
            >
              <span className="min-w-0 leading-tight">
                <span className="block text-sm font-bold">Book your seat</span>
                <span className="block truncate text-[11px] font-medium text-white/90">{dateLabel ? `${priceLabel}, ${dateLabel}` : priceLabel}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </a>
          ) : (
            <a href="#ask" className="btn-ocean min-h-12 w-full gap-2 px-4 text-sm">
              <BellRing className="h-4 w-4" aria-hidden="true" />
              Notify me of new dates
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
