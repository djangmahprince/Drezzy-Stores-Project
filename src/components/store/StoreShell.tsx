import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { DesktopNav, HeaderActions } from "@/components/store/StoreNav";
import { branches } from "@/lib/data";

export { BottomNav, WhatsAppButton } from "@/components/store/StoreNav";

export function StoreHeader() {
  return (
    <header className="sticky top-0 z-40">
      <div className="bg-lime px-4 py-2 text-center text-xs font-semibold text-navy">
        Nationwide delivery from our Accra and Kumasi branches
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
];

export function StoreFooter() {
  return (
    <footer className="relative mt-16 overflow-hidden bg-navy px-4 py-12 pb-28 text-white md:px-8 md:pb-12">
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 select-none whitespace-nowrap text-[28vw] font-extrabold uppercase leading-none tracking-tighter text-white/[0.04] md:text-[16rem]">
        Drezzy
      </span>
      <div className="relative mx-auto grid max-w-6xl gap-8 md:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-white/80">Your Outfits Solution. You order, we deliver, you drip.</p>
        </div>
        <div>
          <h4 className="label-wide !tracking-[0.3em] text-lime">Help</h4>
          <ul className="mt-3 space-y-2 text-sm text-white/85">
            {helpLinks.map((l) => (
              <li key={l.href}><Link href={l.href} className="hover:text-lime">{l.label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="label-wide !tracking-[0.3em] text-lime">Branches</h4>
          <div className="mt-3 space-y-3 text-sm text-white/85">
            <p><b className="text-white">Accra</b><br />
              <a href={`tel:${branches.accra.call.replace(/\s/g, "")}`} className="hover:text-lime">Call {branches.accra.call}</a><br />
              <a href={`https://wa.me/${branches.accra.wa}`} className="hover:text-lime">WhatsApp {branches.accra.whatsapp}</a></p>
            <p><b className="text-white">Kumasi</b><br />
              <a href={`tel:${branches.kumasi.call.replace(/\s/g, "")}`} className="hover:text-lime">Call or WhatsApp {branches.kumasi.call}</a></p>
          </div>
        </div>
        <div>
          <h4 className="label-wide !tracking-[0.3em] text-lime">Follow</h4>
          <ul className="mt-3 space-y-2 text-sm text-white/85">
            <li>Instagram @drezzy_stores</li>
            <li>TikTok @drezzy.stores</li>
            <li>Snapchat drezzystores</li>
          </ul>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs">
            <Icon name="shield" size={16} /> Secure payments by Paystack
          </p>
        </div>
      </div>
      <p className="relative mx-auto mt-10 max-w-6xl text-xs text-white/60">
        © Drezzy Stores. <Link href="/help/privacy" className="underline">Privacy</Link> · <Link href="/help/terms" className="underline">Terms</Link>
      </p>
    </footer>
  );
}
