import type { CSSProperties, ElementType, ReactNode } from "react";

export interface RevealProps {
  children: ReactNode;
  /** Element to render, e.g. "section", "li", "h2". Default "div". */
  as?: ElementType;
  /**
   * Stagger in ms. Used for the on-load entrance (`onLoad`); scroll reveals follow the scroll
   * position instead, so siblings naturally rise one after another.
   */
  delay?: number;
  /** Above-the-fold copy: a short CSS entrance when the page opens instead of a scroll reveal. */
  onLoad?: boolean;
  className?: string;
  id?: string;
}

/**
 * Reveal wrapper with no JavaScript: content is painted with the HTML, never held back until
 * the page's script wakes up. Supported browsers let blocks rise in as they scroll into view
 * (compositor-driven, smooth); others show them straight away.
 */
export function Reveal({ children, as, delay = 0, onLoad = false, className, id }: RevealProps) {
  const Tag: ElementType = as ?? "div";
  const base = onLoad ? "enter-up" : "reveal-in";
  const style: CSSProperties | undefined =
    onLoad && delay > 0 ? ({ "--enter-delay": `${delay}ms` } as CSSProperties) : undefined;

  return (
    <Tag id={id} className={className ? `${base} ${className}` : base} style={style}>
      {children}
    </Tag>
  );
}
