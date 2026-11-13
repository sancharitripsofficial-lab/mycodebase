import { Instagram, PlayCircle } from "lucide-react";
import { classifyVideoLink } from "@/lib/media";
import type { VideoLink } from "@/lib/types";

/** Videos the owner added in Admin → Trips → Photos & videos. */
export function TripVideos({ videos, title }: { videos: VideoLink[]; title: string }) {
  if (videos.length === 0) return null;
  const items = videos.map((v) => ({ ...v, kind: classifyVideoLink(v.url) }));
  const players = items.filter((v) => v.kind.kind === "youtube" || v.kind.kind === "file");
  const links = items.filter((v) => v.kind.kind === "instagram" || v.kind.kind === "link");

  return (
    <section className="space-y-4" aria-labelledby="trip-videos">
      <h2 id="trip-videos" className="font-display text-2xl font-semibold text-forest-900">
        Watch the road
      </h2>
      {players.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {players.map((v, i) => (
            <figure key={`${v.url}-${i}`} className="card-soft overflow-hidden">
              <div className="relative aspect-video bg-gradient-to-br from-[#14523f] to-[#0d6b73]">
                {v.kind.kind === "youtube" ? (
                  <iframe
                    src={v.kind.embedUrl}
                    title={`${title}: ${v.label}`}
                    loading="lazy"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="absolute inset-0 h-full w-full"
                  />
                ) : (
                  <video src={v.url} controls preload="metadata" playsInline className="absolute inset-0 h-full w-full object-contain" />
                )}
              </div>
              <figcaption className="px-4 py-2.5 text-sm font-medium text-ink-900">{v.label}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((v, i) => (
            <a
              key={`${v.url}-${i}`}
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-forest-900 transition hover:border-copper-600 hover:text-copper-700"
            >
              {v.kind.kind === "instagram" ? <Instagram className="h-4 w-4" aria-hidden="true" /> : <PlayCircle className="h-4 w-4" aria-hidden="true" />}
              {v.label}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
