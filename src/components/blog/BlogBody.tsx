import { Fragment, type ReactNode } from "react";
import { type Align, type Inline, parseBlogBody } from "@/lib/blog-format";

const ALIGN: Record<Align, string> = { left: "text-left", center: "text-center", right: "text-right" };

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.kind) {
      case "text":
        return <Fragment key={i}>{n.text}</Fragment>;
      case "br":
        return <br key={i} />;
      case "bold":
        return (
          <strong key={i} className="font-semibold text-ink-900">
            {renderInline(n.children)}
          </strong>
        );
      case "italic":
        return <em key={i}>{renderInline(n.children)}</em>;
      case "link": {
        const external = /^https:\/\//i.test(n.href);
        return (
          <a
            key={i}
            href={n.href}
            className="font-semibold text-copper-700 underline decoration-copper-700/40 underline-offset-2 hover:decoration-copper-700"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {renderInline(n.children)}
          </a>
        );
      }
    }
  });
}

/** A formatted blog story (see src/lib/blog-format.ts for the marks the admin editor inserts). */
export function BlogBody({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseBlogBody(text);
  if (blocks.length === 0) return null;
  return (
    <div className={`max-w-3xl space-y-5 text-[1.05rem] leading-[1.75] text-ink-900/90 ${className}`}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "hr":
            return <hr key={i} className="mx-auto my-8 w-24 border-0 border-t-2 border-copper-600/40" />;
          case "img":
            return (
              <figure key={i} className={`${ALIGN[b.align]} ${b.logo ? "py-2" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.src}
                  alt={b.caption || (b.logo ? "Logo" : "Trip photo")}
                  loading="lazy"
                  decoding="async"
                  className={
                    b.logo
                      ? "inline-block max-h-24 w-auto max-w-[220px] object-contain"
                      : "w-full rounded-3xl object-cover shadow-[0_24px_60px_-28px_rgb(13_95_107/0.55)]"
                  }
                />
                {b.caption && !b.logo && <figcaption className="mt-2 text-center text-sm text-stone-600 italic">{b.caption}</figcaption>}
              </figure>
            );
          case "h2":
            return (
              <h2 key={i} className={`pt-2 font-display text-2xl leading-snug font-semibold text-forest-900 sm:text-[1.75rem] ${ALIGN[b.align]}`}>
                {renderInline(b.inline)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className={`pt-1 font-display text-xl leading-snug font-semibold text-forest-900 ${ALIGN[b.align]}`}>
                {renderInline(b.inline)}
              </h3>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className={`rounded-r-2xl border-l-4 border-copper-600 bg-peach-100/60 px-5 py-4 font-display text-lg leading-relaxed text-forest-900 italic ${ALIGN[b.align]}`}
              >
                {renderInline(b.inline)}
              </blockquote>
            );
          case "ul":
          case "ol": {
            if (b.emoji) {
              // Emoji points: the emoji is the bullet, in a soft card.
              return (
                <ul key={i} className="space-y-2 rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[var(--shadow-soft)]">
                  {b.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-3">
                      <span aria-hidden="true" className="w-7 shrink-0 text-center text-xl leading-7">
                        {b.emoji![j]}
                      </span>
                      <span className="min-w-0 pt-0.5">{renderInline(item)}</span>
                    </li>
                  ))}
                </ul>
              );
            }
            const List = b.type;
            return (
              <List
                key={i}
                start={b.type === "ol" ? b.start : undefined}
                className={`space-y-2 pl-6 ${b.type === "ul" ? "list-disc marker:text-copper-600" : "list-decimal marker:font-semibold marker:text-forest-800"} ${ALIGN[b.align]}`}
              >
                {b.items.map((item, j) => (
                  <li key={j} className="pl-1">
                    {renderInline(item)}
                  </li>
                ))}
              </List>
            );
          }
          default:
            return (
              <p key={i} className={ALIGN[b.align]}>
                {renderInline(b.inline)}
              </p>
            );
        }
      })}
    </div>
  );
}
