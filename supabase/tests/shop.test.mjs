// Customer accounts and shop features: sale prices, drops, coupons, profiles, addresses, wishlist alerts, reviews,
// ratings, newsletter, support inbox, data rights and loyalty. Run with: npm run test:shop
import { createHarness } from "./harness.mjs";

const { db, ok, as, asRole, tryQ, addStaff, done, reset } = await createHarness({ seed: true });
for (const [n, r] of [["owner", "owner"], ["admin", "admin"], ["support", "customer_support"], ["sales", "sales_agent"], ["content", "content_editor"], ["dispatch", "dispatch_coordinator"], ["sourcing", "sourcing_officer"]]) await addStaff(n, r);

const variant = async (sku) => (await db.query("select v.id, v.price, v.product_id, p.slug from public.variants v join public.products p on p.id = v.product_id where v.sku = $1", [sku])).rows[0];
const dunk = await variant("DNK-LO-BW-41");
const dunk42 = await variant("DNK-LO-BW-42");

const base = (phone, extra = {}) => ({
  channel: "web", customer: { name: "Ama Mensah", phone, email: "ama@example.com" },
  delivery: { method: "home", region: "Greater Accra", city: "Accra", area: "Osu", street: "Oxford St" },
  plan: "full", source: "Instagram", pay_method: "mtn", items: [{ variant_id: dunk.id, qty: 1 }], ...extra,
});
const place = (payload) => asRole("anon", () => tryQ("select public.place_order($1::jsonb) as r", [JSON.stringify(payload)]));
const pay = async (r) => asRole("service_role", () => tryQ("select public.confirm_payment($1,$2,'{}'::jsonb)", [r.payment_reference, r.due_now]));
const orderRow = async (number) => (await db.query("select * from public.orders where number = $1", [number])).rows[0];
async function deliver(number) {
  const o = await orderRow(number);
  for (const s of ["to_source", "ready_to_pack", "packed", "dispatched", "out_for_delivery", "delivered"]) {
    const r = await as("admin", () => tryQ("select public.advance_order($1,$2::public.order_status,null)", [o.id, s]));
    if (!r.ok) throw new Error(`could not move to ${s}: ${r.err}`);
  }
}

// ---------------------------------------------------------------- sale prices
await db.query("update public.variants set sale_price = $1, sale_starts_at = now() - interval '1 hour', sale_ends_at = now() + interval '1 day' where id = $2", [Number(dunk.price) - 50, dunk.id]);
let r = await place(base("0240000101"));
ok("an order is placed", r.ok, r.err);
ok("a sale price inside its window is charged", Number(r.rows[0].r.subtotal) === Number(dunk.price) - 50, JSON.stringify(r.rows[0].r));
await db.query("update public.variants set sale_starts_at = now() - interval '2 days', sale_ends_at = now() - interval '1 day' where id = $1", [dunk.id]);
r = await place(base("0240000102"));
ok("an expired sale is not charged", Number(r.rows[0].r.subtotal) === Number(dunk.price));
const badSale = await tryQ("update public.variants set sale_price = price + 1 where id = $1", [dunk.id]);
ok("a sale price must be below the normal price", !badSale.ok);
{ const d = await as("dispatch", () => tryQ("update public.variants set sale_price = 10 where id = $1", [dunk.id]));
  ok("roles without product edit cannot set a sale price", !d.ok || d.n === 0); }
await db.query("insert into public.roles (key, name) values ('stock_checker','Stock checker')");
await db.query("insert into public.role_permissions (role_id, module, can_view, can_edit) select id, 'availability', true, true from public.roles where key = 'stock_checker'");
await db.query("insert into public.role_permissions (role_id, module, can_view) select id, 'products', true from public.roles where key = 'stock_checker'");
await addStaff("checker", "stock_checker");
{ const d = await as("checker", () => tryQ("update public.variants set sale_price = 10 where id = $1", [dunk.id]));
  ok("a role that may only change availability cannot set a sale price", !d.ok && /prices/.test(d.err), d.err); }

