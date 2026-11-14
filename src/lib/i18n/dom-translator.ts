import { translatePattern } from "./patterns";

/**
 * Switches the visible page between English and Kannada without changing the React tree:
 * text nodes and a few text attributes get their Kannada wording (dictionary first, then the
 * live-value patterns), and the English is kept so switching back restores it exactly.
 *
 * Safe with React: only `nodeValue` and attributes change, never nodes. When React later writes
 * new English into a node (seats changed, a new page), the observer translates it again.
 * Anything inside [data-no-translate] or translate="no", form fields and code is left alone.
 */

const ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;
const SKIP = "script,style,noscript,code,pre,textarea,svg,[data-no-translate],[translate='no'],[contenteditable='true']";

const normalise = (s: string) => s.replace(/\s+/g, " ").trim();
/** Any Latin letter (so "3D / 2N" counts); numbers and prices alone are left alone. */
const hasWords = (s: string) => /[A-Za-z]/.test(s);

export type Dictionary = Map<string, string>;

/** Kannada for one English text (whitespace-insensitive), or null. Exported for tests. */
export function translateText(english: string, dict: Dictionary): string | null {
  const core = normalise(english);
  if (!core || !hasWords(core)) return null;
  const direct = dict.get(core);
  if (direct !== undefined) return direct;
  return translatePattern(core, (s) => dict.get(normalise(s)));
}

export class DomTranslator {
  private dict: Dictionary;
  private root: HTMLElement;
  /** English we last saw in each node, and the Kannada we wrote into it. */
  private texts = new Map<Text, { en: string; kn: string }>();
  private attrs = new Map<Element, Map<string, { en: string; kn: string }>>();
  private observer: MutationObserver | null = null;
  private pending = new Set<Node>();
  private raf = 0;
  private titleEn: string | null = null;

  constructor(root: HTMLElement, dict: Dictionary) {
    this.root = root;
    this.dict = dict;
  }

  /** Translate everything now and keep translating whatever React changes or adds. */
  start(): void {
    this.translateSubtree(this.root);
    this.translateTitle();
    this.observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") this.pending.add(r.target);
        else if (r.type === "attributes") this.pending.add(r.target);
        else r.addedNodes.forEach((n) => this.pending.add(n));
      }
      if (!this.raf) this.raf = requestAnimationFrame(() => this.flush());
    });
    this.observer.observe(this.root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });
    const title = document.querySelector("title");
    if (title) this.observer.observe(title, { childList: true, characterData: true, subtree: true });
  }

  /** Stop and put every English text back. */
  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pending.clear();
    for (const [node, t] of this.texts) {
      if (node.isConnected && node.nodeValue === t.kn) node.nodeValue = t.en;
    }
    for (const [el, map] of this.attrs) {
      if (!el.isConnected) continue;
      for (const [name, a] of map) if (el.getAttribute(name) === a.kn) el.setAttribute(name, a.en);
    }
    this.texts.clear();
    this.attrs.clear();
    if (this.titleEn !== null && document.title !== this.titleEn) document.title = this.titleEn;
    this.titleEn = null;
  }

  private flush(): void {
    this.raf = 0;
    const nodes = [...this.pending];
    this.pending.clear();
    for (const n of nodes) {
      if (!n.isConnected) continue;
      if (n.nodeType === Node.TEXT_NODE) this.translateTextNode(n as Text);
      else if (n.nodeType === Node.ELEMENT_NODE) this.translateSubtree(n as Element);
    }
    this.translateTitle();
    // Forget nodes React has removed (keeps memory flat on long visits).
    if (this.texts.size > 4000) for (const node of this.texts.keys()) if (!node.isConnected) this.texts.delete(node);
  }

  private skipped(el: Element | null): boolean {
    return !el || Boolean(el.closest(SKIP));
  }

  private translateSubtree(start: Element): void {
    if (this.skipped(start)) return;
    this.translateAttrs(start);
    for (const el of start.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(","))) {
      if (!this.skipped(el)) this.translateAttrs(el);
    }
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (this.skipped(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let n: Node | null;
    while ((n = walker.nextNode())) this.translateTextNode(n as Text);
  }

  private translateTextNode(node: Text): void {
    const value = node.nodeValue ?? "";
    const known = this.texts.get(node);
    if (known && value === known.kn) return; // our own writing
    if (this.skipped(node.parentElement)) return;
    const kn = translateText(value, this.dict);
    if (kn === null) {
      if (known) this.texts.delete(node);
      return;
    }
    // Keep the spaces around the words (they separate it from the next element).
    const lead = value.match(/^\s*/)?.[0] ?? "";
    const trail = value.match(/\s*$/)?.[0] ?? "";
    const out = lead + kn + trail;
    this.texts.set(node, { en: value, kn: out });
    if (out !== value) node.nodeValue = out;
  }

  private translateAttrs(el: Element): void {
    for (const name of ATTRS) {
      const value = el.getAttribute(name);
      if (!value) continue;
      let map = this.attrs.get(el);
      const known = map?.get(name);
      if (known && value === known.kn) continue;
      const kn = translateText(value, this.dict);
      if (kn === null) continue;
      if (!map) {
        map = new Map();
        this.attrs.set(el, map);
      }
      map.set(name, { en: value, kn });
      if (kn !== value) el.setAttribute(name, kn);
    }
  }

  private translateTitle(): void {
    const current = document.title;
    if (this.titleEn !== null && current === this.translatedTitle) return;
    const kn = translateText(current, this.dict) ?? translateTitleParts(current, this.dict);
    if (kn === null) return;
    this.titleEn = current;
    this.translatedTitle = kn;
    if (kn !== current) document.title = kn;
  }
  private translatedTitle = "";
}

/** Page titles are "Trip name | Sanchari • Micro Trips": translate each part on its own. */
function translateTitleParts(title: string, dict: Dictionary): string | null {
  const parts = title.split(" | ");
  if (parts.length < 2) return null;
  let changed = false;
  const out = parts.map((p) => {
    const kn = translateText(p, dict);
    if (kn !== null) changed = true;
    return kn ?? p;
  });
  return changed ? out.join(" | ") : null;
}
