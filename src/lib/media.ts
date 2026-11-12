/**
 * Media helpers shared by the storefront and admin.
 * Local files and Supabase Storage uploads go through Next's image optimiser; any other
 * https link the owner pastes is shown as-is (unoptimized) so the page never breaks.
 */
export function isOptimizableImage(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
    const u = new URL(url);
    return Boolean(supabase && u.hostname === supabase && u.pathname.startsWith("/storage/v1/object/public/"));
  } catch {
    return false;
  }
}

export type VideoKind =
  | { kind: "youtube"; embedUrl: string }
  | { kind: "instagram"; url: string }
  | { kind: "file"; url: string }
  | { kind: "link"; url: string };

/** Decide how to show a video link: YouTube embed, Instagram button, uploaded file player, or plain link. */
export function classifyVideoLink(url: string): VideoKind {
  try {
    if (/\.(mp4|webm)(\?|$)/i.test(url)) return { kind: "file", url };
    const u = new URL(url, "https://local.invalid");
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (/^[\w-]{6,20}$/.test(id)) return { kind: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,20})/)?.[1] ?? null;
      if (id && /^[\w-]{6,20}$/.test(id)) {
        return { kind: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
      }
    }
    if (host === "instagram.com") return { kind: "instagram", url };
    return { kind: "link", url };
  } catch {
    return { kind: "link", url };
  }
}
