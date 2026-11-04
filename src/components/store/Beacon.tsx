"use client";

import { useEffect } from "react";
import { trackEvent, type StepName } from "@/lib/track";

/** Records one anonymous step in the shopper's journey (no personal details). Renders nothing. */
export function Beacon({ name, params }: { name: StepName; params?: Record<string, string | number> }) {
  const key = JSON.stringify(params ?? {});
  useEffect(() => {
    trackEvent(name, JSON.parse(key));
  }, [name, key]);
  return null;
}
