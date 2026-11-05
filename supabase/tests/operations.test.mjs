// Operations, money close and targets: alerts, riders and partners, delivery rules, sourcing outcome, payment links,
// rider cash, CRM directory/360/merge/import/erase, saved views, search, month close, budgets, profit and targets.
// Run with: npm run test:operations
import { createHarness } from "./harness.mjs";

const { db, ok, as, asRole, tryQ, addStaff, done, reset, ids } = await createHarness({ seed: true });
for (const [n, r] of [["owner", "owner"], ["admin", "admin"], ["sales", "sales_agent"], ["sales2", "sales_agent"], ["sourcing", "sourcing_officer"],
  ["dispatch", "dispatch_coordinator"], ["finance", "finance"], ["support", "customer_support"], ["content", "content_editor"]]) await addStaff(n, r);

const vid = (await db.query("select id from public.variants where sku = 'DNK-LO-BW-41'")).rows[0].id;
const place = async (phone, extra = {}) => {
  const r = await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
    channel: "web", customer: { name: "Ama Mensah", phone, email: `${phone}@example.com` },
    delivery: { method: "home", region: "Greater Accra", city: "Accra", area: "Osu", street: "Oxford St" },
    plan: "full", source: "Instagram", pay_method: "mtn", items: [{ variant_id: vid, qty: 1 }], ...extra })]));
  if (!r.ok) throw new Error(r.err);
  return r.rows[0].r;
};
const pay = (r) => asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [r.payment_reference, r.due_now]));
const orderId = async (number) => (await db.query("select id from public.orders where number = $1", [number])).rows[0].id;
const order = async (id) => (await db.query("select * from public.orders where id = $1", [id])).rows[0];
const adv = (who, id, to) => as(who, () => tryQ("select public.advance_order($1,$2::public.order_status,null)", [id, to]));
const alerts = async (who) => (await as(who, () => tryQ("select kind, title from public.staff_alerts order by id"))).rows;

// ---------------------------------------------------------------- alerts
const o1 = await place("0240000201");
await pay(o1);
const id1 = await orderId(o1.number);
ok("a paid web order alerts the owner, admin and sales", (await alerts("owner")).some((a) => a.kind === "new_order") && (await alerts("sales")).some((a) => a.kind === "new_order"));
ok("dispatch is not told about every new order", !(await alerts("dispatch")).some((a) => a.kind === "new_order"));
ok("alerts are private to the person", (await as("sales", () => tryQ("select * from public.staff_alerts where staff_id <> $1", [ids.sales]))).rows.length === 0);
ok("a person marks their alert read", (await as("sales", () => tryQ("update public.staff_alerts set read_at = now()"))).n >= 1);
ok("nobody can rewrite an alert", !(await as("sales", () => tryQ("update public.staff_alerts set title = 'x'"))).ok);
await adv("admin", id1, "to_source");
ok("a confirmed order tells sourcing there is a supplier order to place", (await alerts("sourcing")).some((a) => a.kind === "to_source"));
ok("a target set for someone tells them", (await as("admin", () => tryQ("insert into public.targets (staff_id, metric, goal, period_start, period_end, set_by) values ($1,'orders',5,current_date,current_date+6,$2)", [ids.sales, ids.admin]))).ok
  && (await alerts("sales")).some((a) => a.kind === "target"));
ok("a new device sign-in warns the person (not the first device)", (await as("sales", () => tryQ("select public.note_sign_in('aaaaaaaaaaaaaaaa1','Chrome on Android')"))).ok
  && !(await alerts("sales")).some((a) => a.kind === "security")
  && (await as("sales", () => tryQ("select public.note_sign_in('bbbbbbbbbbbbbbbb2','Safari on iPhone')"))).ok
  && (await alerts("sales")).some((a) => a.kind === "security"));
ok("settings change the alert routes and are audited", (await as("owner", () => tryQ("update public.app_settings set value = jsonb_set(value, '{new_order}', '[\"owner\"]') where key = 'alert_routes'"))).n === 1
  && (await db.query("select count(*)::int n from public.audit_log where table_name = 'app_settings' and record_id = 'alert_routes'")).rows[0].n === 1);
