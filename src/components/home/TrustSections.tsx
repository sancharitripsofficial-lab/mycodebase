import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { HomeIcon } from "@/components/home/icons";
import type { HomeCard, SectionText } from "@/lib/home-content";
import { isOptimizableImage } from "@/lib/media";
import { teamInitials, type TeamMember } from "@/lib/site-media";

function Heading({ text, id }: { text: SectionText; id: string }) {
  return (
    <div className="max-w-2xl space-y-1.5">
      {text.eyebrow && <p className="text-sm font-semibold text-copper-700">{text.eyebrow}</p>}
      <h2 id={id} className="font-display text-2xl font-semibold text-forest-900 sm:text-3xl">
        {text.title}
      </h2>
      {text.body && <p className="text-sm leading-relaxed text-stone-600">{text.body}</p>}
    </div>
  );
}

/**
 * "Travel with confidence": the promises every trip keeps, each linked to the page where it is
 * written down. Words and cards come from Admin → Home page.
 */
export function TrustPromises({ text, cards }: { text: SectionText; cards: HomeCard[] }) {
  if (!text.show || cards.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="trust-heading">
      <Heading text={text} id="trust-heading" />
      <ul className="mt-7 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <li key={`${card.title}-${i}`} className="border-t-2 border-forest-900/15 pt-4">
            <span className={`tile tile-${card.colour} inline-flex h-11 w-11 items-center justify-center p-0`}>
              <HomeIcon name={card.icon} className="tile-num h-5 w-5" />
            </span>
            <h3 className="mt-3 font-display text-lg leading-snug font-semibold text-ink-900">{card.title}</h3>
            {card.body && <p className="mt-1.5 text-sm leading-relaxed text-ink-900/75">{card.body}</p>}
            {card.href && (
              <Link href={card.href} className="mt-2 inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-forest-800 hover:text-copper-700">
                Read it <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The people behind Sanchari. A member without a photo shows their initials, never a stock face. */
export function TeamSection({ text, team, className = "" }: { text: SectionText; team: TeamMember[]; className?: string }) {
  if (!text.show || team.length === 0) return null;
  return (
    <section className={`mx-auto max-w-6xl px-4 py-14 sm:px-6 ${className}`} aria-labelledby="team-heading">
      <Heading text={text} id="team-heading" />
      <ul className="mt-7 grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-4">
        {team.map((member) => (
          <li key={member.name} className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            {member.photo ? (
              <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-white shadow-[var(--shadow-soft)] sm:h-20 sm:w-20">
                <Image src={member.photo} alt={member.name} fill sizes="80px" unoptimized={!isOptimizableImage(member.photo)} className="object-cover" />
              </span>
            ) : (
              <span
                aria-hidden="true"
                data-no-translate
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-forest-900 font-display text-xl font-semibold text-cream-50 ring-2 ring-white shadow-[var(--shadow-soft)] sm:h-20 sm:w-20 sm:text-2xl"
              >
                {teamInitials(member.name)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block font-display text-base leading-snug font-semibold text-ink-900 sm:text-lg" data-no-translate>
                {member.name}
              </span>
              {member.role && <span className="mt-0.5 block text-xs leading-snug text-stone-600 sm:text-sm">{member.role}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Real photos only (the car, or moments from trips that ran), added by the owner in
 * Admin → Pictures & videos. With no photos the whole section is left out: no stand-in pictures.
 */
export function PhotoSection({ text, photos, id, altPrefix }: { text: SectionText; photos: string[]; id: string; altPrefix: string }) {
  if (!text.show || photos.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby={id}>
      <Heading text={text} id={id} />
      <ul className="-mx-4 mt-7 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0">
        {photos.map((src, i) => (
          <li key={src} className="relative aspect-[4/3] w-[78%] shrink-0 snap-center overflow-hidden rounded-2xl bg-stone-200 shadow-[var(--shadow-soft)] sm:w-auto">
            <Image
              src={src}
              alt={`${altPrefix}, photo ${i + 1}`}
              fill
              sizes="(max-width: 640px) 78vw, 33vw"
              unoptimized={!isOptimizableImage(src)}
              className="object-cover"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
