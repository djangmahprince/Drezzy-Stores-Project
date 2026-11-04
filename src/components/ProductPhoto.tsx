import Image from "next/image";
import { ProductArt } from "@/components/ProductArt";
import type { Product } from "@/lib/catalogue/types";
import { publicFile } from "@/lib/media";

/** The product's first photo, resized for where it is shown. A product with no photo yet shows the stand-in artwork. */
export function ProductPhoto({ product, label = "", sizes = "96px", className = "", priority }: { product: Pick<Product, "images" | "art" | "name">; label?: string; sizes?: string; className?: string; priority?: boolean }) {
  const src = publicFile("media", product.images?.[0]);
  if (!src) return <ProductArt {...product.art} label={label} className={className} />;
  return <span className="relative block size-full"><Image src={src} alt={label} fill sizes={sizes} className={`object-cover ${className}`} priority={priority} /></span>;
}
