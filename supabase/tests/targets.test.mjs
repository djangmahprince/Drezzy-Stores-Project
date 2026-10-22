// Targets, daily reports and analytics. Run with: npm run test:targets
import { createHarness } from "./harness.mjs";

const { db, ids, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });
for (const [n, r] of [["owner", "owner"], ["admin", "admin"], ["sales", "sales_agent"], ["sales2", "sales_agent"], ["sourcing", "sourcing_officer"], ["dispatch", "dispatch_coordinator"], ["finance", "finance"], ["support", "customer_support"]]) await addStaff(n, r);

const vid = (await db.query("select id from public.variants where sku = 'DNK-LO-BW-41'")).rows[0].id;
const sup = (await db.query("select id from public.suppliers where name = 'Supplier A'")).rows[0].id;
// sales created two staff orders (one paid in full, one unpaid); sales2 one paid; one web order paid
const staffOrder = async (who, phone, source = "WhatsApp") => (await as(who, () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
  channel: "whatsapp", customer: { name: "Kojo Boateng", phone }, delivery: { method: "home", region: "Greater Accra", city: "Accra", area: "Osu", street: "x" },
  plan: "full", source, pay_method: "mtn", items: [{ variant_id: vid, qty: 1 }] })]))).rows[0].r;
const pay = (r) => asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [r.payment_reference, r.due_now]));
const o1 = await staffOrder("sales", "0240000071"); await pay(o1);
await staffOrder("sales", "0240000072"); // unpaid
const o3 = await staffOrder("sales2", "0240000071"); await pay(o3); // same customer again: a repeat
const web = (await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
  channel: "web", customer: { name: "Web Buyer", phone: "0240000073" }, delivery: { method: "pickup" }, plan: "full", source: "Instagram", pay_method: "mtn", items: [{ variant_id: vid, qty: 1 }] })]))).rows[0].r;
await pay(web);
const id1 = (await db.query("select id from public.orders where number = $1", [o1.number])).rows[0].id;
const item1 = (await db.query("select id from public.order_items where order_id=$1", [id1])).rows[0].id;
await as("sourcing", () => tryQ("select public.place_supplier_order($1,$2,$3::uuid[],300,null,null)", [id1, sup, [item1]]));

// ============ targets ============
const addT = (who, staff, metric, goal) => as(who, () => tryQ("insert into public.targets (staff_id, metric, goal, period_start, period_end, set_by) values ($1,$2,$3,current_date - 3,current_date + 3, auth.uid())", [staff, metric, goal]));
ok("an owner can set a target", (await addT("owner", ids.sales, "paid_sales", 1000)).ok);
ok("an admin can set a target", (await addT("admin", null, "orders", 10)).ok);
ok("sales cannot set targets", !(await addT("sales", ids.sales, "paid_sales", 1)).ok);
ok("a target needs a positive goal", !(await addT("owner", ids.sales, "paid_sales", 0)).ok);
ok("a target cannot end before it starts", !(await as("owner", () => tryQ("insert into public.targets (metric, goal, period_start, period_end, set_by) values ('orders',1,current_date,current_date-1,auth.uid())"))).ok);
ok("a target cannot claim someone else set it", !(await as("owner", () => tryQ("insert into public.targets (metric, goal, period_start, period_end, set_by) values ('orders',1,current_date,current_date,$1)", [ids.admin]))).ok);
await addT("owner", ids.sales2, "paid_sales", 500);
await addT("owner", ids.sourcing, "supplier_orders", 5);

const prog = async (who) => (await as(who, () => tryQ("select public.target_progress() as r"))).rows[0]?.r ?? null;
let p = await prog("owner");
const row = (list, staff, metric) => list.find((t) => (t.staff_id ?? null) === (staff ?? null) && t.metric === metric);
ok("progress counts the agent's paid sales from real orders (450)", Number(row(p, ids.sales, "paid_sales").actual) === 450, JSON.stringify(p));
ok("it counts only that agent's orders (the other agent: 450)", Number(row(p, ids.sales2, "paid_sales").actual) === 450);
ok("team orders target counts every paid order (3)", Number(row(p, null, "orders").actual) === 3);
ok("supplier orders are counted for the officer who placed them (1)", Number(row(p, ids.sourcing, "supplier_orders").actual) === 1);
ok("elapsed time is between 0 and 1", row(p, ids.sales, "paid_sales").elapsed > 0 && row(p, ids.sales, "paid_sales").elapsed < 1);
p = await prog("sales");
ok("a sales agent sees their own target and the team's, not a colleague's", p.some((t) => t.staff_id === ids.sales) && p.some((t) => t.staff_id === null) && !p.some((t) => t.staff_id === ids.sales2), JSON.stringify(p.map((t) => t.staff)));
ok("a sourcing officer sees only their own and the team's", (await prog("sourcing")).every((t) => t.staff_id === ids.sourcing || t.staff_id === null));
ok("sales cannot read the raw targets table for others", (await as("sales", () => tryQ("select * from public.targets where staff_id = $1", [ids.sales2]))).rows.length === 0);
await asRole("anon", async () => ok("shoppers cannot see targets", !(await tryQ("select public.target_progress()")).ok && !(await tryQ("select * from public.targets")).ok));
ok("targets are audited", (await db.query("select count(*)::int n from public.audit_log where table_name='targets'")).rows[0].n >= 3);

