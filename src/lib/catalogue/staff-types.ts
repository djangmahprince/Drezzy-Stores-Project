// Types for the staff side of the catalogue. No imports beyond types, so client components can use them.
import type { Product, Variant } from "./types.ts";

export type Offer = { supplierId: string; cost: number; leadDays?: number; available: boolean };

export type StaffVariant = Variant & {
  id: string;
  preferredSupplierId?: string;
  lastCheckedAt?: string;
  /** When a Pre-order variant is expected. */
  expectedOn?: string;
  offers: Offer[];
};

export type StaffProduct = Omit<Product, "variants"> & {
  id: string;
  published: boolean;
  archived: boolean;
  tags: string[];
  categoryId?: string;
  variants: StaffVariant[];
};

export type SupplierRow = {
  id: string; name: string; phone?: string; whatsapp?: string; notes?: string; active: boolean;
  contactPerson?: string; location?: string; supplies?: string; trusted?: boolean;
};
export type CategoryRow = { id: string; name: string; parentId?: string };

/** What the signed-in person may do in the catalogue. The database enforces it again on every write. */
export type CatalogueRights = {
  canEditPrice: boolean;
  canEditAvailability: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canSeeCosts: boolean;
};

export type StaffCatalogue = {
  mode: "db" | "demo";
  products: StaffProduct[];
  suppliers: SupplierRow[];
  categories: CategoryRow[];
  rights: CatalogueRights;
  /** Days after which availability counts as not checked (Settings, PRD default 7). */
  staleDays: number;
};

export type ProductStatus = "draft" | "active" | "archived";

/** Everything the product editor shows. Prices and sizes stay on the catalogue screen. */
export type ProductEdit = {
  id: string; slug: string; sku: string; name: string; brand: string; categoryId: string; audience: string;
  description: string; details: string[]; condition: string; isNew: boolean; popular: number; tags: string[]; images: string[];
  videoUrl: string; material: string; careNotes: string; deliveryNotes: string; seoTitle: string; seoDescription: string; family: string;
  releaseAt: string | null; capPerCustomer: number | null; status: ProductStatus;
  /** The sale running on the product's sizes, when there is one. */
  sale: { minPrice: number; maxPrice: number; salePrice: number | null; startsAt: string | null; endsAt: string | null; compareAt: number | null };
};

/** Changes applied to every selected product. Only the fields present are written. */
export type BulkPatch = {
  price?: number;
  pricePct?: number;
  availability?: Variant["availability"];
  leadDays?: number;
  categoryId?: string;
  status?: ProductStatus;
  addTags?: string[];
  removeTags?: string[];
  markChecked?: boolean;
};

/** A change to one variant, sent from the catalogue screen. Only the fields present are written. */
export type VariantChange = {
  id: string;
  price?: number;
  compareAt?: number | null;
  availability?: Variant["availability"];
  leadDays?: number;
  supplierId?: string | null;
  cost?: number | null;
  expectedOn?: string | null;
  markChecked?: boolean;
};
