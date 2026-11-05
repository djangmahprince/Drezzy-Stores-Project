// The sample catalogue. It is what the storefront and dashboard show until Supabase is connected, and
// scripts/generate-seed.mjs turns the same data into supabase/seed.sql so a new project starts with it.
// Prices marked "sample" are defaults until the owner confirms them (PRD section 27).
import { buildProduct } from "./build.ts";
import type { Art, Audience, Availability, Product, Variant } from "./types.ts";

export type SampleDef = {
  slug: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  subcategory?: string;
  audience: Audience;
  price: number;
  compareAt?: number;
  styles?: string[];
  colours: string[];
  sizes: { size: string; availability: Availability }[];
  isNew?: boolean;
  popular: number;
  leadDays: number;
  description: string;
  details: string[];
  art: Art;
  images?: string[];
  tags?: string[];
};

const shoeSizes = (limited: string[] = [], out: string[] = []) =>
  ["39", "40", "41", "42", "43", "44", "45"].map((size) => ({
    size,
    availability: (out.includes(size) ? "Unavailable" : limited.includes(size) ? "Limited" : "Available") as Availability,
  }));

const letterSizes = (list: string[], limited: string[] = []) =>
  list.map((size) => ({ size, availability: (limited.includes(size) ? "Limited" : "Available") as Availability }));

const original = "Brand new, original";

// The real range, from Drezzy's own flyers. Prices are defaults until the owner confirms them, and availability is a
// starting point: a Sourcing Officer confirms each size with suppliers. Only the size on the Dunk flyer (40) is on sale.
export const sampleDefs: SampleDef[] = [
  {
    slug: "adidas-samba", sku: "AD-SMB", name: "adidas Samba", brand: "adidas",
    category: "Sneakers", subcategory: "Men", audience: "Men and ladies", price: 450 /* sample */, colours: ["White / Black / Gum"], sizes: shoeSizes(),
    isNew: true, popular: 99, leadDays: 2,
    description: "The terrace classic: white leather, black stripes, a grey suede toe and the gum sole everyone is wearing. Dress it up or down.",
    details: [original, "Leather upper, suede toe", "Gum rubber sole"],
    art: { kind: "sneaker", tone: "navy", upper: "#f4f4f6", accent: "#14161f" }, images: ["/products/adidas-samba.webp"], tags: ["Streetwear", "Classic", "Campus"],
  },
  {
    slug: "adidas-topanga", sku: "AD-TPG", name: "adidas Topanga", brand: "adidas",
    category: "Sneakers", subcategory: "Men", audience: "Men and ladies", price: 450 /* sample */, colours: ["Triple White"], sizes: shoeSizes(),
    isNew: true, popular: 92, leadDays: 2,
    description: "Clean all-white leather with gold Topanga lettering and a chunky crepe-style sole. A sharp, low-key pair that goes with everything.",
    details: [original, "Soft leather upper", "Comes in the original box"],
    art: { kind: "sneaker", tone: "blue", upper: "#fafafc", accent: "#d5d7e0" }, images: ["/products/adidas-topanga.webp"], tags: ["Minimal", "Smart casual"],
  },
  {
    slug: "nike-sb-dunk-low", sku: "NK-SBD", name: "Nike SB Dunk Low", brand: "Nike",
    category: "Sneakers", subcategory: "Men", audience: "Men and ladies", price: 420 /* sample */, colours: ["White / Black"], sizes: shoeSizes([], ["39", "41", "42", "43", "44", "45"]),
    isNew: true, popular: 96, leadDays: 2,
    description: "White leather with a black swoosh and sole. The easiest sneaker in the rack to style, from the lecture hall to Friday night.",
    details: [original, "Runs true to size", "Comes in the original box"],
    art: { kind: "sneaker", tone: "navy", upper: "#f4f4f6", accent: "#14161f" }, images: ["/products/nike-sb-dunk-low.webp"], tags: ["Streetwear", "Campus"],
  },
  {
    slug: "dictator-1976-shirt", sku: "DCT-76", name: "Dictator 1976 USA collared shirt", brand: "Dictator",
    category: "Shirts", audience: "Unisex", price: 250 /* sample */, colours: ["White / Black"], sizes: letterSizes(["M", "L", "XL", "XXL"]),
    isNew: true, popular: 85, leadDays: 3,
    description: "An oversized long-sleeve collared shirt with a bold Dictator 1976 print, USA badge and script down the sleeves. One piece that carries the whole fit.",
    details: ["Brand new", "Relaxed, oversized fit", "Long sleeves with sleeve print"],
    art: { kind: "apparel", tone: "grey", upper: "#f2f3f8", accent: "#00115b" }, images: ["/products/dictator-1976-shirt.webp"], tags: ["Streetwear", "Bold colours"],
  },
  {
    slug: "hublot-skeleton-blue", sku: "HB-SKL-BL", name: "Hublot skeleton watch, blue strap", brand: "Hublot",
    category: "Watches", audience: "Unisex", price: 600 /* sample */, colours: ["Steel / Blue"], sizes: [{ size: "One size", availability: "Available" }],
    isNew: true, popular: 88, leadDays: 3,
    description: "A steel case with an open skeleton dial and a deep blue strap. A statement on the wrist, day or night.",
    details: ["Brand new", "Skeleton dial", "Blue strap"],
    art: { kind: "watch", tone: "charcoal", upper: "#0036ff", accent: "#e9eaf0" }, images: ["/products/hublot-skeleton-blue.webp"], tags: ["Classic", "Bold colours"],
  },
];

const initials = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("");

/** Every style x colour x size combination, priced and marked with the availability the definition gives that size. */
export function variantsOf(d: SampleDef): Variant[] {
  return (d.styles ?? [undefined]).flatMap((style) =>
    d.colours.flatMap((colour) =>
      d.sizes.map((s) => ({
        style,
        colour,
        size: s.size,
        sku: [d.sku, style && style.slice(0, 2).toUpperCase(), d.colours.length > 1 && initials(colour), s.size.replace(/\s+/g, "")].filter(Boolean).join("-"),
        price: d.price,
        compareAt: d.compareAt,
        availability: s.availability,
        leadDays: d.leadDays,
      })),
    ),
  );
}

export const sampleProducts: Product[] = sampleDefs.map((d) =>
  buildProduct(
    {
      slug: d.slug, sku: d.sku, name: d.name, brand: d.brand, category: d.category, subcategory: d.subcategory, audience: d.audience,
      isNew: d.isNew, popular: d.popular, description: d.description, details: d.details, condition: d.details[0] === original ? original : "Brand new", art: d.art,
      ...(d.images ? { images: d.images } : {}), ...(d.tags ? { tags: d.tags } : {}),
    },
    variantsOf(d),
  ),
);