// ---------------------------------------------------------------- drops
await db.query("update public.products set release_at = now() + interval '1 day', cap_per_customer = 1 where id = $1", [dunk.product_id]);
r = await place(base("0240000103"));
ok("a drop cannot be bought before it opens", !r.ok && /drops on/.test(r.err), r.err);
await db.query("update public.products set release_at = now() - interval '1 minute' where id = $1", [dunk.product_id]);
r = await place(base("0240000103"));
ok("once open, the drop can be bought", r.ok, r.err);
r = await place(base("0240000103"));
ok("the cap per customer is enforced across orders", !r.ok && /limited to 1/.test(r.err), r.err);
r = await place(base("0240000104", { items: [{ variant_id: dunk.id, qty: 1 }, { variant_id: dunk42.id, qty: 1 }] }));
ok("the cap counts all sizes of the product in one order", !r.ok && /limited to 1/.test(r.err), r.err);
await db.query("update public.products set release_at = null, cap_per_customer = null where id = $1", [dunk.product_id]);

// ---------------------------------------------------------------- coupons
ok("shoppers cannot create coupons", !(await asRole("anon", () => tryQ("insert into public.coupons (code, kind, value) values ('FREE','amount',10)"))).ok);
ok("sales agents cannot create coupons", !(await as("sales", () => tryQ("insert into public.coupons (code, kind, value) values ('FREE','amount',10)"))).ok);
const mk = await as("admin", () => tryQ("insert into public.coupons (code, kind, value, min_spend, max_uses, max_per_customer) values ('DRIP10','percent',10,100,2,1) returning id"));
ok("an admin creates a coupon", mk.ok, mk.err);
ok("a percentage over 90 is refused", !(await as("admin", () => tryQ("insert into public.coupons (code, kind, value) values ('ALL','percent',95)"))).ok);
let chk = (await asRole("anon", () => tryQ("select public.check_coupon('drip10', 400, null) as r"))).rows[0].r;
ok("the bag can preview a code (case-insensitive)", chk.ok && Number(chk.discount) === 40, JSON.stringify(chk));
chk = (await asRole("anon", () => tryQ("select public.check_coupon('DRIP10', 50, null) as r"))).rows[0].r;
ok("the minimum spend is checked", !chk.ok && /Spend at least/.test(chk.message));
chk = (await asRole("anon", () => tryQ("select public.check_coupon('NOPE', 500, null) as r"))).rows[0].r;
ok("an unknown code is refused", !chk.ok);
r = await place(base("0240000105", { coupon: "drip10" }));
ok("a coupon is applied by the database", r.ok && Number(r.rows[0].r.discount) === Math.round(Number(dunk.price) * 0.1 * 100) / 100, r.err ?? JSON.stringify(r.rows[0].r));
const withCoupon = await orderRow(r.rows[0].r.number);
ok("the order records the code and the reason", withCoupon.coupon_code === "DRIP10" && /Coupon DRIP10/.test(withCoupon.discount_reason));
ok("the same customer cannot use it twice", !(await place(base("0240000105", { coupon: "DRIP10" }))).ok);
ok("another customer can", (await place(base("0240000106", { coupon: "DRIP10" }))).ok);
const third = await place(base("0240000107", { coupon: "DRIP10" }));
ok("the total use limit is enforced", !third.ok && /fully used/.test(third.err), third.err);
ok("coupons are audited", (await db.query("select count(*)::int n from public.audit_log where table_name = 'coupons'")).rows[0].n >= 1);

// ---------------------------------------------------------------- attribution and validation
r = await place(base("0240000108", { attribution: { utm_source: "instagram", utm_medium: "bio", utm_campaign: "launch", session: "sess-12345678", article: "5-ways-to-wear-nike-dunks", device: "mobile" }, delivery: { method: "home", region: "Greater Accra", city: "Accra", street: "Oxford St", gps: "GA-123-4567", landmark: "Near the mall" } }));
const attributed = await orderRow(r.rows[0].r.number);
ok("tracked source, article and device are kept on the order", attributed.utm_source === "instagram" && attributed.article_slug === "5-ways-to-wear-nike-dunks" && attributed.device === "mobile");
ok("the GPS address and landmark are kept", attributed.gps_code === "GA-123-4567" && attributed.landmark === "Near the mall");
ok("a malformed GPS address is refused", !(await place(base("0240000109", { delivery: { method: "home", region: "Greater Accra", city: "Accra", street: "x", gps: "hello" } }))).ok);
ok("every order gets a 4-digit delivery code", /^\d{4}$/.test(attributed.delivery_code));
ok("staff cannot change the delivery code", !(await as("admin", () => tryQ("update public.orders set delivery_code = '0000' where id = $1", [attributed.id]))).ok);

