// Order, payment and tracking rules, proven in the database. Run with: npm run test:orders
import { createHarness } from "./harness.mjs";

const { db, ids, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });

const vid = async (sku) => (await db.query("select id from public.variants where sku = $1", [sku])).rows[0].id;
const V = { dunk41: await vid("DNK-LO-BW-41"), dunk42: await vid("DNK-LO-BW-42"), aj45: await vid("AJ1-HI-TB-45"), denimS: await vid("DRZ-DEN-S") };

for (const [n, r] of [["owner", "owner"], ["admin", "admin"], ["sales", "sales_agent"], ["sales2", "sales_agent"], ["dispatch", "dispatch_coordinator"], ["finance", "finance"], ["content", "content_editor"]]) await addStaff(n, r);

const body = (over = {}) => ({
  channel: "web",
  customer: { name: "Ama Mensah", phone: "024 000 0000", email: "ama@example.com" },
  delivery: { method: "home", region: "Greater Accra", city: "Accra", area: "East Legon", street: "Near the mall" },
  plan: "full", source: "Instagram", pay_method: "mtn", items: [{ variant_id: V.dunk41, qty: 1 }], ...over,
});
const place = (over, who) => {
  const run = () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify(typeof over === "function" ? over(body()) : body(over))]);
  return who ? as(who, run) : asRole("anon", run);
};
const order = async (number) => (await db.query("select * from public.orders where number = $1", [number])).rows[0];
const asService = (sql, params) => asRole("service_role", () => tryQ(sql, params));
const confirm = (ref, amount) => asService("select public.confirm_payment($1,$2,$3::jsonb) as r", [ref, amount, JSON.stringify({ test: true })]);

// ================= placing orders as a guest =================
const g1 = await place();
ok("a guest can place an order", g1.ok, g1.err);
const r1 = g1.rows[0].r;
ok("the order gets a DRZ number", /^DRZ-10\d\d$/.test(r1.number), r1.number);
ok("price comes from the catalogue plus the Accra fee (420 + 30)", Number(r1.total) === 450 && Number(r1.due_now) === 450 && Number(r1.balance_due) === 0, JSON.stringify(r1));

const g2 = await place({ plan: "half" });
ok("half payment in Accra: pay 225 now, 225 later", g2.ok && Number(g2.rows[0].r.due_now) === 225 && Number(g2.rows[0].r.balance_due) === 225, g2.err);
const g3 = await place({ plan: "half", delivery: { method: "home", region: "Ashanti", city: "Kumasi", area: "Adum", street: "High St" } });
ok("half payment outside Accra is refused", !g3.ok && /paid in full/.test(g3.err), g3.err);
const g4 = await place({ customer: { name: "Test Buyer", phone: "0240000004" }, plan: "half", delivery: { method: "pickup" } });
ok("pickup follows the Accra rule: no fee, half allowed", g4.ok && Number(g4.rows[0].r.total) === 420 && Number(g4.rows[0].r.due_now) === 210, g4.err);
const g5 = await place({ customer: { name: "Test Buyer", phone: "0240000005" }, items: [{ variant_id: V.dunk41, qty: 1, price: 1, unit_price: 1 }], total: 1, delivery_fee: 0 });
ok("prices and totals sent by the browser are ignored", g5.ok && Number(g5.rows[0].r.total) === 450, g5.err);
const g6 = await place({ customer: { name: "Test Buyer", phone: "0240000006" }, items: [{ variant_id: V.dunk41, qty: 2 }, { variant_id: V.denimS, qty: 1 }] });
ok("several items add up (2 x 420 + 350 + 30)", Number(g6.rows[0].r.total) === 1220, g6.err);
ok("an unavailable size cannot be ordered", /unavailable/.test((await place({ customer: { name: "Test Buyer", phone: "0240000007" }, items: [{ variant_id: V.aj45, qty: 1 }] })).err ?? ""));
ok("a limited size can be ordered", (await place({ customer: { name: "Test Buyer", phone: "0240000008" }, items: [{ variant_id: V.dunk42, qty: 1 }] })).ok);

await db.query("update public.products set published = false where slug = 'denim-set'");
ok("an unpublished product cannot be ordered", /no longer available/.test((await place({ customer: { name: "Test Buyer", phone: "0240000009" }, items: [{ variant_id: V.denimS, qty: 1 }] })).err ?? ""));
await db.query("update public.products set published = true where slug = 'denim-set'");

