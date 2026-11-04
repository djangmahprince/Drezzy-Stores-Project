"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useEffect } from "react";
import { deleteArticleAction, restoreVersionAction, saveArticleAction, versionsAction, type Version } from "@/app/dashboard/content/actions";
import { parseBody, readingMinutes, slugFromTitle } from "@/lib/articles/format";
import type { StaffArticle } from "@/lib/articles/staff";

const types = ["Outfit guide", "How-to", "Trends", "Occasion lookbook", "Drop news", "Customer spotlight", "Gift guide"];
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
    tags: (initial?.tags ?? []).join(", "), featured: initial?.featured ?? false, seoTitle: initial?.seoTitle ?? "", seoDescription: initial?.seoDescription ?? "",
    heroImage: initial?.heroImage ?? "", shareImage: initial?.shareImage ?? "",
  });
  const [versions, setVersions] = useState<Version[]>([]);
  useEffect(() => {
    if (initial) void versionsAction(initial.id).then(setVersions);
  }, [initial]);
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
        <details className="rounded-[12px] bg-card p-3 text-xs text-text2">
          <summary className="cursor-pointer font-semibold text-ink">Add products, looks, videos and images</summary>
          <p className="mt-2">On a line of its own: <code>[product: nike-dunk]</code> for a live product card · <code>[look: campus-fit]</code> for Shop the Look · <code>[embed: https://youtu.be/…]</code> for a YouTube, TikTok or Instagram video · <code>![Alt text](path-from-media-library.jpg)</code> for an image · <code>[gallery: a.jpg, b.jpg]</code> · a line starting with <code>&gt; </code> for a quote.</p>
        </details>
        <p className="text-xs text-text2">Leave the article text empty to keep the built-in layout of a starter article. About {readingMinutes(f.intro, f.body)} min read.</p>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <label><span className="mb-1 block font-medium">Tags</span><input className="field" value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="campus, dunks, church" /></label>
          <label className="flex items-end gap-2 pb-3"><input type="checkbox" checked={f.featured} onChange={(e) => set("featured", e.target.checked)} className="size-5 accent-[#00115b]" /> Feature on Drip School home</label>
          <label><span className="mb-1 block font-medium">Hero image</span><input className="field" value={f.heroImage} onChange={(e) => set("heroImage", e.target.value)} placeholder="Path from the media library" /></label>
          <label><span className="mb-1 block font-medium">Share image</span><input className="field" value={f.shareImage} onChange={(e) => set("shareImage", e.target.value)} placeholder="For WhatsApp and Instagram previews" /></label>
          <label><span className="mb-1 block font-medium">SEO title <span className="font-normal text-text2">({f.seoTitle.length}/70)</span></span><input className="field" maxLength={70} value={f.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} /></label>
          <label><span className="mb-1 block font-medium">SEO description <span className="font-normal text-text2">({f.seoDescription.length}/170)</span></span><input className="field" maxLength={170} value={f.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} /></label>
        </div>
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
          {initial && f.status !== "published" && <button type="button" className="text-sm font-semibold text-navy underline" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/drip-school/preview/${initial.previewToken}`); setMsg({ text: "Preview link copied. Anyone with it can read the draft.", bad: false }); }}>Copy preview link</button>}
          {initial && canDelete && <button type="button" disabled={pending} className="ml-auto text-sm text-error underline" onClick={remove}>Delete</button>}
        </div>
        {versions.length > 0 && (
          <details className="rounded-[12px] border border-line bg-white p-3 text-sm">
            <summary className="cursor-pointer font-semibold">Version history ({versions.length})</summary>
            <ul className="mt-2 space-y-1">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2">
                  <span>{new Date(v.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {v.by ?? "Someone"} · {v.title}</span>
                  <button type="button" className="text-navy underline" onClick={() => start(async () => { const r = await restoreVersionAction(v.id); setMsg(r.ok ? { text: "Restored as a draft. Check it, then publish.", bad: false } : { text: r.error ?? "Could not restore.", bad: true }); router.refresh(); })}>Restore</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <section className="card h-fit p-5 text-[15px] leading-relaxed" aria-label="Preview">
        <p className="text-xs font-semibold uppercase tracking-wide text-text2">{f.type}</p>
        <h2 className="text-2xl font-bold leading-tight">{f.title || "Your title"}</h2>
        <p className="mt-3 text-text2">{f.intro || "Your introduction appears here."}</p>
        <div className="mt-4 space-y-3">
          {blocks.map((b, i) => b.t === "h" ? <h3 key={i} className="mt-4 text-lg font-bold">{b.text}</h3>
            : b.t === "ul" ? <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
            : b.t === "p" || b.t === "quote" ? <p key={i} className={b.t === "quote" ? "border-l-4 border-lime pl-3 italic" : ""}>{b.text}</p>
            : <p key={i} className="rounded-[10px] bg-card px-3 py-2 text-sm text-text2">{b.t === "product" ? `Product card: ${b.slug}` : b.t === "look" ? `Shop the look: ${b.slug}` : b.t === "embed" ? `${b.provider} video (loads when tapped)` : b.t === "img" ? `Image: ${b.alt || b.src}` : `Gallery of ${b.srcs.length} images`}</p>)}
        </div>
      </section>
    </div>
  );
}
