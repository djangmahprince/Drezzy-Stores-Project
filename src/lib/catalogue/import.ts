// Spreadsheet import logic (PRD section 13: "Excel import"). Pure functions only, so it is tested without a database.
import { audienceToDb, slugify } from "./build.ts";
import type { Availability } from "./types.ts";

/** One variant per row. This is the template customers of the spreadsheet fill in. */
export const TEMPLATE_HEADERS = [
  "Product", "Brand", "Category", "Audience", "Style", "Colour", "Size", "SKU",
  "Price (GHS)", "Compare-at price (GHS)", "Availability", "Lead time (days)", "Supplier", "Supplier cost (GHS)", "Description",
] as const;

export const TEMPLATE_EXAMPLE_ROWS: string[][] = [
  ["Nike Dunk", "Nike", "Sneakers > Men", "Men and ladies", "Low", "Black / White", "42", "", "420", "", "Available", "2", "Supplier A", "300", "The easiest sneaker in the rack to style."],
  ["Nike Dunk", "Nike", "Sneakers > Men", "Men and ladies", "Low", "Black / White", "43", "", "420", "", "Limited", "2", "Supplier A", "300", ""],
  ["Navy cap", "Drezzy", "Accessories > Caps", "Unisex", "", "Navy", "One size", "", "90", "", "Available", "2", "Supplier B", "55", "A structured six-panel cap."],
];

export const MAX_ROWS = 5000;

type Key =
  | "product" | "brand" | "category" | "audience" | "style" | "colour" | "size" | "sku"
  | "price" | "compareAt" | "availability" | "leadDays" | "supplier" | "cost" | "description";

// Headers people actually type. Matching ignores case, punctuation and "(GHS)".
const synonyms: Record<Key, string[]> = {
  product: ["product", "product name", "name", "item", "title"],
  brand: ["brand", "make"],
  category: ["category", "categories", "type"],
  audience: ["audience", "for", "gender", "men or ladies"],
  style: ["style", "model", "cut", "variant"],
  colour: ["colour", "color", "colourway", "colorway"],
  size: ["size", "sizes", "eu size", "size eu"],
  sku: ["sku", "code", "item code"],
  price: ["price", "selling price", "price ghs", "sell price", "retail price"],
  compareAt: ["compare at price", "compare at", "was price", "old price", "original price", "compare at price ghs"],
  availability: ["availability", "status", "stock", "in stock", "available"],
  leadDays: ["lead time", "lead time days", "lead days", "days", "delivery days"],
  supplier: ["supplier", "best supplier", "vendor", "wholesaler"],
  cost: ["supplier cost", "cost", "cost price", "supplier cost ghs", "buying price", "cost ghs"],
  description: ["description", "details", "about"],
};

const clean = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** Works out which column holds what, from the header row. Unknown columns are ignored. */
export function mapHeaders(headers: string[]): { map: Partial<Record<Key, number>>; missing: string[] } {
  const map: Partial<Record<Key, number>> = {};
  headers.forEach((h, i) => {
    const c = clean(h);
    for (const [key, names] of Object.entries(synonyms) as [Key, string[]][]) {
      if (map[key] === undefined && names.includes(c)) map[key] = i;
    }
  });
  const required: [Key, string][] = [["product", "Product"], ["brand", "Brand"], ["category", "Category"], ["colour", "Colour"], ["size", "Size"], ["price", "Price (GHS)"]];
  return { map, missing: required.filter(([k]) => map[k] === undefined).map(([, label]) => label) };
}

/** Minimal CSV reader: quoted fields, escaped quotes, commas and line breaks inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export const toCsv = (rows: string[][]) =>
  rows.map((r) => r.map((c) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n") + "\r\n";

export const templateCsv = () => toCsv([[...TEMPLATE_HEADERS], ...TEMPLATE_EXAMPLE_ROWS]);

export type ParsedRow = {
  line: number; // line in the file, counting the header as line 1
  product: string; brand: string; categoryText: string; audience: string;
  style?: string; colour: string; size: string; sku?: string;
  price: number; compareAt?: number; availability: Availability; leadDays: number;
  supplier?: string; cost?: number; description?: string;
};
export type ImportIssue = { line: number; message: string };

const num = (v: string): number | null => {
  const t = v.replace(/ghs|₵|gh₵|cedis?/gi, "").replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

export function parseAvailability(v: string): Availability | null {
  const t = v.trim().toLowerCase();
  if (t === "") return "Unavailable"; // not stated means not confirmed, so it is not offered for sale
  if (/^(available|yes|y|in stock|instock|ok|can supply)$/.test(t)) return "Available";
  if (/^(limited|few|low|low stock|few left)$/.test(t)) return "Limited";
  if (/^(unavailable|no|n|out|out of stock|sold out|none)$/.test(t)) return "Unavailable";
  if (/^(pre.?order|preorder|coming|coming soon)$/.test(t)) return "Pre-order";
  return null;
}

/** Turns "Sneakers > Men", "sneakers/men" or "Sneakers › Men" into one comparable string. */
export const normaliseCategory = (s: string) => s.toLowerCase().split(/\s*(?:>|›|\/|\\|»)\s*/).map((x) => x.trim()).filter(Boolean).join(" > ");

export type CategoryOption = { id: string; label: string };

/** Finds the category id: by full path, or by the second-level name when that is unique, or by a top level with no children. */
export function resolveCategory(text: string, options: CategoryOption[]): string | null {
  const t = normaliseCategory(text);
  if (!t) return null;
  const byLabel = options.find((o) => normaliseCategory(o.label) === t);
  if (byLabel) return byLabel.id;
  const leaf = options.filter((o) => normaliseCategory(o.label).split(" > ").pop() === t);
  if (leaf.length === 1) return leaf[0].id;
  const top = options.filter((o) => normaliseCategory(o.label).split(" > ")[0] === t);
  return top.length === 1 ? top[0].id : null;
}