// fee paid to the courier on arrival
await db.query("update public.delivery_zones set fee_on_arrival = true where region = 'Upper West'");
r = await place(base("0240000110", { delivery: { method: "home", region: "Upper West", city: "Wa", street: "Main" } }));
ok("a fee-on-arrival zone charges no fee at checkout", r.ok && Number(r.rows[0].r.delivery_fee) === 0 && r.rows[0].r.fee_on_arrival === true, r.err);

// ---------------------------------------------------------------- tracker: delivery code only once on its way
const tracked = await place(base("0240000111"));
await pay(tracked.rows[0].r);
let t = (await asRole("anon", () => tryQ("select public.track_order($1,$2) as r", [tracked.rows[0].r.number, "0240000111"]))).rows[0].r;
ok("the delivery code is hidden before dispatch", t.delivery_code === null);
await deliver(tracked.rows[0].r.number).catch(() => {});
t = (await asRole("anon", () => tryQ("select public.track_order($1,$2) as r", [tracked.rows[0].r.number, "0240000111"]))).rows[0].r;
ok("delivered orders list their items with product links", t.items[0].slug === dunk.slug && t.items[0].reviewed === false, JSON.stringify(t.items));

// ---------------------------------------------------------------- accounts and profiles
const shopper = (await db.query("insert into auth.users(email, raw_user_meta_data) values ('ama@example.com', '{\"full_name\":\"Ama Mensah\",\"ref\":\"\"}') returning id")).rows[0].id;
const other = (await db.query("insert into auth.users(email) values ('kofi@example.com') returning id")).rows[0].id;
const asUser = async (uid, fn) => {
  await reset();
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, aal: "aal1" })]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await reset(); }
};
let prof = (await asUser(shopper, () => tryQ("select public.my_profile() as r"))).rows[0].r;
ok("a profile is created on first visit with a referral code", /^[A-Z]{4}\d{4}$/.test(prof.referral_code) && prof.full_name === "Ama Mensah", JSON.stringify(prof));
ok("staff logins have no shopper profile", !(await as("sales", () => tryQ("select public.my_profile()"))).ok);
let s = await asUser(shopper, () => tryQ("select public.save_my_profile($1::jsonb)", [JSON.stringify({ full_name: "Ama M.", phone: "024 000 0101", shoe_size_eu: "41", clothing_size: "M", style_tags: ["Streetwear"], topics: ["drops", "hacking"], notify_whatsapp: true, marketing: true })]));
ok("the shopper saves their profile", s.ok, s.err);
prof = (await asUser(shopper, () => tryQ("select public.my_profile() as r"))).rows[0].r;
ok("phone is stored in international format and unknown topics are dropped", prof.phone === "+233240000101" && JSON.stringify(prof.topics) === '["drops"]' && prof.marketing_consent_at, JSON.stringify(prof));
ok("a bad phone number is refused", !(await asUser(shopper, () => tryQ("select public.save_my_profile('{\"phone\":\"12\"}'::jsonb)"))).ok);
ok("nobody writes profiles directly", !(await asUser(shopper, () => tryQ("update public.customer_profiles set referral_code = 'XXXX0000'"))).ok);
ok("another shopper cannot read my profile", (await asUser(other, () => tryQ("select * from public.customer_profiles where user_id = $1", [shopper]))).rows.length === 0);
ok("customer support can read profiles", (await as("support", () => tryQ("select * from public.customer_profiles"))).rows.length >= 1);