ok("sales cannot change settings", (await as("sales", () => tryQ("update public.app_settings set value = '{}' where key = 'alerts'"))).n === 0);

// ---------------------------------------------------------------- riders, delivery and partners
const rider = (await as("dispatch", () => tryQ("insert into public.riders (name, phone, kind) values ('Kofi Rider','+233200000001','rider') returning id"))).rows?.[0]?.id;
ok("dispatch adds a rider", !!rider);
ok("sales cannot add riders", !(await as("sales", () => tryQ("insert into public.riders (name) values ('X Y')"))).ok);
await as("sourcing", () => tryQ("select public.place_supplier_order($1,(select id from public.suppliers limit 1),(select array_agg(id) from public.order_items where order_id=$1),300,null,null)", [id1]));
await as("sourcing", () => tryQ("select public.receive_supplier_order((select id from public.supplier_orders where order_id=$1),null)", [id1]));
await adv("dispatch", id1, "packed");
ok("dispatch assigns a rider", (await as("dispatch", () => tryQ("select public.assign_rider($1,$2,null,'TRK1')", [id1, rider]))).ok);
let o = await order(id1);
ok("the rider's name and phone are copied onto the order", o.rider_id === rider && o.rider_name === "Kofi Rider" && o.tracking_number === "TRK1");
ok("sales cannot assign riders", !(await as("sales", () => tryQ("select public.assign_rider($1,$2,null,null)", [id1, rider]))).ok);
await adv("dispatch", id1, "dispatched");
ok("delivering with a wrong code is refused", !(await as("dispatch", () => tryQ("select public.deliver_order($1,'0000x',null,null)", [id1]))).ok);
ok("delivering with the customer's code works", (await as("dispatch", () => tryQ("select public.deliver_order($1,$2,null,null)", [id1, o.delivery_code]))).ok);
ok("the order is delivered with a time", (await order(id1)).status === "delivered" && (await order(id1)).delivered_at);

// half payment: admin override and rider cash
const o2 = await place("0240000202", { plan: "half" });
await pay(o2);
const id2 = await orderId(o2.number);
for (const s of ["to_source", "ready_to_pack", "packed", "dispatched"]) await adv("admin", id2, s);
await as("dispatch", () => tryQ("select public.assign_rider($1,$2,null,null)", [id2, rider]));
ok("an order with a balance cannot be delivered", !(await as("dispatch", () => tryQ("select public.deliver_order($1,null,null,null)", [id2]))).ok);
ok("dispatch cannot override", !(await as("dispatch", () => tryQ("select public.deliver_order($1,null,null,'customer will pay later')", [id2]))).ok);
await db.query("update public.app_settings set value = '{\"require_delivery_code\": true}' where key = 'delivery'");
ok("with codes required, delivering needs the code or a photo", !(await as("dispatch", () => tryQ("select public.record_balance($1,'cash',null)", [id2]).then(() => tryQ("select public.deliver_order($1,null,null,null)", [id2])))).ok);
ok("the balance was recorded against the rider", (await db.query("select collected_by_rider from public.payments where order_id = $1 and kind = 'balance'", [id2])).rows[0].collected_by_rider === rider);
const proof = `${id2}/door.jpg`;
ok("a photo inside the order's folder proves delivery", (await as("dispatch", () => tryQ("select public.deliver_order($1,null,$2,null)", [id2, proof]))).ok);
let cash = (await as("finance", () => tryQ("select public.rider_cash(current_date) as r"))).rows[0].r;
ok("finance sees the cash the rider collected", Number(cash.find((c) => c.rider_id === rider).collected) === Number(o2.balance_due), JSON.stringify(cash));
ok("dispatch cannot record cash handed in", !(await as("dispatch", () => tryQ("select public.record_handover($1,current_date,100,null)", [rider]))).ok);
ok("finance records the hand-in", (await as("finance", () => tryQ("select public.record_handover($1,current_date,$2,'all in')", [rider, Number(o2.balance_due) - 10]))).ok);
cash = (await as("finance", () => tryQ("select public.rider_cash(current_date) as r"))).rows[0].r;
ok("the difference shows", Number(cash[0].collected) - Number(cash[0].handed_in) === 10);
ok("sales cannot see rider cash", !(await as("sales", () => tryQ("select public.rider_cash(current_date)"))).ok);

