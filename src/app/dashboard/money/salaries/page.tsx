import { Suspense } from "react";
import { DbGate, Guard } from "@/components/dashboard/Guard";
import { PageHead } from "@/components/dashboard/DashShell";
import { SalaryLive } from "@/components/dashboard/SalaryLive";
import { getSalaries } from "@/lib/money/salaries";

export const metadata = { title: "Salaries" };

async function Live({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const now = new Date();
  const valid = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return <SalaryLive d={await getSalaries(valid)} />;
}

export default function Salaries({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  return (
    <Guard module="salary">
      <PageHead real title="Salaries" sub="Owner and Finance only" />
      <DbGate>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <Live searchParams={searchParams} />
        </Suspense>
      </DbGate>
    </Guard>
  );
}
