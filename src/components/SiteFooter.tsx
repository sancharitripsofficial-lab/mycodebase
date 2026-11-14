import { Facebook, Instagram, Mail, Youtube } from "lucide-react";
import { WhatsAppChannelButton } from "@/components/WhatsAppChannelCta";
import Image from "next/image";
import Link from "next/link";
import type { SiteSettings } from "@/lib/types";

/** Storefront footer. Social links and contact come from Admin → Text & policies. */
export function SiteFooter({
  social,
  brand,
}: {
  social: SiteSettings["socialLinks"];
  brand: SiteSettings["brandIdentity"];
}) {
  const socials = [
    { href: social.instagramUrl, label: "Instagram", icon: Instagram },
    { href: social.youtubeUrl, label: "YouTube", icon: Youtube },
    { href: social.facebookUrl, label: "Facebook", icon: Facebook },
  ].filter((s) => s.href);
  const looksSet = (v: string) => v && !v.startsWith("[");

  return (
    <footer className="bg-ocean text-white">
      <div className="road-divider mx-auto max-w-6xl opacity-80" aria-hidden="true" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="space-y-4 md:col-span-2">
          <div className="flex items-center gap-3">
            <Image src="/brand/sanchari-mark.png" alt="" width={48} height={48} className="h-12 w-12 rounded-2xl bg-white/95 p-1" />
            <div>
              <p className="font-display text-xl font-semibold">{brand.brandName}</p>
              <p className="text-xs text-white/75">{brand.baseCity}</p>
            </div>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-white/80">
            Curated small-group Karnataka road trips from Bengaluru, strictly capped at six travellers per car.
          </p>
          {socials.length > 0 && (
            <ul className="flex gap-2" aria-label="Sanchari on social media">
              {socials.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="glass flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/25"
                  >
                    <s.icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          {social.whatsappChannelUrl && <WhatsAppChannelButton href={social.whatsappChannelUrl} />}
          {brand.isCopyDraft && (
            <p className="glass rounded-xl px-3 py-2 text-xs text-white/85">
              Some itineraries, prices and policy text on this site are samples awaiting final owner sign-off.
            </p>
          )}
        </div>

        <div className="space-y-2.5 text-sm">
          <p className="font-semibold">Explore</p>
          <ul className="space-y-0.5 text-white/80 md:space-y-2">
            <li><Link href="/trips" className="inline-flex min-h-9 items-center hover:text-white md:min-h-0">All departures</Link></li>
            <li><Link href="/trips?mode=private" className="inline-flex min-h-9 items-center hover:text-white md:min-h-0">Book the whole car</Link></li>
            <li><Link href="/about" className="inline-flex min-h-9 items-center hover:text-white md:min-h-0">About Sanchari</Link></li>
            <li><Link href="/blog" className="inline-flex min-h-9 items-center hover:text-white md:min-h-0">Blog &amp; trip videos</Link></li>
            <li><Link href="/safety" className="inline-flex min-h-9 items-center hover:text-white md:min-h-0">Safety &amp; comfort</Link></li>
            <li><Link href="/booking-lookup" className="inline-flex min-h-9 items-center hover:text-white md:min-h-0">Find my booking</Link></li>
            <li><Link href="/creators" className="inline-flex min-h-9 items-center hover:text-white md:min-h-0">Creators programme</Link></li>
          </ul>
        </div>

        <div className="space-y-2.5 text-sm">
          <p className="font-semibold">Policies &amp; support</p>
          <ul className="space-y-0.5 text-white/80 md:space-y-2">
            <li><Link href="/policies#terms" className="inline-flex min-h-9 items-center hover:text-white md:min-h-0">Terms</Link></li>
            <li><Link href="/policies#privacy" className="inline-flex min-h-9 items-center hover:text-white md:min-h-0">Privacy</Link></li>
            <li><Link href="/policies#refunds" className="inline-flex min-h-9 items-center hover:text-white md:min-h-0">Cancellation &amp; refunds</Link></li>
            <li><Link href="/contact" className="inline-flex min-h-9 items-center hover:text-white md:min-h-0">Contact &amp; WhatsApp</Link></li>
            {looksSet(brand.supportEmail) && (
              <li>
                <a href={`mailto:${brand.supportEmail}`} className="inline-flex items-center gap-1.5 hover:text-white">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {brand.supportEmail}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/15 px-4 py-4 text-center text-xs text-white/70">
        © {new Date().getFullYear()} {looksSet(brand.legalEntityName) ? brand.legalEntityName : brand.brandName} — {brand.baseCity}
      </div>
    </footer>
  );
}