// admin override with a reason
const o3 = await place("0240000203", { plan: "half" });
await pay(o3);
const id3 = await orderId(o3.number);
for (const s of ["to_source", "ready_to_pack", "packed", "dispatched"]) await adv("admin", id3, s);
ok("an admin override needs a reason", !(await as("admin", () => tryQ("select public.deliver_order($1,null,null,'x')", [id3]))).ok);
ok("an admin delivers with a reason despite the balance", (await as("admin", () => tryQ("select public.deliver_order($1,null,null,'Customer paid the rider by bank transfer')", [id3]))).ok);
ok("the override is kept on the timeline", (await db.query("select internal_note from public.order_events where order_id = $1 and status = 'delivered'", [id3])).rows[0].internal_note.includes("Admin override"));
await db.query("update public.app_settings set value = '{\"require_delivery_code\": false}' where key = 'delivery'");

// partner portal
const partnerUser = (await db.query("insert into auth.users(email) values ('kofi.rider@example.com') returning id")).rows[0].id;
await db.query("update public.riders set user_id = $1 where id = $2", [partnerUser, rider]);
const asPartner = async (fn) => { await reset(); await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: partnerUser, aal: "aal1" })]); await db.exec("set role authenticated"); try { return await fn(); } finally { await reset(); } };
const o4 = await place("0240000204", { plan: "half" });
await pay(o4);
const id4 = await orderId(o4.number);
for (const s of ["to_source", "ready_to_pack", "packed"]) await adv("admin", id4, s);
await as("dispatch", () => tryQ("select public.assign_rider($1,$2,null,null)", [id4, rider]));
const code4 = (await order(id4)).delivery_code;
const jobs = (await asPartner(() => tryQ("select public.partner_jobs() as r"))).rows[0].r;
ok("the partner sees their job with the balance to collect, not the delivery code", jobs.jobs.some((j) => j.id === id4 && Number(j.balance) > 0) && !JSON.stringify(jobs).includes("delivery_code"));
ok("the partner cannot read orders directly", (await asPartner(() => tryQ("select * from public.orders"))).rows.length === 0);
ok("the partner sets out", (await asPartner(() => tryQ("select public.partner_update($1,'out_for_delivery')", [id4]))).ok);
ok("the partner cannot deliver before collecting the balance", !(await asPartner(() => tryQ("select public.partner_update($1,'delivered',$2)", [id4, code4]))).ok);
ok("the partner collects the balance in cash", (await asPartner(() => tryQ("select public.partner_update($1,'collect',null,'cash')", [id4]))).ok);
ok("the partner needs the customer's code to deliver", !(await asPartner(() => tryQ("select public.partner_update($1,'delivered','9999x')", [id4]))).ok
  && (await asPartner(() => tryQ("select public.partner_update($1,'delivered',$2)", [id4, code4]))).ok);
ok("another login is not a partner", !(await as("sales", () => tryQ("select public.partner_jobs()"))).ok);

// ---------------------------------------------------------------- sourcing outcome, reassign, payment link
const o5 = await place("0240000205");
await pay(o5);
const id5 = await orderId(o5.number);
await adv("admin", id5, "to_source");
ok("an outcome needs a failed supplier order first", !(await as("sourcing", () => tryQ("select public.set_sourcing_outcome($1,'refund',null)", [id5]))).ok);
await as("sourcing", () => tryQ("select public.place_supplier_order($1,(select id from public.suppliers limit 1),(select array_agg(id) from public.order_items where order_id=$1),300,null,null)", [id5]));
await as("sourcing", () => tryQ("select public.fail_supplier_order((select id from public.supplier_orders where order_id=$1),'Out of stock everywhere')", [id5]));
ok("an alternative needs a description", !(await as("sourcing", () => tryQ("select public.set_sourcing_outcome($1,'alternative_offered','')", [id5]))).ok);
ok("sourcing offers an alternative", (await as("sourcing", () => tryQ("select public.set_sourcing_outcome($1,'alternative_offered','Nike Dunk Low Panda, same size')", [id5]))).ok);
ok("the customer is emailed straight away", (await db.query("select count(*)::int n from public.notifications where order_id = $1 and payload->>'headline' like 'We could not get your item%'", [id5])).rows[0].n === 1);
ok("choosing a refund requests the full amount paid", (await as("sourcing", () => tryQ("select public.set_sourcing_outcome($1,'refund',null)", [id5]))).ok
  && Number((await db.query("select amount from public.refunds where order_id = $1", [id5])).rows[0].amount) === Number(o5.total));