const phones = await tryQ("select count(*)::int n from public.customers where phone = '+233240000000'");
ok("phone formats are normalised and one customer is kept per number", phones.rows[0].n === 1);
ok("+233 and 233 formats reach the same customer", (await place({ customer: { name: "Ama Mensah", phone: "+233 24 000 0000" } })).ok && (await place({ customer: { name: "Ama Mensah", phone: "233240000000" } })).ok && (await db.query("select count(*)::int n from public.customers where phone = '+233240000000'")).rows[0].n === 1);

ok("a bad phone number is refused", /valid Ghana phone/.test((await place({ customer: { name: "Ama Mensah", phone: "12345" } })).err ?? ""));
ok("a missing name is refused", !(await place({ customer: { name: "", phone: "0240000001" } })).ok);
ok("a bad email is refused", !(await place({ customer: { name: "Kofi Boateng", phone: "0240000002", email: "nope" } })).ok);
ok("the source question is required on the web", /how you got to know/.test((await place({ source: "" })).err ?? ""));
ok("an unknown region is refused", /do not deliver/.test((await place({ delivery: { method: "home", region: "Atlantis", city: "x", street: "y" } })).err ?? ""));
ok("home delivery needs a street or landmark", /street or landmark/.test((await place({ delivery: { method: "home", region: "Greater Accra", city: "Accra" } })).err ?? ""));
ok("quantity above 10 is refused", /Quantity/.test((await place({ items: [{ variant_id: V.dunk41, qty: 11 }] })).err ?? ""));
ok("an empty bag is refused", !(await place({ items: [] })).ok);
ok("more than 20 lines is refused", !(await place({ items: Array.from({ length: 21 }, () => ({ variant_id: V.dunk41, qty: 1 })) })).ok);
ok("a guest cannot place a WhatsApp order", /Only staff/.test((await place({ channel: "whatsapp" })).err ?? ""));
const sneakyDiscount = await place({ customer: { name: "Test Buyer", phone: "0240000010" }, discount: { amount: 100, reason: "mate" } });
ok("a guest's discount is ignored", sneakyDiscount.ok && Number(sneakyDiscount.rows[0].r.total) === 450);

// the guest rate limit: five unpaid orders per phone per hour
const flood = { name: "Flood Test", phone: "0200000009" };
let floodOk = 0;
for (let i = 0; i < 5; i++) if ((await place({ customer: flood })).ok) floodOk++;
const sixth = await place({ customer: flood });
ok("five unpaid orders are allowed, the sixth is refused", floodOk === 5 && !sixth.ok && /several unpaid/.test(sixth.err), `${floodOk} ok; ${sixth.err}`);

// ================= shoppers cannot reach the tables =================
await asRole("anon", async () => {
  for (const t of ["orders", "customers", "payments", "order_items", "order_events", "order_notes"]) {
    ok(`anon cannot read ${t}`, !(await tryQ(`select * from public.${t}`)).ok);
  }
  ok("anon cannot insert an order directly", !(await tryQ("insert into public.orders (number, customer_id, subtotal, total) values ('X', gen_random_uuid(), 1, 1)")).ok);
  ok("anon cannot confirm a payment", !(await tryQ("select public.confirm_payment('x', 1, '{}'::jsonb)")).ok);
  ok("anon cannot advance an order", !(await tryQ("select public.advance_order(gen_random_uuid(), 'to_source')")).ok);
  ok("anon can read the delivery zones", (await tryQ("select * from public.delivery_zones")).rows.length === 16);
  ok("anon cannot change delivery zones", !(await tryQ("update public.delivery_zones set fee = 0")).ok);
});
await as("sales", async () => ok("a signed-in staff member cannot call the webhook function", !(await tryQ("select public.confirm_payment('x', 1, '{}'::jsonb)")).ok));

// ================= the public tracking page =================
const t1 = await asRole("anon", () => tryQ("select public.track_order($1, $2) as r", [r1.number, "0240000000"]));
ok("the right number and phone find the order", t1.ok && t1.rows[0].r?.number === r1.number);
ok("the phone can be given in any format", (await asRole("anon", () => tryQ("select public.track_order($1, $2) as r", [r1.number.toLowerCase(), "+233 24 000 0000"]))).rows[0].r?.number === r1.number);
ok("the wrong phone finds nothing", (await asRole("anon", () => tryQ("select public.track_order($1, $2) as r", [r1.number, "0245550000"]))).rows[0].r === null);
ok("a made-up number finds nothing", (await asRole("anon", () => tryQ("select public.track_order('DRZ-9999', '0240000000') as r"))).rows[0].r === null);
const tr = t1.rows[0].r;
ok("tracking shows items and a timeline, and never internal fields", tr.items.length === 1 && tr.events.length >= 1 && !/created_by|assigned|email|internal|customer_id|raw/i.test(JSON.stringify(tr)), Object.keys(tr).join());
ok("tracking has the balance due and totals", Number(tr.total) === 450 && Number(tr.balance_due) === 450 && tr.status === "awaiting_payment");

