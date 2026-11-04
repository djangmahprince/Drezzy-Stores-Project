"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { alertsAction, markAlertsReadAction, noteDeviceAction, searchAction, setBranchAction, type Alert, type SearchHit } from "@/app/dashboard/actions";
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

const dayTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** The notifications bell (FR-DB-006): alerts for new orders, payment checks, stuck orders, targets and more. */
function Bell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ unread: number; items: Alert[] }>({ unread: 0, items: [] });
  useEffect(() => {
    let live = true;
    const load = () => alertsAction().then((d) => live && setData(d)).catch(() => {});
    void load();
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    return () => { live = false; window.clearInterval(t); };
  }, []);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Notifications, ${data.unread} unread`} className="relative flex size-10 items-center justify-center rounded-full border border-line bg-white text-navy">
        <Icon name="spark" size={20} />
        {data.unread > 0 && <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-error px-1 text-[11px] font-bold leading-5 text-white">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(92vw,380px)] rounded-[16px] border border-line bg-white shadow-2xl" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {data.unread > 0 && <button type="button" className="text-sm text-navy underline" onClick={async () => { await markAlertsReadAction(); setData((d) => ({ unread: 0, items: d.items.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })) })); }}>Mark all read</button>}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {data.items.length === 0 && <li className="p-6 text-center text-sm text-text2">Nothing new.</li>}
            {data.items.map((a) => (
              <li key={a.id} className={`border-b border-line last:border-0 ${a.read_at ? "" : "bg-[#eef1fb]"}`}>
                <Link href={a.link ?? "/dashboard"} onClick={() => { setOpen(false); if (!a.read_at) void markAlertsReadAction([a.id]); }} className="block px-4 py-3 text-sm hover:bg-card">
                  <p className="font-medium">{a.title}</p>
                  {a.body && <p className="text-text2">{a.body}</p>}
                  <p className="mt-1 text-xs text-muted">{dayTime(a.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Global search with live results (PRD section 12). Enter opens the orders list filtered by the text. */
function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = window.setTimeout(() => void searchAction(q).then((h) => { setHits(h); setOpen(true); }), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const focus = () => input.current?.focus();
    window.addEventListener("drezzy:search", focus);
    return () => window.removeEventListener("drezzy:search", focus);
  }, []);
  const kinds: Record<string, string> = { order: "Order", customer: "Customer", product: "Product", supplier: "Supplier" };
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); setOpen(false); router.push(`/dashboard/orders?q=${encodeURIComponent(q.trim())}`); }} className="relative min-w-0 max-w-sm flex-1">
      <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => window.setTimeout(() => setOpen(false), 150)} onFocus={() => hits.length && setOpen(true)}
        className="field !min-h-10" placeholder="Search order, phone, customer, SKU ( / )" aria-label="Global search" />
      {open && q.trim().length >= 2 && (
        <ul className="absolute inset-x-0 top-12 z-50 max-h-80 overflow-y-auto rounded-[12px] border border-line bg-white shadow-xl">
          {hits.length === 0 ? <li className="px-4 py-3 text-sm text-text2">No matches. Press Enter to search orders.</li> : hits.map((h, i) => (
            <li key={i}><Link href={h.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-card"><span><b>{h.label}</b> <span className="text-text2">{h.sub}</span></span><span className="chip bg-card text-text2">{kinds[h.kind]}</span></Link></li>
          ))}
        </ul>
      )}
    </form>
  );
}

/** Keyboard shortcuts for power users (FR-DB-008): / search, n new order, g then a letter to jump, ? for help. */
function Shortcuts() {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  useEffect(() => {
    let g = false;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); window.dispatchEvent(new Event("drezzy:search")); return; }
      if (e.key === "?") { setHelp((h) => !h); return; }
      if (e.key === "Escape") { setHelp(false); return; }
      if (g) {
        g = false;
        const to: Record<string, string> = { d: "/dashboard", o: "/dashboard/orders", b: "/dashboard/dispatch", c: "/dashboard/catalogue", u: "/dashboard/customers", m: "/dashboard/money", a: "/dashboard/analytics", s: "/dashboard/support", t: "/dashboard/staff" };
        if (to[e.key]) router.push(to[e.key]);
        return;
      }
      if (e.key === "g") { g = true; window.setTimeout(() => (g = false), 1200); return; }
      if (e.key === "n") router.push("/dashboard/orders/new");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);
  if (!help) return null;
  const rows = [["/", "Search"], ["n", "New order"], ["g d", "Dashboard"], ["g o", "Orders"], ["g b", "Dispatch board"], ["g c", "Catalogue"], ["g u", "Customers"], ["g s", "Support inbox"], ["g m", "Money"], ["g a", "Analytics"], ["g t", "Staff and targets"], ["?", "Show or hide this"]];
  return (
    <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 p-4" onClick={() => setHelp(false)}>
      <div className="w-full max-w-sm rounded-[16px] bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold">Keyboard shortcuts</p>
        <ul className="mt-3 space-y-1 text-sm">{rows.map(([k, l]) => <li key={k} className="flex justify-between"><span>{l}</span><kbd className="rounded bg-card px-2 font-mono">{k}</kbd></li>)}</ul>
      </div>
    </div>
  );
}

/** Light or dark, and normal or compact tables (FR-DB-007). Remembered on this device. */
function Appearance() {
  const [dark, setDark] = useState(false);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const d = localStorage.getItem("drezzy.dash.theme") === "dark";
    const c = localStorage.getItem("drezzy.dash.density") === "compact";
    root.toggleAttribute("data-dash-dark", d);
    root.toggleAttribute("data-dash-compact", c);
    void Promise.resolve().then(() => { setDark(d); setCompact(c); });
    return () => { root.removeAttribute("data-dash-dark"); root.removeAttribute("data-dash-compact"); };
  }, []);
  const flip = (k: "theme" | "density") => {
    const root = document.documentElement;
    if (k === "theme") { const v = !dark; setDark(v); root.toggleAttribute("data-dash-dark", v); localStorage.setItem("drezzy.dash.theme", v ? "dark" : "light"); }
    else { const v = !compact; setCompact(v); root.toggleAttribute("data-dash-compact", v); localStorage.setItem("drezzy.dash.density", v ? "compact" : "normal"); }
  };
  return (
    <div className="flex gap-1">
      <button type="button" onClick={() => flip("theme")} aria-pressed={dark} className="chip min-h-9 bg-card px-3 text-navy" title="Light or dark">{dark ? "Dark" : "Light"}</button>
      <button type="button" onClick={() => flip("density")} aria-pressed={compact} className="chip min-h-9 bg-card px-3 text-navy" title="Table density">{compact ? "Compact" : "Comfy"}</button>
    </div>
  );
}

export function DashTopbar({ items, who, branch: initialBranch = "all" }: { items: NavItem[]; who: Who; branch?: "all" | "accra" | "kumasi" }) {
  const [menu, setMenu] = useState(false);
  const [branch, setBranch] = useState(initialBranch);
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);

  // once per browser session: tell the database which device this is, so a new device raises an alert
  useEffect(() => {
    try {
      if (sessionStorage.getItem("drezzy.device.noted")) return;
      sessionStorage.setItem("drezzy.device.noted", "1");
      void noteDeviceAction();
    } catch { /* ignore */ }
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-3">
        <button type="button" onClick={() => setMenu(true)} className="btn-outline !min-h-10 lg:hidden" aria-label="Open menu">
          <Icon name="menu" size={20} /> Menu
        </button>
        <div className="flex gap-1 text-sm" role="group" aria-label="Branch">
          {([["all", "All branches"], ["accra", "Accra"], ["kumasi", "Kumasi"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={branch === v} onClick={async () => { setBranch(v); await setBranchAction(v); router.refresh(); }} className={`chip min-h-9 px-3 ${branch === v ? "bg-navy text-white" : "bg-card text-navy"}`}>{l}</button>
          ))}
        </div>
        <GlobalSearch />
        {path !== "/dashboard/orders/new" && <Link href="/dashboard/orders/new" className="btn-primary !min-h-10">Create order</Link>}
        <Appearance />
        <Bell />
      </header>
      <Shortcuts />

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
