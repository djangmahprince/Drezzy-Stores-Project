import Link from "next/link";
import { Suspense } from "react";
import { PageHead, Pill, Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { listArticles } from "@/lib/articles/staff";
import { articles as starter } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Drip School and content" };

const word = { draft: "Draft", in_review: "In review", published: "Published" } as const;
const stamp = (iso: string) => new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" }).format(new Date(iso));

async function Live() {
  const { articles, canWrite, now } = await listArticles();
  return (
    <>
      {canWrite && <div className="mb-3"><Link href="/dashboard/content/new" className="btn-primary !min-h-10">New article</Link></div>}
      {articles.length === 0 ? (
        <p className="card p-8 text-center text-sm text-text2">No articles yet. The shop shows the built-in starter articles until you publish one.</p>
      ) : (
        <Table head={["Title", "Type", "Status", "Updated", "By"]} rows={articles.map((a) => {
          const scheduled = a.status === "published" && a.publishAt !== null && Date.parse(a.publishAt) > now;
          return [
            <Link key={a.id} href={`/dashboard/content/${a.id}`} className="font-semibold text-navy underline">{a.title}</Link>, a.type,
            <Pill key={a.id + "s"} tone={a.status === "published" ? (scheduled ? "info" : "ok") : a.status === "in_review" ? "warn" : "info"}>{scheduled ? `Scheduled ${stamp(a.publishAt!)}` : word[a.status]}</Pill>,
            stamp(a.updatedAt), a.authorName ?? "",
          ];
        })} />
      )}
    </>
  );
}

function Sample() {
  return (
    <>
      <PageHead title="Drip School and content" sub="Sample articles. Connect Supabase to write your own." />
      <Table head={["Title", "Type", "Status"]} rows={starter.map((a) => [a.title, a.type, <Pill key={a.slug} tone="ok">Published</Pill>])} />
    </>
  );
}

export default function Content() {
  return (
    <Guard module="content">
      {isSupabaseConfigured ? (
        <>
          <PageHead real title="Drip School and content" sub="Write, review and schedule articles" />
          <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
            <Live />
          </Suspense>
        </>
      ) : (
        <Sample />
      )}
    </Guard>
  );
}
