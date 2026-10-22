"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/track";

/** Records one anonymous step in the shopper's journey (no personal details). Renders nothing. */
export function Beacon({ name }: { name: "visit" | "product_view" | "add_to_cart" | "checkout_started" }) {
  useEffect(() => {
    trackEvent(name);
  }, [name]);
  return null;
}
