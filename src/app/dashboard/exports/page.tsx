import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { DbGate, Guard } from "@/components/dashboard/Guard";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "Exports" };

const files = [
  { kind: "orders", title: "Orders", note: "Every order you can see, with customer, status, payment and totals." },
  { kind: "customers", title: "Customers", note: "Names, phone numbers, emails and where they found us." },
  { kind: "money", title: "Money", note: "The ledger: payments in, supplier costs, refunds, salaries and expenses out." },
  { kind: "catalogue", title: "Catalogue", note: "Every variant with its SKU, price and availability. Supplier costs are never included." },
];

async function List() {
  const me = await requireStaff();
  const catalogueOnly = /^catalogue/i.test(me.permissions.exports?.restriction ?? "");
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {files.filter((f) => !catalogueOnly || f.kind === "catalogue").map((f) => (
        <li key={f.kind} className="card flex flex-col justify-between gap-3 p-4">
          <div><h2 className="font-semibold">{f.title}</h2><p className="mt-1 text-sm text-text2">{f.note}</p></div>
          {/* a plain link: the browser downloads the file with the person's own sign-in */}
          <a href={`/api/export?kind=${f.kind}`} download className="btn-outline w-fit !min-h-10">Download CSV</a>
        </li>
      ))}
    </ul>
  );
}

export default function Exports() {
  return (
    <Guard module="exports" action="export">
      <PageHead real title="Exports" sub="Spreadsheets of your data. You only get what your role may already see, and every download is logged." />
      <DbGate>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <List />
        </Suspense>
      </DbGate>
    </Guard>
  );
}
