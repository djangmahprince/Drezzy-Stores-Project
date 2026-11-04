"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { addSocialReviewAction, mediaAltAction, mediaListAction, mediaUploadAction, moderateReviewAction, reviewsAction, type MediaItem, type ReviewRow } from "@/app/dashboard/content/actions";
import { Pill } from "@/components/dashboard/DashShell";

type Msg = { text: string; bad?: boolean } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role={m.bad ? "alert" : "status"} className={`rounded-[12px] px-3 py-2 text-sm ${m.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{m.text}</p> : null);

/** Media library (FR-CMS-007): upload with alt text and a folder; copy the path into articles, banners and products. */
export function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [folder, setFolder] = useState("all");
  const [pending, start] = useTransition();
  const load = () => mediaListAction().then(setItems);
  useEffect(() => void load(), []);
  const folders = [...new Set((items ?? []).map((i) => i.folder))].sort();
  const list = (items ?? []).filter((i) => folder === "all" || i.folder === folder);
  return (
    <div className="space-y-4">
      <form className="card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_160px_auto]" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const form = e.currentTarget; start(async () => { const r = await mediaUploadAction(fd); setMsg(r.ok ? { text: `Uploaded. Path: ${r.path}` } : { text: r.error ?? "Upload failed", bad: true }); if (r.ok) { form.reset(); void load(); } }); }}>
        <input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4" className="field py-2" aria-label="File" required />
        <input name="alt" className="field" placeholder="Alt text: what is in the picture" aria-label="Alt text" required />
        <input name="folder" className="field" placeholder="Folder, for example products" aria-label="Folder" defaultValue="general" />
        <button disabled={pending} className="btn-primary">{pending ? "Uploading…" : "Upload"}</button>
        <p className="text-xs text-text2 sm:col-span-4">Use 4:5 photos at least 1200 px on the long side for products (PRD image rules). The shop serves them resized as WebP or AVIF.</p>
      </form>
      <Note m={msg} />
      {folders.length > 1 && (
        <div className="flex flex-wrap gap-2">{["all", ...folders].map((f) => <button key={f} type="button" onClick={() => setFolder(f)} className={`chip min-h-9 px-3 ${folder === f ? "bg-navy text-white" : "bg-white text-navy"}`}>{f}</button>)}</div>
      )}
      {items === null ? <div className="h-40 animate-pulse rounded-[12px] bg-white" /> : list.length === 0 ? <p className="card p-6 text-center text-sm text-text2">No media yet.</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {list.map((m) => (
            <li key={m.id} className="card overflow-hidden">
              <div className="relative aspect-[4/5] bg-card">{m.path.endsWith(".mp4") ? <span className="flex size-full items-center justify-center text-sm text-text2">Video</span> : <Image src={m.url} alt={m.alt ?? ""} fill sizes="200px" className="object-cover" />}</div>
              <div className="space-y-1 p-2 text-xs">
                <input defaultValue={m.alt ?? ""} onBlur={(e) => void mediaAltAction(m.id, e.target.value)} className="w-full rounded border border-line px-1 py-0.5" aria-label="Alt text" />
                <button type="button" className="text-navy underline" onClick={() => { void navigator.clipboard.writeText(m.path); setMsg({ text: `Copied ${m.path}` }); }}>Copy path</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Review moderation and the testimonial manager (FR-SF-013, FR-CMS-009). */
export function ReviewModeration() {
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [filter, setFilter] = useState("pending");
  const [msg, setMsg] = useState<Msg>(null);
  const [add, setAdd] = useState({ productSlug: "", rating: 5, body: "", name: "", source: "instagram" as "instagram" | "whatsapp", consent: false });
  const [pending, start] = useTransition();
  const load = () => reviewsAction().then(setRows);
  useEffect(() => void load(), []);
  const list = (rows ?? []).filter((r) => filter === "all" || r.status === filter);
  const act = (id: string, patch: Parameters<typeof moderateReviewAction>[1]) => start(async () => { const r = await moderateReviewAction(id, patch); setMsg(r.ok ? { text: "Saved." } : { text: r.error ?? "Failed", bad: true }); void load(); });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{[["pending", "Waiting"], ["approved", "Published"], ["hidden", "Hidden"], ["all", "All"]].map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} className={`chip min-h-9 px-3 ${filter === k ? "bg-navy text-white" : "bg-white text-navy"}`}>{l} {rows ? `(${rows.filter((r) => k === "all" || r.status === k).length})` : ""}</button>)}</div>
      <Note m={msg} />
      {rows === null ? <div className="h-40 animate-pulse rounded-[12px] bg-white" /> : list.length === 0 ? <p className="card p-6 text-center text-sm text-text2">Nothing here.</p> : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className="card p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p><b>{"★".repeat(r.rating)}</b> {r.title && <b>· {r.title}</b>} <span className="text-text2">{r.product ? `on ${r.product.name}` : ""}</span></p>
                <div className="flex gap-1">{r.verified && <Pill tone="ok">Verified buyer</Pill>}<Pill tone={r.consent ? "info" : "bad"}>{r.consent ? "May publish" : "No consent"}</Pill><Pill>{r.source}</Pill></div>
              </div>
              <textarea defaultValue={r.body} rows={2} onBlur={(e) => e.target.value !== r.body && act(r.id, { body: e.target.value })} className="field mt-2 py-2" aria-label="Review text (edit for length)" />
              <p className="mt-1 text-xs text-text2">{r.display_name}{r.city ? `, ${r.city}` : ""} · {new Date(r.created_at).toLocaleDateString("en-GB")}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={pending || !r.consent} className="btn-primary !min-h-9 !px-3 text-sm disabled:opacity-50" onClick={() => act(r.id, { status: "approved" })}>Publish</button>
                <button type="button" disabled={pending} className="btn-outline !min-h-9 !px-3 text-sm" onClick={() => act(r.id, { status: "hidden" })}>Hide</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="card grid gap-3 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addSocialReviewAction(add); setMsg(r.ok ? { text: "Added and published." } : { text: r.error ?? "Failed", bad: true }); if (r.ok) { setAdd({ ...add, body: "", name: "", consent: false }); void load(); } }); }}>
        <h3 className="font-semibold sm:col-span-2">Add a review from Instagram or WhatsApp</h3>
        <input className="field" placeholder="Product web address (optional)" value={add.productSlug} onChange={(e) => setAdd({ ...add, productSlug: e.target.value })} aria-label="Product" />
        <select className="field" value={add.rating} onChange={(e) => setAdd({ ...add, rating: Number(e.target.value) })} aria-label="Rating">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}</select>
        <textarea className="field py-2 sm:col-span-2" rows={2} placeholder="What they said" value={add.body} onChange={(e) => setAdd({ ...add, body: e.target.value })} aria-label="Review" required />
        <input className="field" placeholder="Name to show" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} aria-label="Name" />
        <select className="field" value={add.source} onChange={(e) => setAdd({ ...add, source: e.target.value as "instagram" | "whatsapp" })} aria-label="Source"><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option></select>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={add.consent} onChange={(e) => setAdd({ ...add, consent: e.target.checked })} className="size-5 accent-[#00115b]" /> The customer agreed that we publish this</label>
        <button disabled={pending} className="btn-primary sm:col-span-2 sm:w-fit">Add review</button>
      </form>
    </div>
  );
}

const reminders: [number, number, string][] = [[2, 1, "Valentine's gift guide"], [3, 15, "Easter and church looks"], [7, 1, "Graduation gift guide"], [8, 15, "Back to campus"], [11, 15, "Detty December looks"], [12, 1, "Christmas gift guide"]];

/** Content calendar (FR-JR-011): what is scheduled or published each day of the month, with seasonal reminders. */
export function ContentCalendar({ articles }: { articles: { id: string; title: string; status: string; publishAt: string | null }[] }) {
  const [offset, setOffset] = useState(0);
  const [base] = useState(() => new Date());
  const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const lead = (d.getDay() + 6) % 7;
  const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const onDay = (n: number) => articles.filter((a) => a.publishAt && new Date(a.publishAt).getFullYear() === d.getFullYear() && new Date(a.publishAt).getMonth() === d.getMonth() && new Date(a.publishAt).getDate() === n);
  const remind = reminders.filter(([m]) => m === d.getMonth() + 1 || m === d.getMonth() + 2);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><button type="button" className="btn-outline !min-h-9" onClick={() => setOffset((o) => o - 1)}>‹</button><p className="min-w-40 text-center font-semibold">{label}</p><button type="button" className="btn-outline !min-h-9" onClick={() => setOffset((o) => o + 1)}>›</button></div>
      {remind.length > 0 && <p className="rounded-[12px] bg-[#fbeedb] p-3 text-sm text-warning">Coming up: {remind.map(([m, day, t]) => `${t} (${day} ${new Date(2000, m - 1, 1).toLocaleDateString("en-GB", { month: "short" })})`).join(" · ")}</p>}
      <div className="grid grid-cols-7 gap-1 text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => <p key={x} className="p-1 font-semibold text-text2">{x}</p>)}
        {Array.from({ length: lead }).map((_, i) => <span key={`l${i}`} />)}
        {Array.from({ length: days }).map((_, i) => (
          <div key={i} className="min-h-20 rounded-[8px] border border-line bg-white p-1">
            <p className="text-text2">{i + 1}</p>
            {onDay(i + 1).map((a) => <Link key={a.id} href={`/dashboard/content/${a.id}`} className={`mt-1 block truncate rounded px-1 ${a.status === "published" ? "bg-[#e3f5ee] text-success" : "bg-[#e6eaf8] text-navy"}`}>{a.title}</Link>)}
          </div>
        ))}
      </div>
    </div>
  );
}
