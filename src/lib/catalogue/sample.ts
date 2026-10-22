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
};

const shoeSizes = (limited: string[] = [], out: string[] = []) =>
  ["39", "40", "41", "42", "43", "44", "45"].map((size) => ({
    size,
    availability: (out.includes(size) ? "Unavailable" : limited.includes(size) ? "Limited" : "Available") as Availability,
  }));

const letterSizes = (list: string[], limited: string[] = []) =>
  list.map((size) => ({ size, availability: (limited.includes(size) ? "Limited" : "Available") as Availability }));

const original = "Brand new, original";

export const sampleDefs: SampleDef[] = [
  {
    slug: "air-jordan-1-retro-high-og-triple-black", sku: "AJ1-HI-TB", name: 'Air Jordan 1 Retro High OG "Triple Black"', brand: "Jordan",
    category: "Sneakers", subcategory: "Men", audience: "Men and ladies", price: 400, colours: ["Triple Black"], sizes: shoeSizes(["44"], ["45"]),
    isNew: true, popular: 95, leadDays: 2,
    description: "The high-top that started it all, in an all-black colourway that goes with everything. Leather upper, padded collar and a cushioned sole.",
    details: [original, "Runs true to size", "Comes in the original box"],
    art: { kind: "sneaker", tone: "navy", upper: "#14161f", accent: "#3b3f52" },
  },
  {
    slug: "new-balance-2000", sku: "NB-2000", name: "New Balance 2000", brand: "New Balance",
    category: "Sneakers", subcategory: "Men", audience: "Men", price: 450, colours: ["Grey / Navy"], sizes: shoeSizes([], ["39"]),
    isNew: true, popular: 80, leadDays: 2,
    description: "A clean running-inspired shape with a soft suede and mesh upper. Light enough for all-day wear.",
    details: [original, "Runs slightly narrow, size up if between sizes", "Comes in the original box"],
    art: { kind: "sneaker", tone: "grey", upper: "#9aa0b4", accent: "#00115b" },
  },
  {
    slug: "air-jordan-4-retro-red-patent", sku: "AJ4-RP", name: 'Air Jordan 4 Retro "Red Patent"', brand: "Jordan",
    category: "Sneakers", subcategory: "Men", audience: "Men", price: 400, colours: ["Red Patent"], sizes: shoeSizes(["41"], ["44", "45"]),
    isNew: true, popular: 88, leadDays: 3,
    description: "A glossy patent finish with the classic mesh panels and wing eyelets. A statement pair.",
    details: [original, "Runs true to size", "Comes in the original box"],
    art: { kind: "sneaker", tone: "red", upper: "#b3172b", accent: "#ffffff" },
  },
  {
    slug: "nike-dunk", sku: "DNK", name: "Nike Dunk", brand: "Nike",
    category: "Sneakers", subcategory: "Men", audience: "Men and ladies", price: 420 /* sample */, styles: ["Low", "Mid", "High"],
    colours: ["Black / White", "Purple", "Brown"], sizes: shoeSizes(["42"]), popular: 99, leadDays: 2,
    description: "The easiest sneaker in the rack to style. Pick the low, mid or high cut and the colourway that suits your fit.",
    details: [original, "Runs true to size", "Comes in the original box"],
    art: { kind: "sneaker", tone: "navy", upper: "#f4f4f6", accent: "#14161f" },
  },
  {
    slug: "nike-air-force-1-low", sku: "AF1-LO", name: "Nike Air Force 1 Low", brand: "Nike",
    category: "Sneakers", subcategory: "Ladies", audience: "Men and ladies", price: 380 /* sample */, colours: ["Triple White"], sizes: shoeSizes([], ["45"]),
    popular: 90, leadDays: 2,
    description: "Crisp, all-white and always in season. A thick sole and soft leather that keeps its shape.",
    details: [original, "Runs true to size", "Comes in the original box"],
    art: { kind: "sneaker", tone: "blue", upper: "#fafafc", accent: "#d5d7e0" },
  },
  {
    slug: "denim-set", sku: "DRZ-DEN", name: "Denim set", brand: "Drezzy",
    category: "Outfits", subcategory: "Sets", audience: "Men", price: 350 /* sample */, colours: ["Indigo"], sizes: letterSizes(["S", "M", "L", "XL", "XXL"], ["XXL"]),
    popular: 70, leadDays: 3,
    description: "A matching jacket and jeans in heavy denim. Roll the hem once and wear it with a clean pair of Dunks.",
    details: ["Two-piece set", "Cotton denim", "Machine wash cold, inside out"],
    art: { kind: "apparel", tone: "blue", upper: "#2b4a8c", accent: "#9db4e8" },
  },
  {
    slug: "striped-quarter-zip", sku: "DRZ-QZ", name: "Striped quarter-zip", brand: "Drezzy",
    category: "Outfits", subcategory: "Tops", audience: "Men", price: 220 /* sample */, compareAt: 260 /* sample */, colours: ["Navy / White"], sizes: letterSizes(["M", "L", "XL"]),
    popular: 60, leadDays: 3,
    description: "A knit quarter-zip with a clean stripe. Smart enough for church, relaxed enough for campus.",
    details: ["Cotton knit", "Regular fit", "Machine wash cold"],
    art: { kind: "apparel", tone: "navy", upper: "#f2f3f8", accent: "#00115b" },
  },
  {
    slug: "watch-blue-strap", sku: "DRZ-WT-BL", name: "Watch, blue strap", brand: "Drezzy",
    category: "Watches", audience: "Unisex", price: 280 /* sample */, colours: ["Blue strap"], sizes: [{ size: "One size", availability: "Available" }],
    popular: 65, leadDays: 3,
    description: "A slim stainless case with a blue strap. Quartz movement, splash resistant.",
    details: [original, "Adjustable strap", "Comes in a gift box"],
    art: { kind: "watch", tone: "charcoal", upper: "#0036ff", accent: "#e9eaf0" },
  },
  {
    slug: "everyday-slides", sku: "DRZ-SL", name: "Everyday slides", brand: "Drezzy",
    category: "Slides and Sandals", audience: "Unisex", price: 150 /* sample */, colours: ["Black", "White"], sizes: shoeSizes(["42"]),
    popular: 55, leadDays: 2,
    description: "Soft, light slides for after the game, the beach or the walk to the shop.",
    details: ["Brand new", "Runs true to size", "Quick-dry foam"],
    art: { kind: "slide", tone: "grey", upper: "#14161f", accent: "#3b3f52" },
  },
  {
    slug: "navy-cap", sku: "DRZ-CAP-NV", name: "Navy cap", brand: "Drezzy",
    category: "Accessories", subcategory: "Caps", audience: "Unisex", price: 90 /* sample */, colours: ["Navy"], sizes: [{ size: "One size", availability: "Available" }],
    popular: 50, leadDays: 2,
    description: "A structured six-panel cap with an adjustable strap. Finishes any fit.",
    details: ["Brand new", "Adjustable strap", "Cotton twill"],
    art: { kind: "cap", tone: "navy", upper: "#00115b", accent: "#9cff00" },
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
      isNew: d.isNew, popular: d.popular, description: d.description, details: d.details, condition: original, art: d.art,
    },
    variantsOf(d),
  ),
);
