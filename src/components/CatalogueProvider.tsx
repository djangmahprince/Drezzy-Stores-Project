"use client";

import { createContext, useContext, useMemo } from "react";
import type { Product } from "@/lib/catalogue/types";

type Catalogue = { products: Product[]; get: (slug: string) => Product | undefined };

const Ctx = createContext<Catalogue | null>(null);

/** Hands the (cached) catalogue from the server to client components such as the cart, search and shop filters. */
export function CatalogueProvider({ products, children }: { products: Product[]; children: React.ReactNode }) {
  const value = useMemo<Catalogue>(() => {
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    return { products, get: (slug) => bySlug.get(slug) };
  }, [products]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useCatalogue(): Catalogue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCatalogue must be used inside <CatalogueProvider>.");
  return c;
}