// ============ daily reports ============
const rep = (who, over = "") => as(who, () => tryQ(`insert into public.daily_reports (summary, orders_handled ${over ? "," + over.split("=")[0] : ""}) values ('Confirmed 9 orders', 9 ${over ? "," + over.split("=")[1] : ""}) returning id`));
ok("any staff member can file today's report", (await rep("sales")).ok && (await rep("dispatch")).ok && (await rep("support")).ok);
ok("only one report per person per day", !(await rep("sales")).ok);
ok("a report cannot be filed for last week", !(await rep("sourcing", "report_date=current_date - 7")).ok);
ok("a report cannot be filed for someone else", !(await as("sales2", () => tryQ("insert into public.daily_reports (staff_id, summary) values ($1,'sneaky one')", [ids.sales]))).ok);
ok("a report needs some content", !(await as("sales2", () => tryQ("insert into public.daily_reports (summary) values ('')"))).ok);
ok("you can fix your own report", ((await as("sales", () => tryQ("update public.daily_reports set summary = 'Confirmed 10 orders'"))).n ?? 0) === 1);
ok("you cannot edit someone else's", ((await as("sales2", () => tryQ("update public.daily_reports set summary = 'hacked'"))).n ?? 0) === 0);
ok("you read your own reports only", (await as("sales", () => tryQ("select * from public.daily_reports"))).rows.length === 1);
ok("a manager reads everyone's", (await as("admin", () => tryQ("select * from public.daily_reports"))).rows.length === 3);
const st = (await as("admin", () => tryQ("select public.report_status(current_date) as r"))).rows[0].r;
ok("the team view shows who has filed and who has not", st.find((s) => s.name && s.filed === false) && st.filter((s) => s.filed).length === 3, JSON.stringify(st.map((s) => [s.name, s.filed])));
ok("sales cannot see the team report status", !(await as("sales", () => tryQ("select public.report_status()"))).ok);
ok("report counts feed a 'reports' target", Number((await db.query("select private.target_actual('reports', $1, current_date, current_date) as n", [ids.sales])).rows[0].n) === 1);

// ============ visit events ============
const ev = (name, session, src) => asRole("anon", () => tryQ("select public.track_event($1,$2,$3)", [session, name, src]));
for (let i = 0; i < 10; i++) await ev("visit", `sess-000${i}`, i < 4 ? "instagram" : null);
for (let i = 0; i < 6; i++) await ev("product_view", `sess-000${i}`);
for (let i = 0; i < 3; i++) await ev("add_to_cart", `sess-000${i}`);
await ev("checkout_started", "sess-0000");
await ev("visit", "sess-0000"); await ev("visit", "sess-0000");
await ev("hack", "sess-0000"); await ev("visit", "x");
const events = (await db.query("select count(*)::int n from public.site_events")).rows[0].n;
ok("events are counted once per visitor per step per day", events === 10 + 6 + 3 + 1, String(events));
await asRole("anon", async () => ok("shoppers cannot read events", !(await tryQ("select * from public.site_events")).ok));
ok("staff cannot read raw events either", !(await as("owner", () => tryQ("select * from public.site_events"))).ok);

// ============ analytics ============
const summary = async (who) => (await as(who, () => tryQ("select public.analytics_summary(current_date - 30, current_date) as r")));
let a = (await summary("owner")).rows[0].r;
ok("orders placed, paid and delivered are counted (4 / 3 / 0)", a.orders_placed === 4 && a.paid_orders === 3 && a.delivered === 0, JSON.stringify(a));
ok("gross sales are what was actually paid (450 + 450 + 420)", Number(a.gross_sales) === 1320, String(a.gross_sales));
ok("average order is gross over paid orders", Number(a.average_order) === 440);
ok("new and repeat customers (2 new... one repeated)", a.new_customers === 1 && a.repeat_customers === 1, `${a.new_customers}/${a.repeat_customers}`);
const f = Object.fromEntries(a.funnel.map((s) => [s.step, s.count]));
ok("the funnel starts with visitors and ends with orders", f["Visited the shop"] === 10 && f["Viewed a product"] === 6 && f["Added to bag"] === 3 && f["Started checkout"] === 1 && f["Placed an order"] === 4 && f["Paid"] === 3, JSON.stringify(f));
ok("channels and sources are broken down", a.channels.some((c) => c.channel === "whatsapp" && c.orders === 3) && a.sources.some((s) => s.source === "WhatsApp"));
ok("top products show units and revenue", a.top_products[0].name && a.top_products[0].units === 3 && Number(a.top_products[0].revenue) > 0);
ok("a period with nothing in it is all zeros", (await as("owner", () => tryQ("select public.analytics_summary('2001-01-01','2001-01-31') as r"))).rows[0].r.orders_placed === 0);
ok("a backwards period is refused", !(await as("owner", () => tryQ("select public.analytics_summary('2026-02-01','2026-01-01')"))).ok);

a = (await summary("sales")).rows[0].r;
ok("a sales agent's analytics cover only their own orders (2 placed, 1 paid)", a.orders_placed === 2 && a.paid_orders === 1, JSON.stringify([a.orders_placed, a.paid_orders]));
ok("and no site-wide funnel (visits hidden)", a.funnel[0].count === 0);
a = (await summary("dispatch")).rows[0].r;
ok("dispatch's analytics are limited to Delivery: counts yes, money hidden", a.money_visible === false && a.gross_sales === null && a.top_products.every((p) => p.revenue === null));
a = (await summary("finance")).rows[0].r;
ok("finance (Money) sees the money", a.money_visible === true && Number(a.gross_sales) === 1320);
ok("customer support and sourcing see counts without money", (await summary("support")).rows[0].r.gross_sales === null && (await summary("sourcing")).rows[0].r.gross_sales === null);
await asRole("anon", async () => ok("shoppers cannot see analytics", !(await tryQ("select public.analytics_summary(current_date-1,current_date)")).ok));

await done();
