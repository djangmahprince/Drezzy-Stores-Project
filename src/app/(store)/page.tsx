import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { ProductArt } from "@/components/ProductArt";
import { ProductCard } from "@/components/store/ProductCard";
import type { ArtKind, Tone } from "@/lib/catalogue/types";
import { getCatalogue } from "@/lib/catalogue/server";
import { articles, formatGHS } from "@/lib/data";

const tiles: { label: string; href: string; tone: Tone; kind: ArtKind; upper: string; accent: string }[] = [
  { label: "Sneakers", href: "/shop?category=Sneakers", tone: "navy", kind: "sneaker", upper: "#f4f4f6", accent: "#9cff00" },
  { label: "Outfits", href: "/shop?category=Outfits", tone: "blue", kind: "apparel", upper: "#f2f3f8", accent: "#00115b" },
  { label: "Watches", href: "/shop?category=Watches", tone: "charcoal", kind: "watch", upper: "#0036ff", accent: "#e9eaf0" },
  { label: "Ladies sneakers", href: "/shop?category=Ladies%20sneakers", tone: "grey", kind: "sneaker", upper: "#fafafc", accent: "#00115b" },
];

const promises: { icon: IconName; title: string; text: string }[] = [
  { icon: "truck", title: "Nationwide delivery", text: "From our Accra and Kumasi branches" },
  { icon: "shield", title: "Pay with MoMo or card", text: "Secured by Paystack" },
  { icon: "chat", title: "Real people on WhatsApp", text: "One tap from every page" },
];

