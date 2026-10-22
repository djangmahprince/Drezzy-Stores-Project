import { Guard } from "@/components/dashboard/Guard";
import { Kpi, PageHead, Pill, Progress } from "@/components/dashboard/DashShell";

export const metadata = { title: "Staff and targets" };

const rows: [string, string, string, number, "ok" | "warn" | "bad", string][] = [
  ["Kwame · Sales, Kumasi", "Paid sales GHS 8,000", "GHS 6,240 · 78%", 78, "ok", "On pace"],
  ["Akosua · Sales, Accra", "Paid sales GHS 8,000", "GHS 3,920 · 49%", 49, "bad", "Behind"],
  ["Yaw · Dispatch, Kumasi", "On-time delivery 95%", "93% · 26 of 28", 93, "ok", "On pace"],
  ["Adjoa · Sourcing, Accra", "Supplier order within 24 h, 95%", "96% · 23 of 24 orders", 96, "ok", "Hit"],
  ["Esi · Content", "3 Journal posts", "3 of 3 published", 100, "ok", "Hit"],
  ["Mawuli · Support", "Reply within 1 hour, 90%", "88% of 41 chats", 88, "warn", "Close"],
  ["Kofi · Rider partner, Kumasi", "25 deliveries", "21 of 25", 84, "ok", "On pace"],
];

export default function Staff() {
  return (
    <Guard module={["targets_view", "targets_set", "staff"]}>
      <PageHead title="Staff and targets" sub="Progress is counted from real orders, supplier orders and deliveries. Daily reports fill the gaps." actions={<button className="btn-primary">Set a target</button>} />
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Targets on pace or hit" value="5 of 7" note="2 need a check-in" />
        <Kpi label="Daily reports this week" value="31 of 35" note="1 missing yesterday" />
        <Kpi label="Team sales vs weekly target" value="74%" note="GHS 18,450 of GHS 25,000" />
      </div>
      <section className="card mt-4 divide-y divide-line">
        {rows.map(([who, target, prog, pct, tone, pace]) => (
          <div key={who} className="grid items-center gap-2 p-4 text-sm md:grid-cols-4">
            <b>{who}</b><span className="text-text2">{target}</span>
            <div><p>{prog}</p><Progress pct={pct} tone={tone} /></div>
            <Pill tone={tone}>{pace}</Pill>
          </div>
        ))}
      </section>
      <section className="card mt-4 p-4 text-sm">
        <h2 className="font-semibold">Yesterday&apos;s daily reports</h2>
        <ul className="mt-2 space-y-2">
          <li><b>Kwame</b> · Sent 18:05 · Confirmed 9 orders, 6 paid by MoMo. Blocker: 2 customers waiting on EU 42 restock.</li>
          <li><b>Akosua</b> · <Pill tone="bad">Missing</Pill> reminder sent. Admin was notified at the cut-off time.</li>
          <li><b>Yaw</b> · Sent 19:20 · 7 deliveries, 1 failed in Obuasi, rescheduled for today.</li>
        </ul>
      </section>
    </Guard>
  );
}
