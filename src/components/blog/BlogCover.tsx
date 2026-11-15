import Image from "next/image";
import { isSafeMediaLink } from "@/lib/blog";
import { isOptimizableImage } from "@/lib/media";
import { BlogVideo } from "./BlogVideo";

/**
 * The top of a story: its video (with the cover photo until play), or — for a photo story — the
 * cover photo itself, served at the right size (AVIF/WebP) with a soft cinematic finish.
 */
export function BlogCover({
  videoUrl,
  posterUrl,
  title,
  priority = false,
  className = "",
}: {
  videoUrl: string;
  posterUrl: string;
  title: string;
  priority?: boolean;
  className?: string;
}) {
  if (videoUrl && isSafeMediaLink(videoUrl)) {
    return <BlogVideo src={videoUrl} poster={posterUrl} title={title} className={className} />;
  }
  if (!posterUrl || !isSafeMediaLink(posterUrl)) return null;
  return (
    <div
      className={`relative aspect-[16/9] w-full overflow-hidden rounded-3xl bg-[#0f2b2b] shadow-[0_28px_70px_-30px_rgb(13_95_107/0.65)] ring-1 ring-black/5 ${className}`}
    >
      {isOptimizableImage(posterUrl) ? (
        <Image
          src={posterUrl}
          alt={title}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 960px, 100vw"
          className="object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterUrl} alt={title} loading={priority ? "eager" : "lazy"} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
    </div>
  );
}

/** Small card picture for the story list: the cover photo at card size; a play badge on videos. */
export function BlogCardImage({ posterUrl, hasVideo, title }: { posterUrl: string; hasVideo: boolean; title: string }) {
  const safe = posterUrl && isSafeMediaLink(posterUrl) ? posterUrl : "";
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-forest-900 to-[#0b4f5a]">
      {safe &&
        (isOptimizableImage(safe) ? (
          <Image
            src={safe}
            alt={title}
            fill
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition duration-700 group-hover:scale-105"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={safe} alt={title} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
        ))}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold tracking-wide text-forest-900 uppercase shadow">
        {hasVideo ? "▶ Video story" : "Photo story"}
      </span>
    </div>
  );
}