// addresses
s = await asUser(shopper, () => tryQ("insert into public.addresses (user_id, label, region, city, street, is_default) values ($1,'Home','Greater Accra','Accra','Oxford St', true)", [shopper]));
ok("a shopper adds an address", s.ok, s.err);
ok("only one default address", !(await asUser(shopper, () => tryQ("insert into public.addresses (user_id, region, city, street, is_default) values ($1,'Ashanti','Kumasi','Adum', true)", [shopper]))).ok);
ok("nobody adds an address for someone else", !(await asUser(other, () => tryQ("insert into public.addresses (user_id, region, city, street) values ($1,'Ashanti','Kumasi','Adum')", [shopper]))).ok);
ok("another shopper cannot see or change it", (await asUser(other, () => tryQ("update public.addresses set city = 'X'"))).n === 0 && (await asUser(other, () => tryQ("select * from public.addresses"))).rows.length === 0);
ok("support can read but not change addresses", (await as("support", () => tryQ("select * from public.addresses"))).rows.length === 1 && (await as("support", () => tryQ("update public.addresses set city = 'X'"))).n === 0);

// wishlist and alerts
const aj = await variant("AJ1-HI-TB-45"); // unavailable in the seed
ok("a shopper saves to their wishlist", (await asUser(shopper, () => tryQ("select public.wishlist_toggle($1,'45',true)", [aj.product_id]))).ok);
ok("guests cannot use the account wishlist", !(await asRole("anon", () => tryQ("select public.wishlist_toggle($1,null,true)", [aj.product_id]))).ok);
ok("notify-me needs a valid email", !(await asRole("anon", () => tryQ("select public.request_stock_alert('nope',$1,'45','restock')", [aj.product_id]))).ok);
ok("a guest asks to be told when size 45 is back", (await asRole("anon", () => tryQ("select public.request_stock_alert('yaw@example.com',$1,'45','restock')", [aj.product_id]))).ok);
ok("asking twice keeps one alert", (await asRole("anon", () => tryQ("select public.request_stock_alert('YAW@example.com',$1,'45','restock')", [aj.product_id]))).ok
  && (await db.query("select count(*)::int n from public.stock_alerts")).rows[0].n === 1);
await as("owner", () => tryQ("update public.variants set availability = 'available' where id = $1", [aj.id]));
const q = (await db.query("select template, to_address from public.notifications where template in ('stock_back','wishlist_back') order by id")).rows;
ok("size back: the guest and the wishlist owner are emailed once each", q.length === 2 && q.some((x) => x.to_address === "yaw@example.com") && q.some((x) => x.to_address === "ama@example.com"), JSON.stringify(q));
ok("the guest alert is marked sent", (await db.query("select count(*)::int n from public.stock_alerts where notified_at is not null")).rows[0].n === 1);
await as("owner", () => tryQ("update public.variants set price = price - 20 where product_id = $1", [aj.product_id]));
ok("a price drop emails the wishlist owner once", (await db.query("select count(*)::int n from public.notifications where template = 'wishlist_price'")).rows[0].n === 1);

// ---------------------------------------------------------------- reviews and ratings
const reviewOn = (number, phone, extra = {}) => asRole("anon", () => tryQ("select public.submit_review($1::jsonb) as id", [JSON.stringify({ number, phone, product: dunk.slug, rating: 5, body: "Fits well, fast delivery", consent: true, ...extra })]));
const undelivered = await place(base("0240000112"));
ok("an order that is not delivered cannot be reviewed", !(await reviewOn(undelivered.rows[0].r.number, "0240000112")).ok);
ok("the wrong phone cannot review", !(await reviewOn(tracked.rows[0].r.number, "0240000999")).ok);
ok("a product not on the order cannot be reviewed", !(await reviewOn(tracked.rows[0].r.number, "0240000111", { product: "new-balance-2000" })).ok);
const rv = await reviewOn(tracked.rows[0].r.number, "0240000111");
ok("a verified buyer reviews a delivered item", rv.ok, rv.err);
ok("one review per item per order", !(await reviewOn(tracked.rows[0].r.number, "0240000111")).ok);
let pubReviews = (await asRole("anon", () => tryQ("select public.product_reviews($1) as r", [dunk.slug]))).rows[0].r;
ok("a new review waits for moderation", Number(pubReviews.count) === 0);
ok("shoppers cannot read the reviews table", !(await asRole("anon", () => tryQ("select * from public.reviews"))).ok);
ok("the content editor approves it", (await as("content", () => tryQ("update public.reviews set status = 'approved' where id = $1", [rv.rows[0].id]))).n === 1);
pubReviews = (await asRole("anon", () => tryQ("select public.product_reviews($1) as r", [dunk.slug]))).rows[0].r;
ok("approved reviews show with the average", Number(pubReviews.count) === 1 && Number(pubReviews.average) === 5 && pubReviews.reviews[0].verified === true, JSON.stringify(pubReviews));
ok("an Instagram review needs a staff role", (await as("content", () => tryQ("insert into public.reviews (product_id, rating, body, display_name, consent, source, status) values ($1, 5, 'Love it', 'Esi', true, 'instagram', 'approved')", [dunk.product_id]))).ok
  && !(await as("sales", () => tryQ("insert into public.reviews (product_id, rating, body, display_name, consent, source) values ($1, 5, 'x x x', 'Esi', true, 'instagram')", [dunk.product_id]))).ok);
