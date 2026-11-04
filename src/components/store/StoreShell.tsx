import Link from "next/link";
import { waNumber } from "@/lib/media";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { DesktopNav, HeaderActions } from "@/components/store/StoreNav";
import type { SiteSettings } from "@/lib/site/server";

export { BottomNav, WhatsAppButton } from "@/components/store/StoreNav";

/** The announcement bar (FR-CMS-003) and the header. Several announcements rotate on wide screens; phones show the first. */
export function StoreHeader({ announcements }: { announcements: { text: string; href: string | null }[] }) {
  const a = announcements[0];
  return (
    <header className="sticky top-0 z-40">
      <div className="bg-lime px-4 py-2 text-center text-xs font-semibold text-navy">
        {a?.href ? <Link href={a.href} className="underline-offset-2 hover:underline">{a.text}</Link> : a?.text}
        {announcements.length > 1 && <span className="hidden md:inline"> · {announcements.slice(1, 3).map((x) => x.text).join(" · ")}</span>}
      </div>
      <div className="flex items-center justify-between bg-navy px-4 py-2 md:px-8">
        <Logo />
        <DesktopNav />
        <HeaderActions />
      </div>
    </header>
  );
}

const helpLinks = [
  { href: "/track", label: "Track an order" },
  { href: "/help/delivery", label: "Delivery" },
  { href: "/help/payment", label: "Payment options" },
  { href: "/help/order-issues", label: "Order issues and refunds" },
  { href: "/help/size-guide", label: "Size guide" },
  { href: "/help/faq", label: "FAQ" },
  { href: "/help/contact", label: "Contact" },
];

const discoverLinks = [
  { href: "/drops", label: "Drop calendar" },
  { href: "/looks", label: "Shop the look" },
  { href: "/style-quiz", label: "Find your style" },
  { href: "/drip-school/glossary", label: "Sneaker glossary" },
  { href: "/help/about", label: "About Drezzy" },
];

export function StoreFooter({ settings }: { settings: SiteSettings }) {
  const s = settings;
  return (
    <footer className="relative mt-16 overflow-hidden bg-navy px-4 py-12 pb-28 text-white md:px-8 md:pb-12">
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 select-none whitespace-nowrap text-[28vw] font-extrabold uppercase leading-none tracking-tighter text-white/[0.04] md:text-[16rem]">
        Drezzy
      </span>
      <div className="relative mx-auto grid max-w-6xl gap-8 sm:grid-cols-2 md:grid-cols-5">
        <div className="md:col-span-1">
          <Logo />
          <p className="mt-3 text-sm text-white/80">Your Outfits Solution. You order, we deliver, you drip.</p>
          <p className="mt-3 text-xs text-white/60">{s.hours}</p>
        </div>
        <div>
          <h4 className="label-wide !tracking-[0.3em] text-lime">Help</h4>
          <ul className="mt-3 space-y-2 text-sm text-white/85">
            {helpLinks.map((l) => <li key={l.href}><Link href={l.href} className="hover:text-lime">{l.label}</Link></li>)}
          </ul>
        </div>
        <div>
          <h4 className="label-wide !tracking-[0.3em] text-lime">Discover</h4>
          <ul className="mt-3 space-y-2 text-sm text-white/85">
            {discoverLinks.map((l) => <li key={l.href}><Link href={l.href} className="hover:text-lime">{l.label}</Link></li>)}
          </ul>
        </div>
        <div>
          <h4 className="label-wide !tracking-[0.3em] text-lime">Branches</h4>
          <div className="mt-3 space-y-3 text-sm text-white/85">
            <p><b className="text-white">Accra</b><br />
              <a href={`tel:${s.accra.call.replace(/\s/g, "")}`} className="hover:text-lime">Call {s.accra.call}</a><br />
              <a href={`https://wa.me/${waNumber(s.accra.whatsapp)}`} className="hover:text-lime">WhatsApp {s.accra.whatsapp}</a></p>
            <p><b className="text-white">Kumasi</b><br />
              <a href={`tel:${s.kumasi.call.replace(/\s/g, "")}`} className="hover:text-lime">Call {s.kumasi.call}</a><br />
              <a href={`https://wa.me/${waNumber(s.kumasi.whatsapp)}`} className="hover:text-lime">WhatsApp {s.kumasi.whatsapp}</a></p>
          </div>
        </div>
        <div>
          <h4 className="label-wide !tracking-[0.3em] text-lime">Follow</h4>
          <ul className="mt-3 space-y-2 text-sm text-white/85">
            {s.socials.instagram && <li><a href={s.socials.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-lime">Instagram @drezzy_stores</a></li>}
            {s.socials.tiktok && <li><a href={s.socials.tiktok} target="_blank" rel="noopener noreferrer" className="hover:text-lime">TikTok @drezzy.stores</a></li>}
            {s.socials.snapchat && <li><a href={s.socials.snapchat} target="_blank" rel="noopener noreferrer" className="hover:text-lime">Snapchat drezzystores</a></li>}
            {s.socials.facebook && <li><a href={s.socials.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-lime">Facebook</a></li>}
          </ul>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs">
            <Icon name="shield" size={16} /> Secure payments by Paystack
          </p>
        </div>
      </div>
      <p className="relative mx-auto mt-10 max-w-6xl text-xs text-white/60">
        © Drezzy Stores. <Link href="/help/privacy" className="underline">Privacy</Link> · <Link href="/help/terms" className="underline">Terms</Link> · <Link href="/privacy-requests" className="underline">Your data</Link>
      </p>
    </footer>
  );
}