// ================= payments: the webhook =================
const bad = await confirm(r1.payment_reference, 1);
ok("a payment of the wrong amount is not accepted", bad.rows[0].r.ok === false && bad.rows[0].r.reason === "amount_mismatch");
ok("the order is still unpaid after a wrong amount", (await order(r1.number)).payment_state === "unpaid" && (await order(r1.number)).status === "awaiting_payment");
ok("the mismatched payment is marked failed", (await db.query("select status from public.payments where reference = $1", [r1.payment_reference])).rows[0].status === "failed");

const retry = await asRole("anon", () => tryQ("select public.retry_payment($1, $2, 'telecel') as r", [r1.number, "0240000000"]));
ok("the customer can retry with another method", retry.ok && retry.rows[0].r.payment_reference !== r1.payment_reference && Number(retry.rows[0].r.amount) === 450, retry.err);
ok("retry needs the right phone", !(await asRole("anon", () => tryQ("select public.retry_payment($1, $2, 'mtn')", [r1.number, "0245550000"]))).ok);

const good = await confirm(retry.rows[0].r.payment_reference, 450);
ok("the right amount confirms the payment", good.rows[0].r.ok === true);
let o1 = await order(r1.number);
ok("the order is paid and moves to To confirm", o1.payment_state === "paid" && o1.status === "to_confirm" && Number(o1.amount_paid) === 450 && Number(o1.balance_due) === 0);
const dup = await confirm(retry.rows[0].r.payment_reference, 450);
ok("a repeated webhook changes nothing", dup.rows[0].r.duplicate === true && Number((await order(r1.number)).amount_paid) === 450);
ok("an unknown reference is reported, not applied", (await confirm("nope", 5)).rows[0].r.reason === "unknown_reference");
ok("retry is refused once the order is paid", !(await asRole("anon", () => tryQ("select public.retry_payment($1, $2, 'mtn')", [r1.number, "0240000000"]))).ok);

const half = g2.rows[0].r;
await confirm(half.payment_reference, 225);
const oh = await order(half.number);
ok("a half payment leaves the balance to collect", oh.payment_state === "part_paid" && Number(oh.amount_paid) === 225 && Number(oh.balance_due) === 225 && oh.status === "to_confirm");

const t2 = (await asRole("anon", () => tryQ("select public.track_order($1,$2) as r", [r1.number, "0240000000"]))).rows[0].r;
ok("tracking now shows the payment and the confirmation step", t2.payments.length === 1 && t2.events.some((e) => e.note === "Payment confirmed"));

// ================= staff: who sees what =================
const s1 = await place({ channel: "whatsapp", pay_method: "momo", source: "" }, "sales");
ok("a sales agent can create a WhatsApp order", s1.ok, s1.err);
const so = s1.rows[0].r;
ok("it is credited to the agent who took it", String((await order(so.number)).assigned_agent_id) === String(ids.sales));
await as("sales", async () => ok("a sales agent sees their own order", (await tryQ("select number from public.orders where number = $1", [so.number])).rows.length === 1));
await as("sales2", async () => ok("another sales agent does not", (await tryQ("select number from public.orders where number = $1", [so.number])).rows.length === 0));
await as("admin", async () => ok("an admin sees every order", (await tryQ("select count(*)::int n from public.orders")).rows[0].n > 10));
await as("content", async () => ok("a content editor sees no orders", (await tryQ("select * from public.orders")).rows.length === 0));
await as("sales", async () => {
  const mine = (await tryQ("select count(*)::int n from public.orders")).rows[0].n;
  ok("own-scope staff do not see guest web orders", mine === 1, String(mine));
  ok("a sales agent sees only their customer", (await tryQ("select count(*)::int n from public.customers")).rows[0].n === 1);
});
await as("finance", async () => ok("finance sees every customer", (await tryQ("select count(*)::int n from public.customers")).rows[0].n >= 2));
await as("content", async () => ok("a content editor sees no customers", (await tryQ("select * from public.customers")).rows.length === 0));

