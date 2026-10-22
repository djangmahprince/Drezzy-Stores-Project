// The sourcing flow: ordering from suppliers after payment, receiving, failing. Run with: npm run test:supplier-orders
import { createHarness } from "./harness.mjs";

const { db, ids, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });
for (const [n, r] of [["sourcing", "sourcing_officer"], ["sales", "sales_agent"], ["finance", "finance"], ["dispatch", "dispatch_coordinator"], ["admin", "admin"]]) await addStaff(n, r);

const vid = async (sku) => (await db.query("select id from public.variants where sku = $1", [sku])).rows[0].id;
const supA = (await db.query("select id from public.suppliers where name = 'Supplier A'")).rows[0].id;
const supB = (await db.query("select id from public.suppliers where name = 'Supplier B'")).rows[0].id;

async function newOrder(phone, skus) {
  const items = [];
  for (const s of skus) items.push({ variant_id: await vid(s), qty: 1 });
  const r = await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
    channel: "web", customer: { name: "Ama Mensah", phone, email: "a@x.co" },
    delivery: { method: "home", region: "Greater Accra", city: "Accra", area: "Osu", street: "Oxford St" }, plan: "full", source: "Instagram", pay_method: "mtn", items })]));
  const x = r.rows[0].r;
  const id = (await db.query("select id from public.orders where number = $1", [x.number])).rows[0].id;
  return { ...x, id, reference: x.payment_reference };
}
const pay = (o) => asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [o.reference, o.total]));
const itemsOf = async (id) => (await db.query("select id, sourcing from public.order_items where order_id = $1 order by id", [id])).rows;
const status = async (id) => (await db.query("select status from public.orders where id = $1", [id])).rows[0].status;

// ---------- a single-item order ----------
const o1 = await newOrder("0240000001", ["DNK-LO-BW-41"]);
const [i1] = await itemsOf(o1.id);
const place = (who, order, sup, items, cost = 300, exp = null) => as(who, () => tryQ("select public.place_supplier_order($1,$2,$3::uuid[],$4,$5,null) as r", [order, sup, items, cost, exp]));

const early = await place("sourcing", o1.id, supA, [i1.id]);
ok("nothing is ordered before the customer has paid", !early.ok && /payment is confirmed/.test(early.err), early.err);

await pay(o1);
ok("sales cannot place a supplier order", !(await place("sales", o1.id, supA, [i1.id])).ok);
ok("dispatch cannot place a supplier order", !(await place("dispatch", o1.id, supA, [i1.id])).ok);
ok("a cost is required", !(await place("sourcing", o1.id, supA, [i1.id], null)).ok);
ok("an item list is required", !(await place("sourcing", o1.id, supA, [])).ok);
const so1 = await place("sourcing", o1.id, supA, [i1.id], 300, "2026-10-27");
ok("sourcing places the supplier order once paid", so1.ok, so1.err);
ok("a paid order is confirmed by sourcing it", (await status(o1.id)) === "to_source");
ok("its item is marked ordered", (await itemsOf(o1.id))[0].sourcing === "ordered");
ok("the same item cannot be ordered twice", !(await place("sourcing", o1.id, supB, [i1.id])).ok);
const pub = (await asRole("anon", () => tryQ("select public.track_order($1,'0240000001') as r", [o1.number]))).rows[0].r;
ok("the customer's tracker shows the supplier step but no cost or supplier", pub.events.some((e) => e.note === "Getting your item from our supplier") && !/300|Supplier A/.test(JSON.stringify(pub)));

const soId = so1.rows[0].r;
// who can read what
await as("sourcing", async () => {
  ok("sourcing reads the agreed cost", Number((await tryQ("select agreed_cost from public.supplier_order_costs")).rows[0]?.agreed_cost) === 300);
});
await as("finance", async () => ok("finance reads the agreed cost", (await tryQ("select * from public.supplier_order_costs")).rows.length === 1));
await as("dispatch", async () => {
  ok("dispatch sees the supplier order", (await tryQ("select * from public.supplier_orders")).rows.length === 1);
  ok("dispatch never sees what suppliers charge", (await tryQ("select * from public.supplier_order_costs")).rows.length === 0);
});
await as("sales", async () => ok("sales sees neither cost nor receive rights", (await tryQ("select * from public.supplier_order_costs")).rows.length === 0 && !(await tryQ("select public.receive_supplier_order($1)", [soId])).ok));
await asRole("anon", async () => ok("shoppers cannot read supplier orders", !(await tryQ("select * from public.supplier_orders")).ok));
await as("sourcing", async () => ok("rows cannot be edited directly", ((await tryQ("update public.supplier_orders set status = 'received'")).n ?? 0) === 0));

