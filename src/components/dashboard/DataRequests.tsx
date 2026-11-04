"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { handleRequestAction } from "@/app/dashboard/customers/actions";
import { Pill } from "@/components/dashboard/DashShell";

type Row = { id: string; kind: string; details: string | null; email: string | null; phone: string | null; status: string; due_at: string; created_at: string; response: string | null; handled_by_name: string | null; user_id: string | null; overdue?: boolean };
const kind: Record<string, string> = { access: "Send a copy", correct: "Correct", delete: "Delete", withdraw_consent: "Stop marketing" };

export function DataRequests({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [reply, setReply] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (id: string, status: "done" | "refused") => start(async () => { const r = await handleRequestAction(id, status, reply[id] ?? ""); setMsg(r.ok ? "Saved." : r.error); router.refresh(); });
  if (!rows.length) return <p className="card p-8 text-center text-sm text-text2">No requests.</p>;
  return (
    <div className="space-y-3">
      {msg && <p role="status" className="text-sm text-text2">{msg}</p>}
      <p className="rounded-[12px] bg-card p-3 text-sm text-text2">Before sending or deleting anything, confirm it is really the person (call the phone on the order, or reply to their email). To delete, open the customer and use Erase personal data; orders and money records stay, without their details.</p>
      {rows.map((r) => {
        const overdue = r.status === "open" && !!r.overdue;
        return (
          <article key={r.id} className="card space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{kind[r.kind] ?? r.kind} · {r.email ?? r.phone ?? (r.user_id ? "Account holder" : "")}</p>
              <div className="flex gap-1"><Pill tone={r.status === "open" ? (overdue ? "bad" : "warn") : r.status === "done" ? "ok" : "info"}>{r.status}</Pill><Pill>Due {new Date(r.due_at).toLocaleDateString("en-GB")}</Pill></div>
            </div>
            {r.details && <p className="text-text2">{r.details}</p>}
            {r.status === "open" ? (
              <div className="flex flex-wrap gap-2">
                <input className="field min-w-0 flex-1" value={reply[r.id] ?? ""} onChange={(e) => setReply((x) => ({ ...x, [r.id]: e.target.value }))} placeholder="What you did (kept on record)" aria-label="Response" />
                <button disabled={pending} className="btn-primary" onClick={() => act(r.id, "done")}>Done</button>
                <button disabled={pending} className="btn-outline" onClick={() => act(r.id, "refused")}>Refuse</button>
              </div>
            ) : <p className="text-text2">{r.response} {r.handled_by_name ? `· ${r.handled_by_name}` : ""}</p>}
          </article>
        );
      })}
    </div>
  );
}
