"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteArticleAction, saveArticleAction } from "@/app/dashboard/content/actions";
import { parseBody, readingMinutes, slugFromTitle } from "@/lib/articles/format";
import type { StaffArticle } from "@/lib/articles/staff";

const types = ["Outfit guide", "How-to", "Trends"];
const tones = ["navy", "grey", "blue", "red", "charcoal"];
const kinds = ["sneaker", "apparel", "watch", "slide", "cap"];

/** The date-time field wants local time without seconds. */
const local = (iso: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function ArticleEditor({ initial, canDelete }: { initial: StaffArticle | null; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [f, setF] = useState({
    title: initial?.title ?? "", slug: initial?.slug ?? "", type: initial?.type ?? "How-to", tone: initial?.tone ?? "navy", kind: initial?.kind ?? "sneaker",
    intro: initial?.intro ?? "", body: initial?.body ?? "", status: initial?.status ?? "draft", publishAt: local(initial?.publishAt ?? null),
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  function save() {
    start(async () => {
      const res = await saveArticleAction({ id: initial?.id, ...f, publishAt: f.status === "published" ? f.publishAt : null });
      if (!res.ok) return setMsg({ text: res.error, bad: true });
      setMsg({ text: f.status === "published" ? "Saved. It is live on the shop at its publish time." : "Saved.", bad: false });
      if (!initial) router.replace(`/dashboard/content/${res.id}`);
      else router.refresh();
    });
  }

  function remove() {
    if (!initial || !window.confirm(`Delete "${initial.title}"? This cannot be undone.`)) return;
    start(async () => {
      const res = await deleteArticleAction(initial.id);
      if (res.ok) router.push("/dashboard/content");
      else setMsg({ text: res.error ?? "Could not delete.", bad: true });
    });
  }

  const blocks = parseBody(f.body);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        {msg && <p role="status" className={`rounded-[12px] p-3 text-sm ${msg.bad ? "bg-[#fdecec] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
        <label className="block text-sm"><span className="mb-1 block font-medium">Title</span>
          <input className="field" maxLength={140} value={f.title} onChange={(e) => { set("title", e.target.value); if (!slugTouched) set("slug", slugFromTitle(e.target.value)); }} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium">Web address</span>
          <span className="flex items-center gap-1 text-text2">/drip-school/<input aria-label="Web address" className="field !min-h-10" value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} /></span></label>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <label><span className="mb-1 block font-medium">Type</span><select className="field" value={f.type} onChange={(e) => set("type", e.target.value)}>{types.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label><span className="mb-1 block font-medium">Colour</span><select className="field" value={f.tone} onChange={(e) => set("tone", e.target.value)}>{tones.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label><span className="mb-1 block font-medium">Picture</span><select className="field" value={f.kind} onChange={(e) => set("kind", e.target.value)}>{kinds.map((t) => <option key={t}>{t}</option>)}</select></label>
        </div>
        <label className="block text-sm"><span className="mb-1 block font-medium">Introduction <span className="font-normal text-text2">({f.intro.length}/600)</span></span>
          <textarea className="field min-h-24" maxLength={600} value={f.intro} onChange={(e) => set("intro", e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium">Article text</span>
          <textarea className="field min-h-72" maxLength={20000} value={f.body} onChange={(e) => set("body", e.target.value)} placeholder={"Write in plain text.\n\n## A heading\n\nA paragraph.\n\n- A bullet\n- Another bullet"} /></label>
        <p className="text-xs text-text2">Leave the article text empty to keep the built-in layout of a starter article. About {readingMinutes(f.intro, f.body)} min read.</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label><span className="mb-1 block font-medium">Status</span>
            <select className="field" value={f.status} onChange={(e) => set("status", e.target.value as typeof f.status)}>
              <option value="draft">Draft</option><option value="in_review">In review</option><option value="published">Published</option>
            </select></label>
          {f.status === "published" && <label><span className="mb-1 block font-medium">Goes live</span><input type="datetime-local" className="field" value={f.publishAt} onChange={(e) => set("publishAt", e.target.value)} /></label>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} className="btn-primary !min-h-10 disabled:opacity-60" onClick={save}>{pending ? "Saving…" : "Save"}</button>
          <Link href="/dashboard/content" className="btn-outline !min-h-10">Back</Link>
          {initial && f.status === "published" && <Link href={`/drip-school/${f.slug}`} className="text-sm font-semibold text-navy underline" target="_blank">View on the shop</Link>}
          {initial && canDelete && <button type="button" disabled={pending} className="ml-auto text-sm text-error underline" onClick={remove}>Delete</button>}
        </div>
      </div>

      <section className="card h-fit p-5 text-[15px] leading-relaxed" aria-label="Preview">
        <p className="text-xs font-semibold uppercase tracking-wide text-text2">{f.type}</p>
        <h2 className="text-2xl font-bold leading-tight">{f.title || "Your title"}</h2>
        <p className="mt-3 text-text2">{f.intro || "Your introduction appears here."}</p>
        <div className="mt-4 space-y-3">
          {blocks.map((b, i) => b.t === "h" ? <h3 key={i} className="mt-4 text-lg font-bold">{b.text}</h3>
            : b.t === "ul" ? <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
            : <p key={i}>{b.text}</p>)}
        </div>
      </section>
    </div>
  );
}
