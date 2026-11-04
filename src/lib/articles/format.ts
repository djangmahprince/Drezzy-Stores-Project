// Article text. Pure, no imports, so the shop, the editor preview and the tests share it.
//
// The editor writes plain text, no markup to learn:
//   a blank line starts a new paragraph
//   a line starting with "## " is a heading
//   lines starting with "- " make a bullet list
//   "> " starts a quote
//   [product: nike-dunk]           a live product card (price and availability from the catalogue)
//   [look: campus-fit]             a Shop the Look block with "Add all to bag"
//   [embed: https://youtu.be/...]  a YouTube, TikTok or Instagram video, loaded only when the reader taps it
//   ![alt text](products/photo.jpg) an image from the media library
//   [gallery: a.jpg, b.jpg]        a row of images
// Nothing is ever treated as HTML, so an article can never inject a script into the shop.

export type Block =
  | { t: "h"; text: string }
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "quote"; text: string }
  | { t: "product"; slug: string }
  | { t: "look"; slug: string }
  | { t: "embed"; provider: "youtube" | "tiktok" | "instagram"; id: string; url: string }
  | { t: "img"; src: string; alt: string }
  | { t: "gallery"; srcs: string[] };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PATH = /^(https:\/\/[^\s]+|[A-Za-z0-9/_.-]+\.(?:jpe?g|png|webp|avif|gif))$/;

/** A supported video link as an embeddable id, or null. Anything else is ignored rather than embedded. */
export function parseEmbed(url: string): { provider: "youtube" | "tiktok" | "instagram"; id: string } | null {
  const u = url.trim();
  let m = u.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/);
  if (m) return { provider: "youtube", id: m[1] };
  m = u.match(/^https:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+\/video\/(\d{6,25})/);
  if (m) return { provider: "tiktok", id: m[1] };
  m = u.match(/^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]{5,20})/);
  if (m) return { provider: "instagram", id: m[1] };
  return null;
}

/** Special one-line blocks, or null for normal text. */
function special(line: string): Block | null {
  let m = line.match(/^\[product:\s*([^\]]+)\]$/i);
  if (m && SLUG.test(m[1].trim())) return { t: "product", slug: m[1].trim() };
  m = line.match(/^\[look:\s*([^\]]+)\]$/i);
  if (m && SLUG.test(m[1].trim())) return { t: "look", slug: m[1].trim() };
  m = line.match(/^\[embed:\s*([^\]]+)\]$/i);
  if (m) {
    const e = parseEmbed(m[1]);
    return e ? { t: "embed", ...e, url: m[1].trim() } : null;
  }
  m = line.match(/^\[gallery:\s*([^\]]+)\]$/i);
  if (m) {
    const srcs = m[1].split(",").map((x) => x.trim()).filter((x) => PATH.test(x)).slice(0, 8);
    return srcs.length ? { t: "gallery", srcs } : null;
  }
  m = line.match(/^!\[([^\]]{0,200})\]\(([^)\s]+)\)$/);
  if (m && PATH.test(m[2])) return { t: "img", alt: m[1].trim(), src: m[2] };
  return null;
}

export function parseBody(body: string | null | undefined): Block[] {
  if (!body) return [];
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    let list: string[] = [];
    let para: string[] = [];
    const flush = () => {
      if (list.length) blocks.push({ t: "ul", items: list });
      if (para.length) blocks.push({ t: "p", text: para.join(" ") });
      list = [];
      para = [];
    };
    for (const line of lines) {
      const sp = special(line);
      if (sp) {
        flush();
        blocks.push(sp);
        continue;
      }
      if (line.startsWith("> ")) {
        flush();
        blocks.push({ t: "quote", text: line.slice(2).trim() });
        continue;
      }
      if (/^##(\s|$)/.test(line)) {
        flush();
        const text = line.slice(2).trim();
        if (text) blocks.push({ t: "h", text });
      } else if (line.startsWith("- ")) {
        if (para.length) flush();
        list.push(line.slice(2).trim());
      } else {
        if (list.length) flush();
        para.push(line);
      }
    }
    flush();
  }
  return blocks;
}

/** Reading time from the text, never below one minute. */
export function readingMinutes(intro: string, body: string | null | undefined): number {
  const words = `${intro} ${body ?? ""}`.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** A web address piece from a title: lower-case words joined by dashes. */
export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Headings, for a table of contents on long guides. */
export const headings = (blocks: Block[]) => blocks.filter((b): b is { t: "h"; text: string } => b.t === "h").map((b) => ({ text: b.text, id: slugFromTitle(b.text) || "section" }));
