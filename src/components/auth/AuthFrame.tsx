import { Logo } from "@/components/Logo";

/** The navy, watermarked frame used by the staff sign-in screens. */
export function AuthFrame({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-navy to-navy-2 px-4 py-10">
      <span aria-hidden="true" className="pointer-events-none absolute -left-8 top-1/2 -translate-y-1/2 select-none text-[38vw] font-extrabold uppercase leading-none tracking-tighter text-white/[0.05]">
        Drezzy
      </span>
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="hero-card p-6 md:p-8">
          <p className="label-wide text-text2">Staff</p>
          <h1 className="mt-2 text-[26px] font-bold leading-tight">{title}</h1>
          {intro && <p className="mt-1 text-sm text-text2">{intro}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
