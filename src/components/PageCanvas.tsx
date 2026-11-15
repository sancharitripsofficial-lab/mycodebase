/** Colour themes for the page backgrounds (classes `canvas-*` in globals.css). */
export type CanvasTheme = "trips" | "karnataka" | "blog" | "faqs" | "safety" | "policies" | "contact" | "booking" | "about";

/**
 * The page's own background: a colour combination, a light pattern and soft colour glows that
 * drift slowly (still when the visitor prefers less motion). It sits behind everything, so text,
 * cards, banners and 3D scenes on the page are untouched. Pure CSS: no script, no image download.
 */
export function PageCanvas({ theme }: { theme: CanvasTheme }) {
  return (
    <div aria-hidden="true" className={`page-canvas canvas-${theme}`}>
      <span className="page-glow page-glow-a" />
      <span className="page-glow page-glow-b" />
      <span className="page-glow page-glow-c" />
    </div>
  );
}
