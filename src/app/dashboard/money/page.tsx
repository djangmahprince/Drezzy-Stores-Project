import { Guard } from "@/components/dashboard/Guard";
import { Kpi, PageHead, Pill, Progress, Table } from "@/components/dashboard/DashShell";

export const metadata = { title: "Money" };

const out: [string, number][] = [["Supplier costs", 13900], ["Salaries", 2400], ["Delivery and riders", 820], ["Ads and promotion", 600], ["Refunds", 450]];

export default function Money() {
  return (
    <Guard module={["expenses", "salary"]}>
      <PageHead title="Money" sub="Every cedi in and out. Payments, supplier costs and refunds are recorded automatically; expenses are added here."
        actions={<><button className="btn-outline">Export</button><button className="btn-primary">Add expense</button></>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Money in" value="GHS 24,600" note="Payments and balances collected" />
        <Kpi label="Money out" value="GHS 18,170" note="Suppliers, expenses, refunds" />
        <Kpi label="Net cash flow" value="GHS 6,430" note="Both branches" />
        <Kpi label="Balances to collect" value="GHS 1,200" note="6 half-paid Accra orders" />
        <Kpi label="Paystack Starter limit used" value="GHS 18,450" note="62% of GHS 30,000 · register to lift it" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table head={["When", "What", "Category", "Branch", "Method", "Amount (GHS)"]} rows={[
            ["Today 9:14", "Half payment · DRZ-1036", "Sales", "Accra", "MTN MoMo", "+200"],
            ["Today 8:41", "Supplier order · DRZ-1029 · receipt", "Supplier cost", "Kumasi", "MoMo", "−260"],
            ["Today 8:40", "Balance collected · DRZ-1022", "Sales", "Accra", "Cash · Kofi", "+200"],
            ["Yesterday", "Rider fuel and fares · receipt", "Delivery and riders", "Accra", "Cash", "−120"],
            ["Mon", "Instagram ads, weekend promo", "Ads and promotion", "Both", "Card", "−300"],
            ["Mon", "Refund · DRZ-1012 · could not source", "Refund", "Kumasi", "MTN MoMo", "−450"],
          ]} />
        </div>
        <div className="space-y-4">
          <section className="card p-4 text-sm">
            <h2 className="font-semibold">Money out by category</h2>
            <ul className="mt-3 space-y-2">{out.map(([c, n]) => <li key={c}><p className="flex justify-between"><span>{c}</span><b>{n.toLocaleString()}</b></p><Progress pct={(n / 13900) * 100} /></li>)}</ul>
          </section>
          <section className="card p-4 text-sm">
            <h2 className="font-semibold">Rider cash today</h2>
            <p className="mt-2">Kofi · collected GHS 400 <Pill tone="ok">Handed in</Pill></p>
            <p className="mt-1">Yaw · collected GHS 200 <Pill tone="warn">Not handed in</Pill></p>
          </section>
          <section className="card p-4 text-sm">
            <h2 className="font-semibold">Salaries this month <span className="text-xs font-normal text-text2">Owner and Finance only</span></h2>
            <p className="mt-2">5 staff · GHS 2,400 recorded · 3 paid, 2 due by Friday</p>
          </section>
        </div>
      </div>
    </Guard>
  );
}
