import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArticleEditor } from "@/components/dashboard/ArticleEditor";
import { PageHead } from "@/components/dashboard/DashShell";
import { DbGate, Guard } from "@/components/dashboard/Guard";
import { requireStaff } from "@/lib/auth";
import { getArticleForEdit } from "@/lib/articles/staff";
import { can } from "@/lib/permissions";

export const metadata = { title: "Edit article" };

async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, a] = await Promise.all([requireStaff(), getArticleForEdit(id)]);
  if (!a) notFound();
  return <ArticleEditor initial={a} canDelete={can(me.permissions, "content", "delete")} />;
}

export default function EditArticle({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Guard module="content" action="edit">
      <PageHead real title="Edit article" />
      <DbGate>
        <Suspense fallback={<div className="h-96 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <Edit params={params} />
        </Suspense>
      </DbGate>
    </Guard>
  );
}
