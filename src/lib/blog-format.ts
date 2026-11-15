import { isSafeMediaLink } from "@/lib/blog";

/**
 * Blog story formatting (Admin → Blog & videos → Story). A small, safe set of marks the editor's
 * buttons insert; the website turns them into headings, lists, quotes, photos and alignment.
 * No HTML is ever taken from the text, so a story can't break or attack the page.
 *
 *   ## Heading             ### Small heading        **bold**   *italic*   [link text](https://…)
 *   - point                1. numbered point        > quote    ---  (divider)
 *   ![Caption](photo link) ![Logo: name](logo link)  (a logo shows small and centred)
 *   :::center … :::        :::right … :::           (align the lines between)
 */

export type Align = "left" | "center" | "right";

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "italic"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "br" };

export type Block =
  | { type: "p"; align: Align; inline: Inline[] }
  | { type: "h2" | "h3"; align: Align; inline: Inline[] }
  | { type: "ul" | "ol"; align: Align; items: Inline[][]; start?: number; emoji?: string[] }
  | { type: "quote"; align: Align; inline: Inline[] }
  | { type: "img"; align: Align; src: string; caption: string; logo: boolean }
  | { type: "hr" };

const SAFE_HREF = /^(https:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

/** **bold**, *italic* / _italic_, [text](link) and line breaks inside a paragraph. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) out.push({ kind: "text", text: buf });
    buf = "";
  };
  while (i < text.length) {
    const rest = text.slice(i);
    if (rest.startsWith("\n")) {
      flush();
      out.push({ kind: "br" });
      i += 1;
      continue;
    }
    const bold = /^\*\*([^*\n](?:[^\n]*?[^*\n])?)\*\*/.exec(rest);
    if (bold) {
      flush();
      out.push({ kind: "bold", children: parseInline(bold[1]) });
      i += bold[0].length;
      continue;
    }
    const italic = /^(\*|_)([^*_\n](?:[^\n]*?[^*_\n])?)\1/.exec(rest);
    if (italic && (i === 0 || /[\s(["'-]/.test(text[i - 1]))) {
      flush();
      out.push({ kind: "italic", children: parseInline(italic[2]) });
      i += italic[0].length;
      continue;
    }
    const link = /^\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/.exec(rest);
    if (link && SAFE_HREF.test(link[2])) {
      flush();
      out.push({ kind: "link", href: link[2], children: parseInline(link[1]) });
      i += link[0].length;
      continue;
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return out;
}

const IMAGE_LINE = /^!\[([^\]]{0,200})\]\(([^)\s]{1,500})\)$/;
const ALIGN_OPEN = /^:::\s*(left|center|centre|right)\s*$/i;
const ALIGN_CLOSE = /^:::\s*$/;

export function parseBlogBody(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let align: Align = "left";
  let para: string[] = [];
  let quote: string[] = [];
  let list: { type: "ul" | "ol"; items: string[]; start: number; emoji: string[] } | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", align, inline: parseInline(para.join("\n")) });
    para = [];
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ type: "quote", align, inline: parseInline(quote.join("\n")) });
    quote = [];
  };
  const flushList = () => {
    if (list && list.items.length) {
      const hasEmoji = list.emoji.length === list.items.length && list.emoji.every(Boolean);
      blocks.push({
        type: list.type,
        align,
        items: list.items.map(parseInline),
        ...(list.type === "ol" && list.start !== 1 ? { start: list.start } : {}),
        ...(hasEmoji ? { emoji: list.emoji } : {}),
      });
    }
    list = null;
  };
  const flushAll = () => {
    flushPara();
    flushQuote();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.trim();
    const open = ALIGN_OPEN.exec(line);
    if (open) {
      flushAll();
      const a = open[1].toLowerCase();
      align = a === "centre" ? "center" : (a as Align);
      continue;
    }
    if (ALIGN_CLOSE.test(line)) {
      flushAll();
      align = "left";
      continue;
    }
    if (!line) {
      flushAll();
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushAll();
      blocks.push({ type: "hr" });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushAll();
      blocks.push({ type: heading[1].length === 3 ? "h3" : "h2", align, inline: parseInline(heading[2]) });
      continue;
    }
    const img = IMAGE_LINE.exec(line);
    if (img) {
      flushAll();
      if (isSafeMediaLink(img[2])) {
        const caption = img[1].trim();
        const logo = /^logo\b/i.test(caption);
        blocks.push({ type: "img", align: logo && align === "left" ? "center" : align, src: img[2], caption: caption.replace(/^logo\s*[:\-–]?\s*/i, ""), logo });
      }
      continue;
    }
    const quoteLine = /^>\s?(.*)$/.exec(line);
    if (quoteLine) {
      flushPara();
      flushList();
      quote.push(quoteLine[1]);
      continue;
    }
    const bullet = /^[-*•]\s+(.+)$/.exec(line);
    const numbered = /^(\d{1,3})[.)]\s+(.+)$/.exec(line);
    // A line that starts with an emoji ("📱 Mobile phone") is a point with the emoji as its bullet.
    const emojiLine = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*(.+)$/u.exec(line);
    if (bullet || numbered || emojiLine) {
      flushPara();
      flushQuote();
      const type = numbered ? "ol" : "ul";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [], start: numbered ? Number(numbered[1]) : 1, emoji: [] };
      }
      if (numbered) list.items.push(numbered[2]);
      else if (bullet) {
        list.items.push(bullet[1]);
        list.emoji.push("");
      } else {
        list.items.push(emojiLine![2]);
        list.emoji.push(emojiLine![1]);
      }
      continue;
    }
    flushQuote();
    flushList();
    para.push(line);
  }
  flushAll();
  return blocks.map((b, i) => {
    const next = blocks[i + 1];
    if (b.type === "ol" && b.items.length === 1 && next && next.type !== "ol" && next.type !== "hr") {
      const n = b.start ?? 1;
      return { type: "h3" as const, align: b.align, inline: [{ kind: "text" as const, text: `${n}. ` }, ...b.items[0]] };
    }
    return b;
  });
}

/** Plain text of a story (for reading time and the search description). */
export function blogPlainText(source: string): string {
  return source
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^:::.*$/gm, " ")
    .replace(/[#>*_`-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
