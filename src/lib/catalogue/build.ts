// Pure catalogue logic. No framework imports, so it is unit-tested directly (see supabase/tests/catalogue.test.mjs).
import type { Art, ArtKind, Availability, Product, ProductBase, Variant } from "./types.ts";

const rank: Record<Availability, number> = { Available: 3, Limited: 2, "Pre-order": 1, Unavailable: 0 };

/** The better of two availabilities. */
export const bestOf = (a: Availability, b: Availability): Availability => (rank[a] >= rank[b] ? a : b);

const letterOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/** Numeric sizes first (EU 39 before 40), then S to XXXL, then anything else, then "One size". */
export function compareSizes(a: string, b: string): number {
  const na = Number(a), nb = Number(b);
  const aNum = Number.isFinite(na) && a.trim() !== "";
  const bNum = Number.isFinite(nb) && b.trim() !== "";
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  const la = letterOrder.indexOf(a.toUpperCase()), lb = letterOrder.indexOf(b.toUpperCase());
  if (la >= 0 && lb >= 0) return la - lb;
  if (la >= 0) return -1;
  if (lb >= 0) return 1;
  if (a === "One size") return 1;
  if (b === "One size") return -1;
  return a.localeCompare(b);
}

const unique = <T>(list: T[]) => [...new Set(list)];

/** Works out a product's price range, styles, colours and per-size availability from its variants. */
export function buildProduct(base: ProductBase, variants: Variant[]): Product {
  const sorted = [...variants].sort((a, b) => compareSizes(a.size, b.size));
  const prices = sorted.map((v) => v.price);
  const price = prices.length ? Math.min(...prices) : 0;
  const cheapest = sorted.find((v) => v.price === price);
  const styles = unique(sorted.flatMap((v) => (v.style ? [v.style] : [])));

  const sizeMap = new Map<string, Availability>();
  for (const v of sorted) sizeMap.set(v.size, bestOf(sizeMap.get(v.size) ?? "Unavailable", v.availability));

  return {
    ...base,
    price,
    compareAt: cheapest?.compareAt && cheapest.compareAt > price ? cheapest.compareAt : undefined,
    priceVaries: prices.length > 0 && Math.max(...prices) !== price,
    styles: styles.length ? styles : undefined,
    colours: unique(sorted.map((v) => v.colour)),
    variants: sorted,
    sizes: [...sizeMap].map(([size, availability]) => ({ size, availability })),
    leadDays: sorted.length ? Math.min(...sorted.map((v) => v.leadDays)) : 0,
  };
}

/** Finds the variant a customer picked. Style only matters when the product has styles. */
export function findVariant(p: Product, pick: { style?: string; colour: string; size: string }): Variant | undefined {
  return p.variants.find((v) => v.colour === pick.colour && v.size === pick.size && (v.style ?? "") === (pick.style ?? ""));
}

/** Variants that can be shown for the chosen style and colour (used for the size chips). */
export function variantsFor(p: Product, pick: { style?: string; colour: string }): Variant[] {
  return p.variants.filter((v) => v.colour === pick.colour && (v.style ?? "") === (pick.style ?? ""));
}

export function availabilitySummary(p: Product): { label: string; tone: "ok" | "warn" | "bad" } {
  const open = p.variants.filter((v) => v.availability !== "Unavailable");
  if (open.length === 0) return { label: "Unavailable", tone: "bad" };
  if (open.every((v) => v.availability === "Limited")) return { label: "Limited", tone: "warn" };
  return { label: "Available", tone: "ok" };
}

// ---- mapping from database values ----
export const availabilityFromDb = (v: string): Availability =>
  v === "available" ? "Available" : v === "limited" ? "Limited" : v === "pre_order" ? "Pre-order" : "Unavailable";

export const availabilityToDb = (v: Availability): string =>
  v === "Available" ? "available" : v === "Limited" ? "limited" : v === "Pre-order" ? "pre_order" : "unavailable";

export const audienceFromDb = (v: string): Product["audience"] =>
  v === "men" ? "Men" : v === "ladies" ? "Ladies" : v === "men_and_ladies" ? "Men and ladies" : "Unisex";

export const audienceToDb = (v: string): string => {
  const x = v.trim().toLowerCase();
  if (x === "men" || x === "male" || x === "mens") return "men";
  if (x === "ladies" || x === "women" || x === "female" || x === "womens") return "ladies";
  if (/men\s*(and|&|\/)\s*(ladies|women)/.test(x) || x === "both") return "men_and_ladies";
  return "unisex";
};

/** Stand-in artwork for products that have none yet, chosen from the category so cards still look right. */
export function defaultArt(category: string): Art {
  const c = category.toLowerCase();
  const kind: ArtKind = /watch/.test(c) ? "watch" : /outfit|cloth|tee|top|set/.test(c) ? "apparel" : /slide|sandal/.test(c) ? "slide" : /accessor|cap|bag|sock/.test(c) ? "cap" : "sneaker";
  return { kind, tone: "navy", upper: kind === "apparel" ? "#2b4a8c" : "#f4f4f6", accent: "#9cff00" };
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
