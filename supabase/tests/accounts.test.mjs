// Customer accounts. Run with: npm run test:accounts
import { createHarness } from "./harness.mjs";

const { db, ids, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });
await addStaff("admin", "admin");

const vid = (await db.query("select id from public.variants where sku = 'DNK-LO-BW-41'")).rows[0].id;
const place = async (phone, email) => (await asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify({
  channel: "web", customer: { name: "Ama Mensah", phone, ...(email ? { email } : {}) }, delivery: { method: "pickup" }, plan: "full", source: "Instagram", pay_method: "mtn", items: [{ variant_id: vid, qty: 1 }] })]))).rows[0].r;
// a shopper's sign-in: a row in auth.users, then acting as them (the test helper looks people up by name)
const shopper = async (name, email, confirmed = true) => {
  ids[name] = (await db.query("insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id", [email, confirmed ? new Date().toISOString() : null])).rows[0].id;
};

const a = await place("0240000091", "ama@example.com");
const b = await place("0240000092", "kojo@example.com");
await place("0240000093", "ama@example.com"); // a second order, same email, another phone

await shopper("ama", "Ama@Example.com");
const link = (who) => as(who, () => tryQ("select public.link_customer_orders() as n"));
const mine = async (who) => (await as(who, () => tryQ("select public.my_orders() as r"))).rows[0].r;

let r = await link("ama");
ok("a confirmed email links the orders placed with that address (case-insensitive)", r.ok && r.rows[0].n === 2, r.err);
ok("the other customer is untouched", (await db.query("select auth_user_id from public.customers where email = 'kojo@example.com'")).rows[0].auth_user_id === null);
ok("linking again changes nothing", (await link("ama")).rows[0].n === 0);

const list = await mine("ama");
ok("my_orders lists only my orders", list.length === 2 && !list.some((o) => o.number === b.number) && list.some((o) => o.number === a.number));
ok("each order carries status, money, and item names", list[0].status && Number(list[0].total) === 420 && list[0].items[0].includes("Dunk") && list[0].phone.startsWith("+233"), JSON.stringify(list[0]));
ok("newest first", list[0].placed_at >= list[1].placed_at);
ok("it shows no supplier or cost information", !JSON.stringify(list).match(/supplier|cost/i));

await shopper("stranger", "stranger@example.com");
await link("stranger");
ok("a signed-in stranger sees no orders", (await mine("stranger")).length === 0);
await shopper("faker", "kojo@example.com", false);
r = await link("faker");
ok("an UNCONFIRMED address links nothing, so signing up with someone's email reveals nothing", r.rows[0].n === 0 && (await mine("faker")).length === 0);
ok("staff logins are skipped", (await link("admin")).rows[0].n === 0);
await asRole("anon", async () => ok("a visitor who is not signed in gets nothing", !(await tryQ("select public.my_orders()")).ok && !(await tryQ("select public.link_customer_orders()")).ok));
ok("a shopper cannot read the customers or orders tables", (await as("ama", () => tryQ("select * from public.customers"))).rows.length === 0 && (await as("ama", () => tryQ("select * from public.orders"))).rows.length === 0);

await done();
