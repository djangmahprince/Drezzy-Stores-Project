"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { SearchOverlay } from "@/components/store/SearchOverlay";
import { useCatalogue, waNumber } from "@/components/CatalogueProvider";
import { track } from "@/lib/track";
import { openDrawer, useCart, useWishlist } from "@/lib/cart";
import { branches } from "@/lib/data";

const nav: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/shop", label: "Shop", icon: "shop" },
  { href: "/drip-school", label: "Drip School", icon: "book" },
  { href: "/account", label: "Account", icon: "user" },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

function useBagCount() {
  return useCart().lines.reduce((s, l) => s + l.qty, 0);
}

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-lime px-1 text-[11px] font-bold leading-5 text-navy" aria-hidden="true">
      {n > 9 ? "9+" : n}
    </span>
  );
}

export function HeaderActions() {
  const [searching, setSearching] = useState(false);
  const count = useBagCount();
  const saved = useWishlist().length;
  return (
    <>
      <div className="flex items-center gap-1 text-white">
        <button type="button" onClick={() => setSearching(true)} aria-label="Search" className="flex size-11 items-center justify-center rounded-full hover:bg-white/10">
          <Icon name="search" />
        </button>
        <Link href="/account#wishlist" aria-label={`Wishlist, ${saved} saved`} className="relative hidden size-11 items-center justify-center rounded-full hover:bg-white/10 sm:flex">
          <Icon name="heart" />
          <Badge n={saved} />
        </Link>
        <button type="button" onClick={openDrawer} aria-label={`Open bag, ${count} items`} className="relative flex size-11 items-center justify-center rounded-full hover:bg-white/10">
          <Icon name="bag" />
          <Badge n={count} />
        </button>
      </div>
      {searching && <SearchOverlay onClose={() => setSearching(false)} />}
    </>
  );
}

export function DesktopNav() {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-1 text-sm font-medium text-white md:flex" aria-label="Main">
      {[...nav.filter((n) => n.href !== "/account"), { href: "/track", label: "Track an order" }].map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={isActive(path, n.href) ? "page" : undefined}
          className={`rounded-full px-3 py-2 transition-colors hover:bg-white/10 ${isActive(path, n.href) ? "bg-white/15 text-lime" : ""}`}
        >
          {n.label}
        </Link>
      ))}
      <Link href="/account" className="rounded-full px-3 py-2 hover:bg-white/10">Account</Link>
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  const count = useBagCount();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      {nav.slice(0, 3).map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={isActive(path, n.href) ? "page" : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive(path, n.href) ? "text-navy" : "text-text2"}`}
        >
          <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${isActive(path, n.href) ? "bg-lime" : ""}`}>
            <Icon name={n.icon} size={20} />
          </span>
          {n.label}
        </Link>
      ))}
      <button type="button" onClick={openDrawer} className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-text2">
        <span className="relative flex h-7 w-12 items-center justify-center">
          <Icon name="bag" size={20} />
          <Badge n={count} />
        </span>
        Bag
      </button>
      <Link
        href="/account"
        aria-current={isActive(path, "/account") ? "page" : undefined}
        className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive(path, "/account") ? "text-navy" : "text-text2"}`}
      >
        <span className={`flex h-7 w-12 items-center justify-center rounded-full ${isActive(path, "/account") ? "bg-lime" : ""}`}>
          <Icon name="user" size={20} />
        </span>
        Account
      </Link>
    </nav>
  );
}

/** Floating help button. Uses the Kumasi number when the customer's region is Ashanti, otherwise Accra (FR-SF-017). */
export function WhatsAppButton() {
  const path = usePathname();
  const { region } = useCart();
  const { site } = useCatalogue();
  if (path.startsWith("/product/") || path.startsWith("/checkout")) return null;
  const kumasiSide = ["Ashanti", "Bono", "Bono East", "Ahafo", "Northern", "Savannah", "North East", "Upper East", "Upper West"].includes(region);
  const branch = site
    ? { name: kumasiSide ? "Kumasi" : "Accra", wa: waNumber(kumasiSide ? site.kumasi.whatsapp : site.accra.whatsapp) }
    : kumasiSide ? branches.kumasi : branches.accra;
  const href = `https://wa.me/${branch.wa}?text=${encodeURIComponent("Hi Drezzy, I need help with an order.")}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Chat with the ${branch.name} branch on WhatsApp`}
      onClick={() => track("whatsapp_click", { page: path, number: branch.name })}
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-lime px-4 text-sm font-semibold text-navy shadow-lg transition active:scale-95 md:bottom-6"
    >
      <Icon name="chat" size={20} />
      <span className="hidden sm:inline">Chat with us</span>
    </a>
  );
}
