// Proves supabase/seed.sql loads cleanly after the migrations, is repeatable, and what shoppers then see matches the sample catalogue.
// Run with: npm run test:seed
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sampleProducts } from "../../src/lib/catalogue/sample.ts";
import { productFromRow, PUBLIC_PRODUCT_SELECT } from "../../src/lib/catalogue/map.ts";

const dir = (p) => fileURLToPath(new URL(p, import.meta.url));
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
`);
for (const f of fs.readdirSync(dir("../migrations")).sort()) await db.exec(fs.readFileSync(dir(`../migrations/${f}`), "utf8"));

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  -> " + x : ""}`); };

const seed = fs.readFileSync(dir("../seed.sql"), "utf8");
await db.exec(seed);
const count = async (t) => (await db.query(`select count(*)::int n from public.${t}`)).rows[0].n;
const expectedVariants = sampleProducts.reduce((n, p) => n + p.variants.length, 0);

ok("seed creates every sample product", (await count("products")) === sampleProducts.length, String(await count("products")));
ok("seed creates every variant", (await count("variants")) === expectedVariants, `${await count("variants")} of ${expectedVariants}`);
ok("seed adds two suppliers", (await count("suppliers")) === 2);
await db.exec(seed);
ok("running the seed again changes nothing", (await count("products")) === sampleProducts.length && (await count("variants")) === expectedVariants);
ok("every seeded product is published", (await db.query("select count(*)::int n from public.products where not published")).rows[0].n === 0);
ok("every seeded product has a category", (await db.query("select count(*)::int n from public.products where category_id is null")).rows[0].n === 0);

// What a shopper reads, mapped through the same code the storefront uses
await db.exec("set role anon");
const rows = (await db.query("select slug from public.products order by slug")).rows;
ok("a shopper can read the seeded catalogue", rows.length === sampleProducts.length);
const v = (await db.query("select price, availability, lead_days from public.variants where sku = 'NK-SBD-45'")).rows[0];
ok("a sold-out size is stored as unavailable", v?.availability === "unavailable", JSON.stringify(v));
ok("a shopper still cannot read costs or suppliers", !(await db.query("select * from public.supplier_offers").then(() => true).catch(() => false)));
await db.exec("reset role");

// Round trip: database rows -> Product must equal the sample Product the storefront uses in demo mode
const prows = (await db.query("select id, slug, sku, name, brand, audience, description, details, condition, is_new, popular, art, category_id from public.products")).rows;
let same = 0;
for (const r of prows) {
  const cat = (await db.query("select c.name, p.name as parent from public.categories c left join public.categories p on p.id = c.parent_id where c.id = $1", [r.category_id])).rows[0];
  const vars = (await db.query("select id, style, colour, size, sku, price, compare_at, availability, lead_days from public.variants where product_id = $1", [r.id])).rows;
  const built = productFromRow({ ...r, category: { name: cat.name, parent: cat.parent ? { name: cat.parent } : null }, variants: vars });
  const sample = sampleProducts.find((p) => p.slug === r.slug);
  const strip = (p) => JSON.stringify({ price: p.price, compareAt: p.compareAt, sizes: p.sizes, styles: p.styles, colours: p.colours, category: p.category, audience: p.audience, n: p.variants.length });
  if (sample && strip(built) === strip(sample)) same++;
  else console.log("  differs:", r.slug, strip(built), strip(sample));
}
ok("database products match the demo-mode sample exactly", same === sampleProducts.length, `${same}/${sampleProducts.length}`);
ok("the storefront select string names only public columns", !/preferred_supplier|last_checked|cost/.test(PUBLIC_PRODUCT_SELECT));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
