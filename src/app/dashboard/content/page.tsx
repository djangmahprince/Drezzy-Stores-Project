import { Guard } from "@/components/dashboard/Guard";
import { PageHead, Pill, Table } from "@/components/dashboard/DashShell";
import { articles } from "@/lib/data";

export const metadata = { title: "Drip School and content" };

const states = ["Published", "Scheduled", "In review", "Draft"] as const;
const tone = { Published: "ok", Scheduled: "info", "In review": "warn", Draft: "info" } as const;

export default function Content() {
  return (
    <Guard module="content">
      <PageHead title="Drip School and content" sub="Write, schedule and check content performance" actions={<button className="btn-primary">New article</button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        {["Articles", "Home page builder", "Banners", "Announcement bar", "Collections", "Pages", "Media library"].map((t, i) => <span key={t} className={`chip min-h-9 px-3 ${i === 0 ? "bg-navy text-white" : "bg-white"}`}>{t}</span>)}
      </div>
      <Table head={["Title", "Type", "Status", "Views", "Product clicks", "Sales credited"]}
        rows={articles.map((a, i) => [a.title, a.type, <Pill key={a.slug} tone={tone[states[i]]}>{states[i]}</Pill>, `${(4 - i) * 120}`, `${(4 - i) * 14}`, `GHS ${(4 - i) * 150}`])} />
    </Guard>
  );
}
