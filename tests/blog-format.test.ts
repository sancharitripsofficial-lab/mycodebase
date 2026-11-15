import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlogBody } from "@/components/blog/BlogBody";
import { blogPlainText, parseBlogBody, parseInline } from "@/lib/blog-format";

describe("blog story formatting", () => {
  it("makes paragraphs, headings, points, numbered points, quotes and dividers", () => {
    const blocks = parseBlogBody(
      [
        "## Packing for Coorg",
        "Bring layers.",
        "Mornings are cold.",
        "",
        "- Rain jacket",
        "- Walking shoes",
        "",
        "1. Pack light",
        "2. Carry cash",
        "",
        "> Best weekend of my year!",
        "---",
        "### Day 2",
      ].join("\n")
    );
    expect(blocks.map((b) => b.type)).toEqual(["h2", "p", "ul", "ol", "quote", "hr", "h3"]);
    const ul = blocks[2] as { items: unknown[] };
    expect(ul.items).toHaveLength(2);
  });

  it("aligns the lines between :::center and :::", () => {
    const blocks = parseBlogBody(":::center\nThank you!\n:::\nBack to normal");
    expect(blocks).toMatchObject([
      { type: "p", align: "center" },
      { type: "p", align: "left" },
    ]);
  });

  it("shows photos and small centred logos, never unsafe links", () => {
    const blocks = parseBlogBody(
      ["![Sunrise at Raja's Seat](/media/dest-coorg.jpg)", "![Logo: Sanchari](/brand/sanchari-logo.png)", "![x](javascript:alert(1))"].join("\n")
    );
    expect(blocks.slice(0, 2)).toMatchObject([
      { type: "img", src: "/media/dest-coorg.jpg", caption: "Sunrise at Raja's Seat", logo: false },
      { type: "img", src: "/brand/sanchari-logo.png", caption: "Sanchari", logo: true, align: "center" },
    ]);
    // The unsafe line is never a picture or a link; at most it shows as plain text.
    expect(blocks.filter((b) => b.type === "img")).toHaveLength(2);
    expect(blocks.slice(2).every((b) => b.type === "p")).toBe(true);
  });

  it("handles bold, italic and safe links inside text", () => {
    expect(parseInline("A **big** and *calm* trip")).toEqual([
      { kind: "text", text: "A " },
      { kind: "bold", children: [{ kind: "text", text: "big" }] },
      { kind: "text", text: " and " },
      { kind: "italic", children: [{ kind: "text", text: "calm" }] },
      { kind: "text", text: " trip" },
    ]);
    expect(parseInline("[Book](/trips)")[0]).toMatchObject({ kind: "link", href: "/trips" });
    expect(parseInline("[bad](javascript:alert(1))")[0]).toMatchObject({ kind: "text" });
  });

  it("never puts the story's own HTML on the page", () => {
    const html = renderToStaticMarkup(createElement(BlogBody, { text: '<script>alert(1)</script>\n<img src=x onerror=alert(1)>' }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("old plain stories still read as paragraphs", () => {
    const blocks = parseBlogBody("First paragraph.\n\nSecond paragraph\nwith a line break.");
    expect(blocks.map((b) => b.type)).toEqual(["p", "p"]);
    expect(blogPlainText("## Hi\n- **one**\n![x](/a.jpg)")).toBe("Hi one");
  });
});
