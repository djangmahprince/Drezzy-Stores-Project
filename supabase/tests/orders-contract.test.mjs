// The application and the database must agree on their JSON. This runs the REAL payload builders and the REAL tracker mapper
// against the REAL SQL functions, so a mismatch fails here instead of live. Run with: npm run test:orders-contract
import { createHarness } from "./harness.mjs";
import { placePayload, staffPayload } from "../../src/lib/orders/payload.ts";
import { buildTrack } from "../../src/lib/orders/track.ts";
import { orderFromRow } from "../../src/lib/orders/map.ts";

const { db, ids, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });
await addStaff("sales", "sales_agent");
await addStaff("admin", "admin");

const vid = async (sku) => (await db.query("select id from public.variants where sku = $1", [sku])).rows[0].id;
const dunk = await vid("DNK-LO-BW-41");
const denim = await vid("DRZ-DEN-S");

// ---------- customer checkout ----------
const input = {
  customer: { name: "Ama Mensah", phone: "024 000 0000", email: "ama@example.com" },
  receiver: { name: "Kofi Owusu", phone: "055 355 7347" },
  delivery: { method: "home", region: "Ashanti", city: "Kumasi", area: "Adum", street: "Near the post office", gps: "AK-039-5028", note: "Call at the gate" },
  plan: "full", source: "Referral", sourceDetail: "Kwame", payMethod: "mtn",
  items: [{ variantId: dunk, qty: 2 }, { variantId: denim, qty: 1 }],
};
const res = await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify(placePayload(input))]));
ok("the real checkout payload is accepted by place_order", res.ok, res.err);
const r = res.rows[0].r;
const o = (await db.query("select o.*, c.full_name, c.email, c.source as csource from public.orders o join public.customers c on c.id = o.customer_id where o.number = $1", [r.number])).rows[0];
ok("customer name, phone and email are stored", o.full_name === "Ama Mensah" && o.email === "ama@example.com");
ok("the gift receiver is stored in international form", o.receiver_name === "Kofi Owusu" && o.receiver_phone === "+233553557347", o.receiver_phone);
ok("the address, GPS code and rider note are stored", o.region === "Ashanti" && o.city === "Kumasi" && o.area === "Adum" && o.street === "Near the post office" && o.gps_code === "AK-039-5028" && o.rider_note === "Call at the gate");
ok("the source and its detail are stored", o.source === "Referral" && o.source_detail === "Kwame" && o.csource === "Referral");
ok("an Ashanti order belongs to the Kumasi branch", o.branch === "kumasi");
ok("the web channel and unpaid state are set", o.channel === "web" && o.status === "awaiting_payment" && o.payment_state === "unpaid");
ok("total = 2 x 420 + 350 + Ashanti fee 50", Number(o.total) === 1240, String(o.total));
const items = (await db.query("select * from public.order_items where order_id = $1 order by product_name", [o.id])).rows;
ok("items are snapshotted with a readable label", items.length === 2 && items.some((i) => i.product_name === "Nike Dunk" && /Low · Black \/ White · Size 41/.test(i.variant_label) && i.qty === 2), JSON.stringify(items.map((i) => i.variant_label)));
ok("the payment row is waiting with the order's reference", (await db.query("select count(*)::int n from public.payments where reference = $1 and status = 'pending' and amount = 1240", [r.payment_reference])).rows[0].n === 1);

const pickup = await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify(placePayload({ ...input, receiver: null, customer: { name: "Esi Boateng", phone: "0200000001", email: "e@x.co" }, delivery: { method: "pickup", region: "Anything", city: "", area: "", street: "", gps: "", note: "" }, plan: "half", payMethod: "manual_momo" }))]));
ok("a pickup order with blank address fields is accepted", pickup.ok, pickup.err);
const po = (await db.query("select * from public.orders where number = $1", [pickup.rows[0].r.number])).rows[0];
ok("pickup stores no address, no fee, and half is allowed", po.delivery_method === "pickup" && po.region === null && Number(po.delivery_fee) === 0 && po.payment_plan === "half" && po.receiver_name === null);

// ---------- what the tracker gets ----------
const tj = (await asRole("anon", () => tryQ("select public.track_order($1,$2) as r", [r.number, "0240000000"]))).rows[0].r;
let view;
try { view = buildTrack(tj); } catch (e) { view = null; ok("the tracker mapper accepts the real database JSON", false, e.message); }
ok("the tracker mapper accepts the real database JSON", !!view);
ok("the unpaid order shows its amount to pay", view.banner?.tone === "warn" && /GHS 1,?240/.test(view.banner.text), view.banner?.text);
ok("the delivery line uses the receiver and the address", view.deliveringTo === "Kofi Owusu · Adum, Kumasi · Ashanti", view.deliveringTo);
ok("items come through with details", view.items.length === 2 && view.items.every((i) => i.name && i.detail !== undefined));
ok("the helper branch is Kumasi", view.helpBranch === "kumasi");

