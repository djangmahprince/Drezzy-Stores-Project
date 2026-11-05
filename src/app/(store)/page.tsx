import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { ProductArt } from "@/components/ProductArt";
import { DropsRow } from "@/components/store/DropsRow";
import { PickedForYou } from "@/components/store/PickedForYou";
import { ProductCard } from "@/components/store/ProductCard";
import { ProductPhoto } from "@/components/ProductPhoto";
import type { Product, Tone } from "@/lib/catalogue/types";
import { getListedCatalogue } from "@/lib/catalogue/server";
import { getArticles } from "@/lib/articles/server";
import { formatGHS } from "@/lib/data";
import { getRecentReviews, getSiteContent, publicFile, type Banner, type HomeSection } from "@/lib/site/server";

// The five categories Drezzy sells. Each tile shows a real photo from that category; a category with nothing in it yet
// shows the Drezzy wordmark on navy rather than a made-up picture.
const tiles = ["Sneakers", "Shoes", "Shirts", "Loafers", "Watches"];

const promises: { icon: IconName; title: string; text: string }[] = [
  { icon: "truck", title: "Nationwide delivery", text: "From our Accra and Kumasi branches" },
  { icon: "shield", title: "Pay with MoMo or card", text: "Secured by Paystack" },
  { icon: "chat", title: "Real people on WhatsApp", text: "One tap from every page" },
];

const toneBg: Record<Tone, string> = { navy: "from-navy to-navy-2", blue: "from-[#0036ff] to-navy", grey: "from-[#dedede] to-[#ececef]", red: "from-[#a10000] to-[#5c0000]", charcoal: "from-[#404040] to-[#23273a]" };

function Heading({ title, href, link }: { title: string; href?: string; link?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-[22px] font-bold md:text-[30px]">{title}</h2>
      {href && <Link href={href} className="text-sm font-semibold text-navy underline">{link ?? "See all"}</Link>}
    </div>
  );
}

function Row({ title, products, href }: { title: string; products: Product[]; href?: string }) {
  if (!products.length) return null;
  return (
    <section>
      <Heading title={title} href={href} />
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">{products.map((p) => <ProductCard key={p.slug} product={p} />)}</div>
    </section>
  );
}

/** A hero banner made in the dashboard (FR-CMS-002), with separate phone and desktop images when given. */
function BannerHero({ b }: { b: Banner }) {
  const desk = publicFile("media", b.image_desktop);
  const mob = publicFile("media", b.image_mobile) ?? desk;
  const light = b.tone === "grey";
  return (
    <section className={`relative overflow-hidden rounded-[24px] bg-gradient-to-br ${toneBg[b.tone]} ${light ? "text-navy" : "text-white"}`}>
      {desk && <Image src={desk} alt="" fill sizes="(min-width: 768px) 1100px, 0px" className="hidden object-cover md:block" priority />}
      {mob && <Image src={mob} alt="" fill sizes="(max-width: 767px) 100vw, 0px" className="object-cover md:hidden" priority />}
      <div className={`relative p-6 md:max-w-xl md:p-12 ${desk ? "bg-gradient-to-r from-ink/60 to-transparent text-white" : ""}`}>
        <p className={`label-wide ${light ? "text-navy" : "text-lime"}`}>Drezzy Stores</p>
        <h1 className="mt-4 text-[34px] font-extrabold uppercase leading-[1.02] tracking-tight md:text-[52px]">{b.title}</h1>
        {b.subtitle && <p className="mt-4 max-w-md opacity-90">{b.subtitle}</p>}
        {b.cta_href && <Link href={b.cta_href} className="btn-lime mt-6">{b.cta_label || "Shop now"} <Icon name="arrow" size={18} /></Link>}
      </div>
    </section>
  );
}

