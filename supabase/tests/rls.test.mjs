import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Security rules test. Runs the real migrations on an in-memory Postgres (PGlite) with a stand-in for Supabase's auth
// schema, then acts as different staff members. Run it with: npm run test:db
const MIG = fileURLToPath(new URL("../migrations", import.meta.url));
const db = new PGlite();

// ---- minimal stand-in for Supabase's auth schema and roles ----
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  grant select on auth.users to authenticated;
`);

for (const f of fs.readdirSync(MIG).sort()) {
  await db.exec(fs.readFileSync(`${MIG}/${f}`, "utf8"));
  console.log("applied", f);
}

// ---- helpers ----
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); };

const ids = {};
const roleId = async (key) => (await db.query("select id from public.roles where key=$1", [key])).rows[0].id;
async function addStaff(name, role) {
  const u = (await db.query("insert into auth.users(email) values ($1) returning id", [`${name}@drezzy.test`])).rows[0].id;
  await db.query("insert into public.staff(id, full_name, email, role_id) values ($1,$2,$3,$4)", [u, name.padEnd(3, "_"), `${name}@drezzy.test`, await roleId(role)]);
  ids[name] = u;
}

async function as(who, aal, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(who ? { sub: ids[who], aal } : {})]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claims','',false)"); }
}
const tryQ = async (sql, params = []) => { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows, n: r.affectedRows ?? r.rows.length }; } catch (e) { return { ok: false, err: e.message }; } };

// ---- seed data checks (as superuser) ----
const roleCount = (await db.query("select count(*)::int n from public.roles")).rows[0].n;
ok("8 built-in roles seeded", roleCount === 8, String(roleCount));

const perm = async (role, module) => (await db.query(
  "select rp.* from public.role_permissions rp join public.roles r on r.id=rp.role_id where r.key=$1 and rp.module=$2", [role, module])).rows[0];

ok("sales agent: orders = view/create/edit, own only, no delete", (p => p && p.can_view && p.can_create && p.can_edit && !p.can_delete && p.scope === "own")(await perm("sales_agent", "orders")));
ok("dispatch: orders editable with field restriction", (p => p && p.can_edit && /Status, delivery/.test(p.restriction ?? ""))(await perm("dispatch_coordinator", "orders")));
ok("sourcing: products editable, finance only views", (a => a.can_edit)(await perm("sourcing_officer", "products")) && !(await perm("finance", "products")).can_edit);
ok("sales has no staff, salary, audit or settings access", (await Promise.all(["staff", "salary", "audit", "settings"].map((m) => perm("sales_agent", m)))).every((p) => !p));
const salaryRoles = (await db.query("select r.key from public.role_permissions rp join public.roles r on r.id=rp.role_id where rp.module='salary' order by 1")).rows.map((r) => r.key);
ok("salary access exists only for owner and finance (FR-ROLE-003)", salaryRoles.join() === "finance,owner", salaryRoles.join());
ok("admin can view but not edit audit log; finance can view it", (await perm("admin", "audit")).can_view && !(await perm("admin", "audit")).can_edit && (await perm("finance", "audit")).can_view);
ok("admin: staff = create/edit but no delete", (p => p.can_create && p.can_edit && !p.can_delete)(await perm("admin", "staff")));
ok("finance can export, dispatch cannot", (await perm("finance", "exports")).can_export && !(await perm("dispatch_coordinator", "exports")));
ok("targets: everyone can view own progress", (await Promise.all(["sales_agent", "sourcing_officer", "dispatch_coordinator", "content_editor", "customer_support", "finance"].map((r) => perm(r, "targets_view")))).every((p) => p.can_view && p.scope === "own"));

// people
await addStaff("owner", "owner");
await addStaff("owner2", "owner");
await addStaff("admin", "admin");
await addStaff("sales", "sales_agent");
await addStaff("finance", "finance");
await addStaff("content", "content_editor");

// ---- sessions without MFA ----
await as("owner", "aal1", async () => {
  ok("aal1 session can read its own staff row", (await tryQ("select * from public.staff")).rows.length === 1);
  ok("aal1 session cannot read roles", (await tryQ("select * from public.roles")).rows.length === 0);
  ok("aal1 owner cannot read the audit log", (await tryQ("select * from public.audit_log")).rows.length === 0);
  const w = await tryQ("insert into public.roles(key,name) values ('x_role','X role')");
  ok("aal1 owner cannot create a role", !w.ok);
});
await db.exec("reset role");
await db.query("select set_config('request.jwt.claims','',false)");

// ---- anonymous ----
await db.exec("set role anon");
ok("anon cannot read staff", !(await tryQ("select * from public.staff")).ok);
ok("anon cannot read audit log", !(await tryQ("select * from public.audit_log")).ok);
ok("anon cannot read roles", !(await tryQ("select * from public.roles")).ok);
await db.exec("reset role");

// ---- sales agent (aal2) ----
await as("sales", "aal2", async () => {
  ok("sales sees only themselves in staff", (await tryQ("select * from public.staff")).rows.length === 1);
  ok("sales cannot read audit log", (await tryQ("select * from public.audit_log")).rows.length === 0);
  ok("sales can read role definitions", (await tryQ("select * from public.roles")).rows.length === 8);
  const ins = await tryQ("insert into public.staff(id, full_name, email, role_id) values (gen_random_uuid(), 'Bad Actor', 'b@x.test', (select id from public.roles where key='sales_agent'))");
  ok("sales cannot create staff", !ins.ok);
  const up = await tryQ("update public.staff set role_id=(select id from public.roles where key='owner') where id=auth.uid()");
  ok("sales cannot promote themselves", !up.ok || up.n === 0, up.err ?? `${up.n} rows`);
  const rp = await tryQ("update public.role_permissions set can_delete=true where module='orders'");
  ok("sales cannot edit permissions", (rp.n ?? 0) === 0);
});

// ---- admin (aal2) ----
await as("admin", "aal2", async () => {
  ok("admin sees all staff", (await tryQ("select * from public.staff")).rows.length === 6);
  const log = await tryQ("select * from public.audit_log");
  ok("admin can read the audit log", log.ok);

});
// authenticated cannot write auth.users, so the "invite" is done by the service side first, then the Admin creates the staff row
ids.newhire = (await db.query("insert into auth.users(email) values ('newhire@drezzy.test') returning id")).rows[0].id;
ids.newhire2 = (await db.query("insert into auth.users(email) values ('newhire2@drezzy.test') returning id")).rows[0].id;
ids.newhire3 = (await db.query("insert into auth.users(email) values ('newhire3@drezzy.test') returning id")).rows[0].id;
ids.newhire4 = (await db.query("insert into auth.users(email) values ('newhire4@drezzy.test') returning id")).rows[0].id;

await as("admin", "aal2", async () => {
  const mk = (id, role) => tryQ("insert into public.staff(id, full_name, email, role_id, created_by) values ($1,'New Hire','n@x.test',(select id from public.roles where key=$2), auth.uid())", [ids[id], role]);
  ok("admin can create a sales agent", (await mk("newhire", "sales_agent")).ok);
  const own = await mk("newhire2", "owner");
  ok("admin cannot create an Owner", !own.ok, own.err);
  const fin = await mk("newhire3", "finance");
  ok("admin cannot assign the Finance role (salary access)", !fin.ok, fin.err);
  const promote = await tryQ("update public.staff set role_id=(select id from public.roles where key='admin') where id=$1", [ids.newhire]);
  ok("admin can change a hire's role to admin", promote.ok && promote.n === 1);
  const selfUp = await tryQ("update public.staff set role_id=(select id from public.roles where key='sales_agent') where id=auth.uid()");
  ok("admin cannot change their own role", !selfUp.ok, selfUp.err);
  const ownerEdit = await tryQ("update public.staff set phone='0240000000' where id=$1", [ids.owner]);
  ok("admin cannot edit an Owner", !ownerEdit.ok, ownerEdit.err);
  const del = await tryQ("delete from public.staff where id=$1", [ids.newhire]);
  ok("admin cannot delete staff (no delete right)", (del.n ?? 0) === 0 || !del.ok);
  const rp = await tryQ("update public.role_permissions set can_delete=true where module='orders'");
  ok("admin cannot edit role permissions", (rp.n ?? 0) === 0);
  const nr = await tryQ("insert into public.roles(key,name) values ('sneaky','Sneaky')");
  ok("admin cannot create roles (Owner only)", !nr.ok);
  const ar = await tryQ("select action, actor_name, actor_role, table_name from public.audit_log where table_name='staff' and action='INSERT' order by id desc limit 1");
  ok("audit log recorded the admin's hire with their name and role", ar.rows[0]?.actor_role === "admin" && /admin/.test(ar.rows[0]?.actor_name ?? ""), JSON.stringify(ar.rows[0]));
});

// ---- owner (aal2) ----
await as("owner", "aal2", async () => {
  const cr = await tryQ("insert into public.roles(key,name,description) values ('stock_clerk','Stock Clerk','Checks stock') returning id");
  ok("owner can create a custom role", cr.ok);
  const rid = cr.rows?.[0]?.id;
  ok("owner can set a custom role's permissions", (await tryQ("insert into public.role_permissions(role_id,module,can_view,can_edit) values ($1,'products',true,true)", [rid])).ok);
  const sal = await tryQ("insert into public.role_permissions(role_id,module,can_view) values ($1,'salary',true)", [rid]);
  ok("owner cannot grant salary access to a custom role (FR-ROLE-003)", !sal.ok, sal.err);
  const ownRole = await tryQ("update public.role_permissions set can_delete=false where module='orders' and role_id=(select id from public.roles where key='owner')");
  ok("the Owner role's permissions are locked", !ownRole.ok, ownRole.err);
  ok("system roles cannot be deleted", !(await tryQ("delete from public.roles where key='sales_agent'")).ok);
  ok("system roles cannot be renamed", !(await tryQ("update public.roles set key='sales' where key='sales_agent'")).ok);
  ok("owner can assign the Finance role", (await tryQ("insert into public.staff(id, full_name, email, role_id, created_by) values ($1,'Fin Hire','f@x.test',(select id from public.roles where key='finance'), auth.uid())", [ids.newhire3])).ok);
  ok("owner can create an Owner", (await tryQ("insert into public.staff(id, full_name, email, role_id, created_by) values ($1,'Second Owner','o@x.test',(select id from public.roles where key='owner'), auth.uid())", [ids.newhire4])).ok);
  const self = await tryQ("update public.staff set active=false where id=auth.uid()");
  ok("owner cannot deactivate themselves", !self.ok, self.err);
  ok("owner can deactivate another Owner while one remains", (await tryQ("update public.staff set active=false where id=$1", [ids.newhire4])).ok);

  const log = await tryQ("select count(*)::int n from public.audit_log");
  ok("owner can read the audit log", log.rows[0].n >= 5, String(log.rows[0].n));
  const upd = await tryQ("select old_values->>'active' o, new_values->>'active' n from public.audit_log where action='UPDATE' and table_name='staff' and record_id=$1 order by id desc limit 1", [ids.newhire4]);
  ok("audit log keeps old and new values", upd.rows[0]?.o === "true" && upd.rows[0]?.n === "false", JSON.stringify(upd.rows[0]));
  const tamper = await tryQ("update public.audit_log set action='DELETE' where id=1");
  ok("audit log cannot be edited (even by an Owner)", !tamper.ok);
  const wipe = await tryQ("delete from public.audit_log");
  ok("audit log cannot be deleted", !wipe.ok);
  const forge = await tryQ("insert into public.audit_log(action, table_name) values ('INSERT','staff')");
  ok("nobody can write the audit log directly", !forge.ok);
});

// ---- finance ----
await as("finance", "aal2", async () => {
  ok("finance can read the audit log", (await tryQ("select 1 from public.audit_log limit 1")).ok);
  ok("finance cannot see other staff", (await tryQ("select * from public.staff")).rows.length === 1);
});
await as("content", "aal2", async () => {
  ok("content editor cannot read the audit log", (await tryQ("select * from public.audit_log")).rows.length === 0);
});

// ================= Sprint 2: catalogue =================
await addStaff("sourcing", "sourcing_officer");
await addStaff("dispatch", "dispatch_coordinator");
await addStaff("sales2", "sales_agent");

const cat = (await db.query("select id from public.categories where slug='sneakers-men'")).rows[0].id;
const prodPub = (await db.query("insert into public.products(slug, sku, name, brand, category_id, published) values ('nike-dunk','DNK','Nike Dunk','Nike',$1,true) returning id", [cat])).rows[0].id;
const prodDraft = (await db.query("insert into public.products(slug, sku, name, brand, category_id, published) values ('secret-drop','SEC','Secret Drop','Nike',$1,false) returning id", [cat])).rows[0].id;
const sup = (await db.query("insert into public.suppliers(name, phone) values ('Supplier A','0200000000') returning id")).rows[0].id;
const varPub = (await db.query("insert into public.variants(product_id, style, colour, size, sku, price, availability, preferred_supplier_id) values ($1,'Low','Black','42','DNK-LO-BK-42',420,'available',$2) returning id", [prodPub, sup])).rows[0].id;
await db.query("insert into public.variants(product_id, colour, size, sku, price) values ($1,'Black','42','SEC-BK-42',999)", [prodDraft]);
await db.query("insert into public.supplier_offers(variant_id, supplier_id, cost) values ($1,$2,300)", [varPub, sup]);

ok("categories seeded two levels deep", (await db.query("select count(*)::int n from public.categories where parent_id is not null")).rows[0].n === 12);

// shoppers
await db.exec("set role anon");
ok("anon sees published products only", (await tryQ("select slug from public.products")).rows.map((r) => r.slug).join() === "nike-dunk");
ok("anon sees public variant columns of published products", (await tryQ("select price, availability from public.variants")).rows.length === 1);
ok("anon cannot read internal variant columns (preferred supplier)", !(await tryQ("select preferred_supplier_id from public.variants")).ok);
ok("anon cannot select * from variants", !(await tryQ("select * from public.variants")).ok);
ok("anon cannot read suppliers", !(await tryQ("select * from public.suppliers")).ok);
ok("anon cannot read supplier costs", !(await tryQ("select * from public.supplier_offers")).ok);
ok("anon cannot change prices", !(await tryQ("update public.variants set price=1")).ok);
ok("anon can read categories", (await tryQ("select * from public.categories")).rows.length === 18);
await db.exec("reset role");

// sales: sees everything in the catalogue, changes nothing, never sees costs
await as("sales2", "aal2", async () => {
  ok("sales sees drafts too (products: view)", (await tryQ("select * from public.products")).rows.length === 2);
  ok("sales cannot reprice (no row is updatable)", ((await tryQ("update public.variants set price=1 where id=$1", [varPub])).n ?? 0) === 0);
  ok("sales cannot change availability", ((await tryQ("update public.variants set availability='unavailable' where id=$1", [varPub])).n ?? 0) === 0);
  ok("sales cannot read supplier costs", (await tryQ("select * from public.supplier_offers")).rows.length === 0);
  ok("sales cannot add a product", !(await tryQ("insert into public.products(slug, sku, name, brand, category_id) values ('x-y','XY','X Y','X',$1)", [cat])).ok);
});

// sourcing: availability and costs, but not prices
await as("sourcing", "aal2", async () => {
  ok("sourcing can change availability", (await tryQ("update public.variants set availability='limited', last_checked_at=now() where id=$1", [varPub])).ok);
  ok("sourcing can reprice (the matrix gives it products: edit)", (await tryQ("update public.variants set price=430 where id=$1", [varPub])).ok);
  ok("sourcing can read supplier costs", (await tryQ("select cost from public.supplier_offers")).rows[0]?.cost == 300);
  ok("sourcing can update a supplier cost", (await tryQ("update public.supplier_offers set cost=310 where variant_id=$1", [varPub])).ok);
  ok("sourcing can add a supplier", (await tryQ("insert into public.suppliers(name) values ('Supplier B')")).ok);
  ok("sourcing can add a product (products: create)", (await tryQ("insert into public.products(slug, sku, name, brand, category_id) values ('new-shoe','NEW','New Shoe','X',$1)", [cat])).ok);
  ok("sourcing cannot delete a product", ((await tryQ("delete from public.products where slug='new-shoe'")).n ?? 0) === 0);
});

// dispatch: reads the catalogue, never sees costs
await as("dispatch", "aal2", async () => {
  ok("dispatch can read suppliers", (await tryQ("select * from public.suppliers")).rows.length >= 1);
  ok("dispatch cannot read supplier costs", (await tryQ("select * from public.supplier_offers")).rows.length === 0);
  ok("dispatch cannot change availability", ((await tryQ("update public.variants set availability='available' where id=$1", [varPub])).n ?? 0) === 0);
});

// finance reads costs, writes none; content editor sees neither suppliers nor costs
await as("finance", "aal2", async () => {
  ok("finance can read supplier costs", (await tryQ("select * from public.supplier_offers")).rows.length === 1);
  ok("finance cannot edit supplier costs", ((await tryQ("update public.supplier_offers set cost=1")).n ?? 0) === 0);
});
await as("content", "aal2", async () => {
  ok("content editor can read products", (await tryQ("select * from public.products")).rows.length >= 2);
  ok("content editor cannot read suppliers or costs", (await tryQ("select * from public.suppliers")).rows.length === 0 && (await tryQ("select * from public.supplier_offers")).rows.length === 0);
});

// a custom role that may keep availability honest but not reprice: the two rights are separate
const availRole = (await db.query("insert into public.roles(key,name) values ('availability_clerk','Availability clerk') returning id")).rows[0].id;
await db.query("insert into public.role_permissions(role_id,module,can_view) values ($1,'products',true)", [availRole]);
await db.query("insert into public.role_permissions(role_id,module,can_view,can_edit) values ($1,'availability',true,true)", [availRole]);
{
  const u = (await db.query("insert into auth.users(email) values ('clerk@drezzy.test') returning id")).rows[0].id;
  await db.query("insert into public.staff(id, full_name, email, role_id) values ($1,'Clerk One','clerk@drezzy.test',$2)", [u, availRole]);
  ids.clerk = u;
}
await as("clerk", "aal2", async () => {
  ok("availability-only role can change availability", (await tryQ("update public.variants set availability='available' where id=$1", [varPub])).ok);
  const pr = await tryQ("update public.variants set price=1 where id=$1", [varPub]);
  ok("availability-only role cannot reprice (guard)", !pr.ok, pr.err);
  ok("availability-only role cannot see costs", (await tryQ("select * from public.supplier_offers")).rows.length === 0);
});
// put availability back the way the audit assertions below expect
await db.query("update public.variants set availability='limited' where id=$1", [varPub]);

// admin / owner: full control, everything audited
await as("admin", "aal2", async () => {
  ok("admin can reprice", (await tryQ("update public.variants set price=450 where id=$1", [varPub])).ok);
  ok("admin can set a sale price", (await tryQ("update public.variants set compare_at=500 where id=$1", [varPub])).ok);
  ok("a compare-at price below the price is refused", !(await tryQ("update public.variants set compare_at=100 where id=$1", [varPub])).ok);
  ok("duplicate size of the same style and colour is refused", !(await tryQ("insert into public.variants(product_id, style, colour, size, sku, price) values ($1,'Low','Black','42','DNK-DUP',1)", [prodPub])).ok);
  ok("a third category level is refused", !(await tryQ("insert into public.categories(parent_id, name, slug) values ((select id from public.categories where slug='sneakers-men'),'Deep','deep')")).ok);
  const au = await tryQ("select action, actor_role, old_values->>'price' o, new_values->>'price' n from public.audit_log where table_name='variants' and action='UPDATE' and new_values->>'price'='450.00'");
  ok("price change is audited with old and new value", au.rows[0]?.actor_role === "admin" && au.rows[0]?.o === "430.00", JSON.stringify(au.rows[0]));
  const av = await tryQ("select actor_role from public.audit_log where table_name='variants' and new_values->>'availability'='limited' order by id");
  ok("availability change is audited with the sourcing officer", av.rows[0]?.actor_role === "sourcing_officer", JSON.stringify(av.rows[0]));
  const co = await tryQ("select record_id from public.audit_log where table_name='supplier_offers' and action='UPDATE' order by id desc limit 1");
  ok("cost changes are audited with a pair key", /:/.test(co.rows[0]?.record_id ?? ""), co.rows[0]?.record_id);
});

// ---- deactivated staff lose access immediately ----
await db.query("update public.staff set active=false where id=$1", [ids.sales]);
await as("sales", "aal2", async () => {
  ok("deactivated staff can read nothing", (await tryQ("select * from public.staff")).rows.length === 0 && (await tryQ("select * from public.roles")).rows.length === 0);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
