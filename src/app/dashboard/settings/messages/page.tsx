import { Suspense } from "react";
import { Pill, Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { channelsReady } from "@/lib/notify/send";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Message log" };

/** The delivery log (FR-NT-003): every message queued, sent, failed or skipped, with the error. */
async function Log({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  let q = (await createClient()).from("notifications").select("id, channel, template, to_address, status, attempts, last_error, created_at, sent_at").order("created_at", { ascending: false }).limit(300);
  if (status && ["queued", "sending", "sent", "failed", "skipped"].includes(status)) q = q.eq("status", status);
  const { data } = await q;
  const ready = channelsReady();
  const rows = (data ?? []) as { id: number; channel: string; template: string; to_address: string; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null }[];
  const mask = (a: string) => (a.includes("@") ? a.replace(/^(.).*(@.*)$/, "$1•••$2") : a.replace(/^(\+\d{4}).*(\d{2})$/, "$1•••$2"));
  return (
    <>
      <p className="mb-3 text-sm text-text2">Channels switched on: {ready.length ? ready.join(", ") : "none yet"}. Messages for channels that are not set up wait in the queue.</p>
      <nav className="mb-3 flex gap-2 text-sm">{["all", "queued", "sent", "failed", "skipped"].map((s) => <a key={s} href={s === "all" ? "?" : `?status=${s}`} className={`chip min-h-9 px-3 ${(status ?? "all") === s ? "bg-navy text-white" : "bg-white text-navy"}`}>{s}</a>)}</nav>
      <Table head={["When", "Channel", "Message", "To", "Status", "Tries", "Problem"]} rows={rows.map((r) => [
        new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), r.channel, r.template, mask(r.to_address),
        <Pill key={r.id} tone={r.status === "sent" ? "ok" : r.status === "failed" ? "bad" : r.status === "skipped" ? "info" : "warn"}>{r.status}</Pill>, r.attempts, r.last_error ?? "",
      ])} />
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  return <Guard module="settings"><Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><Log searchParams={searchParams} /></Suspense></Guard>;
}
