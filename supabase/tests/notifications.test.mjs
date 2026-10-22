// The notification outbox. Run with: npm run test:notifications
import { createHarness } from "./harness.mjs";

const { db, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });
for (const [n, r] of [["owner", "owner"], ["admin", "admin"], ["sales", "sales_agent"], ["finance", "finance"]]) await addStaff(n, r);
const vid = (await db.query("select id from public.variants where sku = 'DNK-LO-BW-41'")).rows[0].id;
const place = async (phone, email) => (await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
  channel: "web", customer: { name: "Ama Mensah", phone, ...(email ? { email } : {}) }, delivery: { method: "home", region: "Greater Accra", city: "Accra", area: "Osu", street: "Oxford St" },
  plan: "full", source: "Instagram", pay_method: "mtn", items: [{ variant_id: vid, qty: 1 }] })]))).rows[0].r;
const q = async (number) => (await db.query("select n.* from public.notifications n join public.orders o on o.id = n.order_id where o.number = $1 order by n.id", [number])).rows;

const withEmail = await place("0240000061", "ama@example.com");
let rows = await q(withEmail.number);
ok("placing an order with an email queues a confirmation", rows.length === 1 && rows[0].template === "order_placed" && rows[0].to_address === "ama@example.com", JSON.stringify(rows));
ok("the payload carries what the email needs", rows[0].payload.number === withEmail.number && Number(rows[0].payload.total) === 450 && rows[0].payload.name === "Ama Mensah");
const noEmail = await place("0240000062");
ok("no email address, nothing queued", (await q(noEmail.number)).length === 0);

await asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [withEmail.payment_reference, withEmail.due_now]));
rows = await q(withEmail.number);
ok("a confirmed payment queues an update", rows.length === 2 && rows[1].template === "order_update" && /Payment confirmed/.test(rows[1].payload.headline), JSON.stringify(rows.map((r) => r.payload.headline)));
const id = (await db.query("select id from public.orders where number = $1", [withEmail.number])).rows[0].id;
await as("admin", () => tryQ("select public.advance_order($1,'to_source',null)", [id]));
rows = await q(withEmail.number);
ok("a status change queues an update with the customer-facing label", rows.length === 3 && rows[2].payload.headline === "Confirmed by Drezzy", rows[2]?.payload.headline);
await as("admin", () => tryQ("select public.move_order_back($1,'to_confirm','test')", [id]));
ok("internal-only events (admin overrides) queue nothing", (await q(withEmail.number)).length === 3);

// the sender
const claim = (n = 20) => asRole("service_role", () => tryQ("select * from public.claim_notifications($1)", [n]));
const c1 = await claim(2);
ok("the sender claims a batch, oldest first", c1.ok && c1.rows.length === 2 && c1.rows[0].attempts === 1 && c1.rows[0].status === "sending", c1.err);
ok("claimed rows are not handed out twice", (await claim()).rows.every((r) => !c1.rows.some((x) => x.id === r.id)));
const fin = (i, good, err) => asRole("service_role", () => tryQ("select public.finish_notification($1,$2,$3)", [i, good, err]));
await fin(c1.rows[0].id, true);
await fin(c1.rows[1].id, false, "provider timeout");
const st = async (i) => (await db.query("select status, last_error, sent_at from public.notifications where id = $1", [i])).rows[0];
ok("a sent email is marked sent", (await st(c1.rows[0].id)).status === "sent" && (await st(c1.rows[0].id)).sent_at !== null);
ok("a failed attempt goes back to the queue with the error", (await st(c1.rows[1].id)).status === "queued" && (await st(c1.rows[1].id)).last_error === "provider timeout");
for (let i = 0; i < 5; i++) { const c = await claim(100); for (const r of c.rows) await fin(r.id, false, "down"); }
ok("after 5 attempts it is marked failed and no longer retried", (await st(c1.rows[1].id)).status === "failed" && (await claim()).rows.length === 0);

// who can see the outbox
ok("only people with settings access can read the outbox", (await as("admin", () => tryQ("select * from public.notifications"))).rows.length > 0 && (await as("sales", () => tryQ("select * from public.notifications"))).rows.length === 0 && (await as("finance", () => tryQ("select * from public.notifications"))).rows.length === 0);
await asRole("anon", async () => ok("shoppers cannot read it", !(await tryQ("select * from public.notifications")).ok));
ok("no signed-in user can claim, finish or write", !(await as("owner", () => tryQ("select * from public.claim_notifications()"))).ok && !(await as("owner", () => tryQ("select public.finish_notification(1,true,null)"))).ok && !(await as("owner", () => tryQ("insert into public.notifications (template, to_address) values ('x','a@b.co')"))).ok);
await asRole("anon", async () => ok("shoppers cannot claim", !(await tryQ("select * from public.claim_notifications()")).ok));

await done();
