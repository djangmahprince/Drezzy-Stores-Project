"use client";

import { createContext, useContext, useMemo } from "react";
import type { Product } from "@/lib/catalogue/types";
import type { Zone } from "@/lib/data";

type Catalogue = { products: Product[]; get: (slug: string) => Product | undefined; zones: Zone[]; zone: (region: string) => Zone | undefined };

const Ctx = createContext<Catalogue | null>(null);

/** Hands the (cached) catalogue from the server to client components such as the cart, search and shop filters. */
export function CatalogueProvider({ products, zones, children }: { products: Product[]; zones: Zone[]; children: React.ReactNode }) {
  const value = useMemo<Catalogue>(() => {
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    return { products, get: (slug) => bySlug.get(slug), zones, zone: (region) => zones.find((z) => z.region === region) };
  }, [products, zones]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useCatalogue(): Catalogue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCatalogue must be used inside <CatalogueProvider>.");
  return c;
}
