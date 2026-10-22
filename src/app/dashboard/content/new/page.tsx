import { ArticleEditor } from "@/components/dashboard/ArticleEditor";
import { PageHead } from "@/components/dashboard/DashShell";
import { DbGate, Guard } from "@/components/dashboard/Guard";

export const metadata = { title: "New article" };

export default function NewArticle() {
  return (
    <Guard module="content" action="create">
      <PageHead real title="New article" sub="Plain text is fine: a blank line starts a paragraph, ## makes a heading, - makes a bullet" />
      <DbGate>
        <ArticleEditor initial={null} canDelete={false} />
      </DbGate>
    </Guard>
  );
}
