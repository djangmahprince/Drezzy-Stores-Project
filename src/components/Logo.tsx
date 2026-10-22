import Link from "next/link";

/** Text stand-in for the DREZZY logo artwork (Officer Domenic). Swap for the supplied SVG when it arrives. */
export function Logo({ tone = "light", href = "/" }: { tone?: "light" | "dark"; href?: string }) {
  const color = tone === "light" ? "text-white" : "text-navy";
  return (
    <Link href={href} aria-label="Drezzy Stores home" className={`inline-flex flex-col leading-none ${color}`}>
      <span className="text-[26px] font-extrabold uppercase tracking-[-0.04em]">Drezzy</span>
      <span className="mt-1 text-[8px] font-medium uppercase tracking-[0.6em] opacity-90">Stores</span>
    </Link>
  );
}