export type ValidationResult = { rows: ParsedRow[]; issues: ImportIssue[]; mapping: { missing: string[] } };

/** Checks every row and explains each problem in plain words, with the line number to fix. */
export function validateTable(table: string[][], categories: CategoryOption[]): ValidationResult {
  if (table.length === 0) return { rows: [], issues: [{ line: 1, message: "The file is empty." }], mapping: { missing: [] } };
  const { map, missing } = mapHeaders(table[0].map((c) => String(c ?? "")));
  if (missing.length) {
    return { rows: [], issues: [{ line: 1, message: `The header row is missing: ${missing.join(", ")}. Download the template to see the columns.` }], mapping: { missing } };
  }
  const body = table.slice(1);
  if (body.length > MAX_ROWS) return { rows: [], issues: [{ line: 1, message: `The file has ${body.length} rows. Import at most ${MAX_ROWS} at a time.` }], mapping: { missing: [] } };

  const rows: ParsedRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Map<string, number>();
  const cell = (r: string[], k: Key) => String(r[map[k] ?? -1] ?? "").trim();

  body.forEach((r, i) => {
    const line = i + 2;
    if (r.every((c) => String(c ?? "").trim() === "")) return;
    const bad = (message: string) => issues.push({ line, message });
    const before = issues.length;

    const product = cell(r, "product");
    const brand = cell(r, "brand");
    const colour = cell(r, "colour");
    const size = cell(r, "size") || "One size";
    const style = cell(r, "style") || undefined;
    if (!product) bad("The product name is empty.");
    if (!brand) bad("The brand is empty.");
    if (!colour) bad("The colour is empty.");

    const categoryText = cell(r, "category");
    if (!categoryText) bad("The category is empty.");
    else if (!resolveCategory(categoryText, categories)) bad(`The category "${categoryText}" does not exist. Use one from the Category list, for example "Sneakers > Men".`);

    const price = num(cell(r, "price"));
    if (price === null) bad("The price is empty.");
    else if (Number.isNaN(price) || price < 0) bad(`The price "${cell(r, "price")}" is not a number.`);

    const compareRaw = map.compareAt === undefined ? null : num(cell(r, "compareAt"));
    if (compareRaw !== null && (Number.isNaN(compareRaw) || (price !== null && !Number.isNaN(price) && compareRaw <= price))) {
      bad("The compare-at price must be a number higher than the price.");
    }

    const availability = parseAvailability(cell(r, "availability"));
    if (!availability) bad(`The availability "${cell(r, "availability")}" is not recognised. Use Available, Limited, Unavailable or Pre-order.`);

    let leadDays = 2;
    const leadRaw = cell(r, "leadDays");
    if (leadRaw !== "") {
      const l = num(leadRaw);
      if (l === null || Number.isNaN(l) || !Number.isInteger(l) || l < 0 || l > 60) bad(`The lead time "${leadRaw}" must be a whole number of days from 0 to 60.`);
      else leadDays = l;
    }

    const costRaw = cell(r, "cost");
    const cost = costRaw === "" ? undefined : num(costRaw);
    if (cost !== undefined && (cost === null || Number.isNaN(cost) || cost < 0)) bad(`The supplier cost "${costRaw}" is not a number.`);
    const supplier = cell(r, "supplier") || undefined;
    if (cost !== undefined && !supplier) bad("A supplier cost needs a supplier name.");

    const key = [slugify(`${brand} ${product}`), (style ?? "").toLowerCase(), colour.toLowerCase(), size.toLowerCase()].join("|");
    const firstSeen = seen.get(key);
    if (firstSeen) bad(`This repeats line ${firstSeen}: same product, style, colour and size.`);
    else seen.set(key, line);

    if (issues.length > before) return;

    rows.push({
      line, product, brand, categoryText, audience: cell(r, "audience") || "unisex", style, colour, size,
      sku: cell(r, "sku") || undefined, price: price as number, compareAt: compareRaw ?? undefined,
      availability: availability as Availability, leadDays, supplier, cost: typeof cost === "number" ? cost : undefined,
      description: cell(r, "description") || undefined,
    });
  });

  if (rows.length === 0 && issues.length === 0) issues.push({ line: 1, message: "There are no product rows under the header." });
  return { rows, issues, mapping: { missing: [] } };
}

export type ProductGroup = {
  slug: string; name: string; brand: string; categoryText: string; audience: string; description?: string; rows: ParsedRow[];
};

/** One product per brand and name. The first row that has a description supplies it. */
export function groupProducts(rows: ParsedRow[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const r of rows) {
    const slug = slugify(`${r.brand} ${r.product}`);
    const g = groups.get(slug) ?? { slug, name: r.product, brand: r.brand, categoryText: r.categoryText, audience: audienceToDb(r.audience), description: undefined, rows: [] };
    g.description ??= r.description;
    g.rows.push(r);
    groups.set(slug, g);
  }
  return [...groups.values()];
}

/** Stable, short product code: the first letters of the name plus a few characters from its slug. */
export function makeSku(name: string, slug: string): string {
  const letters = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w.slice(0, 3)).join("").toUpperCase().slice(0, 6) || "ITEM";
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${letters}-${h.toString(36).toUpperCase().slice(0, 3).padStart(3, "0")}`;
}

export const variantSku = (productSku: string, style: string | undefined, colour: string, size: string, multiColour: boolean) => {
  const initials = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return [productSku, style && style.slice(0, 2).toUpperCase(), multiColour && initials(colour), size.replace(/\s+/g, "")].filter(Boolean).join("-");
};
