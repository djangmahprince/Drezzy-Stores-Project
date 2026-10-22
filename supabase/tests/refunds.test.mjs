// Refunds: request, decision and pay-out. Run with: npm run test:refunds
import { createHarness } from "./harness.mjs";

const { db, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });
for (const [n, r] of [["owner", "owner"], ["admin", "admin"], ["finance", "finance"], ["support", "customer_support"], ["support2", "customer_support"], ["sales", "sales_agent"], ["dispatch", "dispatch_coordinator"]]) await addStaff(n, r);

const vid = (await db.query("select id from public.variants where sku = 'DNK-LO-BW-41'")).rows[0].id;
const place = async (phone, plan = "full") => {
  const r = (await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
    channel: "web", customer: { name: "Ama Mensah", phone }, delivery: { method: "home", region: "Greater Accra", city: "Accra", area: "Osu", street: "Oxford St" },
    plan, source: "Instagram", pay_method: "mtn", items: [{ variant_id: vid, qty: 1 }] })]))).rows[0].r;
  await asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [r.payment_reference, r.due_now]));
  return (await db.query("select * from public.orders where number = $1", [r.number])).rows[0];
};
const unpaid = (await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
  channel: "web", customer: { name: "No Pay", phone: "0240000050" }, delivery: { method: "pickup" }, plan: "full", source: "Instagram", pay_method: "mtn", items: [{ variant_id: vid, qty: 1 }] })]))).rows[0].r;
const o = await place("0240000051"); // paid in full: 450
const request = (who, order, amount, reason = "Customer changed their mind") => as(who, () => tryQ("select public.request_refund($1,$2,$3) as id", [order, amount, reason]));
const order = async (id) => (await db.query("select payment_state, amount_paid from public.orders where id = $1", [id])).rows[0];

// requesting
const r1 = await request("support", o.id, 100);
ok("customer support can request a refund", r1.ok, r1.err);
ok("sales cannot request refunds", !(await request("sales", o.id, 50)).ok);
ok("dispatch cannot request refunds", !(await request("dispatch", o.id, 50)).ok);
await asRole("anon", async () => ok("shoppers cannot request refunds", !(await tryQ("select public.request_refund($1,50,'x y z')", [o.id])).ok));
ok("a refund needs an amount above zero", !(await request("support", o.id, 0)).ok);
ok("a refund needs a reason", !(await request("support", o.id, 10, " ")).ok);
ok("a refund cannot exceed what was paid", !(await request("support", o.id, 451)).ok);
ok("requests count against the limit: 100 asked, so 351 is too much", !(await request("support", o.id, 351)).ok);
ok("the remaining 350 can still be requested", (await request("support2", o.id, 350)).ok);
ok("an order nothing was paid on cannot be refunded", !(await request("support", unpaid.order_id ?? (await db.query("select id from public.orders where number=$1", [unpaid.number])).rows[0].id, 10)).ok);

// deciding
const id1 = r1.rows[0].id;
const decide = (who, id, yes, note) => as(who, () => tryQ("select public.review_refund($1,$2,$3)", [id, yes, note]));
ok("support cannot approve (request only)", !(await decide("support2", id1, true)).ok);
ok("the requester cannot approve their own request", !(await decide("support", id1, true)).ok);
ok("sales cannot approve", !(await decide("sales", id1, true)).ok);
ok("a rejection needs a reason", !(await decide("finance", id1, false, "")).ok);
ok("finance can approve", (await decide("finance", id1, true, "ok")).ok);
ok("an approved refund cannot be decided twice", !(await decide("admin", id1, false, "changed my mind")).ok);
const id2 = (await db.query("select id from public.refunds where amount = 350")).rows[0].id;
ok("admin can reject, with a reason", (await decide("admin", id2, false, "Customer kept the item")).ok);
ok("a rejected request frees up the amount again", (await request("support", o.id, 340)).ok);
const ownReq = (await as("owner", () => tryQ("select public.request_refund($1,10,'owner test') as id", [o.id]))).rows[0].id;
ok("an owner may approve their own request", (await decide("owner", ownReq, true)).ok);

// paying out
const pay = (who, id, method, ref) => as(who, () => tryQ("select public.pay_refund($1,$2,$3)", [id, method, ref]));
ok("a refund that is not approved cannot be paid", !(await pay("finance", (await db.query("select id from public.refunds where status='requested' limit 1")).rows[0].id, "cash")).ok);
ok("support cannot pay out a refund", !(await pay("support", id1, "cash")).ok);
ok("a MoMo refund needs a reference", !(await pay("finance", id1, "momo", "")).ok);
ok("a refund is paid by MoMo or cash only", !(await pay("finance", id1, "paypal", "x")).ok);
ok("finance pays the approved refund", (await pay("finance", id1, "momo", "MM123")).ok);
ok("a refund cannot be paid twice", !(await pay("finance", id1, "cash")).ok);
let s = await order(o.id);
ok("the order shows partly refunded", s.payment_state === "partly_refunded", s.payment_state);
ok("the amount the customer paid is kept as it was", Number(s.amount_paid) === 450);

// the ledger
let l = (await as("finance", () => tryQ("select direction, category, amount from public.money_ledger where category = 'Refunds'"))).rows;
ok("the paid refund appears once as money out", l.length === 1 && l[0].direction === "out" && Number(l[0].amount) === 100, JSON.stringify(l));
const sum = (await as("finance", () => tryQ("select public.money_summary('2020-01-01','2099-01-01') as r"))).rows[0].r;
ok("the summary counts it in money out and lists a Refunds category", Number(sum.money_out) === 100 && sum.out_by_category.some((c) => c.category === "Refunds" && Number(c.amount) === 100), JSON.stringify(sum));
ok("customer support cannot see refunds in the ledger", (await as("support", () => tryQ("select * from public.money_ledger"))).rows.length === 0);

// refunding the rest completes it
const idRest = (await db.query("select id from public.refunds where status = 'requested' and amount = 340")).rows[0].id;
await decide("admin", idRest, true, "fine");
await pay("admin", idRest, "cash");
await pay("owner", ownReq, "cash");
s = await order(o.id);
ok("once everything is paid back the order shows refunded", s.payment_state === "refunded", s.payment_state);

// who can read
ok("support can read refunds", (await as("support", () => tryQ("select * from public.refunds"))).rows.length > 0);
ok("sales cannot read refunds", (await as("sales", () => tryQ("select * from public.refunds"))).rows.length === 0);
await asRole("anon", async () => ok("shoppers cannot read refunds", !(await tryQ("select * from public.refunds")).ok));
ok("nobody writes refunds directly", !(await as("finance", () => tryQ("update public.refunds set amount = 1"))).ok && !(await as("owner", () => tryQ("insert into public.refunds (order_id, amount, reason) values ($1, 1, 'xxx')", [o.id]))).ok);
ok("refunds are audited", (await db.query("select count(*)::int n from public.audit_log where table_name = 'refunds'")).rows[0].n >= 5);

await done();