// receiving
ok("receiving moves the order to ready to pack", (await as("sourcing", () => tryQ("select public.receive_supplier_order($1, 'receipts/inv-1.jpg')", [soId]))).ok && (await status(o1.id)) === "ready_to_pack");
ok("its item is marked received", (await itemsOf(o1.id))[0].sourcing === "received");
ok("a supplier order cannot be received twice", !(await as("sourcing", () => tryQ("select public.receive_supplier_order($1)", [soId]))).ok);
const pub2 = (await asRole("anon", () => tryQ("select public.track_order($1,'0240000001') as r", [o1.number]))).rows[0].r;
ok("the tracker now says the item was received", pub2.events.some((e) => e.note === "Item received at our branch"));

// ---------- an order with two items, from two suppliers ----------
const o2 = await newOrder("0240000002", ["DNK-LO-BW-40", "DRZ-DEN-S"]);
await pay(o2);
const [a, b] = await itemsOf(o2.id);
const sa = (await place("sourcing", o2.id, supA, [a.id], 280)).rows[0].r;
const sb = (await place("sourcing", o2.id, supB, [b.id], 200)).rows[0].r;
await as("sourcing", () => tryQ("select public.receive_supplier_order($1)", [sa]));
ok("one of two items received: the order is still being sourced", (await status(o2.id)) === "to_source");
await as("sourcing", () => tryQ("select public.receive_supplier_order($1)", [sb]));
ok("the last one arriving makes it ready to pack", (await status(o2.id)) === "ready_to_pack");

// ---------- a supplier cannot provide ----------
const o3 = await newOrder("0240000003", ["DNK-LO-BW-39"]);
await pay(o3);
const [c] = await itemsOf(o3.id);
const sf = (await place("sourcing", o3.id, supA, [c.id], 290)).rows[0].r;
ok("a failure needs a reason", !(await as("sourcing", () => tryQ("select public.fail_supplier_order($1, '')", [sf]))).ok);
ok("sales cannot mark a supplier order failed", !(await as("sales", () => tryQ("select public.fail_supplier_order($1, 'x')", [sf]))).ok);
ok("sourcing marks it failed with a reason", (await as("sourcing", () => tryQ("select public.fail_supplier_order($1, 'Out of stock at the wholesaler')", [sf]))).ok);
ok("the item goes back to failed and the order stays in sourcing", (await itemsOf(o3.id))[0].sourcing === "failed" && (await status(o3.id)) === "to_source");
ok("another supplier can then be tried", (await place("sourcing", o3.id, supB, [c.id], 310)).ok);
ok("the customer is not told about the internal failure", !/wholesaler/.test(JSON.stringify((await asRole("anon", () => tryQ("select public.track_order($1,'0240000003') as r", [o3.number]))).rows[0].r)));

// ---------- history ----------
ok("supplier orders and costs are audited", (await db.query("select count(*)::int n from public.audit_log where table_name in ('supplier_orders','supplier_order_costs') and actor_role = 'sourcing_officer'")).rows[0].n >= 6);
ok("a part-paid order can be sourced too", await (async () => {
  const capId = await vid("DRZ-CAP-NV-Onesize");
  const o = await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
    channel: "web", customer: { name: "Esi B", phone: "0240000004", email: "e@x.co" }, delivery: { method: "pickup" }, plan: "half", source: "TikTok", pay_method: "mtn",
    items: [{ variant_id: capId, qty: 1 }] })]));
  const x = o.rows[0].r;
  await asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [x.payment_reference, x.due_now]));
  const oid = (await db.query("select id from public.orders where number = $1", [x.number])).rows[0].id;
  return (await place("sourcing", oid, supA, [(await itemsOf(oid))[0].id], 55)).ok;
})());

await done();
