"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Settings">
      {tabs.map((t) => {
        const on = t.href === "/dashboard/settings" ? path === t.href : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`chip min-h-10 px-4 text-sm transition-colors ${on ? "bg-navy text-white" : "bg-white text-navy hover:bg-card"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
