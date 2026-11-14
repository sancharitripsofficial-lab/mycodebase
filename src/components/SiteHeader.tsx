"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";

const NAV_LINKS = [
  { href: "/trips", label: "Explore Trips" },
  { href: "/trips?mode=private", label: "Private 6-Seat" },
  { href: "/safety", label: "Safety & Comfort" },
  { href: "/booking-lookup", label: "My Booking" },
  { href: "/policies", label: "Policies" },
];

export function SiteHeader({ isDemoMode }: { isDemoMode: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      {isDemoMode && (
        <div className="bg-ocean px-4 py-1.5 text-center text-xs text-white/90">
          <span className="font-semibold text-saffron-500">Preview mode:</span> sample itineraries
          until the Supabase database is connected.
        </div>
      )}

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="Sanchari Micro Trips — home">
          <Image
            src="/brand/sanchari-mark.png"
            alt=""
            width={44}
            height={44}
            priority
            className="h-11 w-11 transition-transform duration-300 group-hover:-rotate-6"
          />
          <span className="flex flex-col leading-none">
            <span className="font-display text-[1.35rem] font-semibold tracking-tight text-forest-900">
              Sanchari
            </span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-forest-700">
              Micro Trips
            </span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((item) => {
            const active = pathname === item.href.split("?")[0] && !item.href.includes("?");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-forest-900/8 text-forest-900"
                    : "text-ink-900/80 hover:bg-lagoon-100 hover:text-forest-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <LanguageToggle />
          <Link href="/trips" className="btn-sunset px-5 py-2.5 text-sm">
            Grab your seat
          </Link>
        </div>

        <LanguageToggle className="ml-auto lg:hidden" />

        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="inline-flex items-center justify-center rounded-xl border border-stone-200 bg-white p-2 text-forest-900 lg:hidden"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <nav aria-label="Mobile navigation" className="border-t border-stone-200 bg-white px-4 py-4 lg:hidden">
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-sm font-medium text-ink-900 hover:bg-lagoon-100"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="pt-2">
              <Link href="/trips" onClick={() => setMenuOpen(false)} className="btn-sunset w-full px-5 py-3 text-sm">
                Grab your seat
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
