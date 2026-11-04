// Catalogue tools: supplier details, pre-order dates, confirming a supplier, bulk edit rights. Run with: npm run test:catalogue-tools
import { createHarness } from "./harness.mjs";

const { db, ok, as, asRole, tryQ, addStaff, done } = await createHarness({ seed: true });
for (const [n, r] of [["owner", "owner"], ["sales", "sales_agent"], ["sourcing", "sourcing_officer"], ["finance", "finance"]]) await addStaff(n, r);

const vid = (await db.query("select id, product_id, price from public.variants where sku = 'DNK-LO-BW-41'")).rows[0];
const sup = (await db.query("insert into public.suppliers (name) values ('Kantamanto Kicks') returning id")).rows[0].id;
await db.query("insert into public.supplier_offers (variant_id, supplier_id, cost, checked_at) values ($1, $2, 200, now() - interval '30 days')", [vid.id, sup]);
await db.query("update public.variants set last_checked_at = now() - interval '30 days' where id = $1", [vid.id]);

ok("the sourcing officer records the supplier's contact, location and trust", (await as("sourcing", () => tryQ("update public.suppliers set contact_person = 'Yaw', location = 'Kantamanto', supplies = 'Sneakers', trusted = true where id = $1", [sup]))).n === 1);
ok("sales cannot change a supplier", (await as("sales", () => tryQ("update public.suppliers set trusted = false where id = $1", [sup]))).n === 0);

ok("the sourcing officer sets a pre-order date", (await as("sourcing", () => tryQ("update public.variants set availability = 'pre_order', expected_on = current_date + 14 where id = $1", [vid.id]))).n === 1);
ok("shoppers can read the expected date", (await asRole("anon", () => tryQ("select expected_on from public.variants where id = $1", [vid.id]))).rows[0]?.expected_on != null);
await db.query("update public.variants set availability = 'available', expected_on = null where id = $1", [vid.id]);

ok("sales cannot confirm a supplier", !(await as("sales", () => tryQ("select public.confirm_supplier_checked($1)", [sup]))).ok);
ok("shoppers cannot confirm a supplier", !(await asRole("anon", () => tryQ("select public.confirm_supplier_checked($1)", [sup]))).ok);
const confirmed = await as("sourcing", () => tryQ("select public.confirm_supplier_checked($1) as n", [sup]));
ok("the sourcing officer confirms everything from one supplier", confirmed.ok && confirmed.rows[0].n === 1);
const after = (await db.query("select (select checked_at from public.supplier_offers where variant_id = $1 and supplier_id = $2) c, (select last_checked_at from public.variants where id = $1) l", [vid.id, sup])).rows[0];
ok("the offer and the variant both show today", Date.now() - new Date(after.c) < 60_000 && Date.now() - new Date(after.l) < 60_000);
ok("an unknown supplier is refused", !(await as("sourcing", () => tryQ("select public.confirm_supplier_checked(gen_random_uuid())"))).ok);

// bulk edit goes through the same rules as one-at-a-time edits
ok("the sourcing officer bulk-sets availability and lead time", (await as("sourcing", () => tryQ("update public.variants set availability = 'limited', lead_days = 4 where product_id = $1", [vid.product_id]))).ok);
const salesPrice = await as("sales", () => tryQ("update public.variants set price = price + 1 where product_id = $1", [vid.product_id]));
ok("sales cannot bulk-change prices", !salesPrice.ok || salesPrice.n === 0);
ok("the owner bulk-changes prices", (await as("owner", () => tryQ("update public.variants set price = price + 1, compare_at = null where product_id = $1", [vid.product_id]))).ok);
ok("a sale must stay below the price", !(await as("owner", () => tryQ("update public.variants set sale_price = price + 5 where id = $1", [vid.id]))).ok);
ok("an archived product cannot stay published", !(await as("owner", () => tryQ("update public.products set archived = true, published = true where id = $1", [vid.product_id]))).ok);
ok("archiving takes it off the shop", (await as("owner", () => tryQ("update public.products set archived = true, published = false where id = $1", [vid.product_id]))).n === 1);
ok("shoppers no longer see it", (await asRole("anon", () => tryQ("select id from public.products where id = $1", [vid.product_id]))).rows.length === 0);
ok("a supplier's costs stay hidden from sales", (await as("sales", () => tryQ("select cost from public.supplier_offers"))).rows?.length === 0 || !(await as("sales", () => tryQ("select cost from public.supplier_offers"))).ok);

done();
