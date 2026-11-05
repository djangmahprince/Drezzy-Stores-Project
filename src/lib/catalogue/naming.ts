// The Drezzy naming standard: Brand + Model + Cut + Colour + Size, for example "Nike Dunk Low · Black / White · Size 42".
// Brand and model make the product's name; cut, colour and size are its variants. Pure, so the tests and both screens agree.

/** "Nike" + "Dunk" gives "Nike Dunk". A model typed with the brand already in it is not doubled. */
export function productName(brand: string, model: string): string {
  const b = brand.trim().replace(/\s+/g, " ");
  const m = model.trim().replace(/\s+/g, " ");
  if (!b) return m;
  return m.toLowerCase().startsWith(`${b.toLowerCase()} `) || m.toLowerCase() === b.toLowerCase() ? m : `${b} ${m}`;
}

/** The full title of one variant, in the standard's order. */
export function variantTitle(name: string, v: { style?: string | null; colour?: string | null; size?: string | null }): string {
  const size = v.size && v.size !== "One size" ? (/^size /i.test(v.size) ? v.size : `Size ${v.size}`) : "";
  return [[name, v.style].filter(Boolean).join(" "), v.colour, size].filter(Boolean).join(" · ");
}

/** One way to write a size, whoever typed it: "xxl", "XX-Large" and "2 XL" are all 2XL; "large" is L; shoe sizes stay numbers. */
export function normaliseSize(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return t;
  if (/^one ?size$/i.test(t)) return "One size";
  if (/^(eu|size)\s*\d/i.test(t)) return t.replace(/^(eu|size)\s*/i, "");
  const c = t.toUpperCase().replace(/[\s-]/g, "");
  const word: Record<string, string> = { SMALL: "S", MEDIUM: "M", LARGE: "L", XLARGE: "XL", EXTRALARGE: "XL" };
  if (word[c]) return word[c];
  const x = c.match(/^(X+)(L|LARGE)$/);
  if (x) return x[1].length === 1 ? "XL" : `${x[1].length}XL`;
  const n = c.match(/^(\d)X(L|LARGE)$/);
  if (n) return n[1] === "1" ? "XL" : `${n[1]}XL`;
  return /^(XS|S|M|L|XL)$/.test(c) ? c : t;
}

/** What breaks the standard in a product's name, in words staff can act on. Empty when it is fine. */
export function nameIssues(brand: string, name: string): string[] {
  const issues: string[] = [];
  if (brand.trim() && !name.toLowerCase().startsWith(brand.trim().toLowerCase())) issues.push(`Start the name with the brand: ${brand.trim()}`);
  if (/\b(size|eu|uk|us)\s*\d/i.test(name)) issues.push("Sizes belong in the size column, not the name");
  return issues;
}