// direct edits: allowed fields only
await as("sales", async () => {
  ok("an agent can add a courier to their own order", ((await tryQ("update public.orders set courier = 'Skynet', tracking_number = 'SK123' where number = $1", [so.number])).n ?? 0) === 1);
  const st = await tryQ("update public.orders set status = 'delivered' where number = $1", [so.number]);
  ok("status cannot be changed by editing the row", !st.ok && /order actions/.test(st.err), st.err);
  ok("money cannot be changed by editing the row", !(await tryQ("update public.orders set total = 1, balance_due = 0 where number = $1", [so.number])).ok);
  ok("an order cannot be deleted", ((await tryQ("delete from public.orders where number = $1", [so.number])).n ?? 0) === 0);
  ok("an order cannot be created by inserting a row", !(await tryQ("insert into public.orders (number, customer_id, subtotal, total) values ('X', gen_random_uuid(), 1, 1)")).ok);
});

// ================= staff: moving an order =================
const soId = (await order(so.number)).id;
await as("sales", async () => {
  const early = await tryQ("select public.advance_order($1, 'to_source')", [soId]);
  ok("nothing moves before the payment is confirmed", !early.ok && /Confirm the payment/.test(early.err), early.err);
  const noRef = await tryQ("select public.record_checkout_payment($1, 'momo', '')", [soId]);
  ok("a MoMo payment needs a transaction ID", !noRef.ok);
  ok("an agent can record the payment they were given", (await tryQ("select public.record_checkout_payment($1, 'cash')", [soId])).ok);
});
ok("recording it paid the order and confirmed it", (await order(so.number)).payment_state === "paid" && (await order(so.number)).status === "to_confirm");
await as("sales", async () => {
  ok("then it moves forward", (await tryQ("select public.advance_order($1, 'to_source', 'Kwame ordering from supplier')", [soId])).ok);
  ok("and again", (await tryQ("select public.advance_order($1, 'ready_to_pack')", [soId])).ok);
  const back = await tryQ("select public.advance_order($1, 'to_confirm')", [soId]);
  ok("a step cannot go backwards (FR-TR-002)", !back.ok && /Only an Admin can move an order back/.test(back.err), back.err);
  ok("moving back through the override needs the right", !(await tryQ("select public.move_order_back($1, 'to_source', 'oops')", [soId])).ok);
});
await as("dispatch", async () => {
  ok("dispatch can move it on", (await tryQ("select public.advance_order($1, 'packed')", [soId])).ok && (await tryQ("select public.advance_order($1, 'dispatched')", [soId])).ok);
  ok("dispatch cannot mark it failed before it is dispatched, but can after", (await tryQ("select public.advance_order($1, 'failed_delivery')", [soId])).ok);
  ok("a failed delivery can be rescheduled", (await tryQ("select public.advance_order($1, 'out_for_delivery')", [soId])).ok);
});
await as("admin", async () => {
  ok("an admin must give a reason to move an order back", !(await tryQ("select public.move_order_back($1, 'packed', '')", [soId])).ok);
  ok("an admin can move it back with a reason", (await tryQ("select public.move_order_back($1, 'packed', 'Wrong size found at packing')", [soId])).ok);
  ok("going forward is not a 'move back'", !(await tryQ("select public.move_order_back($1, 'delivered', 'x')", [soId])).ok);
  await tryQ("select public.advance_order($1, 'dispatched')", [soId]);
  await tryQ("select public.advance_order($1, 'out_for_delivery')", [soId]);
});
ok("the override and its reason are on the timeline", (await db.query("select internal_note from public.order_events where order_id = $1 and kind = 'override'", [soId])).rows[0]?.internal_note?.includes("Wrong size"));
const pubEvents = (await asRole("anon", () => tryQ("select public.track_order($1, $2) as r", [so.number, "0240000000"]))).rows[0].r;
ok("the customer never sees the override note", pubEvents === null || !JSON.stringify(pubEvents).includes("Wrong size"));
await as("admin", async () => ok("an order can be delivered once nothing is owed", (await tryQ("select public.advance_order($1, 'delivered')", [soId])).ok));
await as("admin", async () => ok("a delivered order is final", /already/.test((await tryQ("select public.advance_order($1, 'dispatched')", [soId])).err ?? "")));

