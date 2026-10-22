// Types for the staff side of the catalogue. No imports beyond types, so client components can use them.
import type { Product, Variant } from "./types.ts";

export type Offer = { supplierId: string; cost: number; leadDays?: number; available: boolean };

export type StaffVariant = Variant & {
  id: string;
  preferredSupplierId?: string;
  lastCheckedAt?: string;
  offers: Offer[];
};

export type StaffProduct = Omit<Product, "variants"> & {
  id: string;
  published: boolean;
  categoryId?: string;
  variants: StaffVariant[];
};

export type SupplierRow = { id: string; name: string; phone?: string; whatsapp?: string; notes?: string; active: boolean };
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
  markChecked?: boolean;
};
