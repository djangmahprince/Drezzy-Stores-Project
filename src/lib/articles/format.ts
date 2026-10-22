// Article text. Pure, no imports, so the shop, the editor preview and the tests share it.
//
// The editor writes plain text, no markup to learn:
//   a blank line starts a new paragraph
//   a line starting with "## " is a heading
//   lines starting with "- " make a bullet list
// Nothing is ever treated as HTML, so an article can never inject a script into the shop.

export type Block = { t: "h"; text: string } | { t: "p"; text: string } | { t: "ul"; items: string[] };

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
