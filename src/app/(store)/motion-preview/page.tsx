import { CountUp, HeroCinematic, Reveal, RoadTripRoute, SeatPulse } from "@/components/motion";

export const metadata = { title: "Motion preview", robots: { index: false } };

const STATS = [
  { value: 6, suffix: " seats", label: "Never more than six travelers" },
  { value: 4, suffix: " routes", label: "Hand-picked Karnataka weekends" },
  { value: 48, suffix: " hrs", label: "Door to door, Saturday to Sunday" },
  { value: 4.5, decimals: 1, suffix: " hrs", label: "Typical drive from Bengaluru" },
];

/** Review page for the motion components: each one on the ocean-blue hero and on the light canvas. */
export default function MotionPreviewPage() {
  return (
    <div className="overflow-x-clip bg-[#F2F8FA] text-[#0F2A3D]">
      {/* 1. Video hero + route on dark */}
      <section className="relative isolate overflow-hidden text-[#FFFEFC]">
        <HeroCinematic
          videoSrc="/media/motion/hero-loop.mp4"
          mobileVideoSrc="/media/motion/hero-loop-mobile.mp4"
          posterSrc="/media/motion/hero-loop-poster.jpg"
        />
        <div className="relative mx-auto grid min-h-[560px] max-w-6xl items-center gap-8 px-5 py-16 md:grid-cols-[1.2fr_0.8fr] md:py-24">
          <div>
            <Reveal as="p" className="text-xs font-semibold uppercase tracking-[0.2em] text-[#DDF3F4]">
              HeroCinematic • video
            </Reveal>
            <Reveal as="h1" delay={120} className="font-display mt-3 text-4xl leading-tight sm:text-5xl md:text-6xl">
              Karnataka weekends, six seats at a time.
            </Reveal>
            <Reveal as="p" delay={240} className="mt-4 max-w-md text-base text-[#DDF3F4]">
              Looping mp4 with the photo slideshow as fallback. Scrim: left.
            </Reveal>
            <Reveal delay={360} className="mt-8 flex flex-wrap items-center gap-6">
              <span className="rounded-full bg-[#E8600F] px-6 py-3 text-sm font-semibold text-white">Sample button</span>
              <SeatPulse taken={3} selected={1} tone="onDark" />
            </Reveal>
          </div>
          <RoadTripRoute tone="onDark" labels={["Bengaluru", "Chikmagalur"]} className="mx-auto max-w-[300px] md:max-w-[360px]" />
        </div>
      </section>

      {/* 2. Slideshow hero (no video) */}
      <section className="relative isolate overflow-hidden text-[#FFFEFC]">
        <HeroCinematic scrim="full" />
        <div className="relative mx-auto flex min-h-[440px] max-w-3xl flex-col items-center justify-center px-5 py-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#DDF3F4]">HeroCinematic • slideshow</p>
          <h2 className="font-display mt-3 text-3xl sm:text-5xl">Ken-Burns photos, 6s each, 1.2s crossfade.</h2>
          <p className="mt-4 text-[#DDF3F4]">Scrim: full. Wait about six seconds to see the crossfade.</p>
        </div>
      </section>

      {/* 3. Plain blue band */}
      <section className="bg-gradient-to-br from-[#0B5683] via-[#1373A8] to-[#0C7A8C] text-[#FFFEFC]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#DDF3F4]">On the blue band</p>
            <h2 className="font-display mt-3 text-3xl sm:text-4xl">RoadTripRoute, three stops, drives once.</h2>
            <dl className="mt-8 grid grid-cols-2 gap-6">
              {STATS.map((s) => (
                <div key={s.label}>
                  <dt className="font-display text-4xl">
                    <CountUp value={s.value} decimals={s.decimals} suffix={s.suffix} />
                  </dt>
                  <dd className="mt-1 text-sm text-[#DDF3F4]">{s.label}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8 flex flex-wrap gap-8">
              <SeatPulse taken={0} tone="onDark" />
              <SeatPulse taken={4} selected={2} tone="onDark" />
            </div>
          </div>
          <RoadTripRoute
            tone="onDark"
            loop={false}
            durationMs={6000}
            labels={["Bengaluru", "Hassan", "Chikmagalur"]}
            className="mx-auto max-w-[360px]"
          />
        </div>
      </section>

      {/* 4. Light canvas */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2">
        <RoadTripRoute tone="onLight" labels={["Bengaluru", "Coorg"]} className="mx-auto max-w-[360px]" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0C7A8C]">On the light canvas</p>
          <h2 className="font-display mt-3 text-3xl sm:text-4xl">Same components, light tone.</h2>
          <dl className="mt-8 grid grid-cols-2 gap-6">
            {STATS.map((s) => (
              <div key={s.label}>
                <dt className="font-display text-4xl text-[#0B5683]">
                  <CountUp value={s.value} decimals={s.decimals} suffix={s.suffix} />
                </dt>
                <dd className="mt-1 text-sm text-[#4B6273]">{s.label}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 flex flex-wrap gap-8">
            <SeatPulse taken={2} selected={1} />
            <SeatPulse taken={6} />
            <SeatPulse taken={1} max={4} showLegend={false} />
          </div>
        </div>
      </section>

      {/* 5. Reveal stagger */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <h2 className="font-display text-3xl">Reveal, staggered by 120ms</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {["Chikmagalur", "Coorg", "Gokarna", "Hampi"].map((name, i) => (
            <Reveal
              as="li"
              key={name}
              delay={i * 120}
              className="rounded-2xl border border-[#DCE8EE] bg-[#FFFEFC] p-6 shadow-[0_10px_30px_-18px_rgba(11,86,131,0.45)]"
            >
              <p className="font-display text-xl text-[#0B5683]">{name}</p>
              <p className="mt-2 text-sm text-[#4B6273]">Card {i + 1} rises 16px and fades in once.</p>
            </Reveal>
          ))}
        </ul>
        <p className="mt-10 text-sm text-[#4B6273]">Route with no labels, on light:</p>
        <RoadTripRoute className="mt-4 max-w-[220px]" />
      </section>
    </div>
  );
}