export default async function Home() {
  const products = await getCatalogue();
  const hero = products.find((p) => p.isNew && p.category === "Sneakers") ?? products.find((p) => p.isNew) ?? products[0];
  const fresh = products.filter((p) => p.isNew).concat(products.filter((p) => !p.isNew)).slice(0, 4);
  const best = [...products].sort((a, b) => b.popular - a.popular).slice(0, 4);
  // the "street wear, sorted" strip: a cap, an outfit and a sneaker, whichever the catalogue has
  const pick = (re: RegExp, exclude: string[] = []) => products.find((p) => re.test(p.category + " " + (p.subcategory ?? "")) && !exclude.includes(p.slug));
  const look = [pick(/accessor|cap/i), pick(/outfit/i), pick(/sneaker/i)].filter((p): p is NonNullable<typeof p> => !!p);

  return (
    <div className="space-y-14">
      <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-navy to-navy-2 text-white md:grid md:grid-cols-2 md:items-center">
        <span aria-hidden="true" className="pointer-events-none absolute -left-4 top-1/2 -translate-y-1/2 select-none text-[34vw] font-extrabold uppercase leading-none tracking-tighter text-white/[0.05] md:text-[16rem]">
          Drezzy
        </span>
        <div className="relative p-6 pb-2 md:p-12">
          <p className="label-wide text-lime">Your outfits solution</p>
          <h1 className="mt-4 text-[36px] font-extrabold uppercase leading-[1.02] tracking-tight md:text-[56px]">
            You order.<br />We deliver.<br /><span className="text-lime">You drip.</span>
          </h1>
          <p className="mt-4 max-w-md text-white/85">Sneakers, outfits and watches from trusted suppliers, delivered anywhere in Ghana.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/shop?category=Sneakers" className="btn-lime">Shop sneakers <Icon name="arrow" size={18} /></Link>
            <Link href="/drip-school" className="btn border border-white/40 text-white hover:bg-white/10">Outfit ideas</Link>
          </div>
        </div>
        <div className="relative p-6 md:p-10">
          {hero && (
            <Link href={`/product/${hero.slug}`} className="hero-card group relative block rotate-[-2deg] p-3 text-ink transition duration-300 hover:rotate-0">
              <span className="chip absolute left-6 top-6 z-10 bg-lime text-navy">NEW IN</span>
              <div className="aspect-[4/5] overflow-hidden rounded-[18px]">
                <ProductArt {...hero.art} label={`${hero.name}, product image`} className="transition duration-300 group-hover:scale-105" />
              </div>
              <div className="flex items-center justify-between gap-3 px-1 pb-1 pt-3">
                <p className="line-clamp-1 text-sm font-medium">{hero.name}</p>
                <p className="shrink-0 font-bold">{formatGHS(hero.price)}</p>
              </div>
            </Link>
          )}
        </div>
      </section>

      <section aria-label="Delivery promise" className="-mt-6 grid gap-3 md:grid-cols-3">
        {promises.map((p) => (
          <div key={p.title} className="card flex items-center gap-3 p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-navy text-lime"><Icon name={p.icon} size={22} /></span>
            <div><p className="font-semibold leading-tight">{p.title}</p><p className="text-sm text-text2">{p.text}</p></div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-[22px] font-bold md:text-[30px]">Shop by category</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {tiles.map((c) => (
            <Link key={c.label} href={c.href} className="group relative block aspect-[4/5] overflow-hidden rounded-[24px] shadow-[0_8px_30px_rgba(0,17,91,0.10)]">
              <ProductArt kind={c.kind} tone={c.tone} upper={c.upper} accent={c.accent} label="" className="transition duration-300 group-hover:scale-105" />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-ink/70 to-transparent p-4 pt-10 text-lg font-bold text-white">
                {c.label} <Icon name="arrow" size={20} className="transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {fresh.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[22px] font-bold md:text-[30px]">New arrivals</h2>
            <Link href="/shop" className="text-sm font-semibold text-navy underline">See all</Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {fresh.map((p) => <ProductCard key={p.slug} product={p} />)}
          </div>
        </section>
      )}

      {look.length >= 2 && (
        <section className="relative overflow-hidden rounded-[24px] bg-navy p-6 text-white md:grid md:grid-cols-[1.1fr_1fr] md:items-center md:gap-8 md:p-10">
          <span aria-hidden="true" className="pointer-events-none absolute -right-6 bottom-0 select-none text-[26vw] font-extrabold uppercase leading-none tracking-tighter text-white/[0.04] md:text-[12rem]">Look</span>
          <div className="relative">
            <p className="label-wide text-lime">Drezzy outfits</p>
            <h2 className="mt-3 text-[28px] font-extrabold uppercase leading-tight md:text-[40px]">Street wear, sorted</h2>
            <p className="mt-2 text-white/85">Denim set, cap and Dunks. Add the full look in one tap.</p>
            <Link href="/drip-school/5-ways-to-wear-nike-dunks" className="btn-lime mt-5">Shop the look</Link>
          </div>
          <div className="relative mt-6 grid grid-cols-3 gap-3 md:mt-0">
            {look.map((p) => (
              <Link key={p.slug} href={`/product/${p.slug}`} className="group block">
                <div className="aspect-[4/5] overflow-hidden rounded-[16px] ring-1 ring-white/20"><ProductArt {...p.art} label={p.name} className="transition duration-300 group-hover:scale-105" /></div>
                <p className="mt-2 truncate text-xs font-medium">{p.name}</p>
                <p className="text-xs text-white/70">{formatGHS(p.price)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {best.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[22px] font-bold md:text-[30px]">Best sellers</h2>
            <Link href="/shop" className="text-sm font-semibold text-navy underline">Shop all</Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {best.map((p) => <ProductCard key={p.slug} product={p} />)}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[22px] font-bold md:text-[30px]">From Drip School</h2>
          <Link href="/drip-school" className="text-sm font-semibold text-navy underline">All stories</Link>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {articles.slice(0, 2).map((a) => (
            <Link key={a.slug} href={`/drip-school/${a.slug}`} className="card group block overflow-hidden">
              <div className="aspect-[16/9] overflow-hidden">
                <ProductArt kind={a.kind} tone={a.tone} upper={a.tone === "grey" ? "#00115b" : "#f4f4f6"} accent="#9cff00" label="" className="transition duration-300 group-hover:scale-105" />
              </div>
              <div className="p-4">
                <p className="text-xs font-semibold uppercase text-text2">Drip School · {a.minutes} min</p>
                <h3 className="mt-1 text-lg font-semibold">{a.title}</h3>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="card flex flex-col items-center gap-3 p-8 text-center">
        <p className="label-wide text-text2">Reviews</p>
        <h2 className="text-[22px] font-bold md:text-[30px]">See what our customers say</h2>
        <p className="max-w-md text-text2">Real reviews from real customers live in the Reviews highlight on our Instagram.</p>
        <a href="https://www.instagram.com/drezzy_stores/" target="_blank" rel="noopener noreferrer" className="btn-outline">Open @drezzy_stores</a>
      </section>
    </div>
  );
}