ok("finance is alerted about the refund to decide", (await alerts("finance")).some((a) => a.kind === "refund_requested"));
ok("sales cannot reassign", !(await as("sales", () => tryQ("select public.reassign_order($1,$2)", [id5, ids.sales2]))).ok);
ok("an admin reassigns the order", (await as("admin", () => tryQ("select public.reassign_order($1,$2)", [id5, ids.sales2]))).ok && (await order(id5)).agent_name === "sales2");
ok("the new agent is told", (await alerts("sales2")).some((a) => a.kind === "assigned"));
ok("nobody changes the agent directly", !(await as("admin", () => tryQ("update public.orders set assigned_agent_id = $2 where id = $1", [id5, ids.sales]))).ok);
const o6 = await place("0240000206", { plan: "half" });
const id6 = await orderId(o6.number);
let link = (await as("admin", () => tryQ("select public.create_payment_link($1) as r", [id6]))).rows[0].r;
ok("an unpaid order's link is for the amount due now", Number(link.amount) === Number(o6.due_now) && link.reference === o6.payment_reference);
await pay(o6);
link = (await as("admin", () => tryQ("select public.create_payment_link($1) as r", [id6]))).rows[0].r;
ok("a half-paid order's link is for the balance", Number(link.amount) === Number(o6.balance_due) && link.reference !== o6.payment_reference);
await asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [link.reference, link.amount]));
ok("paying the link clears the balance", Number((await order(id6)).balance_due) === 0);

// ---------------------------------------------------------------- CRM
const dir = (await as("support", () => tryQ("select public.customer_directory('{\"q\":\"Ama\"}'::jsonb) as r"))).rows[0].r;
ok("the directory finds customers with lifetime value", dir.total >= 5 && dir.rows.every((r) => r.spend !== undefined));
const own = (await as("sales2", () => tryQ("select public.customer_directory('{}'::jsonb) as r"))).rows[0].r;
ok("a sales agent sees only customers on their own orders", own.total === 1, JSON.stringify(own));
const dDir = (await as("dispatch", () => tryQ("select public.customer_directory('{}'::jsonb) as r"))).rows[0].r;
ok("dispatch sees delivery fields only (no email, source or spend)", dDir.rows.every((r) => r.email === null && r.spend === null && r.source === null));
const c1 = (await db.query("select id from public.customers where phone = '+233240000201'")).rows[0].id;
const c2 = (await db.query("select id from public.customers where phone = '+233240000202'")).rows[0].id;
const p360 = (await as("support", () => tryQ("select public.customer_360($1) as r", [c1]))).rows[0].r;
ok("the 360 view shows orders, lifetime value and consent", p360.orders.length === 1 && Number(p360.lifetime_value) > 0 && p360.consent);
ok("sales cannot open a customer who is not theirs", !(await as("sales2", () => tryQ("select public.customer_360($1)", [c1]))).ok);
ok("support tags a customer", (await as("support", () => tryQ("select public.update_customer($1,'{\"tags\":[\"VIP\",\"VIP\",\"wholesale\"]}'::jsonb)", [c1]))).ok
  && JSON.stringify((await db.query("select tags from public.customers where id = $1", [c1])).rows[0].tags.sort()) === '["VIP","wholesale"]');