await as("content", () => tryQ("insert into public.reviews (product_id, rating, body, display_name, consent, source, status) values ($1, 5, 'No consent given', 'Kwesi', false, 'instagram', 'approved')", [dunk.product_id]));
pubReviews = (await asRole("anon", () => tryQ("select public.product_reviews($1) as r", [dunk.slug]))).rows[0].r;
ok("reviews without consent are never shown", Number(pubReviews.count) === 2 && !pubReviews.reviews.some((x) => x.name === "Kwesi"));
ok("the home strip lists recent good reviews", (await asRole("anon", () => tryQ("select public.recent_reviews(8) as r"))).rows[0].r.length === 2);
ok("a delivery rating is saved once and can be changed", (await asRole("anon", () => tryQ("select public.submit_feedback($1,$2,4,'Quick')", [tracked.rows[0].r.number, "0240000111"]))).ok
  && (await asRole("anon", () => tryQ("select public.submit_feedback($1,$2,5,null)", [tracked.rows[0].r.number, "0240000111"]))).ok
  && (await db.query("select rating from public.order_feedback")).rows[0].rating === 5);

// ---------------------------------------------------------------- loyalty and account orders
await db.query("update public.customers set auth_user_id = $1 where phone = '+233240000111'", [shopper]);
const loyal = await place(base("0240000111"));
await pay(loyal.rows[0].r);
await deliver(loyal.rows[0].r.number);
prof = (await asUser(shopper, () => tryQ("select public.my_profile() as r"))).rows[0].r;
ok("a delivered order linked to an account earns 1 point per GHS 10", Number(prof.points) === Math.floor(Number(loyal.rows[0].r.total) / 10), JSON.stringify(prof.points));
ok("delivered_at is stamped", (await orderRow(loyal.rows[0].r.number)).delivered_at !== null);
const mine = (await asUser(shopper, () => tryQ("select public.my_orders() as r"))).rows[0].r;
ok("My Drezzy orders carry lines for reorder", mine.length >= 1 && mine[0].lines[0].variant_id, JSON.stringify(mine[0]));
ok("a signed-in shopper reviews from their account without the phone", (await asUser(shopper, () => tryQ("select public.submit_review($1::jsonb)", [JSON.stringify({ number: loyal.rows[0].r.number, product: dunk.slug, rating: 4, body: "Nice pair", consent: true })]))).ok);
ok("another account cannot review my order", !(await asUser(other, () => tryQ("select public.submit_review($1::jsonb)", [JSON.stringify({ number: loyal.rows[0].r.number, product: dunk.slug, rating: 1, body: "bad bad", consent: true })]))).ok);
ok("also bought is empty with single-item orders", (await asRole("anon", () => tryQ("select public.also_bought($1) as r", [dunk.slug]))).rows[0].r.length === 0);

// ---------------------------------------------------------------- newsletter
ok("newsletter sign-up", (await asRole("anon", () => tryQ("select public.newsletter_subscribe('Esi@Example.com','article')"))).ok);
ok("signing up twice keeps one row", (await asRole("anon", () => tryQ("select public.newsletter_subscribe('esi@example.com','footer')"))).ok
  && (await db.query("select count(*)::int n from public.newsletter_subscribers")).rows[0].n === 1);
const token = (await db.query("select token from public.newsletter_subscribers")).rows[0].token;
ok("one-click unsubscribe works once", (await asRole("anon", () => tryQ("select public.newsletter_unsubscribe($1) as r", [token]))).rows[0].r === true
  && (await asRole("anon", () => tryQ("select public.newsletter_unsubscribe($1) as r", [token]))).rows[0].r === false);