function DefaultHero({ hero }: { hero?: Product }) {
  return (
    <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-navy to-navy-2 text-white md:grid md:grid-cols-2 md:items-center">
      <span aria-hidden="true" className="pointer-events-none absolute -left-4 top-1/2 -translate-y-1/2 select-none text-[34vw] font-extrabold uppercase leading-none tracking-tighter text-white/[0.05] md:text-[16rem]">Drezzy</span>
      <div className="relative p-6 pb-2 md:p-12">
        <p className="label-wide text-lime">Your outfits solution</p>
        <h1 className="mt-4 text-[36px] font-extrabold uppercase leading-[1.02] tracking-tight md:text-[56px]">You order.<br />We deliver.<br /><span className="text-lime">You drip.</span></h1>
        <p className="mt-4 max-w-md text-white/85">Sneakers, shoes, shirts, loafers and watches from trusted suppliers, delivered anywhere in Ghana.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/shop?category=Sneakers" className="btn-lime">Shop sneakers <Icon name="arrow" size={18} /></Link>
          <Link href="/drip-school" className="btn border border-white/40 text-white hover:bg-white/10">Outfit ideas</Link>
        </div>
      </div>
      <div className="relative p-6 md:p-10">
        {hero && (
          <Link href={`/product/${hero.slug}`} className="hero-card group relative block rotate-[-2deg] p-3 text-ink transition duration-300 hover:rotate-0">
            <span className="chip absolute left-6 top-6 z-10 bg-lime text-navy">NEW IN</span>
            <div className="relative aspect-[4/5] overflow-hidden rounded-[18px]">
              {hero.images?.[0] ? <Image src={publicFile("media", hero.images[0])!} alt={hero.name} fill sizes="(min-width: 768px) 40vw, 90vw" className="object-cover" priority />
                : <ProductArt {...hero.art} label={`${hero.name}, product image`} className="transition duration-300 group-hover:scale-105" />}
            </div>
            <div className="flex items-center justify-between gap-3 px-1 pb-1 pt-3">
              <p className="line-clamp-1 text-sm font-medium">{hero.name}</p>
              <p className="shrink-0 font-bold">{formatGHS(hero.price)}</p>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}

export default async function Home() {
  const [products, articles, site, reviews] = await Promise.all([getListedCatalogue(), getArticles(), getSiteContent(), getRecentReviews()]);
  // drops are filtered in the browser (DropsRow), because the current time cannot be part of a prerendered page
  const buyable = products.filter((p) => !p.releaseAt);
  const heroProduct = buyable.find((p) => p.isNew && p.category === "Sneakers") ?? buyable.find((p) => p.isNew) ?? buyable[0];
  const fresh = buyable.filter((p) => p.isNew).concat(buyable.filter((p) => !p.isNew)).slice(0, 4);
  const best = [...buyable].sort((a, b) => b.popular - a.popular).slice(0, 4);
  const heroBanner = site.banners.find((b) => b.placement === "hero");
  const promos = site.banners.filter((b) => b.placement === "promo");
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const pick = (re: RegExp, exclude: string[] = []) => buyable.find((p) => re.test(p.category + " " + (p.subcategory ?? "")) && !exclude.includes(p.slug));
  const fallbackLook = [pick(/shirt/i), pick(/sneaker/i), pick(/watch/i)].filter((p): p is Product => !!p);

  const render = (s: HomeSection) => {
    switch (s.kind) {
      case "hero":
        return heroBanner ? <BannerHero b={heroBanner} /> : <DefaultHero hero={heroProduct} />;
      case "promise":
        return (
          <section aria-label="Delivery promise" className="grid gap-3 md:grid-cols-3">
            {promises.map((p) => (
              <div key={p.title} className="card flex items-center gap-3 p-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-navy text-lime"><Icon name={p.icon} size={22} /></span>
                <div><p className="font-semibold leading-tight">{p.title}</p><p className="text-sm text-text2">{p.text}</p></div>
              </div>
            ))}
          </section>
        );
      case "categories":
        return (
          <section>
            <Heading title={s.title ?? "Shop by category"} />
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
              {tiles.map((c) => {
                const p = products.filter((x) => x.category === c && x.images?.length).sort((x, y) => y.popular - x.popular)[0];
                return (
                  <Link key={c} href={`/shop?category=${c}`} className="group relative block aspect-[4/5] overflow-hidden rounded-[24px] bg-gradient-to-br from-navy to-navy-2 shadow-[0_8px_30px_rgba(0,17,91,0.10)]">
                    {p ? <ProductPhoto product={p} sizes="(min-width: 768px) 20vw, 50vw" className="transition duration-300 group-hover:scale-105" />
                      : <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold uppercase tracking-tighter text-white/10">Drezzy</span>}
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-ink/70 to-transparent p-4 pt-10 text-lg font-bold text-white">
                      {c} <Icon name="arrow" size={20} className="transition group-hover:translate-x-1" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      case "new":
        return <Row title={s.title ?? "New arrivals"} products={fresh} href="/shop?sort=newest" />;
      case "best":
        return <Row title={s.title ?? "Best sellers"} products={best} href="/shop?sort=popular" />;
      case "manual": {
        const slugs = Array.isArray(s.config.slugs) ? (s.config.slugs as string[]) : [];
        return <Row title={s.title ?? "Picked by Drezzy"} products={slugs.map((x) => bySlug.get(x)).filter((p): p is Product => !!p).slice(0, 8)} />;
      }
      case "picked":
        return <PickedForYou title={s.title ?? "Picked for you"} />;
      case "drops":
        return <DropsRow title={s.title ?? "Upcoming drops"} />;
      case "looks": {
        const look = site.looks[0];
        const items = look ? look.items.map((i) => bySlug.get(i.slug)).filter((p): p is Product => !!p) : fallbackLook;
        if (items.length < 2) return null;
        return (
          <section className="relative overflow-hidden rounded-[24px] bg-navy p-6 text-white md:grid md:grid-cols-[1.1fr_1fr] md:items-center md:gap-8 md:p-10">
            <span aria-hidden="true" className="pointer-events-none absolute -right-6 bottom-0 select-none text-[26vw] font-extrabold uppercase leading-none tracking-tighter text-white/[0.04] md:text-[12rem]">Look</span>
            <div className="relative">
              <p className="label-wide text-lime">{look?.occasion ?? "Drezzy outfits"}</p>
              <h2 className="mt-3 text-[28px] font-extrabold uppercase leading-tight md:text-[40px]">{look?.title ?? s.title ?? "Street wear, sorted"}</h2>
              <p className="mt-2 text-white/85">{look?.intro ?? "A statement shirt, clean sneakers and a watch. Build the full look in a few taps."}</p>
              <Link href={look ? `/looks/${look.slug}` : "/looks"} className="btn-lime mt-5">Shop the look</Link>
            </div>
            <div className="relative mt-6 grid grid-cols-3 gap-3 md:mt-0">
              {items.slice(0, 3).map((p) => (
                <Link key={p.slug} href={`/product/${p.slug}`} className="group block">
                  <div className="aspect-[4/5] overflow-hidden rounded-[16px] ring-1 ring-white/20"><ProductPhoto product={p} label={p.name} sizes="200px" className="transition duration-300 group-hover:scale-105" /></div>
                  <p className="mt-2 truncate text-xs font-medium">{p.name}</p>
                  <p className="text-xs text-white/70">{formatGHS(p.price)}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      }
      case "drip":
        return (
          <section>
            <Heading title={s.title ?? "From Drip School"} href="/drip-school" link="All stories" />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {articles.slice(0, 2).map((a) => (
                <Link key={a.slug} href={`/drip-school/${a.slug}`} className="card group block overflow-hidden">
                  <div className="relative aspect-[16/9] overflow-hidden">
                    {a.hero_image ? <Image src={publicFile("media", a.hero_image)!} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
                      : <ProductArt kind={a.kind} tone={a.tone} upper={a.tone === "grey" ? "#00115b" : "#f4f4f6"} accent="#9cff00" label="" className="transition duration-300 group-hover:scale-105" />}
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-semibold uppercase text-text2">Drip School · {a.minutes} min</p>
                    <h3 className="mt-1 text-lg font-semibold">{a.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      case "reviews":
        if (!reviews.length) {
          return (
            <section className="card flex flex-col items-center gap-3 p-8 text-center">
              <p className="label-wide text-text2">Reviews</p>
              <h2 className="text-[22px] font-bold md:text-[30px]">See what our customers say</h2>
              <p className="max-w-md text-text2">Real reviews from real customers live in the Reviews highlight on our Instagram.</p>
              <a href={site.settings.socials.instagram ?? "https://www.instagram.com/drezzy_stores/"} target="_blank" rel="noopener noreferrer" className="btn-outline">Open @drezzy_stores</a>
            </section>
          );
        }
        return (
          <section>
            <Heading title={s.title ?? "What customers say"} />
            <div className="mt-4 flex snap-x gap-4 overflow-x-auto pb-2">
              {reviews.map((r, i) => (
                <figure key={i} className="card w-72 shrink-0 snap-start p-5">
                  <p aria-label={`${r.rating} out of 5`} className="text-lime [text-shadow:0_0_1px_#00115b]">{"★".repeat(r.rating)}<span className="text-line">{"★".repeat(5 - r.rating)}</span></p>
                  <blockquote className="mt-2 line-clamp-5 text-sm">“{r.body}”</blockquote>
                  <figcaption className="mt-3 text-xs text-text2">{r.name}{r.city ? `, ${r.city}` : ""}{r.product && r.slug ? <> · <Link href={`/product/${r.slug}`} className="underline">{r.product}</Link></> : null}{r.source === "instagram" ? " · via Instagram" : ""}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        );
      case "promo":
        return promos.length ? (
          <section className="grid gap-4 md:grid-cols-2">
            {promos.slice(0, 2).map((b) => (
              <Link key={b.id} href={b.cta_href ?? "/shop"} className={`relative block overflow-hidden rounded-[24px] bg-gradient-to-br p-6 ${toneBg[b.tone]} ${b.tone === "grey" ? "text-navy" : "text-white"}`}>
                <p className="text-2xl font-extrabold uppercase">{b.title}</p>
                {b.subtitle && <p className="mt-1 opacity-85">{b.subtitle}</p>}
                <span className="btn-lime mt-4 !min-h-10">{b.cta_label ?? "Shop now"}</span>
              </Link>
            ))}
          </section>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-14">
      {site.sections.map((s) => {
        const node = render(s);
        return node ? <div key={s.id}>{node}</div> : null;
      })}
    </div>
  );
}