ok("a phone taken by another customer is refused", !(await as("support", () => tryQ("select public.update_customer($1,'{\"phone\":\"0240000202\"}'::jsonb)", [c1]))).ok);
ok("merging needs a reason", !(await as("support", () => tryQ("select public.merge_customers($1,$2,'')", [c1, c2]))).ok);
ok("sales cannot merge", !(await as("sales", () => tryQ("select public.merge_customers($1,$2,'same person')", [c1, c2]))).ok);
ok("support merges duplicates", (await as("support", () => tryQ("select public.merge_customers($1,$2,'Same person, two numbers')", [c1, c2]))).ok);
const merged = (await as("support", () => tryQ("select public.customer_360($1) as r", [c1]))).rows[0].r;
ok("the kept record shows both people's orders", merged.orders.length === 2 && merged.merged.length === 1);
ok("the merged record leaves the directory", !(await as("support", () => tryQ("select public.customer_directory('{}'::jsonb) as r"))).rows[0].r.rows.some((r) => r.id === c2));
ok("the merged customer can still track with their own phone", (await asRole("anon", () => tryQ("select public.track_order($1,'0240000202') as r", [o2.number]))).rows[0].r !== null);
ok("the merge is logged", (await db.query("select count(*)::int n from public.customer_merges")).rows[0].n === 1);
const imp = (await as("support", () => tryQ("select public.import_customers($1::jsonb) as r", [JSON.stringify([
  { name: "Yaw Boateng", phone: "024 000 0301", consent: "yes", tags: "wholesale;vip" }, { name: "Ama Mensah", phone: "0240000201", email: "new@x.com" },
  { name: "Bad", phone: "12345" }, { name: "", phone: "0240000302" }])]))).rows[0].r;
ok("import creates, updates duplicates by phone, and reports bad rows", imp.created === 1 && imp.updated === 1 && imp.errors.length === 2, JSON.stringify(imp));
ok("sales cannot import", !(await as("sales", () => tryQ("select public.import_customers('[]'::jsonb)"))).ok);
const c3 = (await db.query("select id from public.customers where phone = '+233240000301'")).rows[0].id;
ok("support cannot erase (needs delete)", !(await as("support", () => tryQ("select public.erase_customer($1,null)", [c3]))).ok);
ok("an admin erases a customer with no open orders", (await as("admin", () => tryQ("select public.erase_customer($1,null)", [c3]))).ok
  && (await db.query("select phone, full_name from public.customers where id = $1", [c3])).rows[0].phone === null);
ok("a customer with an open order cannot be erased", !(await as("admin", () => tryQ("select public.erase_customer((select customer_id from public.orders where id = $1),null)", [id6]))).ok);

// saved views and search
ok("a person saves a view", (await as("sales", () => tryQ("insert into public.saved_views (list, name, params) values ('orders','Mine to confirm','{\"status\":\"to_confirm\"}')"))).ok);
ok("views are private", (await as("admin", () => tryQ("select * from public.saved_views"))).rows.length === 0);
const found = (await as("support", () => tryQ("select public.staff_search($1) as r", [o1.number]))).rows[0].r;
ok("search finds an order by number", found.some((x) => x.kind === "order"));
const sFound = (await as("sales2", () => tryQ("select public.staff_search('DRZ') as r"))).rows[0].r;
ok("search only finds what the person may see", sFound.filter((x) => x.kind === "order").length === 1, JSON.stringify(sFound));
ok("search finds products by SKU", (await as("sales", () => tryQ("select public.staff_search('DNK-LO') as r"))).rows[0].r.some((x) => x.kind === "product"));

