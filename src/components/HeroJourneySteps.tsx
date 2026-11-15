import { BedDouble, Camera, Car, House, MapPin, type LucideIcon } from "lucide-react";
import { JOURNEY_STEP_KEYS, JOURNEY_STEP_LABELS, type JourneyStepKey } from "@/lib/home-content";

const ICONS: Record<JourneyStepKey, LucideIcon> = { pickup: MapPin, journey: Car, moments: Camera, stay: BedDouble, drop: House };

/**
 * Pick-up → Journey → Moments → Stay → Drop, see-through over the home film (like the route map):
 * a glowing dot travels the route and each step lights up as it passes. Steps the owner marks as
 * not offered yet show a dashed ring and an "Upcoming" tag. Pure CSS (no script, nothing to download);
 * still for visitors who prefer less motion.
 */
export function HeroJourneySteps({ upcoming = [] }: { upcoming?: JourneyStepKey[] }) {
  return (
    <div className="hero-steps relative">
      {/* Thin glass edge, faded at the ends, so the film shows straight through. */}
      <div aria-hidden="true" className="hero-steps-glass absolute inset-0 rounded-2xl border border-white/20 ring-1 ring-inset ring-white/10" />
      <ol aria-label="Your trip, end to end" className="relative grid grid-cols-5 px-1 pt-5 pb-2 sm:px-3">
        {/* The route between the first and last step: dashed, filling teal → sunset as the dot moves. */}
        <span aria-hidden="true" className="absolute top-[38px] right-[10%] left-[10%] h-0.5 -translate-y-1/2">
          <span className="absolute inset-0 rounded-full bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.55)_0_7px,transparent_7px_12px)]" />
          <span className="hero-steps-fill absolute inset-0 origin-left rounded-full bg-[linear-gradient(90deg,#1ba3b3,#7ec8c0_45%,#f5a524_75%,#ff8a3d)]" />
          <span className="hero-steps-car absolute inset-0">
            <span className="absolute top-1/2 left-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff8a3d] shadow-[0_0_0_4px_rgb(255_138_61/0.3),0_0_14px_rgb(255_138_61/0.8)]" />
          </span>
        </span>

        {JOURNEY_STEP_KEYS.map((key, i) => {
          const Icon = ICONS[key];
          const soon = upcoming.includes(key);
          return (
            <li key={key} className="relative flex min-w-0 flex-col items-center">
              {soon && (
                <span className="journey-soon absolute -top-[16px] left-1/2 z-20 -translate-x-1/2 rounded-full bg-saffron-500 px-1.5 py-px text-[8.5px] leading-[1.45] font-extrabold tracking-wide whitespace-nowrap text-forest-900 uppercase shadow-[0_2px_8px_-2px_rgb(0_0_0/0.5)] sm:text-[9.5px]">
                  Upcoming
                </span>
              )}
              <span
                style={{ ["--i" as string]: i }}
                className={`hero-steps-dot relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-full ${
                  soon
                    ? "border-[1.5px] border-dashed border-white/80 bg-white/10 text-white"
                    : "border border-white/70 bg-white/85 text-forest-900 shadow-[0_4px_12px_-4px_rgb(0_0_0/0.45)]"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className={`mt-1.5 max-w-full truncate px-0.5 text-center text-[11px] leading-tight font-semibold [text-shadow:0_1px_3px_rgb(10_40_30/0.6)] sm:text-xs ${soon ? "text-white/80" : "text-white"}`}>
                {JOURNEY_STEP_LABELS[key]}
                {soon && <span className="sr-only"> (upcoming)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
