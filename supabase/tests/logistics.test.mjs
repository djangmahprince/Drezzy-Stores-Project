// Logistics: rider details on the tracker in place of GPS, delivery updates, and a carrier before dispatch. Run with: npm run test:logistics
import { createHarness } from "./harness.mjs";

const { db, ok, as, asRole, tryQ, addStaff, done, reset } = await createHarness({ seed: true });
for (const [n, r] of [["dispatch", "dispatch_coordinator"], ["sales", "sales_agent"]]) await addStaff(n, r);
await db.query("update public.app_settings set value = value || '{\"require_carrier\": true}'::jsonb where key = 'delivery'");

const vid = (await db.query("select id from public.variants where sku = 'DNK-LO-BW-41'")).rows[0].id;
const phone = "0240000123";
const placed = (await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
  channel: "web", customer: { name: "Esi Owusu", phone }, delivery: { method: "home", region: "Greater Accra", city: "Accra", area: "Osu", street: "Oxford St" },
  plan: "full", source: "TikTok", pay_method: "mtn", items: [{ variant_id: vid, qty: 1 }] })]))).rows[0].r;
await asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [placed.payment_reference, placed.due_now]));
const id = (await db.query("select id from public.orders where number = $1", [placed.number])).rows[0].id;
const rider = (await db.query("insert into public.riders (name, phone) values ('Kofi Rider', '+233240000555') returning id")).rows[0].id;
await db.query("select set_config('app.via_rpc', '1', false)");
await db.query("update public.orders set status = 'packed' where id = $1", [id]);
await db.query("select set_config('app.via_rpc', '', false)");
const track = async () => (await asRole("anon", () => tryQ("select public.track_order($1,$2) as r", [placed.number, phone]))).rows[0].r;

ok("the rider's number stays hidden before the order leaves", (await track()).rider_phone == null);
const bare = await as("dispatch", () => tryQ("select public.advance_order($1,'dispatched')", [id]));
ok("an order cannot be dispatched with nobody responsible for it", !bare.ok && /rider or courier/.test(bare.err ?? ""), bare.err);
ok("dispatch assigns the rider", (await as("dispatch", () => tryQ("select public.assign_rider($1,$2)", [id, rider]))).ok);
ok("the rider's number is still hidden while the order is packed", (await track()).rider_phone == null);
ok("then it can be dispatched", (await as("dispatch", () => tryQ("select public.advance_order($1,'dispatched')", [id]))).ok);
const road = await track();
ok("on the road, the customer sees the rider's name and number", road.rider_name === "Kofi Rider" && road.rider_phone === "+233240000555", JSON.stringify(road.rider_phone));

ok("sales cannot post a delivery update", !(await as("sales", () => tryQ("select public.set_delivery_update($1,'x')", [id]))).ok);
ok("visitors cannot post a delivery update", !(await asRole("anon", () => tryQ("select public.set_delivery_update($1,'x')", [id]))).ok);
ok("dispatch posts an update", (await as("dispatch", () => tryQ("select public.set_delivery_update($1,'Rider is at Madina')", [id]))).ok);
const upd = await track();
ok("the customer reads it on the tracker", upd.delivery_update === "Rider is at Madina" && !!upd.delivery_update_at);
ok("and it is in the order's timeline", upd.events.some((e) => e.note === "Rider is at Madina"));
ok("an overlong update is refused", !(await as("dispatch", () => tryQ("select public.set_delivery_update($1,$2)", [id, "x".repeat(201)]))).ok);

const user = (await db.query("insert into auth.users(email) values ('kofi.r@example.com') returning id")).rows[0].id;
await db.query("update public.riders set user_id = $1 where id = $2", [user, rider]);
const asRider = async (fn) => { await reset(); await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, aal: "aal1" })]); await db.exec("set role authenticated"); try { return await fn(); } finally { await reset(); } };
ok("the rider posts on their own job", (await asRider(() => tryQ("select public.partner_note($1,'Five minutes away')", [id]))).ok);
ok("the customer sees the rider's update", (await track()).delivery_update === "Five minutes away");
const other = (await db.query("insert into public.riders (name) values ('Other Rider') returning id")).rows[0].id;
await db.query("update public.orders set rider_id = $1 where id = $2", [other, id]);
ok("a rider cannot post on someone else's job", !(await asRider(() => tryQ("select public.partner_note($1,'hello')", [id]))).ok);
await db.query("update public.orders set rider_id = $1 where id = $2", [rider, id]);

await db.query("select set_config('app.via_rpc', '1', false)");
await db.query("update public.orders set status = 'delivered', delivered_at = now() where id = $1", [id]);
await db.query("select set_config('app.via_rpc', '', false)");
const after = await track();
ok("once delivered, the rider's number is gone", after.rider_phone == null && after.rider_name == null && after.delivery_update == null);
ok("a pickup order needs no rider", (await db.query("select prosrc like '%pickup%' as y from pg_proc where proname = 'need_carrier'")).rows[0].y);

done();
