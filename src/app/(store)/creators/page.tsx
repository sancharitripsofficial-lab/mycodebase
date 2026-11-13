import { BadgeCheck, Camera, Sparkles, Ticket } from "lucide-react";
import type { Metadata } from "next";
import { CreatorApplyForm } from "@/components/CreatorApplyForm";
import { followersLabel, getPublicTiers, rewardLabel } from "@/lib/data/creators";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Creators programme",
  description: "Travel creators with an audience can earn discounts or free seats on Sanchari road trips.",
};

export default async function CreatorsPage() {
  const tiers = await getPublicTiers();

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-12 sm:px-6">
      <header className="space-y-3">
        <p className="eyebrow text-copper-700">Sanchari creators</p>
        <h1 className="font-display text-3xl font-semibold text-forest-900 sm:text-5xl">Travel with us. Tell the story.</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-stone-600 sm:text-base">
          If you create travel, food or lifestyle content, your audience can earn you a discount — or a free seat — on our small-group
          Karnataka road trips. The bigger your following, the bigger the reward.
        </p>
      </header>

      <section aria-labelledby="rewards" className="space-y-4">
        <h2 id="rewards" className="font-display text-2xl font-semibold text-forest-900">
          Rewards by followers
        </h2>
        {tiers.length === 0 ? (
          <p className="card-soft p-5 text-sm text-stone-600">Reward ranges are being finalised — apply now and we&apos;ll tell you yours.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tiers.map((t) => (
              <li key={t.id} className={`tile ${["tile-sunset", "tile-lagoon", "tile-amber", "tile-leaf", "tile-rose"][tiers.indexOf(t) % 5]} space-y-2 p-5`}>
                <p className="text-xs font-bold tracking-wider text-copper-700 uppercase">{t.label}</p>
                <p className="font-display text-2xl font-semibold text-forest-900">{rewardLabel(t)}</p>
                <p className="text-sm text-stone-600">{followersLabel(t)}</p>
                <p className="text-xs text-stone-500">Code valid for {t.validDays} days, one booking.</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="how" className="grid gap-3 sm:grid-cols-4">
        <h2 id="how" className="sr-only">
          How it works
        </h2>
        {[
          { icon: Camera, title: "Apply", text: "Send your profile link and follower count." },
          { icon: BadgeCheck, title: "We verify", text: "We check your public profile and real follower count." },
          { icon: Ticket, title: "Get your code", text: "A personal one-time code on WhatsApp, matched to your range." },
          { icon: Sparkles, title: "Travel & share", text: "Book any open date with your code, then share your story." },
        ].map((s, i) => (
          <div key={s.title} className={`tile ${["tile-lagoon", "tile-sunset", "tile-leaf", "tile-amber"][i % 4]} space-y-2 p-4`}>
            <s.icon className="h-6 w-6 text-copper-600" aria-hidden="true" />
            <p className="font-semibold text-ink-900">
              {i + 1}. {s.title}
            </p>
            <p className="text-sm text-stone-600">{s.text}</p>
          </div>
        ))}
      </section>

      <div className="mx-auto max-w-2xl">
        <CreatorApplyForm />
      </div>
    </div>
  );
}