// pay it, move it along, and check the tracker follows
await asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [r.payment_reference, 1240]));
await as("sales", async () => 0);
const orderId = o.id;
await db.query("update public.orders set assigned_agent_id = $1 where id = $2", [ids.admin, orderId]);
await as("admin", async () => {
  for (const s of ["to_source", "ready_to_pack", "packed", "dispatched", "out_for_delivery"]) {
    const x = await tryQ("select public.advance_order($1,$2,null)", [orderId, s]);
    if (!x.ok) ok(`advance to ${s}`, false, x.err);
  }
  await tryQ("update public.orders set rider_name = 'Yaw', rider_phone = '020 000 0000' where id = $1", [orderId]);
});
const t2 = buildTrack((await asRole("anon", () => tryQ("select public.track_order($1,$2) as r", [r.number, "0240000000"]))).rows[0].r);
ok("after payment and dispatch the tracker is at step 7, out for delivery", t2.stepNumber === 7 && t2.headline === "Out for delivery", `${t2.stepNumber} ${t2.headline}`);
ok("the steps before it are done, the later one is not", t2.steps.slice(0, 6).every((s) => s.state === "done") && t2.steps[7].state === "todo");
ok("the customer sees the rider from the database", /Rider: Yaw/.test(t2.steps[5].note), t2.steps[5].note);
ok("the confirmation step names the staff member and branch", /from the Kumasi branch/.test(t2.steps[2].note), t2.steps[2].note);
ok("the payment note shows the method used", /Paid in full, GHS 1,?240/.test(t2.steps[1].note), t2.steps[1].note);

// ---------- staff-created order ----------
const staffIn = {
  channel: "whatsapp", customer: { name: "Kojo Mensah", phone: "0551234567", email: "" },
  delivery: { method: "home", region: "Greater Accra", city: "Accra", area: "Osu", street: "Oxford St" },
  plan: "half", source: "", discount: { amount: 20, reason: "Loyal customer" },
  items: [{ variantId: dunk, qty: 1 }],
};
const sr = await as("sales", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify(staffPayload(staffIn))]));
ok("the real staff payload is accepted", sr.ok, sr.err);
const so = (await db.query("select * from public.orders where number = $1", [sr.rows[0].r.number])).rows[0];
ok("a staff order applies the discount and records the reason", Number(so.discount) === 20 && so.discount_reason === "Loyal customer" && Number(so.total) === 430, String(so.total));
ok("a staff order is credited to the agent, by name", String(so.assigned_agent_id) === String(ids.sales) && /^sal/.test(so.agent_name), so.agent_name);
ok("half in Accra: pay 215 now", Number(sr.rows[0].r.due_now) === 215, String(sr.rows[0].r.due_now));
ok("an empty email is stored as null", (await db.query("select email from public.customers where phone = '+233551234567'")).rows[0].email === null);

// ---------- the dashboard's view of the same order ----------
const row = (await as("sales", () => tryQ("select o.id, o.number, o.channel, o.branch, o.status, o.payment_state, o.payment_plan, o.total, o.balance_due, o.amount_paid, o.delivery_method, o.region, o.city, o.area, o.agent_name, o.courier, o.created_at, o.updated_at, (select to_jsonb(c) from public.customers c where c.id = o.customer_id) as customer, coalesce((select jsonb_agg(jsonb_build_object('product_name', i.product_name, 'variant_label', i.variant_label, 'qty', i.qty)) from public.order_items i where i.order_id = o.id), '[]'::jsonb) as items from public.orders o where o.number = $1", [sr.rows[0].r.number]))).rows[0];
const dash = orderFromRow({ ...row, customer: { full_name: row.customer.full_name, phone: row.customer.phone } }, Date.now());
ok("the dashboard mapper reads a real order row", dash.id === sr.rows[0].r.number && dash.customer === "Kojo" && dash.channel === "WhatsApp" && dash.status === "awaiting_payment" && dash.pay === "unpaid", JSON.stringify(dash));
ok("it describes the item and the place", /Nike Dunk · Low · Black \/ White · Size 41/.test(dash.items) && dash.place === "Osu, Accra", `${dash.items} / ${dash.place}`);
ok("it shows the agent and the payment note", /^sal/.test(dash.agent) && /Awaiting payment · GHS 215/.test(dash.payNote), dash.payNote);

await done();
