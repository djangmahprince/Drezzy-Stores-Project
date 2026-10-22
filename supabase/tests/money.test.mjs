// Money records: the ledger, expenses and the summary. Run with: npm run test:money
import { createHarness } from "./harness.mjs";

const { db, ids, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });
for (const [n, r] of [["finance", "finance"], ["admin", "admin"], ["sourcing", "sourcing_officer"], ["dispatch", "dispatch_coordinator"], ["sales", "sales_agent"], ["owner", "owner"]]) await addStaff(n, r);

// one paid order, sourced and received, so the ledger has a payment in and a supplier cost out
const vid = (await db.query("select id from public.variants where sku = 'DNK-LO-BW-41'")).rows[0].id;
const sup = (await db.query("select id from public.suppliers where name = 'Supplier A'")).rows[0].id;
const placed = (await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
  channel: "web", customer: { name: "Ama Mensah", phone: "0240000001", email: "a@x.co" },
  delivery: { method: "home", region: "Greater Accra", city: "Accra", area: "Osu", street: "Oxford St" }, plan: "half", source: "Instagram", pay_method: "mtn",
  items: [{ variant_id: vid, qty: 1 }] })]))).rows[0].r;
await asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [placed.payment_reference, placed.due_now]));
const orderId = (await db.query("select id from public.orders where number = $1", [placed.number])).rows[0].id;
const itemId = (await db.query("select id from public.order_items where order_id = $1", [orderId])).rows[0].id;
const so = (await as("sourcing", () => tryQ("select public.place_supplier_order($1,$2,$3::uuid[],300,null,null) as r", [orderId, sup, [itemId]]))).rows[0].r;
const ledger = (who) => as(who, () => tryQ("select direction, category, amount from public.money_ledger order by direction"));

ok("an order that is ordered but not received has no supplier cost yet", (await ledger("finance")).rows.filter((r) => r.direction === "out").length === 0);
await as("sourcing", () => tryQ("select public.receive_supplier_order($1)", [so]));

// finance sees everything
let l = (await ledger("finance")).rows;
ok("finance sees the payment in (the half paid, 225)", l.some((r) => r.direction === "in" && r.category === "Sales" && Number(r.amount) === 225), JSON.stringify(l));
ok("finance sees the supplier cost out (300)", l.some((r) => r.direction === "out" && r.category === "Supplier costs" && Number(r.amount) === 300));
ok("each payment and supplier cost appears exactly once", l.length === 2);

// expenses
const addExp = (who, cat, amt, extra = "") => as(who, () => tryQ(`insert into public.expenses (category, amount, note, created_by, created_by_name ${extra ? "," + extra.split("=")[0] : ""}) values ($1,$2,'test',auth.uid(),'x' ${extra ? "," + extra.split("=")[1] : ""}) returning id`, [cat, amt]));
const e1 = await addExp("finance", "ads_and_promotion", 120);
ok("finance records an expense", e1.ok, e1.err);
ok("an expense must be positive", !(await addExp("finance", "other", 0)).ok);
ok("sourcing may record a supplier cost", (await addExp("sourcing", "supplier_costs", 40)).ok);
ok("sourcing may not record an ad expense", !(await addExp("sourcing", "ads_and_promotion", 40)).ok);
ok("dispatch may record rider fuel", (await addExp("dispatch", "delivery_and_riders", 25)).ok);
ok("dispatch may not record a supplier cost", !(await addExp("dispatch", "supplier_costs", 25)).ok);
ok("sales cannot record any expense", !(await addExp("sales", "other", 5)).ok);
ok("an expense cannot claim another person as its author", !(await as("finance", () => tryQ("insert into public.expenses (category, amount, created_by) values ('other', 5, $1)", [ids.admin]))).ok);
await asRole("anon", async () => ok("shoppers cannot read the ledger or expenses", !(await tryQ("select * from public.money_ledger")).ok && !(await tryQ("select * from public.expenses")).ok));

// who sees what
l = (await ledger("finance")).rows;
ok("finance now also sees the expenses", l.filter((r) => r.direction === "out").length === 4, String(l.length));
const sl = (await ledger("sourcing")).rows;
ok("sourcing sees supplier costs but never sales", sl.every((r) => r.category === "Supplier costs") && sl.length >= 2, JSON.stringify(sl));
const dl = (await ledger("dispatch")).rows;
ok("dispatch sees only delivery costs", dl.every((r) => r.category === "Delivery and riders") && dl.length === 1, JSON.stringify(dl));
ok("sales sees an empty ledger", (await ledger("sales")).rows.length === 0);
ok("admin can read the ledger (view only)", (await ledger("admin")).rows.length === 5);
ok("admin cannot add expenses (view only)", !(await addExp("admin", "other", 5)).ok);

// edits and deletes
const mine = (await as("sourcing", () => tryQ("select id from public.expenses where created_by = auth.uid()"))).rows[0].id;
ok("an author can fix their own expense", ((await as("sourcing", () => tryQ("update public.expenses set amount = 45 where id = $1", [mine]))).n ?? 0) === 1);
ok("but not someone else's", ((await as("sourcing", () => tryQ("update public.expenses set amount = 1 where id = $1", [e1.rows[0].id]))).n ?? 0) === 0);
ok("an author cannot move an expense into a category they do not own", !(await as("sourcing", () => tryQ("update public.expenses set category = 'ads_and_promotion' where id = $1", [mine]))).ok);
ok("sourcing cannot delete expenses", ((await as("sourcing", () => tryQ("delete from public.expenses where id = $1", [mine]))).n ?? 0) === 0);
ok("finance can delete an expense", ((await as("finance", () => tryQ("delete from public.expenses where id = $1", [mine]))).n ?? 0) === 1);
ok("expenses are audited", (await db.query("select count(*)::int n from public.audit_log where table_name = 'expenses'")).rows[0].n >= 5);

// the summary
const sum = async (who, from = "2020-01-01", to = "2099-01-01") => as(who, () => tryQ("select public.money_summary($1,$2) as r", [from, to]));
const s = (await sum("finance")).rows[0].r;
ok("summary: money in is the confirmed payments", Number(s.money_in) === 225, JSON.stringify(s));
ok("summary: money out adds supplier costs and expenses (300 + 120 + 25)", Number(s.money_out) === 445, String(s.money_out));
ok("summary: net cash flow is in minus out", Number(s.net) === 225 - 445);
ok("summary: the half-paid balance is still to collect (225)", Number(s.balances_to_collect) === 225);
ok("summary: spending is broken down by category", s.out_by_category.some((c) => c.category === "Supplier costs" && Number(c.amount) === 300) && s.out_by_category.some((c) => c.category === "Ads and promotion"));
ok("summary: a period with nothing in it is all zeros", Number((await sum("finance", "2001-01-01", "2001-01-31")).rows[0].r.money_in) === 0);
ok("summary: a backwards period is refused", !(await sum("finance", "2026-02-01", "2026-01-01")).ok);
ok("summary: admin can see it", (await sum("admin")).ok);
ok("summary: roles limited to one category cannot", !(await sum("sourcing")).ok && !(await sum("dispatch")).ok);
ok("summary: sales cannot", !(await sum("sales")).ok);
await asRole("anon", async () => ok("summary: shoppers cannot", !(await tryQ("select public.money_summary('2020-01-01','2099-01-01')")).ok));

await done();
