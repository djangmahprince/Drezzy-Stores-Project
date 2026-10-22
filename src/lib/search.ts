import type { Product } from "@/lib/catalogue/types";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Edit distance, capped. Used so "jordon" still finds "Jordan". */
function distance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
      rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

function scoreProduct(p: Product, tokens: string[]): number {
  const haystack = norm([p.name, p.brand, p.sku, p.category, p.subcategory ?? "", p.audience, ...(p.styles ?? []), ...p.colours].join(" "));
  const words = haystack.split(" ");
  let total = 0;
  for (const t of tokens) {
    if (haystack.includes(t)) {
      total += words.some((w) => w.startsWith(t)) ? 3 : 2;
    } else if (t.length >= 4 && words.some((w) => w.length >= 4 && distance(t, w, t.length > 5 ? 2 : 1) <= (t.length > 5 ? 2 : 1))) {
      total += 1;
    } else {
      return 0; // every word must match something
    }
  }
  return total;
}

export function searchProducts(products: Product[], query: string): Product[] {
  const tokens = norm(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  return products
    .map((p) => ({ p, s: scoreProduct(p, tokens) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.p.popular - a.p.popular)
    .map((x) => x.p);
}

export const suggestions = ["Jordan", "Nike Dunk", "New Balance", "Denim set", "Watches", "Slides"];
