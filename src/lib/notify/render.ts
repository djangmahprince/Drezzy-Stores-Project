// Every message the platform sends, from an editable template (Settings → Email templates) or the built-in wording.
// Pure, no imports, so the sender, the template editor's test-send and the tests all share it.
//
// Templates use {{variables}}. Values are inserted as plain text: HTML is escaped, so nothing a customer typed
// (a name, a support message) can ever turn into markup in the email.

export type Template = { subject: string; body: string };
export type Rendered = { subject: string; text: string; html: string; short: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ghs = (n: unknown) => (n === null || n === undefined || n === "" ? "" : `GHS ${Number(n).toLocaleString("en-GH")}`);
const first = (name: unknown) => (typeof name === "string" && name.trim() ? name.trim().split(/\s+/)[0] : "there");
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** The built-in wording, used when a template has not been edited (or was switched off). Same keys as the database seed. */
export const defaultTemplates: Record<string, Template> = {
  order_placed: { subject: "We got your order {{number}}", body: "Hi {{first_name}},\n\nThank you for your order. We have it as {{number}}.\n\nTotal {{total}}. {{paid_line}}\n\nTrack your order: {{link}}" },
  order_update: { subject: "{{number}}: {{headline}}", body: "Hi {{first_name}},\n\nAn update on your order {{number}}: {{headline}}.\n\n{{rider_line}}{{balance_line}}{{code_line}}\n\nTrack your order: {{link}}" },
  support_reply: { subject: "Re: {{subject}}", body: "Hi {{first_name}},\n\n{{body}}\n\nReply from the tracking page or your account: {{link}}" },
  stock_back: { subject: "{{product}} is available again", body: "Good news. {{product}} {{size_line}}is available again. It may not last: {{link}}" },
  wishlist_back: { subject: "Back in stock: {{product}}", body: "An item on your wishlist is available again: {{product}}. {{link}}" },
  wishlist_price: { subject: "Price drop: {{product}}", body: "{{product}} on your wishlist is now {{price}} (was {{was}}). {{link}}" },
  drop_open: { subject: "{{product}} is live", body: "The drop you asked about is open now: {{product}}. Limited per customer. {{link}}" },
  feedback_request: { subject: "How did we do with {{number}}?", body: "Hi {{first_name}},\n\nYour order {{number}} was delivered. Tell us how it went in one tap, and review what you bought: {{link}}" },
  abandoned_cart: { subject: "Still thinking about it?", body: "You left items in your bag at Drezzy Stores. They are still available for now: {{link}}\n\nYou are getting this because you asked us to remind you." },
  digest: { subject: "New on Drip School", body: "Fresh from Drip School this week:\n\n{{articles}}\n\nUnsubscribe in one click: {{unsubscribe}}" },
  daily_summary: { subject: "Drezzy today: {{date}}", body: "Paid orders {{orders}} · Sales {{sales}} · Cash in {{cash}} · Balances to collect {{owed}} · Stuck orders {{stuck}}\n\n{{link}}" },
  weekly_report: { subject: "Drezzy week of {{date}}", body: "Paid orders {{orders}} · Sales {{sales}} · Delivered {{delivered}} · On time {{on_time}} · Reports filed {{reports}}\n\n{{link}}" },
  weekly_summary: { subject: "Your week at Drezzy: {{date}}", body: "Hi {{first_name}},\n\nScore {{score}} (last week {{last}}). Wins: {{wins}}. Misses: {{misses}}.\n\n{{link}}" },
  export_ready: { subject: "Your export is ready", body: "Your {{kind}} export ({{rows}} rows) is ready. The link works for 24 hours: {{link}}" },
};

/** The variables a template can use, worked out from the queued message's payload. */
export function variables(template: string, p: Record<string, unknown>, siteUrl: string): Record<string, string> {
  const site = siteUrl.replace(/\/$/, "");
  const number = str(p.number);
  const track = number ? `${site}/track?order=${encodeURIComponent(number)}` : `${site}/account`;
  const product = p.slug ? `${site}/product/${encodeURIComponent(str(p.slug))}` : site;
  const paid = Number(p.paid ?? 0);
  const balance = Number(p.balance ?? 0);
  const link =
    template.startsWith("order_") || template === "feedback_request" || template === "support_reply" ? (template === "support_reply" && !number ? `${site}/account/messages` : track)
      : ["stock_back", "wishlist_back", "wishlist_price", "drop_open"].includes(template) ? product
        : template === "abandoned_cart" ? `${site}/cart`
          : ["daily_summary", "weekly_report", "weekly_summary"].includes(template) ? `${site}/dashboard`
            : template === "export_ready" ? `${site}/dashboard/exports`
              : site;
  const articles = Array.isArray(p.articles)
    ? (p.articles as { title?: string; slug?: string }[]).map((a) => `- ${str(a.title)}: ${site}/drip-school/${encodeURIComponent(str(a.slug))}`).join("\n")
    : "";
  return {
    first_name: first(p.name),
    name: str(p.name),
    number,
    headline: str(p.headline),
    total: ghs(p.total),
    paid: ghs(p.paid),
    balance: ghs(p.balance),
    paid_line: paid > 0 ? `Paid ${ghs(paid)}.${balance > 0 ? ` Balance on delivery ${ghs(balance)}.` : ""}` : "",
    balance_line: balance > 0 && paid > 0 ? `Balance to pay on delivery: ${ghs(balance)}.\n` : "",
    rider_line: p.rider_name ? `Your rider: ${str(p.rider_name)}${p.rider_phone ? `, ${str(p.rider_phone)}` : ""}.\n` : p.courier ? `Courier: ${str(p.courier)}${p.tracking ? `, tracking ${str(p.tracking)}` : ""}.\n` : "",
    code_line: p.delivery_code ? `Your delivery code is ${str(p.delivery_code)}. Give it to the rider when your order arrives.\n` : "",
    subject: str(p.subject),
    body: str(p.body),
    product: str(p.product),
    size_line: p.size ? `in size ${str(p.size)} ` : "",
    price: ghs(p.price),
    was: ghs(p.was),
    articles,
    unsubscribe: p.token ? `${site}/unsubscribe?token=${encodeURIComponent(str(p.token))}` : `${site}/account/notifications`,
    date: str(p.date),
    orders: str(p.orders),
    sales: ghs(p.sales),
    cash: ghs(p.cash),
    owed: ghs(p.owed),
    stuck: str(p.stuck),
    delivered: str(p.delivered),
    on_time: str(p.on_time),
    reports: str(p.reports),
    score: str(p.score),
    last: str(p.last),
    wins: str(p.wins),
    misses: str(p.misses),
    kind: str(p.kind),
    rows: str(p.rows),
    link,
  };
}

/** Replaces {{name}} with its value. Unknown names become empty, so a typo in a template never shows braces to a customer. */
export const fill = (text: string, vars: Record<string, string>) =>
  text.replace(/\\n/g, "\n").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");

/** One message, ready for email (HTML and plain text) and for SMS or WhatsApp (short). */
export function renderMessage(template: string, payload: Record<string, unknown>, siteUrl: string, custom?: Template | null): Rendered {
  const t = custom ?? defaultTemplates[template] ?? { subject: "Drezzy Stores", body: "{{headline}}\n\n{{link}}" };
  const vars = variables(template, payload, siteUrl);
  const subject = fill(t.subject, vars).replace(/\s+/g, " ").trim().slice(0, 160);
  const text = fill(t.body, vars).replace(/\n{3,}/g, "\n\n").trim() + "\n\nDrezzy Stores · Your Outfits Solution";
  const link = vars.link;
  const paras = fill(t.body, vars).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>").replace(esc(link), `<a href="${esc(link)}" style="color:#00115b">${esc(link)}</a>`)}</p>`).join("");
  const html =
    `<div style="background:#ececef;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0a0a0a">` +
    `<div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;overflow:hidden">` +
    `<div style="background:#00115b;padding:18px 24px"><span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:1px">DREZZY</span>` +
    `<span style="color:#9cff00;font-size:11px;letter-spacing:6px;margin-left:8px">STORES</span></div>` +
    `<div style="padding:24px;font-size:15px;line-height:1.55">${paras}` +
    `<p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#00115b;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Open</a></p></div>` +
    `<div style="padding:14px 24px;background:#f5f5f6;color:#5b617a;font-size:12px">Drezzy Stores · Accra and Kumasi · You order, we deliver, you drip.</div>` +
    `</div></div>`;
  const short = `${subject}. ${link}`.slice(0, 300);
  return { subject, text, html, short };
}
