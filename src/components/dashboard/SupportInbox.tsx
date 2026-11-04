"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { supportReplyAction } from "@/app/dashboard/orders/actions";
import { Pill } from "@/components/dashboard/DashShell";

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>) => (Array.isArray(v) ? v[0] : v) ?? null;
type Thread = {
  id: string; subject: string; status: string; complaint: boolean; last_message_at: string; first_reply_at: string | null; created_at: string;
  order: One<{ id: string; number: string }>; customer: One<{ id: string; full_name: string; phone: string | null }>;
  messages: { id: number; from_staff: boolean; author_name: string; body: string; at: string }[];
};
const t = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function SupportInbox({ threads, selected, status }: { threads: Thread[]; selected: string | null; status: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cur = threads.find((x) => x.id === selected) ?? threads[0];
  const send = (close: boolean) => start(async () => {
    if (!cur) return;
    const r = await supportReplyAction(cur.id, body, close);
    setMsg(r.ok ? (close ? "Closed." : "Sent and emailed to the customer.") : r.error);
    if (r.ok) { setBody(""); router.refresh(); }
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="space-y-2">
        <nav className="flex gap-1 text-sm">{["open", "waiting", "closed", "all"].map((s) => <Link key={s} href={`/dashboard/support?status=${s}`} className={`chip min-h-9 px-3 ${status === s ? "bg-navy text-white" : "bg-white text-navy"}`}>{s === "waiting" ? "Replied" : s}</Link>)}</nav>
        {threads.length === 0 && <p className="card p-6 text-center text-sm text-text2">Nothing here.</p>}
        <ul className="space-y-2">
          {threads.map((x) => {
            const last = [...x.messages].sort((a, b) => b.at.localeCompare(a.at))[0];
            return (
              <li key={x.id}>
                <Link href={`/dashboard/support?status=${status}&thread=${x.id}`} className={`card block p-3 text-sm ${cur?.id === x.id ? "ring-2 ring-navy" : ""}`}>
                  <p className="flex items-center justify-between gap-2 font-semibold"><span className="truncate">{one(x.customer)?.full_name ?? "Customer"}</span><span className="text-xs font-normal text-text2">{t(x.last_message_at)}</span></p>
                  <p className="truncate">{x.subject}</p>
                  <p className="truncate text-xs text-text2">{last?.from_staff ? "You: " : ""}{last?.body}</p>
                  {x.complaint && <Pill tone="bad">Complaint</Pill>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      {cur && (
        <section className="card flex min-h-96 flex-col p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div>
              <p className="font-semibold">{cur.subject}</p>
              <p className="text-text2">
                {one(cur.customer) && <Link href={`/dashboard/customers/${one(cur.customer)!.id}`} className="underline">{one(cur.customer)!.full_name}</Link>}
                {one(cur.order) && <> · <Link href={`/dashboard/orders/${one(cur.order)!.number}`} className="underline">{one(cur.order)!.number}</Link></>}
                {cur.first_reply_at && <> · first reply after {Math.max(1, Math.round((Date.parse(cur.first_reply_at) - Date.parse(cur.created_at)) / 60_000))} min</>}
              </p>
            </div>
            <Pill tone={cur.status === "open" ? "warn" : cur.status === "closed" ? "info" : "ok"}>{cur.status === "waiting" ? "Replied" : cur.status}</Pill>
          </div>
          <ul className="flex-1 space-y-2 overflow-y-auto py-3">
            {[...cur.messages].sort((a, b) => a.at.localeCompare(b.at)).map((m) => (
              <li key={m.id} className={`max-w-[80%] rounded-[12px] px-3 py-2 ${m.from_staff ? "ml-auto bg-navy text-white" : "bg-card"}`}>
                <p className="whitespace-pre-wrap">{m.body}</p><p className={`mt-1 text-[11px] ${m.from_staff ? "text-white/70" : "text-text2"}`}>{m.author_name} · {t(m.at)}</p>
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t border-line pt-3">
            <textarea className="field py-2" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply. The customer gets it by email and sees it on their tracking page." aria-label="Reply" />
            <div className="flex flex-wrap gap-2">
              <button disabled={pending || !body.trim()} className="btn-primary" onClick={() => send(false)}>Send</button>
              <button disabled={pending} className="btn-outline" onClick={() => send(true)}>{body.trim() ? "Send and close" : "Close"}</button>
              {msg && <span role="status" className="self-center text-text2">{msg}</span>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
