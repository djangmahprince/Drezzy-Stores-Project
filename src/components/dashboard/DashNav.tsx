"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/app/login/actions";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";

export type NavItem = { href: string; label: string };
export type Who = { name: string; role: string };

const active = (path: string, href: string) => (href === "/dashboard" ? path === href : path === href || path.startsWith(`${href}/`));

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="mt-2 flex flex-col gap-1" aria-label="Dashboard">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          onClick={onNavigate}
          aria-current={active(path, n.href) ? "page" : undefined}
          className={`relative rounded-[12px] px-3 py-2.5 text-sm transition-colors hover:bg-white/10 ${active(path, n.href) ? "bg-white/15 font-semibold" : "text-white/85"}`}
        >
          {active(path, n.href) && <span className="absolute left-0 top-2 h-[calc(100%-1rem)] w-1 rounded-full bg-lime" aria-hidden="true" />}
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

function WhoCard({ who }: { who: Who }) {
  return (
    <div className="mt-auto space-y-2 rounded-[12px] bg-white/10 p-3 text-sm">
      <div>
        <p className="font-semibold">{who.name}</p>
        <p className="text-white/70">{who.role}</p>
      </div>
      <Link href="/dashboard/account" className="block rounded-[10px] px-3 py-2 text-white/90 transition-colors hover:bg-white/10">Account</Link>
      <form action={signOut}>
        <button className="w-full rounded-[10px] bg-white/10 px-3 py-2 text-left text-white/90 transition-colors hover:bg-white/20">Sign out</button>
      </form>
    </div>
  );
}

export function DashSidebar({ items, who }: { items: NavItem[]; who: Who }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto bg-navy p-4 text-white lg:flex">
      <Logo />
      <p className="label-wide mt-6 !text-[9px] text-white/60">Staff</p>
      <NavLinks items={items} />
      <WhoCard who={who} />
    </aside>
  );
}

export function DashTopbar({ items, who }: { items: NavItem[]; who: Who }) {
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("All branches");
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);

  return (
    <>
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-3">
        <button type="button" onClick={() => setMenu(true)} className="btn-outline !min-h-10 lg:hidden" aria-label="Open menu">
          <Icon name="menu" size={20} /> Menu
        </button>
        <div className="flex gap-1 text-sm" role="group" aria-label="Branch">
          {["All branches", "Accra", "Kumasi"].map((b) => (
            <button key={b} type="button" aria-pressed={branch === b} onClick={() => setBranch(b)} className={`chip min-h-9 px-3 ${branch === b ? "bg-navy text-white" : "bg-card text-navy"}`}>{b}</button>
          ))}
        </div>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/dashboard/orders?q=${encodeURIComponent(q.trim())}`);
          }}
          className="min-w-0 max-w-sm flex-1"
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} className="field !min-h-10" placeholder="Search order, phone, customer, SKU" aria-label="Global search" />
        </form>
        {path !== "/dashboard/orders/new" && <Link href="/dashboard/orders/new" className="btn-primary !min-h-10">Create order</Link>}
        <span className="chip bg-lime text-navy" aria-label="4 notifications">4</span>
      </header>

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Dashboard menu">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setMenu(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-navy p-4 text-white">
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" onClick={() => setMenu(false)} aria-label="Close menu" className="flex size-10 items-center justify-center rounded-full hover:bg-white/10"><Icon name="close" /></button>
            </div>
            <NavLinks items={items} onNavigate={() => setMenu(false)} />
            <WhoCard who={who} />
          </div>
        </div>
      )}
    </>
  );
}
