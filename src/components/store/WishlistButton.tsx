"use client";

import { wishlistToggleAction } from "@/app/(store)/account/actions";
import { useCatalogue } from "@/components/CatalogueProvider";
import { Icon } from "@/components/Icon";
import { toggleWishlist, useWishlist } from "@/lib/cart";
import { useShopper } from "@/lib/shopper";
import { track } from "@/lib/track";

/**
 * The heart (FR-SF-007). Guests keep their wishlist on the device; a signed-in shopper's heart is also saved to the account,
 * which is what lets us email them when a size comes back or the price drops.
 */
export function WishlistButton({ slug, name, className = "" }: { slug: string; name: string; className?: string }) {
  const saved = useWishlist().includes(slug);
  const { signedIn } = useShopper();
  const { get } = useCatalogue();
  return (
    <button
      type="button"
      onClick={() => {
        toggleWishlist(slug);
        if (!saved) track("add_to_wishlist", { product: slug });
        const id = get(slug)?.id;
        if (signedIn && id) void wishlistToggleAction(id, !saved);
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      className={`flex size-10 items-center justify-center rounded-full bg-white/95 text-navy shadow-sm transition active:scale-90 ${saved ? "text-error" : ""} ${className}`}
    >
      <Icon name="heart" size={20} filled={saved} />
    </button>
  );
}
