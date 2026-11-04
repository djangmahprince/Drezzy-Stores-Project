"use client";

import Link from "next/link";
import { useState } from "react";
import { notifyMeAction } from "@/app/(store)/actions";
import { useCatalogue } from "@/components/CatalogueProvider";
import { ProductPhoto } from "@/components/ProductPhoto";
import { Countdown } from "@/components/store/Countdown";
import { formatGHS } from "@/lib/data";
import { useNow } from "@/lib/now";

function Notify({ productId }: { productId?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<string | null>(null);
  if (!productId) return null;
  if (state === "ok") return <p className="text-sm text-success" role="status">We will email you when it opens.</p>;
  return (
    <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await notifyMeAction(email, productId, null, "drop"); setState(r.ok ? "ok" : r.error); }}>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email for drop reminder" className="field !min-h-10" />
      <button className="btn-primary !min-h-10 !px-4">Notify me</button>
      {state && state !== "ok" && <p role="alert" className="text-sm text-error">{state}</p>}
    </form>
  );
}

/** The drop calendar (FR-SF-010): upcoming drops with a countdown and Notify me, then recent drops. */
export function DropCalendar() {
  const { products } = useCatalogue();
  const now = useNow();
  const drops = products.filter((p) => p.releaseAt).sort((a, b) => Date.parse(a.releaseAt!) - Date.parse(b.releaseAt!));
  if (now === null) return <div className="mt-6 h-40 animate-pulse rounded-[24px] bg-white" />;
  const upcoming = drops.filter((p) => Date.parse(p.releaseAt!) > now);
  const live = drops.filter((p) => Date.parse(p.releaseAt!) <= now).reverse().slice(0, 8);
  const month = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(iso));
  const byMonth = upcoming.reduce<Record<string, typeof upcoming>>((acc, p) => ((acc[month(p.releaseAt!)] ??= []).push(p), acc), {});
  return (
    <div className="mt-8 space-y-10">
      {upcoming.length === 0 && <p className="card p-8 text-center text-text2">No drops announced right now. Follow us on Instagram so you hear first.</p>}
      {Object.entries(byMonth).map(([m, list]) => (
        <section key={m}>
          <h2 className="text-xl font-bold">{m}</h2>
          <ul className="mt-3 grid gap-4 md:grid-cols-2">
            {list.map((p) => (
              <li key={p.slug} className="card flex gap-4 p-4">
                <Link href={`/product/${p.slug}`} className="size-28 shrink-0 overflow-hidden rounded-[16px]"><ProductPhoto product={p} label={p.name} sizes="300px" /></Link>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase text-text2">{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(p.releaseAt!))}</p>
                  <Link href={`/product/${p.slug}`} className="font-semibold hover:underline">{p.name}</Link>
                  <p className="text-sm text-text2">{formatGHS(p.price)}{p.cap ? ` · ${p.cap} per customer` : ""}</p>
                  <p className="mt-1 text-sm font-semibold text-navy"><Countdown to={p.releaseAt!} /></p>
                  <Notify productId={p.id} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {live.length > 0 && (
        <section>
          <h2 className="text-xl font-bold">Live now and recent</h2>
          <ul className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
            {live.map((p) => (
              <li key={p.slug}><Link href={`/product/${p.slug}`} className="block"><div className="aspect-[4/5] overflow-hidden rounded-[16px]"><ProductPhoto product={p} label={p.name} sizes="300px" /></div><p className="mt-2 text-sm font-medium">{p.name}</p></Link></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