// ---------------------------------------------------------------- money: other money in, budgets, close, profit
ok("finance records an owner top-up", (await as("finance", () => tryQ("insert into public.money_in_entries (amount, reason, created_by) values (500,'Owner top-up',$1)", [ids.finance]))).ok);
ok("dispatch cannot record money in", !(await as("dispatch", () => tryQ("insert into public.money_in_entries (amount, reason, created_by) values (500,'x y z',$1)", [ids.dispatch]))).ok);
let sum = (await as("finance", () => tryQ("select public.money_summary(current_date - 1, current_date + 1) as r"))).rows[0].r;
ok("the summary counts other money in", Number(sum.other_in) === 500 && Number(sum.money_in) === Number(sum.sales_in) + 500);
ok("a budget is set by finance", (await as("finance", () => tryQ("insert into public.budgets (category, amount) values ('ads_and_promotion', 100)"))).ok);
ok("admin cannot set budgets", !(await as("admin", () => tryQ("insert into public.budgets (category, amount) values ('packaging', 100)"))).ok);
await as("finance", () => tryQ("insert into public.expenses (category, amount, created_by) values ('ads_and_promotion', 85, $1)", [ids.finance]));
const bs = (await as("finance", () => tryQ("select public.budget_status(current_date) as r"))).rows[0].r;
ok("budget status shows 85% used", bs.find((b) => b.category === "ads_and_promotion").pct == 85, JSON.stringify(bs));
ok("the current month cannot be closed yet", !(await as("finance", () => tryQ("select public.close_month(current_date, null)"))).ok);
const last = "date_trunc('month', current_date - interval '1 month')::date";
ok("finance closes last month", (await as("finance", () => tryQ(`select public.close_month(${last}, 'Reviewed')`))).ok);
ok("an expense in a closed month is refused", !(await as("finance", () => tryQ(`insert into public.expenses (category, amount, spent_on, created_by) values ('packaging', 5, ${last} + 3, $1)`, [ids.finance]))).ok);
ok("finance cannot unlock", !(await as("finance", () => tryQ(`select public.unlock_month(${last}, 'Fix a typo')`))).ok);
ok("the owner unlocks with a reason, and it is logged", (await as("owner", () => tryQ(`select public.unlock_month(${last}, 'Missing receipt')`))).ok
  && (await db.query("select count(*)::int n from public.month_close_log where action = 'unlocked'")).rows[0].n === 1);
ok("after unlocking, the expense can be added", (await as("finance", () => tryQ(`insert into public.expenses (category, amount, spent_on, created_by) values ('packaging', 5, ${last} + 3, $1)`, [ids.finance]))).ok);
const profit = (await as("finance", () => tryQ("select public.profit_report(current_date, current_date) as r"))).rows[0].r;
ok("the profit report has a row per branch with sales and costs", profit.length === 3 && Number(profit.find((p) => p.branch === "accra").net_sales) > 0, JSON.stringify(profit));
ok("admin cannot see the profit report (it includes salaries)", !(await as("admin", () => tryQ("select public.profit_report(current_date, current_date)"))).ok);
await as("finance", () => tryQ("insert into public.salary_records (staff_id, month, amount, allowances, deductions, created_by) values ($1, date_trunc('month', current_date)::date, 1000, 200, 50, $2)", [ids.sales, ids.finance]));
await as("finance", () => tryQ("update public.salary_records set status = 'paid', paid_on = current_date, method = 'momo'"));
ok("a paid salary counts net of allowances and deductions", Number((await as("finance", () => tryQ("select amount from public.money_ledger where category = 'Salaries'"))).rows[0].amount) === 1150);
ok("a paid salary's allowances cannot change", !(await as("finance", () => tryQ("update public.salary_records set allowances = 0"))).ok);

