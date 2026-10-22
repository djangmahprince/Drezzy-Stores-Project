// Customer email wording. Pure functions, no imports, so the server job and the tests can both load it.

export type OrderMail = {
  number: string;
  name: string;
  headline: string;
  total: number;
  paid: number;
  balance: number;
};

export type Mail = { subject: string; text: string; html: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ghs = (n: number) => `GHS ${n.toLocaleString("en-GH")}`;
const first = (name: string) => name.trim().split(/\s+/)[0] || "there";

/** The one email layout: a short message, the order's money, and a link to the tracker. */
export function renderOrderMail(template: string, m: OrderMail, siteUrl: string): Mail {
  const link = `${siteUrl.replace(/\/$/, "")}/track?order=${encodeURIComponent(m.number)}`;
  const placed = template === "order_placed";
  const subject = placed ? `We got your order ${m.number}` : `${m.number}: ${m.headline}`;
  const lead = placed
    ? `Thank you for your order. We have it as ${m.number}.`
    : `An update on your order ${m.number}: ${m.headline}.`;
  const lines = [`Total ${ghs(m.total)}`, m.paid > 0 ? `Paid ${ghs(m.paid)}` : null, m.balance > 0 && m.paid > 0 ? `Balance on delivery ${ghs(m.balance)}` : null].filter((x): x is string => !!x);
  const text = [`Hi ${first(m.name)},`, "", lead, "", ...lines, "", `Track your order: ${link}`, "", "Drezzy Stores"].join("\n");
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#111">` +
    `<p>Hi ${esc(first(m.name))},</p><p>${esc(lead)}</p>` +
    `<p style="color:#444">${lines.map(esc).join("<br>")}</p>` +
    `<p><a href="${esc(link)}" style="display:inline-block;background:#00115b;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">Track your order</a></p>` +
    `<p style="color:#666;font-size:13px">Drezzy Stores</p></div>`;
  return { subject, text, html };
}
