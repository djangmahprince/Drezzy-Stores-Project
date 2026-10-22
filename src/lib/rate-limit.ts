import "server-only";
import { headers } from "next/headers";

// A small in-memory limiter for public endpoints (order lookup, payment retries). It is best effort: each server instance
// keeps its own counts, so it slows guessing and abuse but is not a guarantee. The database has its own limits as well.
const hits = new Map<string, number[]>();

export async function clientKey(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown").split(",")[0].trim();
}

/** True when this caller has used up `max` requests in the last `windowMs` for this bucket. */
export function limited(bucket: string, key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const k = `${bucket}:${key}`;
  const recent = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(k, recent);
    return true;
  }
  recent.push(now);
  hits.set(k, recent);
  // keep the map from growing without bound
  if (hits.size > 5000) for (const [key2, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(key2);
  return false;
}
