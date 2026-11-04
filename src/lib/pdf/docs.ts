import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

/**
 * Printable documents (PRD FR-ORD-008, FR-ACC-006, FR-FIN-007, FR-DATA-005): receipts showing what was paid and the balance,
 * packing slips, delivery labels with a QR code, customer invoices, payslips and table exports. Built with the standard
 * PDF fonts, so text is limited to the Latin character set; anything outside it is replaced, never dropped silently.
 */

const NAVY = rgb(0, 0.067, 0.357);
const LIME = rgb(0.612, 1, 0);
const GREY = rgb(0.357, 0.38, 0.478);
const LINE = rgb(0.89, 0.894, 0.918);

/** Standard fonts only cover WinAnsi. Common symbols are mapped; the rest become "?". */
export const safe = (s: unknown): string =>
  String(s ?? "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/₵/g, "GHS ")
    .replace(/[^\x20-\x7E\xA0-\xFF·•…€]/g, "?");

const ghs = (n: unknown) => `GHS ${Number(n ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "";

type Ctx = { doc: PDFDocument; page: PDFPage; font: PDFFont; bold: PDFFont; y: number; width: number; margin: number };

async function start(size: [number, number] = [595.28, 841.89]): Promise<Ctx> {
  const doc = await PDFDocument.create();
  doc.setProducer("Drezzy Stores");
  doc.setCreator("Drezzy Stores platform");
  const page = doc.addPage(size);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, page, font, bold, y: size[1] - 40, width: size[0], margin: 40 };
}

function header(c: Ctx, title: string, sub?: string) {
  c.page.drawRectangle({ x: 0, y: c.y - 30, width: c.width, height: 70, color: NAVY });
  c.page.drawText("DREZZY", { x: c.margin, y: c.y - 2, size: 22, font: c.bold, color: rgb(1, 1, 1) });
  c.page.drawText("S T O R E S", { x: c.margin + 92, y: c.y + 1, size: 8, font: c.font, color: LIME });
  c.page.drawText(safe(title), { x: c.width - c.margin - c.bold.widthOfTextAtSize(safe(title), 16), y: c.y - 2, size: 16, font: c.bold, color: rgb(1, 1, 1) });
  if (sub) c.page.drawText(safe(sub), { x: c.width - c.margin - c.font.widthOfTextAtSize(safe(sub), 9), y: c.y - 18, size: 9, font: c.font, color: rgb(0.85, 0.87, 0.95) });
  c.y -= 60;
}

function text(c: Ctx, s: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; gap?: number } = {}) {
  const size = o.size ?? 10;
  c.page.drawText(safe(s), { x: o.x ?? c.margin, y: c.y, size, font: o.bold ? c.bold : c.font, color: o.color ?? rgb(0.04, 0.04, 0.04) });
  c.y -= o.gap ?? size + 6;
}

function rule(c: Ctx) {
  c.page.drawLine({ start: { x: c.margin, y: c.y + 4 }, end: { x: c.width - c.margin, y: c.y + 4 }, thickness: 1, color: LINE });
  c.y -= 8;
}

function pair(c: Ctx, label: string, value: string, strong = false) {
  c.page.drawText(safe(label), { x: c.margin, y: c.y, size: 10, font: c.font, color: GREY });
  const v = safe(value);
  c.page.drawText(v, { x: c.width - c.margin - (strong ? c.bold : c.font).widthOfTextAtSize(v, strong ? 12 : 10), y: c.y, size: strong ? 12 : 10, font: strong ? c.bold : c.font });
  c.y -= strong ? 18 : 15;
}

function wrap(font: PDFFont, s: string, size: number, max: number): string[] {
  const words = safe(s).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export type OrderDoc = {
  number: string;
  placedAt: string;
  status: string;
  plan: "full" | "half";
  customer: { name: string; phone: string | null; email: string | null };
  receiver?: { name: string | null; phone: string | null };
  delivery: { method: string; region: string | null; city: string | null; area: string | null; street: string | null; landmark: string | null; gps: string | null; note: string | null };
  items: { name: string; detail: string; qty: number; price: number }[];
  subtotal: number;
  fee: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  payments: { kind: string; method: string | null; amount: number; at: string | null }[];
  rider?: string | null;
  courier?: string | null;
  tracking?: string | null;
  branch: string;
};

/** Receipt or customer invoice: what was bought, what was paid, and the balance due on delivery. */
export async function receiptPdf(o: OrderDoc, siteUrl: string, title = "Receipt"): Promise<Uint8Array> {
  const c = await start();
  header(c, title, `${o.number} · ${day(o.placedAt)}`);
  text(c, "Billed to", { size: 9, color: GREY, gap: 13 });
  text(c, o.customer.name, { bold: true, gap: 13 });
  text(c, [o.customer.phone, o.customer.email].filter(Boolean).join(" · "), { gap: 13 });
  if (o.delivery.method === "home") text(c, [o.delivery.street, o.delivery.area, o.delivery.city, o.delivery.region].filter(Boolean).join(", "), { gap: 22 });
  else text(c, `Pickup at the ${o.branch === "kumasi" ? "Kumasi" : "Accra"} branch`, { gap: 22 });
  rule(c);
  text(c, "Item", { bold: true, size: 9, gap: 0 });
  c.page.drawText("Qty", { x: c.width - 200, y: c.y, size: 9, font: c.bold });
  c.page.drawText("Amount", { x: c.width - c.margin - c.bold.widthOfTextAtSize("Amount", 9), y: c.y, size: 9, font: c.bold });
  c.y -= 16;
  for (const i of o.items) {
    text(c, i.name, { gap: 0 });
    c.page.drawText(String(i.qty), { x: c.width - 200, y: c.y, size: 10, font: c.font });
    const amt = ghs(i.qty * i.price);
    c.page.drawText(amt, { x: c.width - c.margin - c.font.widthOfTextAtSize(amt, 10), y: c.y, size: 10, font: c.font });
    c.y -= 12;
    text(c, i.detail, { size: 8, color: GREY, gap: 16 });
  }
  rule(c);
  pair(c, "Items", ghs(o.subtotal));
  pair(c, "Delivery", o.fee > 0 ? ghs(o.fee) : o.delivery.method === "pickup" ? "Pickup" : "Paid to courier on arrival / free");
  if (o.discount > 0) pair(c, "Discount", `- ${ghs(o.discount)}`);
  pair(c, "Total", ghs(o.total), true);
  pair(c, "Paid", ghs(o.paid));
  pair(c, o.balance > 0 ? "Balance due on delivery" : "Balance", ghs(o.balance), o.balance > 0);
  c.y -= 6;
  if (o.payments.length) {
    text(c, "Payments", { bold: true, size: 9, gap: 14 });
    for (const p of o.payments) text(c, `${day(p.at)} · ${p.kind === "balance" ? "Balance" : p.kind === "refund" ? "Refund" : "Payment"} · ${p.method ?? ""} · ${ghs(p.amount)}`, { size: 9, gap: 13 });
  }
  c.y -= 10;
  text(c, `Plan: ${o.plan === "half" ? "half now, half on delivery" : "paid in full"} · Status: ${o.status.replace(/_/g, " ")}`, { size: 9, color: GREY });
  text(c, `Track this order: ${siteUrl.replace(/\/$/, "")}/track?order=${o.number}`, { size: 9, color: GREY });
  text(c, "Every Drezzy item is brand new and original. Questions? WhatsApp Accra 050 131 5862 · Kumasi 055 355 7347", { size: 8, color: GREY });
  return c.doc.save();
}

/** Packing slip: what to pack and check, with the balance the rider must collect. No prices except the balance. */
export async function packingSlipPdf(o: OrderDoc): Promise<Uint8Array> {
  const c = await start();
  header(c, "Packing slip", o.number);
  text(c, `Deliver to: ${o.receiver?.name || o.customer.name}`, { bold: true, size: 12 });
  text(c, `Phone: ${o.receiver?.phone || o.customer.phone || ""}`);
  text(c, o.delivery.method === "home" ? [o.delivery.street, o.delivery.landmark, o.delivery.area, o.delivery.city, o.delivery.region].filter(Boolean).join(", ") : "Pickup at the branch");
  if (o.delivery.gps) text(c, `Ghana Post GPS: ${o.delivery.gps}`);
  if (o.delivery.note) for (const l of wrap(c.font, `Rider note: ${o.delivery.note}`, 10, c.width - 80)) text(c, l);
  c.y -= 6;
  rule(c);
  text(c, "Check each item: size, colour and condition", { bold: true, size: 11, gap: 18 });
  for (const i of o.items) {
    c.page.drawRectangle({ x: c.margin, y: c.y - 2, width: 10, height: 10, borderColor: NAVY, borderWidth: 1 });
    text(c, `${i.qty} x ${i.name}`, { x: c.margin + 18, gap: 12 });
    text(c, i.detail, { x: c.margin + 18, size: 9, color: GREY, gap: 18 });
  }
  rule(c);
  if (o.balance > 0) {
    c.page.drawRectangle({ x: c.margin, y: c.y - 30, width: c.width - 80, height: 42, color: LIME });
    text(c, `COLLECT ${ghs(o.balance)} ON DELIVERY`, { bold: true, size: 16, color: NAVY, x: c.margin + 12, gap: 0 });
    c.y -= 40;
  } else text(c, "Fully paid. Nothing to collect.", { bold: true, size: 12 });
  return c.doc.save();
}

/** Delivery label (A6) with a QR code that opens the order, and the balance to collect. */
export async function labelPdf(o: OrderDoc, orderUrl: string): Promise<Uint8Array> {
  const c = await start([297.64, 419.53]);
  c.margin = 18;
  c.page.drawRectangle({ x: 0, y: c.y - 20, width: c.width, height: 60, color: NAVY });
  c.page.drawText("DREZZY", { x: 18, y: c.y + 4, size: 18, font: c.bold, color: rgb(1, 1, 1) });
  c.page.drawText(safe(o.number), { x: c.width - 18 - c.bold.widthOfTextAtSize(safe(o.number), 14), y: c.y + 4, size: 14, font: c.bold, color: LIME });
  c.y -= 44;
  const png = await QRCode.toBuffer(orderUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" });
  const img = await c.doc.embedPng(png);
  c.page.drawImage(img, { x: c.width - 18 - 96, y: c.y - 96, width: 96, height: 96 });
  const maxW = c.width - 18 - 96 - 28;
  text(c, o.receiver?.name || o.customer.name, { bold: true, size: 12, gap: 15 });
  text(c, o.receiver?.phone || o.customer.phone || "", { size: 11, gap: 16 });
  for (const l of wrap(c.font, [o.delivery.street, o.delivery.landmark, o.delivery.area].filter(Boolean).join(", "), 9, maxW).slice(0, 4)) text(c, l, { size: 9, gap: 12 });
  text(c, [o.delivery.city, o.delivery.region].filter(Boolean).join(", "), { size: 10, bold: true, gap: 14 });
  if (o.delivery.gps) text(c, `GPS ${o.delivery.gps}`, { size: 9, gap: 14 });
  c.y = Math.min(c.y, 230);
  if (o.courier || o.tracking) text(c, `${o.courier ?? ""} ${o.tracking ? `· ${o.tracking}` : ""}`, { size: 9, color: GREY });
  if (o.rider) text(c, `Rider: ${o.rider}`, { size: 9, color: GREY });
  c.y -= 4;
  c.page.drawRectangle({ x: 18, y: c.y - 34, width: c.width - 36, height: 46, color: o.balance > 0 ? LIME : rgb(0.96, 0.96, 0.965) });
  text(c, o.balance > 0 ? `COLLECT ${ghs(o.balance)}` : "PAID IN FULL", { bold: true, size: 17, color: NAVY, x: 30, gap: 0 });
  c.y -= 54;
  text(c, `${o.items.reduce((n, i) => n + i.qty, 0)} item(s) · Ask the customer for their 4-digit delivery code`, { size: 8, color: GREY });
  return c.doc.save();
}

export type PayslipDoc = { staff: string; role: string; month: string; amount: number; allowances: number; deductions: number; paidOn: string | null; method: string | null; reference: string | null; note: string | null };

/** Payslip (Owner and Finance only). */
export async function payslipPdf(p: PayslipDoc): Promise<Uint8Array> {
  const c = await start();
  header(c, "Payslip", p.month);
  text(c, p.staff, { bold: true, size: 14 });
  text(c, p.role, { color: GREY, gap: 24 });
  rule(c);
  pair(c, "Basic pay", ghs(p.amount));
  pair(c, "Allowances", ghs(p.allowances));
  pair(c, "Deductions", `- ${ghs(p.deductions)}`);
  rule(c);
  pair(c, "Net pay", ghs(p.amount + p.allowances - p.deductions), true);
  c.y -= 10;
  pair(c, "Paid on", p.paidOn ? day(p.paidOn) : "Not paid yet");
  pair(c, "Method", p.method ?? "");
  if (p.reference) pair(c, "Reference", p.reference);
  if (p.note) text(c, `Note: ${p.note}`, { size: 9, color: GREY });
  c.y -= 20;
  text(c, "Drezzy keeps salary records only; it does not process payroll. Confidential: Owner and Finance only.", { size: 8, color: GREY });
  return c.doc.save();
}

/** A table export as a landscape PDF, paginated, with the filters written on top. */
export async function tablePdf(title: string, sub: string, headers: string[], rows: (string | number | null | undefined)[][]): Promise<Uint8Array> {
  const size: [number, number] = [841.89, 595.28];
  const c = await start(size);
  header(c, title, sub);
  const usable = c.width - c.margin * 2;
  const fs = headers.length > 10 ? 6.5 : 8;
  // column widths from the content, capped so long text wraps onto the next column less often
  const raw = headers.map((h, i) => Math.min(160, Math.max(c.bold.widthOfTextAtSize(safe(h), fs), ...rows.slice(0, 200).map((r) => c.font.widthOfTextAtSize(safe(r[i]), fs))) + 8));
  const scale = Math.min(1, usable / raw.reduce((a, b) => a + b, 0));
  const widths = raw.map((w) => w * scale);
  const fit = (s: string, w: number, f: PDFFont) => {
    let t = safe(s);
    while (t.length > 1 && f.widthOfTextAtSize(t, fs) > w - 4) t = t.slice(0, -2) + "…";
    return t;
  };
  const drawHead = () => {
    let x = c.margin;
    c.page.drawRectangle({ x: c.margin, y: c.y - 3, width: usable, height: fs + 8, color: rgb(0.96, 0.96, 0.965) });
    headers.forEach((h, i) => {
      c.page.drawText(fit(h, widths[i], c.bold), { x: x + 2, y: c.y, size: fs, font: c.bold, color: NAVY });
      x += widths[i];
    });
    c.y -= fs + 8;
  };
  drawHead();
  let pageNo = 1;
  for (const r of rows) {
    if (c.y < 40) {
      c.page.drawText(`Page ${pageNo}`, { x: c.width - c.margin - 40, y: 20, size: 7, font: c.font, color: GREY });
      c.page = c.doc.addPage(size);
      pageNo++;
      c.y = size[1] - 40;
      drawHead();
    }
    let x = c.margin;
    r.forEach((v, i) => {
      c.page.drawText(fit(v === null || v === undefined ? "" : String(v), widths[i], c.font), { x: x + 2, y: c.y, size: fs, font: c.font });
      x += widths[i];
    });
    c.y -= fs + 5;
  }
  c.page.drawText(`Page ${pageNo} · ${rows.length} rows`, { x: c.width - c.margin - 80, y: 20, size: 7, font: c.font, color: GREY });
  return c.doc.save();
}