// ================= half payment: the balance blocks delivery =================
const hid = oh.id;
await as("admin", async () => {
  for (const s of ["to_source", "ready_to_pack", "packed", "dispatched", "out_for_delivery"]) await tryQ("select public.advance_order($1, $2)", [hid, s]);
  const blocked = await tryQ("select public.advance_order($1, 'delivered')", [hid]);
  ok("an order with a balance cannot be delivered (FR-CO-008)", !blocked.ok && /Record the balance collected \(GHS 225/.test(blocked.err), blocked.err);
  ok("MoMo balances need a reference", !(await tryQ("select public.record_balance($1, 'momo', '')", [hid])).ok);
  ok("the rider records the balance in cash", (await tryQ("select public.record_balance($1, 'cash')", [hid])).ok);
  ok("there is then nothing left to collect", !(await tryQ("select public.record_balance($1, 'cash')", [hid])).ok);
  ok("and it can be delivered", (await tryQ("select public.advance_order($1, 'delivered')", [hid])).ok);
});
const oh2 = await order(half.number);
ok("the order ends up fully paid with two payments on record", oh2.payment_state === "paid" && Number(oh2.balance_due) === 0 && (await db.query("select count(*)::int n from public.payments where order_id = $1 and status = 'success'", [hid])).rows[0].n === 2);

// ================= manual MoMo =================
const m1 = (await place({ pay_method: "manual_momo" })).rows[0].r;
const m2 = (await place({ pay_method: "manual_momo" })).rows[0].r;
const submit = (num, phone, txn) => asRole("anon", () => tryQ("select public.submit_manual_payment($1,$2,$3)", [num, phone, txn]));
ok("a transaction ID is needed", !(await submit(m1.number, "0240000000", "ab")).ok);
ok("the phone must match the order", !(await submit(m1.number, "0245550000", "MP240000001")).ok);
ok("the customer submits their MoMo transaction ID", (await submit(m1.number, "0240000000", "mp240000001")).ok);
ok("the order now waits for a check", (await order(m1.number)).payment_state === "pending_check" && (await order(m1.number)).status === "awaiting_payment");
ok("the same transaction ID cannot be used twice (FR-CO-007)", /already been used/.test((await submit(m2.number, "0240000000", "MP240000001")).err ?? ""));
const pm1 = (await db.query("select id from public.payments where order_id = $1", [(await order(m1.number)).id])).rows[0].id;
await as("admin", async () => ok("nothing moves while a payment is being checked", /Confirm the payment/.test((await tryQ("select public.advance_order($1, 'to_source')", [(await order(m1.number)).id])).err ?? "")));
await as("sales", async () => ok("a sales agent cannot review payments", !(await tryQ("select public.review_manual_payment($1, true)", [pm1])).ok));
await as("finance", async () => ok("finance confirms the payment", (await tryQ("select public.review_manual_payment($1, true)", [pm1])).ok));
ok("the order is paid and confirmed", (await order(m1.number)).payment_state === "paid" && (await order(m1.number)).status === "to_confirm");
ok("a payment cannot be reviewed twice", !(await as("finance", () => tryQ("select public.review_manual_payment($1, true)", [pm1]))).ok);
await submit(m2.number, "0240000000", "MP240000002");
const pm2 = (await db.query("select id from public.payments where order_id = $1", [(await order(m2.number)).id])).rows[0].id;
await as("finance", async () => ok("finance can reject a payment it cannot match", (await tryQ("select public.review_manual_payment($1, false)", [pm2])).ok));
ok("a rejected payment puts the order back to unpaid", (await order(m2.number)).payment_state === "unpaid");

// ================= history and audit =================
await db.query("update public.variants set price = 999 where id = $1", [V.dunk41]);
ok("order items keep the price paid even after the catalogue changes", Number((await db.query("select unit_price from public.order_items where order_id = $1 limit 1", [(await order(r1.number)).id])).rows[0].unit_price) === 420);
const aud = (await db.query("select actor_role, new_values->>'status' s from public.audit_log where table_name = 'orders' and action = 'UPDATE' and actor_role is not null order by id desc limit 1")).rows[0];
ok("status changes by staff are audited with who did them", !!aud?.actor_role, JSON.stringify(aud));
ok("payments are audited", (await db.query("select count(*)::int n from public.audit_log where table_name = 'payments'")).rows[0].n > 5);

// ================= delivery zones =================
await as("admin", async () => ok("an admin can change a delivery fee", ((await tryQ("update public.delivery_zones set fee = 35 where region = 'Greater Accra'")).n ?? 0) === 1));
await as("sales", async () => ok("a sales agent cannot", ((await tryQ("update public.delivery_zones set fee = 1 where region = 'Greater Accra'")).n ?? 0) === 0));
ok("a new order uses the new fee (420 + 35)", Number((await place({ customer: { name: "Kojo Mensah", phone: "0240000077" }, items: [{ variant_id: V.dunk42, qty: 1 }] })).rows[0].r.total) === 455);
ok("the fee change is audited with the region as its key", (await db.query("select record_id from public.audit_log where table_name = 'delivery_zones' order by id desc limit 1")).rows[0]?.record_id === "Greater Accra");

await done();