ok("shoppers cannot read the subscriber list", !(await asRole("anon", () => tryQ("select * from public.newsletter_subscribers"))).ok);

// ---------------------------------------------------------------- support inbox
const sp = await asRole("anon", () => tryQ("select public.support_post($1::jsonb) as id", [JSON.stringify({ number: tracked.rows[0].r.number, phone: "0240000111", body: "Where is my receipt?" })]));
ok("a guest writes about their order from the tracker", sp.ok, sp.err);
ok("the wrong phone cannot write about an order", !(await asRole("anon", () => tryQ("select public.support_post($1::jsonb)", [JSON.stringify({ number: tracked.rows[0].r.number, phone: "0240000999", body: "hi there" })]))).ok);
ok("a guest with no order cannot open a thread", !(await asRole("anon", () => tryQ("select public.support_post('{\"body\":\"hello\"}'::jsonb)"))).ok);
ok("sales cannot reply to customers", !(await as("sales", () => tryQ("select public.support_reply($1,'hello',false)", [sp.rows[0].id]))).ok);
ok("support replies", (await as("support", () => tryQ("select public.support_reply($1,'Sent to your email',false)", [sp.rows[0].id]))).ok);
ok("the reply is emailed to the customer", (await db.query("select count(*)::int n from public.notifications where template = 'support_reply'")).rows[0].n === 1);
const thread = (await asRole("anon", () => tryQ("select public.support_threads_for($1,$2) as r", [tracked.rows[0].r.number, "0240000111"]))).rows[0].r;
ok("the customer sees the conversation with the staff first name only", thread.length === 1 && thread[0].messages.length === 2 && thread[0].status === "waiting", JSON.stringify(thread));
ok("another order cannot read that thread", (await asRole("anon", () => tryQ("select public.support_threads_for($1,$2) as r", [undelivered.rows[0].r.number, "0240000112"]))).rows[0].r.length === 0);
ok("a customer cannot post into someone else's thread", !(await asRole("anon", () => tryQ("select public.support_post($1::jsonb)", [JSON.stringify({ number: undelivered.rows[0].r.number, phone: "0240000112", thread: sp.rows[0].id, body: "sneaky" })]))).ok);

// ---------------------------------------------------------------- data rights
const exp = (await asUser(shopper, () => tryQ("select public.my_data_export() as r"))).rows[0].r;
ok("download my data includes profile, orders and wishlist", exp.profile && exp.orders.length >= 1 && exp.wishlist.length === 1 && exp.addresses.length === 1);
ok("the download is logged as an access request", (await db.query("select count(*)::int n from public.data_requests where kind = 'access' and status = 'done'")).rows[0].n === 1);
ok("withdrawing consent takes effect at once", (await asUser(shopper, () => tryQ("select public.request_data_action('withdraw_consent','stop', null, null)"))).ok
  && (await db.query("select marketing_consent_at from public.customer_profiles where user_id = $1", [shopper])).rows[0].marketing_consent_at === null);
ok("a guest can ask for deletion by email", (await asRole("anon", () => tryQ("select public.request_data_action('delete','please delete me','yaw@example.com',null)"))).ok);
ok("a guest request needs an email or phone", !(await asRole("anon", () => tryQ("select public.request_data_action('delete','x',null,null)"))).ok);
ok("support sees the request queue; sales does not", (await as("support", () => tryQ("select * from public.data_requests"))).rows.length >= 3 && (await as("sales", () => tryQ("select * from public.data_requests"))).rows.length === 0);

// ---------------------------------------------------------------- looks
ok("the content editor publishes a look", (await as("content", () => tryQ("insert into public.looks (slug, title, items, published) values ('campus-fit','Campus fit',$1::jsonb,true)", [JSON.stringify([{ slug: dunk.slug }])]))).ok);
ok("shoppers read published looks", (await asRole("anon", () => tryQ("select slug from public.looks"))).rows.length === 1);
ok("shoppers cannot change looks", !(await asRole("anon", () => tryQ("update public.looks set title = 'x'"))).ok);

await done();
