import "server-only";
import { connection } from "next/server";

/** The last `days` days as ISO dates (Ghana is on UTC). Waits for the request, so the dates are never baked into a prerender. */
export async function lastDays(days: number): Promise<{ from: string; to: string }> {
  await connection();
  const now = Date.now();
  return { from: new Date(now - (days - 1) * 86_400_000).toISOString().slice(0, 10), to: new Date(now).toISOString().slice(0, 10) };
}

/** Today and the current month, for server components. */
export async function today(): Promise<{ date: string; month: string; weekStart: string }> {
  await connection();
  const d = new Date();
  const dow = (d.getUTCDay() + 6) % 7;
  return { date: d.toISOString().slice(0, 10), month: d.toISOString().slice(0, 7), weekStart: new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10) };
}
