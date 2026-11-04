import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RichBody } from "@/components/store/RichBody";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata = { title: "Preview", robots: { index: false, follow: false } };

// A known path lets the shop's header prerender here. Real tokens are served on request; this one renders the 404 page.
export function generateStaticParams() {
  return [{ token: "__placeholder__" }];
}

/** A draft or scheduled article, opened from its preview link (FR-JR-006). Never indexed, never cached. */
async function Preview({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const { data } = await createPublicClient().rpc("article_preview", { p_token: token });
  const a = data as { title: string; intro: string; body: string | null; type: string; status: string; publish_at: string | null } | null;
  if (!a) notFound();
  return (
    <article className="mx-auto max-w-2xl text-[17px] leading-[1.7]">
      <p className="mb-4 rounded-[12px] bg-[#fbeedb] px-4 py-2 text-sm text-warning">Preview · {a.status.replace("_", " ")}{a.publish_at ? ` · scheduled for ${a.publish_at.slice(0, 16).replace("T", " ")}` : ""}. Only people with this link can see it.</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-text2">{a.type}</p>
      <h1 className="text-[28px] font-bold leading-tight md:text-[40px]">{a.title}</h1>
      <p className="mt-6">{a.intro}</p>
      {a.body && <div className="mt-4"><RichBody body={a.body} /></div>}
    </article>
  );
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={null}><Preview params={params} /></Suspense>;
}
