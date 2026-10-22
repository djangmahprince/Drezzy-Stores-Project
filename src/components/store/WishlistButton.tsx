"use client";

import { Icon } from "@/components/Icon";
import { toggleWishlist, useWishlist } from "@/lib/cart";

export function WishlistButton({ slug, name, className = "" }: { slug: string; name: string; className?: string }) {
  const saved = useWishlist().includes(slug);
  return (
    <button
      type="button"
      onClick={() => toggleWishlist(slug)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      className={`flex size-10 items-center justify-center rounded-full bg-white/95 text-navy shadow-sm transition active:scale-90 ${saved ? "text-error" : ""} ${className}`}
    >
      <Icon name="heart" size={20} filled={saved} />
    </button>
  );
}
