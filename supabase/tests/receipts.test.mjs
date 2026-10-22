// Supplier receipts. Run with: npm run test:receipts
import { createHarness } from "./harness.mjs";

const { db, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });
for (const [n, r] of [["sourcing", "sourcing_officer"], ["sales", "sales_agent"], ["finance", "finance"]]) await addStaff(n, r);

const vid = (await db.query("select id from public.variants where sku = 'DNK-LO-BW-41'")).rows[0].id;
const sup = (await db.query("select id from public.suppliers where name = 'Supplier A'")).rows[0].id;
const placed = async (phone) => {
  const r = (await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
    channel: "web", customer: { name: "Ama Mensah", phone }, delivery: { method: "pickup" }, plan: "full", source: "Instagram", pay_method: "mtn", items: [{ variant_id: vid, qty: 1 }] })]))).rows[0].r;
  await asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [r.payment_reference, r.due_now]));
  const o = (await db.query("select id from public.orders where number = $1", [r.number])).rows[0].id;
  const item = (await db.query("select id from public.order_items where order_id = $1", [o])).rows[0].id;
  return (await as("sourcing", () => tryQ("select public.place_supplier_order($1,$2,$3::uuid[],200,null,null) as r", [o, sup, [item]]))).rows[0].r;
};
const so1 = await placed("0240000081");
const so2 = await placed("0240000082");
const path = (id) => `${id}/receipt.jpg`;

ok("a receipt for another supplier order is refused", !(await as("sourcing", () => tryQ("select public.receive_supplier_order($1,$2)", [so1, path(so2)]))).ok);
ok("a path that climbs out of its folder is refused", !(await as("sourcing", () => tryQ("select public.receive_supplier_order($1,$2)", [so1, `${so1}/../${so2}/x.jpg`]))).ok);
ok("a receipt inside its own folder is accepted", (await as("sourcing", () => tryQ("select public.receive_supplier_order($1,$2)", [so1, path(so1)]))).ok);
ok("the path is stored", (await db.query("select receipt_path from public.supplier_orders where id = $1", [so1])).rows[0].receipt_path === path(so1));
ok("marking received without a receipt still works", (await as("sourcing", () => tryQ("select public.receive_supplier_order($1)", [so2]))).ok);
ok("a receipt can be attached afterwards", (await as("sourcing", () => tryQ("select public.attach_receipt($1,$2)", [so2, path(so2)]))).ok && (await db.query("select receipt_path from public.supplier_orders where id = $1", [so2])).rows[0].receipt_path === path(so2));
ok("but not one from another order", !(await as("sourcing", () => tryQ("select public.attach_receipt($1,$2)", [so2, path(so1)]))).ok);
ok("sales cannot attach receipts", !(await as("sales", () => tryQ("select public.attach_receipt($1,$2)", [so2, path(so2)]))).ok);
await asRole("anon", async () => ok("shoppers cannot", !(await tryQ("select public.attach_receipt($1,$2)", [so2, path(so2)])).ok));

await done();
