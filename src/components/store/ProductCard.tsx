import Image from "next/image";
import Link from "next/link";
import { ProductArt } from "@/components/ProductArt";
import { WishlistButton } from "@/components/store/WishlistButton";
import { availabilitySummary } from "@/lib/catalogue/build";
import type { Product } from "@/lib/catalogue/types";
import { formatGHS } from "@/lib/data";
import { publicFile } from "@/lib/media";

export function ProductCard({ product }: { product: Product }) {
  const a = availabilitySummary(product);
  const dot = { ok: "bg-success", warn: "bg-warning", bad: "bg-error" }[a.tone];
  return (
    <article className="group relative">
      <Link href={`/product/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-[24px] bg-white shadow-[0_8px_30px_rgba(0,17,91,0.10)] transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_36px_rgba(0,17,91,0.16)]">
          {product.images?.[0] && publicFile("media", product.images[0])
            ? <Image src={publicFile("media", product.images[0])!} alt={`${product.name}, product image`} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover transition duration-300 group-hover:scale-[1.03]" />
            : <ProductArt {...product.art} label={`${product.name}, product image`} className="transition duration-300 group-hover:scale-[1.03]" />}
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {product.isNew && <span className="chip bg-lime text-navy">NEW</span>}
            {product.compareAt && <span className="chip bg-white text-navy">SALE</span>}
            {product.releaseAt && <span className="chip bg-ink text-lime">DROP</span>}
          </div>
        </div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text2">{product.brand}</p>
        <h3 className="text-[15px] font-medium leading-snug">{product.name}</h3>
        {product.styles && <p className="text-xs text-text2">{product.styles.join(" · ")}</p>}
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-base font-semibold">
            {product.priceVaries && <span className="mr-1 text-sm font-normal text-text2">From</span>}{formatGHS(product.price)}
            {product.compareAt && <span className="ml-2 text-sm font-normal text-text2 line-through">{formatGHS(product.compareAt)}</span>}
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs text-text2">
            <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
            {a.label}
          </span>
        </div>
      </Link>
      <WishlistButton slug={product.slug} name={product.name} className="absolute right-3 top-3" />
    </article>
  );
}
