import { isSafeMediaLink } from "@/lib/blog";

/**
 * A story video: steady 16:9 frame (no layout jump), the visitor presses play (no surprise sound),
 * the cover picture shows until then, and only the first bytes load until they do.
 */
export function BlogVideo({ src, poster, title, className = "" }: { src: string; poster?: string; title: string; className?: string }) {
  if (!isSafeMediaLink(src)) return null;
  const type = /\.webm(?:[?#]|$)/i.test(src) ? "video/webm" : "video/mp4";
  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-[#0f2b2b] shadow-[0_24px_60px_-28px_rgb(13_95_107/0.6)] ${className}`}>
      <video
        className="absolute inset-0 h-full w-full object-cover"
        controls
        playsInline
        preload="metadata"
        poster={poster && isSafeMediaLink(poster) ? poster : undefined}
        aria-label={title}
        controlsList="nodownload"
      >
        <source src={src} type={type} />
      </video>
    </div>
  );
}