// ---------------------------------------------------------------- targets
ok("a role target is set", (await as("admin", () => tryQ("insert into public.targets (owner_kind, role_key, metric, goal, period_start, period_end, set_by) values ('role','sales_agent','orders',10,current_date-1,current_date+5,$1)", [ids.admin]))).ok);
ok("a check-in target needs a label", !(await as("admin", () => tryQ("insert into public.targets (staff_id, metric, goal, period_start, period_end, set_by) values ($1,'check_in',5,current_date,current_date+6,$2)", [ids.content, ids.admin]))).ok);
ok("a check-in target with a label", (await as("admin", () => tryQ("insert into public.targets (staff_id, metric, goal, period_start, period_end, set_by, check_in_label) values ($1,'check_in',5,current_date,current_date+6,$2,'Social posts')", [ids.content, ids.admin]))).ok);
ok("the content editor files a report with check-ins", (await as("content", () => tryQ("select public.file_daily_report('{\"summary\":\"Posted twice\",\"checkins\":{\"Social posts\":2,\"bad\":\"x\"}}'::jsonb)"))).ok);
let tp = (await as("content", () => tryQ("select public.target_progress(current_date) as r"))).rows[0].r;
ok("the check-in counts toward the target, from the report", Number(tp.find((t) => t.label === "Social posts").actual) === 2, JSON.stringify(tp));
ok("the report keeps the system's own numbers", (await db.query("select auto_numbers from public.daily_reports where staff_id = $1", [ids.content])).rows[0].auto_numbers.replies === 0);
tp = (await as("sales", () => tryQ("select public.target_progress(current_date) as r"))).rows[0].r;
ok("a sales agent sees their own and their role's targets", tp.some((t) => t.owner_kind === "role") && tp.some((t) => t.owner_kind === "person"));
ok("but not the content editor's", !tp.some((t) => t.label === "Social posts"));
const tid = (await db.query("select id from public.targets where owner_kind = 'role'")).rows[0].id;
ok("changing a goal directly without a reason is refused", !(await as("admin", () => tryQ("update public.targets set goal = 20 where id = $1", [tid]))).ok);
ok("adjust_target needs a reason", !(await as("admin", () => tryQ("select public.adjust_target($1,'{\"goal\":20}'::jsonb,'')", [tid]))).ok);
ok("pausing with a reason works and is audited", (await as("admin", () => tryQ("select public.adjust_target($1,'{\"status\":\"paused\"}'::jsonb,'Agent on leave')", [tid]))).ok
  && (await db.query("select count(*)::int n from public.audit_log where table_name = 'targets' and action = 'UPDATE'")).rows[0].n >= 1);
ok("sales cannot adjust targets", !(await as("sales", () => tryQ("select public.adjust_target($1,'{\"goal\":1}'::jsonb,'because')", [tid]))).ok);
const created = (await as("admin", () => tryQ("select public.apply_starter_targets(date_trunc('week', current_date)::date, 2000) as n"))).rows[0].n;
ok("starter targets are created per role", created >= 10, created);
ok("applying them again creates none", (await as("admin", () => tryQ("select public.apply_starter_targets(date_trunc('week', current_date)::date, 2000) as n"))).rows[0].n === 0);
const card = (await as("sales", () => tryQ("select public.staff_scorecard($1, date_trunc('week', current_date)::date, date_trunc('week', current_date)::date + 6) as r", [ids.sales]))).rows[0].r;
ok("a person sees their own scorecard", card.score !== undefined && card.targets.length >= 2);
ok("but not someone else's", !(await as("sales", () => tryQ("select public.staff_scorecard($1, current_date, current_date)", [ids.sales2]))).ok);
const week = (await as("admin", () => tryQ("select public.weekly_summary($1, date_trunc('week', current_date)::date) as r", [ids.sales]))).rows[0].r;
ok("the weekly summary lists wins and misses", Array.isArray(week.wins) && Array.isArray(week.misses) && week.paid_sales !== undefined);
ok("an admin comments on someone's week", (await as("admin", () => tryQ("insert into public.target_comments (staff_id, week_start, author_id, author_name, body) values ($1, date_trunc('week', current_date)::date, $2, 'admin', 'Good week')", [ids.sales, ids.admin]))).ok);
let lb = (await as("sales", () => tryQ("select public.leaderboard('sales_agent', current_date - 7, current_date) as r"))).rows[0].r;
ok("the leaderboard is off by default", lb.enabled === false && lb.rows.length === 0);
await as("owner", () => tryQ("update public.app_settings set value = '{\"roles\":[\"sales_agent\"]}' where key = 'leaderboard'"));
lb = (await as("sales", () => tryQ("select public.leaderboard('sales_agent', current_date - 7, current_date) as r"))).rows[0].r;
ok("once switched on it ranks the role", lb.enabled === true && lb.rows.length === 2);
ok("a person writes their Daily Plan", (await as("sales", () => tryQ("insert into public.daily_plans (lines) values (array['Call 5 leads','Confirm orders'])"))).ok);
ok("a plan has at most 5 lines", !(await as("sales2", () => tryQ("insert into public.daily_plans (lines) values (array['1','2','3','4','5','6'])"))).ok);
const day = (await as("sales", () => tryQ("select public.my_day() as r"))).rows[0].r;
ok("my day shows the plan and open tasks", day.plan.length === 2 && day.open_tasks.unread >= 0);

await done();
