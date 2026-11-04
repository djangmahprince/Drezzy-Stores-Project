// Catalogue types shared by server and client code. No imports, so tests can load this file directly.

export type Availability = "Available" | "Limited" | "Unavailable" | "Pre-order";
export type Audience = "Men" | "Ladies" | "Men and ladies" | "Unisex";
export type Tone = "navy" | "grey" | "blue" | "red" | "charcoal";
export type ArtKind = "sneaker" | "apparel" | "watch" | "slide" | "cap";
export type Art = { kind: ArtKind; tone: Tone; upper: string; accent: string };

/** One size of one colour (and style, where the product has one). Price and availability live here. */
export type Variant = {
  id?: string;
  style?: string;
  colour: string;
  size: string;
  sku: string;
  price: number;
  compareAt?: number;
  availability: Availability;
  leadDays: number;
  /** When the sale price on this size ends (the normal price is then in compareAt). */
  saleEndsAt?: string;
  /** When a Pre-order size is expected. */
  expectedOn?: string;
};

export type Product = {
  id?: string;
  slug: string;
  sku: string;
  name: string;
  brand: string;
  category: string; // top-level category, for example "Sneakers"
  subcategory?: string; // for example "Men"
  audience: Audience;
  /** The lowest variant price. `priceVaries` says whether other variants cost more. */
  price: number;
  compareAt?: number;
  priceVaries: boolean;
  styles?: string[];
  colours: string[];
  variants: Variant[];
  /** One entry per size, showing the best availability across colours and styles. Used on cards and filters. */
  sizes: { size: string; availability: Availability }[];
  isNew?: boolean;
  popular: number;
  /** The shortest supplier lead time across variants. A chosen variant has its own. */
  leadDays: number;
  description: string;
  details: string[];
  condition: string;
  art: Art;
  /** Real photography (4:5), once uploaded. Without it the stand-in artwork is shown. */
  images?: string[];
  video?: string;
  material?: string;
  careNotes?: string;
  deliveryNotes?: string;
  /** A limited drop: hidden from purchase until this time, with a cap per customer. */
  releaseAt?: string;
  cap?: number;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
};

/** What a product looks like before its derived fields are worked out. */
export type ProductBase = Omit<Product, "price" | "compareAt" | "priceVaries" | "styles" | "colours" | "sizes" | "leadDays" | "variants">;
