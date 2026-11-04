"use client";

import Link from "next/link";
import { useState } from "react";
import { saveStyleAction } from "@/app/(store)/account/actions";
import { useCatalogue } from "@/components/CatalogueProvider";
import { ProductCard } from "@/components/store/ProductCard";
import { saveStyleProfile, type StyleProfile } from "@/lib/personal";
import { useShopper } from "@/lib/shopper";
import { track } from "@/lib/track";

type Q = { key: string; title: string; options: string[]; multi?: boolean };
const questions: Q[] = [
  { key: "audience", title: "Who are you shopping for?", options: ["Men", "Ladies", "Both"] },
  { key: "shoe_size", title: "Your sneaker size (EU)", options: ["38", "39", "40", "41", "42", "43", "44", "45", "46"] },
  { key: "clothing_size", title: "Your clothing size", options: ["XS", "S", "M", "L", "XL", "XXL", "3XL"] },
  { key: "tags", title: "Which styles feel like you?", options: ["Streetwear", "Smart casual", "Sporty", "Minimal", "Bold colours", "Classic"], multi: true },
  { key: "occasions", title: "Where are you dressing for?", options: ["Campus", "Work", "Church", "Date night", "Events", "Everyday"], multi: true },
  { key: "budget", title: "Your budget per item", options: ["Under GHS 300", "GHS 300 to 500", "GHS 500 to 800", "GHS 800 and up"] },
];
const budget = { "Under GHS 300": 300, "GHS 300 to 500": 500, "GHS 500 to 800": 800, "GHS 800 and up": 5000 } as Record<string, number>;

/**
 * "Find your Drezzy style" (FR-JR-009): six questions that save sizes and taste. Kept on the device for guests and saved to
 * the account for signed-in shoppers; the home page then shows "Picked for you".
 */
export function StyleQuiz() {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Record<string, string[]>>({});
  const [done, setDone] = useState<StyleProfile | null>(null);
  const { signedIn } = useShopper();
  const { products } = useCatalogue();

  const q = questions[step];
  const pick = (opt: string) => setA((x) => {
    const cur = x[q.key] ?? [];
    return { ...x, [q.key]: q.multi ? (cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt]) : [opt] };
  });

  async function finish() {
    const profile: StyleProfile = {
      audience: (a.audience?.[0] as StyleProfile["audience"]) ?? "Both",
      shoe_size: a.shoe_size?.[0], clothing_size: a.clothing_size?.[0],
      tags: [...(a.tags ?? []), ...(a.occasions ?? [])], occasions: a.occasions ?? [], budget: budget[a.budget?.[0] ?? ""],
    };
    saveStyleProfile(profile);
    if (signedIn) await saveStyleAction(profile as unknown as Record<string, unknown>);
    track("quiz_complete", { style: profile.tags[0] ?? "none", audience: profile.audience });
    setDone(profile);
  }

  if (done) {
    const picks = products
      .filter((p) => !p.releaseAt && (!done.budget || p.price <= done.budget) && (done.audience === "Both" || p.audience === done.audience || p.audience === "Men and ladies" || p.audience === "Unisex"))
      .map((p) => ({ p, s: (done.shoe_size && p.sizes.some((x) => x.size === done.shoe_size && x.availability !== "Unavailable") ? 3 : 0) + (p.tags ?? []).filter((t) => done.tags.includes(t)).length * 2 + p.popular / 100 }))
      .sort((x, y) => y.s - x.s).slice(0, 8).map((x) => x.p);
    return (
      <div>
        <p className="label-wide text-text2">Your Drezzy style</p>
        <h1 className="mt-2 text-[28px] font-bold md:text-[40px]">{done.tags.slice(0, 2).join(" and ") || "Your picks"}</h1>
        <p className="mt-2 text-text2">Saved{signedIn ? " to your account" : " on this phone"}. We will show you sizes {done.shoe_size ? `EU ${done.shoe_size}` : ""}{done.clothing_size ? ` and ${done.clothing_size}` : ""} first.</p>
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">{picks.map((p) => <ProductCard key={p.slug} product={p} />)}</div>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link href="/shop" className="btn-primary">Shop everything</Link>
          <Link href="/looks" className="btn-outline">See full looks</Link>
          <button type="button" className="btn-outline" onClick={() => { setDone(null); setStep(0); }}>Retake</button>
        </div>
      </div>
    );
  }

  const chosen = a[q.key] ?? [];
  return (
    <div className="mx-auto max-w-xl">
      <p className="label-wide text-text2">Find your Drezzy style · {step + 1} of {questions.length}</p>
      <div className="mt-3 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-navy transition-all" style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></div>
      <h1 className="mt-6 text-[26px] font-bold md:text-[34px]">{q.title}</h1>
      {q.multi && <p className="text-sm text-text2">Choose as many as you like.</p>}
      <div className="mt-5 flex flex-wrap gap-2" role={q.multi ? "group" : "radiogroup"} aria-label={q.title}>
        {q.options.map((o) => (
          <button key={o} type="button" role={q.multi ? "checkbox" : "radio"} aria-checked={chosen.includes(o)} onClick={() => pick(o)}
            className={`chip min-h-12 px-5 text-sm ${chosen.includes(o) ? "bg-navy text-white" : "border border-line bg-white text-ink hover:border-navy"}`}>{o}</button>
        ))}
      </div>
      <div className="mt-8 flex gap-2">
        {step > 0 && <button type="button" className="btn-outline" onClick={() => setStep(step - 1)}>Back</button>}
        {step < questions.length - 1
          ? <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>{chosen.length ? "Next" : "Skip"}</button>
          : <button type="button" className="btn-lime" onClick={() => void finish()}>See my picks</button>}
      </div>
    </div>
  );
}
