import { Suspense } from "react";
import { Guard } from "@/components/dashboard/Guard";
import { TeamLive } from "@/components/dashboard/TeamLive";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getTeam, type ReportRow, type TargetRow, type TeamData } from "@/lib/team/staff";

export const metadata = { title: "Staff and targets" };

const person = (id: string, staff: string, metric: string, goal: number, actual: number, label: string | null = null): TargetRow => ({ id, staffId: id, staff, metric, goal, actual, from: "2026-11-02", to: "2026-11-08", note: null, elapsed: 0.7, weight: 1, status: "active", label });
const filed = (staffId: string, name: string, role: string, summary: string | null): ReportRow => ({ staffId, name, role, filed: summary !== null, summary, blockers: null, ordersHandled: null });

/** Design preview only: the same screen as the live one, with invented people and figures. */
const sample: TeamData = {
  canSet: true, today: "2026-11-06", weekStart: "2026-11-02", meId: "demo", mine: null, leaderboards: [], roles: [], myDay: null,
  targets: [
    person("kwame", "Kwame", "paid_sales", 8000, 6240), person("akosua", "Akosua", "paid_sales", 8000, 2920), person("yaw", "Yaw", "on_time_deliveries", 95, 93), person("adjoa", "Adjoa", "supplier_orders", 24, 24),
    person("esi", "Esi", "articles_published", 3, 3), person("mawuli", "Mawuli", "check_in", 90, 60, "Replied within 1 hour"),
  ],
  people: [["kwame", "Kwame", "Sales · Kumasi"], ["akosua", "Akosua", "Sales · Accra"], ["yaw", "Yaw", "Dispatch · Kumasi"], ["adjoa", "Adjoa", "Sourcing · Accra"], ["esi", "Esi", "Content"], ["mawuli", "Mawuli", "Support"]].map(([id, name, role]) => ({ id, name, role })),
  reports: [
    { day: "2026-11-06", label: "Today", rows: [filed("kwame", "Kwame", "Sales", null)] },
    { day: "2026-11-05", label: "Yesterday", rows: [filed("kwame", "Kwame", "Sales", "Confirmed 9 orders, 6 paid by MoMo. 2 customers waiting on EU 42 restock."), filed("akosua", "Akosua", "Sales", null), filed("yaw", "Yaw", "Dispatch", "7 deliveries, 1 failed in Obuasi, rescheduled for today.")] },
  ],
  week: { filed: 31, expected: 35 },
  dots: { kwame: [true, true, true, true], akosua: [true, true, true, false], yaw: [true, true, true, true], adjoa: [true, true, true, true], esi: [true, true, true, true], mawuli: [true, true, true, true] },
};

async function Live() {
  return <TeamLive d={await getTeam()} />;
}

export default function Staff() {
  return (
    <Guard module={["targets_view", "targets_set", "staff"]}>
      {isSupabaseConfigured ? (
        <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
          <Live />
        </Suspense>
      ) : (
        <TeamLive d={sample} real={false} />
      )}
    </Guard>
  );
}
