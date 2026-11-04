// Shared set-up for the database tests: an in-memory Postgres (PGlite) with a stand-in for Supabase's auth schema and
// roles, the real migrations applied, and helpers to act as an anonymous visitor, the service role, or a signed-in staff member.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const dir = (p) => fileURLToPath(new URL(p, import.meta.url));

export async function createHarness({ seed = false, fixtures = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    grant select on auth.users to authenticated;
  `);
  for (const f of fs.readdirSync(dir("../migrations")).sort()) await db.exec(fs.readFileSync(dir(`../migrations/${f}`), "utf8"));
  if (seed) await db.exec(fs.readFileSync(dir("../seed.sql"), "utf8"));
  // the rules tests use a fixed set of products, so changing the real catalogue never breaks them
  if (seed && fixtures) await db.exec(fs.readFileSync(dir("./fixtures.sql"), "utf8"));

  let pass = 0, fail = 0;
  const ok = (name, cond, extra = "") => {
    if (cond) pass++; else fail++;
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + String(extra).slice(0, 240) : ""}`);
  };
  const ids = {};
  const roleId = async (key) => (await db.query("select id from public.roles where key=$1", [key])).rows[0].id;

  async function addStaff(name, role) {
    const u = (await db.query("insert into auth.users(email) values ($1) returning id", [`${name}@drezzy.test`])).rows[0].id;
    await db.query("insert into public.staff(id, full_name, email, role_id) values ($1,$2,$3,$4)", [u, name.padEnd(3, "_"), `${name}@drezzy.test`, await roleId(role)]);
    ids[name] = u;
    return u;
  }

  const reset = async () => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims','',false)");
  };

  /** Run fn as a signed-in staff member (aal2 unless said otherwise). */
  async function as(who, fn, aal = "aal2") {
    await reset();
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: ids[who], aal })]);
    await db.exec("set role authenticated");
    try { return await fn(); } finally { await reset(); }
  }
  /** Run fn as an anonymous shopper, or as the service role (the payment webhook). */
  async function asRole(role, fn) {
    await reset();
    await db.exec(`set role ${role}`);
    try { return await fn(); } finally { await reset(); }
  }

  const tryQ = async (sql, params = []) => {
    try {
      const r = await db.query(sql, params);
      return { ok: true, rows: r.rows, n: r.affectedRows ?? r.rows.length };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  };

  const done = async () => {
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  };

  return { db, ids, ok, as, asRole, tryQ, addStaff, roleId, done, reset };
}
